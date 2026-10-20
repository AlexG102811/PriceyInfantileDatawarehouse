const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { Pool } = require("pg");

let adminPool;
let appPool;
let httpServer;
let baseUrl;
let schema;
let teacher;
let secondTeacher;
let userNumber = 0;

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function questionPayload(questionText, position = null) {
  return {
    questionText,
    choice_a: "Choice A",
    choice_b: "Choice B",
    choice_c: "Choice C",
    choice_d: "Choice D",
    correct_choice: "a",
    position
  };
}

async function request(user, urlPath, { method = "GET", body, contentType } = {}) {
  const headers = {};
  if (user?.cookie) headers.cookie = user.cookie;
  if (body !== undefined) {
    headers["content-type"] = contentType || "application/json";
  }
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : contentType === "text/csv" ? body : JSON.stringify(body)
  });
  const cookie = response.headers.get("set-cookie");
  if (cookie && user) user.cookie = cookie.split(";")[0];
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

async function registerUser(role = "player") {
  userNumber++;
  const username = `testuser${userNumber}`;
  const result = await request(null, "/api/auth/register", {
    method: "POST",
    body: { username, email: `${username}@example.test`, password: "LongEnough!123" }
  });
  assert.equal(result.response.status, 201);
  const user = { ...result.data.user, cookie: result.response.headers.get("set-cookie").split(";")[0] };
  if (role === "admin") {
    await appPool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
    user.role = "admin";
  }
  return user;
}

async function createQuiz(user, { title, timeLimitSeconds = null }) {
  const result = await request(user, "/api/admin/quizzes", {
    method: "POST",
    body: { title, topic: "Testing", difficulty: "easy", timeLimitSeconds }
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  return result.data.id;
}

async function addQuestion(user, quizId, questionText, position = null) {
  const result = await request(user, `/api/admin/quizzes/${quizId}/questions`, {
    method: "POST",
    body: questionPayload(questionText, position)
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  return result.data.id;
}

async function startAttempt(user, quizId) {
  const result = await request(user, `/api/quizzes/${quizId}/attempts`, { method: "POST", body: {} });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  return result.data.attempt.id;
}

async function answerAndFinish(user, attemptId, questionId, choice = "a") {
  const saved = await request(user, `/api/attempts/${attemptId}`, {
    method: "PATCH",
    body: { answers: [{ questionId, choice, msTaken: 500 }] }
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
  const finished = await request(user, `/api/attempts/${attemptId}/finish`, { method: "POST", body: {} });
  assert.equal(finished.response.status, 200, JSON.stringify(finished.data));
  return finished;
}

before(async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Tests refuse to run with NODE_ENV=production.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run isolated API tests.");
  }

  const connectionString = process.env.DATABASE_URL;
  adminPool = new Pool({ connectionString });
  schema = `quiz_test_${process.pid}_${Date.now()}`;
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const scopedUrl = new URL(connectionString);
  scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = scopedUrl.toString();
  process.env.SESSION_SECRET = "isolated-automated-test-session-secret";

  const schemaPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schemaSql = await fs.readFile(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await schemaPool.query(schemaSql);
  await schemaPool.end();

  const { app, pool } = require("../server");
  appPool = pool;
  httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    httpServer.once("listening", resolve);
    httpServer.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  teacher = await registerUser("admin");
  secondTeacher = await registerUser("admin");
});

after(async () => {
  if (httpServer) {
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
  if (appPool) await appPool.end();
  if (adminPool && schema) {
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  }
});

test("protects player/admin access and attempt ownership", async (t) => {
  const quizId = await createQuiz(teacher, { title: "Access rules" });
  const questionId = await addQuestion(teacher, quizId, "Who owns this attempt?");
  const player = await registerUser();
  const otherPlayer = await registerUser();

  await t.test("requires sign-in and blocks player access to teacher tools", async () => {
    const anonymous = await request(null, "/api/quizzes");
    assert.equal(anonymous.response.status, 401);
    const forbidden = await request(player, "/api/admin/quizzes");
    assert.equal(forbidden.response.status, 403);
    const allowed = await request(teacher, "/api/admin/quizzes");
    assert.equal(allowed.response.status, 200);
  });

  await t.test("only the attempt owner can read, answer, or finish an attempt", async () => {
    const attemptId = await startAttempt(player, quizId);
    for (const [urlPath, options] of [
      [`/api/attempts/${attemptId}`, {}],
      [`/api/attempts/${attemptId}/results`, {}],
      [`/api/attempts/${attemptId}`, { method: "PATCH", body: { answers: [{ questionId, choice: "a" }] } }],
      [`/api/attempts/${attemptId}/finish`, { method: "POST", body: {} }]
    ]) {
      const denied = await request(otherPlayer, urlPath, options);
      assert.equal(denied.response.status, 404, `${options.method || "GET"} ${urlPath}`);
    }
    const owner = await request(player, `/api/attempts/${attemptId}`);
    assert.equal(owner.response.status, 200);
  });
});

test("scores retries correctly, ranks ties with competition ranks, and enforces timed expiry", async () => {
  const quizId = await createQuiz(teacher, { title: "Retry ranking" });
  const questionId = await addQuestion(teacher, quizId, "Which choice is correct?");
  const alpha = await registerUser();
  const bravo = await registerUser();
  const charlie = await registerUser();
  const delta = await registerUser();

  const firstRetry = await startAttempt(alpha, quizId);
  await answerAndFinish(alpha, firstRetry, questionId, "b");

  const secondRetry = await startAttempt(alpha, quizId);
  await answerAndFinish(alpha, secondRetry, questionId, "a");
  const bravoAttempt = await startAttempt(bravo, quizId);
  await answerAndFinish(bravo, bravoAttempt, questionId, "a");
  const charlieAttempt = await startAttempt(charlie, quizId);
  await answerAndFinish(charlie, charlieAttempt, questionId, "a");
  const deltaAttempt = await startAttempt(delta, quizId);
  await answerAndFinish(delta, deltaAttempt, questionId, "b");

  const tiedAt = new Date("2026-01-01T12:00:00.000Z");
  await appPool.query(
    "UPDATE attempts SET finished_at = $1 WHERE id = ANY($2::int[])",
    [tiedAt, [secondRetry, bravoAttempt, charlieAttempt]]
  );
  const board = await request(bravo, `/api/leaderboard/quizzes/${quizId}`);
  assert.equal(board.response.status, 200);
  assert.deepEqual(board.data.entries.map((entry) => entry.username), [bravo.username, charlie.username, alpha.username, delta.username]);
  assert.deepEqual(board.data.entries.map((entry) => Number(entry.rank)), [1, 1, 1, 4]);
  assert.deepEqual(board.data.entries.map((entry) => entry.bestPoints), [1, 1, 1, 0]);

  const timedQuizId = await createQuiz(teacher, { title: "Timed expiry", timeLimitSeconds: 60 });
  const timedQuestionId = await addQuestion(teacher, timedQuizId, "Can time run out?");
  const expiredSave = await startAttempt(alpha, timedQuizId);
  await appPool.query("UPDATE attempts SET started_at = NOW() - INTERVAL '61 seconds' WHERE id = $1", [expiredSave]);
  const blockedSave = await request(alpha, `/api/attempts/${expiredSave}`, {
    method: "PATCH",
    body: { answers: [{ questionId: timedQuestionId, choice: "a" }] }
  });
  assert.equal(blockedSave.response.status, 409);

  const expiredFinish = await startAttempt(alpha, timedQuizId);
  const saved = await request(alpha, `/api/attempts/${expiredFinish}`, {
    method: "PATCH",
    body: { answers: [{ questionId: timedQuestionId, choice: "a" }] }
  });
  assert.equal(saved.response.status, 200);
  await appPool.query("UPDATE attempts SET started_at = NOW() - INTERVAL '90 seconds' WHERE id = $1", [expiredFinish]);
  const finished = await request(alpha, `/api/attempts/${expiredFinish}/finish`, { method: "POST", body: {} });
  assert.equal(finished.response.status, 200);
  const expiredRow = await appPool.query("SELECT points, status FROM attempts WHERE id = $1", [expiredFinish]);
  assert.equal(expiredRow.rows[0].points, 0);
  assert.equal(expiredRow.rows[0].status, "completed");
});

test("validates CSV preview and commit tokens, rows, duplicates, and positions", async () => {
  const quizId = await createQuiz(teacher, { title: "CSV import" });
  await addQuestion(teacher, quizId, "Already in the quiz");
  const headers = ["question", "choice_a", "choice_b", "choice_c", "choice_d", "correct", "position", "extra"];
  const row = (question, a, b, c, d, correct, position = "") =>
    [question, a, b, c, d, correct, position, "ignored"].map(csvCell).join(",");
  const csv = [
    headers.join(","),
    row("Already in the quiz", "A", "B", "C", "D", "A"),
    row("A new imported question", "One", "Two", "Three", "Four", "C", "1"),
    row("Invalid duplicate choices", "Same", "Same", "Three", "Four", "A")
  ].join("\n");

  const wrongType = await request(teacher, `/api/admin/quizzes/${quizId}/import/preview`, {
    method: "POST", body: csv, contentType: "text/plain"
  });
  assert.equal(wrongType.response.status, 415);

  const badHeaders = await request(teacher, `/api/admin/quizzes/${quizId}/import/preview`, {
    method: "POST", body: "question,choice_a\nA question,A\n", contentType: "text/csv"
  });
  assert.equal(badHeaders.response.status, 400);

  const malformedCsv = await request(teacher, `/api/admin/quizzes/${quizId}/import/preview`, {
    method: "POST",
    body: `${headers.join(",")}\n"Unclosed question,One,Two,Three,Four,A,`,
    contentType: "text/csv"
  });
  assert.equal(malformedCsv.response.status, 200);
  assert.equal(malformedCsv.data.summary.errors, 1);
  assert.match(malformedCsv.data.errors[0].reason, /Unclosed quoted value/);

  const preview = await request(teacher, `/api/admin/quizzes/${quizId}/import/preview`, {
    method: "POST", body: csv, contentType: "text/csv"
  });
  assert.equal(preview.response.status, 200);
  assert.deepEqual(preview.data.summary, { valid: 1, skipped: 1, errors: 1 });
  assert.match(preview.data.warnings[0], /Unknown columns ignored/);

  const otherQuizId = await createQuiz(teacher, { title: "CSV token scope" });
  const wrongQuiz = await request(teacher, `/api/admin/quizzes/${otherQuizId}/import/commit`, {
    method: "POST", body: { token: preview.data.token }
  });
  assert.equal(wrongQuiz.response.status, 400);
  const wrongTeacher = await request(secondTeacher, `/api/admin/quizzes/${quizId}/import/commit`, {
    method: "POST", body: { token: preview.data.token }
  });
  assert.equal(wrongTeacher.response.status, 400);

  const commit = await request(teacher, `/api/admin/quizzes/${quizId}/import/commit`, {
    method: "POST", body: { token: preview.data.token }
  });
  assert.equal(commit.response.status, 200);
  assert.deepEqual(commit.data, { added: 1, skipped: 0 });
  const imported = await appPool.query(
    "SELECT question_text, position FROM questions WHERE quiz_id = $1 AND question_text = $2",
    [quizId, "A new imported question"]
  );
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].position, 2);

  const reused = await request(teacher, `/api/admin/quizzes/${quizId}/import/commit`, {
    method: "POST", body: { token: preview.data.token }
  });
  assert.equal(reused.response.status, 400);
});

test("keeps question ordering contiguous and supports reassignment between quizzes", async () => {
  const sourceQuizId = await createQuiz(teacher, { title: "Question positions" });
  const destinationQuizId = await createQuiz(teacher, { title: "Question destination" });
  const first = await addQuestion(teacher, sourceQuizId, "First question");
  const second = await addQuestion(teacher, sourceQuizId, "Second question");
  const third = await addQuestion(teacher, sourceQuizId, "Third question");
  const inserted = await addQuestion(teacher, sourceQuizId, "Inserted question", 2);

  const sourceBeforeMove = await request(teacher, `/api/admin/quizzes/${sourceQuizId}/questions`);
  assert.deepEqual(sourceBeforeMove.data.questions.map((question) => question.id), [first, inserted, second, third]);
  assert.deepEqual(sourceBeforeMove.data.questions.map((question) => question.position), [1, 2, 3, 4]);

  const movedPayload = { ...questionPayload("Third question", 1), quizId: destinationQuizId };
  const moved = await request(teacher, `/api/admin/questions/${third}`, { method: "PATCH", body: movedPayload });
  assert.equal(moved.response.status, 200);
  const sourceAfterMove = await request(teacher, `/api/admin/quizzes/${sourceQuizId}/questions`);
  const destinationAfterMove = await request(teacher, `/api/admin/quizzes/${destinationQuizId}/questions`);
  assert.deepEqual(sourceAfterMove.data.questions.map((question) => question.id), [first, inserted, second]);
  assert.deepEqual(sourceAfterMove.data.questions.map((question) => question.position), [1, 2, 3]);
  assert.deepEqual(destinationAfterMove.data.questions.map((question) => question.id), [third]);
  assert.equal(destinationAfterMove.data.questions[0].position, 1);

  const invalidDestination = await request(teacher, `/api/admin/questions/${third}`, {
    method: "PATCH",
    body: { ...questionPayload("Third question"), quizId: 999999 }
  });
  assert.equal(invalidDestination.response.status, 404);
});
