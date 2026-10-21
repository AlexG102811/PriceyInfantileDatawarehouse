const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const path = require("node:path");
const { sendPasswordResetEmail } = require("./lib/password-reset-email");

const app = express();
app.locals.sendPasswordResetEmail = sendPasswordResetEmail;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PORT = Number(process.env.PORT) || 5000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const COOKIE_NAME = "quiz_session";
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const importPreviews = new Map();
const loginFailures = new Map();
const passwordResetRequests = new Map();
const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const PASSWORD_RESET_REQUEST_LIMIT = 3;
const PASSWORD_RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_AGE_MS = 30 * 60 * 1000;
const PASSWORD_RESET_MESSAGE = "If an account exists for that email, a password reset link will be sent shortly.";

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required. Add it to the Replit Secrets tool.");
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "1mb" }));

function cookieValue(header, name) {
  const part = (header || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function issueSession(res, userId, sessionVersion = 0) {
  const encoded = Buffer.from(JSON.stringify({ userId, sessionVersion, expiresAt: Date.now() + SESSION_AGE })).toString("base64url");
  const value = `${encoded}.${sign(encoded)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_AGE / 1000)}${secure}`);
}

function clearSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

async function requireAuth(req, res, next) {
  try {
    const token = cookieValue(req.headers.cookie, COOKIE_NAME);
    if (!token || !token.includes(".")) return res.status(401).json({ error: "Please sign in to continue." });
    const [encoded, providedSignature] = token.split(".");
    const expected = sign(encoded);
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(providedSignature);
    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (!Number.isInteger(session.userId) || session.expiresAt < Date.now()) {
      clearSession(res);
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    const result = await pool.query(
      "SELECT id, username, email, role, disabled, joined_at, session_version AS \"sessionVersion\" FROM users WHERE id = $1",
      [session.userId]
    );
    const user = result.rows[0];
    if (!user || user.disabled) {
      clearSession(res);
      return res.status(401).json({ error: "This account is unavailable. Please sign in again." });
    }
    if ((session.sessionVersion ?? 0) !== user.sessionVersion) {
      clearSession(res);
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    req.user = user;
    issueSession(res, user.id, user.sessionVersion);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Teacher access is required." });
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function loginFailureKey(identity, user) {
  const value = user ? `user:${user.id}` : `identity:${String(identity || "").trim().toLowerCase()}`;
  return crypto.createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function pruneLoginFailures(now) {
  for (const [key, window] of loginFailures) {
    if (window.until <= now) loginFailures.delete(key);
  }
}

function passwordResetRequestKey(email) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(`password-reset:${email}`).digest("hex");
}

function allowPasswordResetRequest(email, now) {
  for (const [key, window] of passwordResetRequests) {
    if (window.until <= now) passwordResetRequests.delete(key);
  }
  const key = passwordResetRequestKey(email);
  const window = passwordResetRequests.get(key);
  if (window && window.count >= PASSWORD_RESET_REQUEST_LIMIT) return false;
  if (window) window.count++;
  else passwordResetRequests.set(key, { count: 1, until: now + PASSWORD_RESET_REQUEST_WINDOW_MS });
  return true;
}

function passwordResetUrl(token) {
  let baseUrl = app.locals.publicAppBaseUrl || process.env.APP_BASE_URL;
  if (!baseUrl && process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN) {
    baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (!baseUrl) throw new Error("APP_BASE_URL is required to build password reset links.");
  const url = new URL(baseUrl);
  const localHttp = process.env.NODE_ENV !== "production"
    && ["localhost", "127.0.0.1"].includes(url.hostname)
    && url.protocol === "http:";
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("APP_BASE_URL must use HTTPS.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = new URLSearchParams({ reset: token }).toString();
  return url.toString();
}

function normalizeChoice(choice) {
  return typeof choice === "string" && /^[a-d]$/i.test(choice) ? choice.toLowerCase() : null;
}

function validQuestion(question) {
  const errors = {};
  const text = String(question.questionText || "").trim();
  if (text.length < 3 || text.length > 500) errors.questionText = "Use 3–500 characters.";
  const choices = ["a", "b", "c", "d"].map((letter) => String(question[`choice_${letter}`] ?? "").trim());
  choices.forEach((choice, index) => {
    if (choice.length < 1 || choice.length > 200) errors[`choice_${"abcd"[index]}`] = "Use 1–200 characters.";
  });
  if (choices.every(Boolean)) {
    const normalized = choices.map((choice) => choice.toLocaleLowerCase());
    if (new Set(normalized).size !== 4) errors.choices = "Each answer choice must be different.";
  }
  const correct = normalizeChoice(question.correct_choice);
  if (!correct) errors.correct_choice = "Choose one correct answer.";
  const position = question.position === "" || question.position == null ? null : Number(question.position);
  if (position !== null && (!Number.isInteger(position) || position < 1)) errors.position = "Position must be a whole number of 1 or more.";
  return { errors, values: { text, choices, correct, position } };
}

async function normalizeQuestionPositions(client, questionIds) {
  for (const [index, id] of questionIds.entries()) {
    await client.query("UPDATE questions SET position = $1 WHERE id = $2", [index + 1, id]);
  }
}

async function loadAttempt(attemptId, userId, lock = false, client = pool) {
  const query = `SELECT a.*, q.title AS quiz_title, q.time_limit_seconds
    FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.id = $1 AND a.user_id = $2 ${lock ? "FOR UPDATE OF a" : ""}`;
  const result = await client.query(query, [attemptId, userId]);
  return result.rows[0] || null;
}

async function attemptQuestions(attempt) {
  const result = await pool.query(
    `SELECT id, question_text AS "questionText", choice_a AS a, choice_b AS b,
      choice_c AS c, choice_d AS d, position
     FROM questions WHERE id = ANY($1::int[]) ORDER BY array_position($1::int[], id)`,
    [attempt.question_snapshot]
  );
  return result.rows;
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  let recordNumber = 1;
  const errors = [];
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (afterQuote && char !== "," && char !== "\r" && char !== "\n" && !/\s/.test(char)) {
      errors.push({ row: recordNumber, reason: "Unexpected text after a quoted value." });
      afterQuote = false;
    }
    if (char === '"') {
      if (field.length) {
        errors.push({ row: recordNumber, reason: "A quote must begin at the start of a value." });
      } else {
        quoted = true;
      }
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
      afterQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) rows.push({ values: row, number: recordNumber });
      row = [];
      field = "";
      afterQuote = false;
      recordNumber++;
    } else {
      field += char;
    }
  }
  if (quoted) errors.push({ row: recordNumber, reason: "Unclosed quoted value." });
  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((cell) => cell !== "")) rows.push({ values: row, number: recordNumber });
  }
  return { rows, errors };
}

function ensureCsvRequest(req, res, next) {
  const type = req.get("content-type") || "";
  if (!type.includes("text/csv") && !type.includes("application/octet-stream")) {
    return res.status(415).json({ error: "Upload a CSV file." });
  }
  express.raw({ type: () => true, limit: "5mb" })(req, res, next);
}

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) return res.status(400).json({ error: "Username must be 3–24 letters, numbers, dashes, or underscores." });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Password must be 10–128 characters." });
  const hash = await bcrypt.hash(password, 12);
  try {
    const created = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, role, joined_at",
      [username, email, hash]
    );
    issueSession(res, created.rows[0].id);
    res.status(201).json({ user: created.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That username or email is already registered." });
    throw error;
  }
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const identity = String(req.body.identity || "").trim();
  const result = await pool.query(
    "SELECT id, username, email, role, disabled, password_hash, session_version AS \"sessionVersion\" FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)",
    [identity]
  );
  const user = result.rows[0];
  const key = loginFailureKey(identity, user);
  const now = Date.now();
  pruneLoginFailures(now);
  const window = loginFailures.get(key);
  if (window && window.count >= LOGIN_FAILURE_LIMIT) {
    const waitMinutes = Math.max(1, Math.ceil((window.until - now) / 60_000));
    return res.status(429).json({ error: `Too many unsuccessful sign-in attempts for this username or email. Try again in ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"}.` });
  }

  if (!user || user.disabled || !(await bcrypt.compare(String(req.body.password || ""), user.password_hash))) {
    if (window && window.until > now) window.count++;
    else loginFailures.set(key, { count: 1, until: now + LOGIN_WINDOW_MS });
    return res.status(401).json({ error: "The username/email or password is incorrect." });
  }
  loginFailures.delete(key);
  issueSession(res, user.id, user.sessionVersion);
  res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } });
}));

app.post("/api/auth/password-reset/request", asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const now = Date.now();
  const validEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail || !allowPasswordResetRequest(email, now)) {
    return res.status(202).json({ message: PASSWORD_RESET_MESSAGE });
  }

  const result = await pool.query(
    "SELECT id, email FROM users WHERE lower(email) = $1 AND disabled = FALSE",
    [email]
  );
  const user = result.rows[0];
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [user.id]);
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [user.id, tokenHash, new Date(now + PASSWORD_RESET_TOKEN_AGE_MS)]
    );

    try {
      const resetUrl = passwordResetUrl(token);
      await app.locals.sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch (error) {
      await pool.query("DELETE FROM password_reset_tokens WHERE token_hash = $1", [tokenHash]).catch(() => {});
      console.error("Password reset email delivery failed:", error.name || "Error");
    }
  }

  res.status(202).json({ message: PASSWORD_RESET_MESSAGE });
}));

app.post("/api/auth/password-reset/confirm", asyncRoute(async (req, res) => {
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  if (password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: "Password must be 10–128 characters." });
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reset = await client.query(
      `SELECT user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    if (!reset.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." });
    }

    const userId = reset.rows[0].user_id;
    const updated = await client.query(
      "UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2 AND disabled = FALSE RETURNING id",
      [passwordHash, userId]
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." });
    }
    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [userId]
    );
    await client.query("COMMIT");
    clearSession(res);
    res.json({ message: "Your password has been reset. Sign in with your new password." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/auth/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res, next) => {
  if (!cookieValue(req.headers.cookie, COOKIE_NAME)) return res.json({ user: null });
  requireAuth(req, res, next);
}, (req, res) => res.json({ user: req.user }));

app.get("/api/quizzes", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT q.id, q.title, q.topic, q.difficulty, q.time_limit_seconds AS "timeLimitSeconds",
      COUNT(DISTINCT question.id)::int AS "questionCount",
      COUNT(DISTINCT attempt.id) FILTER (WHERE attempt.status = 'completed' AND attempt.user_id = $1)::int AS "myCompletions",
      MAX(attempt.points) FILTER (WHERE attempt.status = 'completed' AND attempt.user_id = $1) AS "myBest"
     FROM quizzes q
     LEFT JOIN questions question ON question.quiz_id = q.id AND NOT question.hidden
     LEFT JOIN attempts attempt ON attempt.quiz_id = q.id
     WHERE q.is_published = TRUE
     GROUP BY q.id ORDER BY q.id`,
    [req.user.id]
  );
  res.json({ quizzes: result.rows });
}));

app.get("/api/quizzes/:id", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT q.id, q.title, q.topic, q.difficulty, q.time_limit_seconds AS "timeLimitSeconds",
      COUNT(question.id)::int AS "questionCount"
     FROM quizzes q LEFT JOIN questions question ON question.quiz_id = q.id AND NOT question.hidden
     WHERE q.id = $1 AND q.is_published = TRUE GROUP BY q.id`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Quiz not found." });
  res.json({ quiz: result.rows[0] });
}));

app.post("/api/quizzes/:id/attempts", requireAuth, asyncRoute(async (req, res) => {
  const quiz = await pool.query("SELECT id, time_limit_seconds FROM quizzes WHERE id = $1 AND is_published = TRUE", [req.params.id]);
  if (!quiz.rows[0]) return res.status(404).json({ error: "Quiz not found." });
  const user = await pool.query("SELECT disabled FROM users WHERE id = $1", [req.user.id]);
  if (user.rows[0]?.disabled) return res.status(403).json({ error: "Disabled accounts cannot start quizzes." });
  const questions = await pool.query(
    "SELECT id FROM questions WHERE quiz_id = $1 AND hidden = FALSE ORDER BY position, id",
    [req.params.id]
  );
  if (!questions.rows.length) return res.status(409).json({ error: "This quiz does not have any active questions yet." });
  const ids = questions.rows.map((question) => question.id);
  const created = await pool.query(
    `INSERT INTO attempts (user_id, quiz_id, total_questions, question_snapshot)
     VALUES ($1, $2, $3, $4) RETURNING id, started_at`,
    [req.user.id, req.params.id, ids.length, ids]
  );
  const attempt = { ...created.rows[0], quiz_id: Number(req.params.id), question_snapshot: ids, time_limit_seconds: quiz.rows[0].time_limit_seconds };
  res.status(201).json({ attempt: { id: attempt.id, startedAt: attempt.started_at, timeLimitSeconds: attempt.time_limit_seconds }, questions: await attemptQuestions(attempt) });
}));

app.get("/api/attempts/:id", requireAuth, asyncRoute(async (req, res) => {
  const attempt = await loadAttempt(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: "Attempt not found." });
  if (attempt.status !== "in_progress") return res.status(409).json({ error: "This attempt is no longer in progress." });
  const answers = await pool.query("SELECT question_id AS \"questionId\", chosen_choice AS choice FROM answer_events WHERE attempt_id = $1", [attempt.id]);
  res.json({
    attempt: { id: attempt.id, quizId: attempt.quiz_id, quizTitle: attempt.quiz_title, startedAt: attempt.started_at, timeLimitSeconds: attempt.time_limit_seconds },
    questions: await attemptQuestions(attempt),
    answers: answers.rows
  });
}));

app.patch("/api/attempts/:id", requireAuth, asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attempt = await loadAttempt(req.params.id, req.user.id, true, client);
    if (!attempt) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Attempt not found." });
    }
    if (attempt.status !== "in_progress") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This attempt is no longer in progress." });
    }
    const elapsedMs = Date.now() - new Date(attempt.started_at).getTime();
    if (attempt.time_limit_seconds && elapsedMs > attempt.time_limit_seconds * 1000) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Time is up. Submit your quiz to finish it." });
    }
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    if (answers.length > attempt.total_questions) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Too many answers were submitted." });
    }
    const allowedIds = new Set(attempt.question_snapshot.map(Number));
    for (const answer of answers) {
      const questionId = Number(answer.questionId);
      const choice = normalizeChoice(answer.choice);
      if (!Number.isInteger(questionId) || !allowedIds.has(questionId) || !choice) continue;
      const msTaken = Math.max(0, Math.min(3_600_000, Math.floor(Number(answer.msTaken) || 0)));
      await client.query(
        `INSERT INTO answer_events (attempt_id, user_id, question_id, chosen_choice, is_correct, ms_taken)
         SELECT $1, $2, q.id, $4, q.correct_choice = $4, $5
         FROM questions q WHERE q.id = $3
         ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET chosen_choice = EXCLUDED.chosen_choice, is_correct = EXCLUDED.is_correct, ms_taken = EXCLUDED.ms_taken, answered_at = NOW()`,
        [attempt.id, req.user.id, questionId, choice, msTaken]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.json({ saved: true });
}));

app.post("/api/attempts/:id/finish", requireAuth, asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attempt = await loadAttempt(req.params.id, req.user.id, true, client);
    if (!attempt) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Attempt not found." });
    }
    if (attempt.status === "completed") {
      await client.query("COMMIT");
      return res.json({ completed: true, alreadyCompleted: true, attemptId: attempt.id });
    }
    if (attempt.status !== "in_progress") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This attempt cannot be completed." });
    }
    const finishedAt = new Date();
    const elapsed = finishedAt.getTime() - new Date(attempt.started_at).getTime();
    if (attempt.time_limit_seconds && elapsed > attempt.time_limit_seconds * 1000 + 10_000) {
      await client.query(
        "DELETE FROM answer_events WHERE attempt_id = $1 AND answered_at > $2::timestamptz + ($3::int * INTERVAL '1 second')",
        [attempt.id, attempt.started_at, attempt.time_limit_seconds]
      );
    }
    const score = await client.query("SELECT COUNT(*)::int AS points FROM answer_events WHERE attempt_id = $1 AND is_correct = TRUE", [attempt.id]);
    await client.query(
      "UPDATE attempts SET status = 'completed', points = $1, finished_at = $2 WHERE id = $3",
      [score.rows[0].points, finishedAt, attempt.id]
    );
    await client.query("COMMIT");
    res.json({ completed: true, attemptId: attempt.id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/attempts/:id/abandon", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    "UPDATE attempts SET status = 'abandoned' WHERE id = $1 AND user_id = $2 AND status = 'in_progress' RETURNING id",
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "In-progress attempt not found." });
  res.json({ abandoned: true });
}));

app.get("/api/attempts/:id/results", requireAuth, asyncRoute(async (req, res) => {
  const attempt = await loadAttempt(req.params.id, req.user.id);
  if (!attempt || attempt.status !== "completed") return res.status(404).json({ error: "Completed result not found." });
  const questions = await pool.query(
    `SELECT q.id, q.question_text AS "questionText", q.choice_a AS a, q.choice_b AS b,
      q.choice_c AS c, q.choice_d AS d, q.correct_choice AS correct,
      e.chosen_choice AS chosen, e.is_correct AS "isCorrect"
     FROM questions q
     LEFT JOIN answer_events e ON e.question_id = q.id AND e.attempt_id = $2
     WHERE q.id = ANY($1::int[]) ORDER BY array_position($1::int[], q.id)`,
    [attempt.question_snapshot, attempt.id]
  );
  res.json({
    attempt: { id: attempt.id, quizId: attempt.quiz_id, quizTitle: attempt.quiz_title, points: attempt.points, totalQuestions: attempt.total_questions, startedAt: attempt.started_at, finishedAt: attempt.finished_at, timeLimitSeconds: attempt.time_limit_seconds },
    questions: questions.rows
  });
}));

app.get("/api/me/attempts", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT a.id, a.quiz_id AS "quizId", q.title AS "quizTitle", a.status, a.points,
      a.total_questions AS "totalQuestions", a.started_at AS "startedAt", a.finished_at AS "finishedAt",
      q.time_limit_seconds AS "timeLimitSeconds"
     FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = $1 ORDER BY a.started_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json({ attempts: result.rows });
}));

app.get("/api/leaderboard/overall", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `WITH board AS (
      SELECT u.id, u.username, u.joined_at AS "joinedAt",
        COUNT(a.id)::int AS "totalAttempts", COUNT(DISTINCT a.quiz_id)::int AS "quizzesPlayed",
        RANK() OVER (ORDER BY COUNT(a.id) DESC) AS rank
      FROM users u JOIN attempts a ON a.user_id = u.id AND a.status = 'completed'
      GROUP BY u.id
    )
    SELECT * FROM board ORDER BY "totalAttempts" DESC, username ASC`,
  );
  const mine = result.rows.find((row) => row.id === req.user.id) || null;
  res.json({ entries: result.rows.slice(0, 10), me: mine });
}));

app.get("/api/leaderboard/quizzes/:id", requireAuth, asyncRoute(async (req, res) => {
  const quiz = await pool.query("SELECT id, title FROM quizzes WHERE id = $1 AND is_published = TRUE", [req.params.id]);
  if (!quiz.rows[0]) return res.status(404).json({ error: "Quiz leaderboard not found." });
  const result = await pool.query(
    `WITH best AS (
      SELECT DISTINCT ON (user_id) user_id, points, finished_at AS best_achieved_at
      FROM attempts WHERE quiz_id = $1 AND status = 'completed'
      ORDER BY user_id, points DESC, finished_at ASC
    ), rows AS (
      SELECT u.id, u.username, b.points AS "bestPoints", b.best_achieved_at AS "bestAchievedAt",
        COUNT(a.id)::int AS attempts,
        RANK() OVER (ORDER BY b.points DESC) AS rank
      FROM best b JOIN users u ON u.id = b.user_id
      LEFT JOIN attempts a ON a.user_id = b.user_id AND a.quiz_id = $1 AND a.status = 'completed'
      GROUP BY u.id, u.username, b.points, b.best_achieved_at
    )
    SELECT * FROM rows
    ORDER BY "bestPoints" DESC, "bestAchievedAt" ASC, attempts ASC, username ASC`,
    [req.params.id]
  );
  res.json({ quiz: quiz.rows[0], entries: result.rows.slice(0, 10), me: result.rows.find((row) => row.id === req.user.id) || null });
}));

app.patch("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const username = String(req.body.username || req.user.username).trim();
  const email = String(req.body.email || req.user.email).trim().toLowerCase();
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) return res.status(400).json({ error: "Username must be 3–24 letters, numbers, dashes, or underscores." });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  try {
    if (req.body.newPassword) {
      if (String(req.body.newPassword).length < 10) return res.status(400).json({ error: "New password must be at least 10 characters." });
      const current = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
      if (!(await bcrypt.compare(String(req.body.currentPassword || ""), current.rows[0].password_hash))) return res.status(403).json({ error: "Current password is incorrect." });
      const hash = await bcrypt.hash(String(req.body.newPassword), 12);
      await pool.query("UPDATE users SET username = $1, email = $2, password_hash = $3, session_version = session_version + 1 WHERE id = $4", [username, email, hash, req.user.id]);
    } else {
      await pool.query("UPDATE users SET username = $1, email = $2 WHERE id = $3", [username, email, req.user.id]);
    }
    const user = await pool.query("SELECT id, username, email, role, joined_at AS \"joinedAt\", session_version AS \"sessionVersion\" FROM users WHERE id = $1", [req.user.id]);
    issueSession(res, user.rows[0].id, user.rows[0].sessionVersion);
    delete user.rows[0].sessionVersion;
    res.json({ user: user.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That username or email is already in use." });
    throw error;
  }
}));

app.delete("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const user = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.password || ""), user.rows[0].password_hash))) return res.status(403).json({ error: "Your password is incorrect." });
  await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
  clearSession(res);
  res.json({ deleted: true });
}));

app.get("/api/admin/quizzes", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT q.id, q.title, q.topic, q.difficulty, q.is_published AS "isPublished",
      q.time_limit_seconds AS "timeLimitSeconds", COUNT(DISTINCT qu.id)::int AS "questionCount",
      COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed')::int AS attempts
     FROM quizzes q LEFT JOIN questions qu ON qu.quiz_id = q.id
     LEFT JOIN attempts a ON a.quiz_id = q.id GROUP BY q.id ORDER BY q.id`
  );
  res.json({ quizzes: result.rows });
}));

app.post("/api/admin/quizzes", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const title = String(req.body.title || "").trim();
  const topic = String(req.body.topic || "").trim();
  const difficulty = String(req.body.difficulty || "");
  const timeLimit = req.body.timeLimitSeconds == null || req.body.timeLimitSeconds === "" ? null : Number(req.body.timeLimitSeconds);
  if (!title || title.length > 100 || !topic || topic.length > 60) return res.status(400).json({ error: "Enter a title (1–100 characters) and topic (1–60 characters)." });
  if (!["easy", "easy_medium", "medium", "hard", "expert"].includes(difficulty)) return res.status(400).json({ error: "Choose a valid difficulty." });
  if (timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit < 60 || timeLimit > 7200)) return res.status(400).json({ error: "Time limit must be between 1 and 120 minutes." });
  try {
    const created = await pool.query(
      `INSERT INTO quizzes (title, topic, difficulty, is_published, time_limit_seconds)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, topic, difficulty, req.body.isPublished !== false, timeLimit]
    );
    res.status(201).json({ id: created.rows[0].id });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "A quiz with that title already exists." });
    throw error;
  }
}));

app.patch("/api/admin/quizzes/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const current = await pool.query("SELECT id FROM quizzes WHERE id = $1", [req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ error: "Quiz not found." });
  const title = String(req.body.title || "").trim();
  const topic = String(req.body.topic || "").trim();
  const difficulty = String(req.body.difficulty || "");
  const timeLimit = req.body.timeLimitSeconds == null || req.body.timeLimitSeconds === "" ? null : Number(req.body.timeLimitSeconds);
  if (!title || title.length > 100 || !topic || topic.length > 60) return res.status(400).json({ error: "Enter a title (1–100 characters) and topic (1–60 characters)." });
  if (!["easy", "easy_medium", "medium", "hard", "expert"].includes(difficulty)) return res.status(400).json({ error: "Choose a valid difficulty." });
  if (timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit < 60 || timeLimit > 7200)) return res.status(400).json({ error: "Time limit must be between 1 and 120 minutes." });
  try {
    await pool.query(
      `UPDATE quizzes SET title = $1, topic = $2, difficulty = $3, is_published = $4, time_limit_seconds = $5 WHERE id = $6`,
      [title, topic, difficulty, Boolean(req.body.isPublished), timeLimit, req.params.id]
    );
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "A quiz with that title already exists." });
    throw error;
  }
  res.json({ saved: true });
}));

app.get("/api/admin/quizzes/:id/questions", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT id, question_text AS "questionText", choice_a, choice_b, choice_c, choice_d,
      correct_choice AS "correctChoice", hidden, position
     FROM questions WHERE quiz_id = $1 ORDER BY position, id`,
    [req.params.id]
  );
  res.json({ questions: result.rows });
}));

app.post("/api/admin/quizzes/:id/questions", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { errors, values } = validQuestion(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the question fields.", fields: errors });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quiz = await client.query("SELECT id FROM quizzes WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!quiz.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Quiz not found." });
    }
    const existing = await client.query("SELECT id FROM questions WHERE quiz_id = $1 ORDER BY position, id FOR UPDATE", [req.params.id]);
    const ids = existing.rows.map((row) => row.id);
    const position = Math.max(1, Math.min(values.position || ids.length + 1, ids.length + 1));
    const result = await client.query(
      `INSERT INTO questions (quiz_id, question_text, choice_a, choice_b, choice_c, choice_d, correct_choice, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.params.id, values.text, ...values.choices, values.correct, ids.length + 1]
    );
    ids.splice(position - 1, 0, result.rows[0].id);
    await normalizeQuestionPositions(client, ids);
    await client.query("COMMIT");
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.patch("/api/admin/questions/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { errors, values } = validQuestion(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the question fields.", fields: errors });
  const requestedQuizId = req.body.quizId == null ? null : Number(req.body.quizId);
  if (requestedQuizId !== null && (!Number.isInteger(requestedQuizId) || requestedQuizId < 1)) {
    return res.status(400).json({ error: "Choose a valid quiz assignment." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const initial = await client.query("SELECT quiz_id FROM questions WHERE id = $1", [req.params.id]);
    if (!initial.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found." });
    }
    const sourceQuizId = initial.rows[0].quiz_id;
    const destinationQuizId = requestedQuizId || sourceQuizId;
    const lockedQuizzes = await client.query(
      "SELECT id FROM quizzes WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
      [[...new Set([sourceQuizId, destinationQuizId])]]
    );
    if (lockedQuizzes.rows.length < new Set([sourceQuizId, destinationQuizId]).size) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Quiz assignment not found." });
    }
    const question = await client.query("SELECT id, quiz_id, position FROM questions WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!question.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found." });
    }
    const current = question.rows[0];
    const sourceList = await client.query("SELECT id FROM questions WHERE quiz_id = $1 ORDER BY position, id FOR UPDATE", [sourceQuizId]);
    const sourceIds = sourceList.rows.map((row) => row.id).filter((id) => id !== current.id);
    let destinationIds = sourceIds;
    let position;
    if (destinationQuizId === sourceQuizId) {
      position = Math.max(1, Math.min(values.position || current.position, sourceIds.length + 1));
      destinationIds.splice(position - 1, 0, current.id);
    } else {
      const destinationList = await client.query("SELECT id FROM questions WHERE quiz_id = $1 ORDER BY position, id FOR UPDATE", [destinationQuizId]);
      destinationIds = destinationList.rows.map((row) => row.id);
      position = Math.max(1, Math.min(values.position || destinationIds.length + 1, destinationIds.length + 1));
      destinationIds.splice(position - 1, 0, current.id);
    }
    await client.query(
      `UPDATE questions SET question_text = $1, choice_a = $2, choice_b = $3, choice_c = $4,
        choice_d = $5, correct_choice = $6, quiz_id = $7 WHERE id = $8`,
      [values.text, ...values.choices, values.correct, destinationQuizId, current.id]
    );
    if (destinationQuizId !== sourceQuizId) await normalizeQuestionPositions(client, sourceIds);
    await normalizeQuestionPositions(client, destinationIds);
    await client.query("COMMIT");
    res.json({ saved: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.patch("/api/admin/questions/:id/visibility", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query("UPDATE questions SET hidden = $1 WHERE id = $2 RETURNING id", [Boolean(req.body.hidden), req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: "Question not found." });
  res.json({ saved: true });
}));

app.delete("/api/admin/questions/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const initial = await client.query("SELECT quiz_id FROM questions WHERE id = $1", [req.params.id]);
    if (!initial.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found." });
    }
    await client.query("SELECT id FROM quizzes WHERE id = $1 FOR UPDATE", [initial.rows[0].quiz_id]);
    const question = await client.query("SELECT id, quiz_id FROM questions WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!question.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found." });
    }
    const history = await client.query("SELECT EXISTS (SELECT 1 FROM answer_events WHERE question_id = $1) AS has_history", [req.params.id]);
    if (history.rows[0].has_history && req.body.force !== true) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This question has answer history. Hide it to preserve analytics, or confirm permanent deletion." });
    }
    await client.query("DELETE FROM questions WHERE id = $1", [req.params.id]);
    const remaining = await client.query("SELECT id FROM questions WHERE quiz_id = $1 ORDER BY position, id FOR UPDATE", [question.rows[0].quiz_id]);
    await normalizeQuestionPositions(client, remaining.rows.map((row) => row.id));
    await client.query("COMMIT");
    res.json({ deleted: true, historyRemoved: history.rows[0].has_history });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/admin/quizzes/:id/import/preview", requireAuth, requireAdmin, ensureCsvRequest, asyncRoute(async (req, res) => {
  const quizId = Number(req.params.id);
  const quiz = await pool.query("SELECT id FROM quizzes WHERE id = $1", [quizId]);
  if (!quiz.rows[0]) return res.status(404).json({ error: "Quiz not found." });
  if (!Buffer.isBuffer(req.body) || req.body.length > 5 * 1024 * 1024) return res.status(400).json({ error: "CSV file must be 5 MB or smaller." });
  const source = req.body.toString("utf8");
  const parsed = parseCsv(source);
  if (!parsed.rows.length) return res.status(400).json({ error: "The CSV file is empty." });
  const headers = parsed.rows[0].values.map((value) => value.trim().toLowerCase());
  const required = ["question", "choice_a", "choice_b", "choice_c", "choice_d", "correct"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return res.status(400).json({ error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` });
  if (new Set(headers).size !== headers.length) return res.status(400).json({ error: "Column names must be unique." });
  const dataRows = parsed.rows.slice(1);
  if (dataRows.length > 500) return res.status(400).json({ error: "A CSV file can contain at most 500 question rows." });
  const allowed = new Set([...required, "position"]);
  const unknown = headers.filter((header) => !allowed.has(header));
  const existingQuestions = await pool.query("SELECT lower(question_text) AS text FROM questions WHERE quiz_id = $1", [quizId]);
  const seen = new Set(existingQuestions.rows.map((row) => row.text));
  const previewRows = [];
  const errors = parsed.errors;
  const malformedRows = new Set(parsed.errors.map((error) => error.row));
  const validRows = [];
  let skipped = 0;
  for (const record of dataRows) {
    if (!record.values.some((value) => value.trim())) continue;
    if (malformedRows.has(record.number)) continue;
    if (record.values.length !== headers.length) {
      errors.push({ row: record.number, reason: `Expected ${headers.length} columns but found ${record.values.length}.` });
      continue;
    }
    const row = Object.fromEntries(headers.map((header, index) => [header, record.values[index].trim()]));
    const question = row.question || "";
    const choices = [row.choice_a, row.choice_b, row.choice_c, row.choice_d];
    const correct = String(row.correct || "").trim().toLowerCase();
    const position = row.position ? Number(row.position) : null;
    let error = null;
    if (question.length < 3 || question.length > 500) error = '"question" must be 3–500 characters.';
    else if (choices.some((choice) => !choice || choice.length > 200)) error = "Each answer choice must be 1–200 characters.";
    else if (!["a", "b", "c", "d"].includes(correct)) error = '"correct" must be A, B, C, or D.';
    else if (new Set(choices.map((choice) => choice.toLowerCase())).size !== 4) error = "Answer choices in a row must be unique.";
    else if (row.position && (!Number.isInteger(position) || position < 1)) error = '"position" must be a whole number of 1 or more.';
    if (error) {
      errors.push({ row: record.number, reason: error });
      continue;
    }
    const normalizedQuestion = question.toLocaleLowerCase();
    if (seen.has(normalizedQuestion)) {
      skipped++;
      previewRows.push({ row: record.number, question, choices, correct, status: "duplicate" });
      continue;
    }
    seen.add(normalizedQuestion);
    const valid = { row: record.number, question, choices, correct, position };
    validRows.push(valid);
    previewRows.push({ row: record.number, question, choices, correct, status: "valid" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  importPreviews.set(token, { quizId, userId: req.user.id, validRows, createdAt: Date.now() });
  for (const [key, value] of importPreviews) if (Date.now() - value.createdAt > 30 * 60 * 1000) importPreviews.delete(key);
  res.json({
    token,
    summary: { valid: validRows.length, skipped, errors: errors.length },
    rows: previewRows.slice(0, 20),
    errors,
    warnings: unknown.length ? [`Unknown columns ignored: ${unknown.join(", ")}.`] : []
  });
}));

app.post("/api/admin/quizzes/:id/import/commit", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const token = String(req.body.token || "");
  const preview = importPreviews.get(token);
  if (!preview || preview.quizId !== Number(req.params.id) || preview.userId !== req.user.id) return res.status(400).json({ error: "Preview this CSV again before importing." });
  importPreviews.delete(token);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quiz = await client.query("SELECT id FROM quizzes WHERE id = $1 FOR UPDATE", [preview.quizId]);
    if (!quiz.rows[0]) throw new Error("Quiz not found.");
    const current = await client.query("SELECT question_text FROM questions WHERE quiz_id = $1", [preview.quizId]);
    const existing = new Set(current.rows.map((row) => row.question_text.toLocaleLowerCase()));
    const max = await client.query("SELECT COALESCE(MAX(position), 0)::int AS max FROM questions WHERE quiz_id = $1", [preview.quizId]);
    let nextPosition = max.rows[0].max + 1;
    let added = 0;
    let skipped = 0;
    const rows = [...preview.validRows].sort((a, b) => (a.position || Infinity) - (b.position || Infinity) || a.row - b.row);
    for (const row of rows) {
      const normalized = row.question.toLocaleLowerCase();
      if (existing.has(normalized)) {
        skipped++;
        continue;
      }
      existing.add(normalized);
      let position = row.position;
      if (!position || await positionTaken(client, preview.quizId, position)) position = nextPosition;
      nextPosition = Math.max(nextPosition, position + 1);
      await client.query(
        `INSERT INTO questions (quiz_id, question_text, choice_a, choice_b, choice_c, choice_d, correct_choice, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [preview.quizId, row.question, ...row.choices, row.correct, position]
      );
      added++;
    }
    await client.query("COMMIT");
    res.json({ added, skipped });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.message === "Quiz not found.") return res.status(404).json({ error: error.message });
    throw error;
  } finally {
    client.release();
  }
}));

async function positionTaken(client, quizId, position) {
  const result = await client.query("SELECT EXISTS (SELECT 1 FROM questions WHERE quiz_id = $1 AND position = $2) AS taken", [quizId, position]);
  return result.rows[0].taken;
}

app.get("/api/admin/users", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.role, u.disabled, u.joined_at AS "joinedAt",
      COUNT(a.id) FILTER (WHERE a.status = 'completed')::int AS "totalAttempts",
      COUNT(DISTINCT a.quiz_id) FILTER (WHERE a.status = 'completed')::int AS "quizzesPlayed"
     FROM users u LEFT JOIN attempts a ON a.user_id = u.id
     GROUP BY u.id ORDER BY u.joined_at DESC`
  );
  res.json({ users: result.rows });
}));

app.get("/api/admin/users/:id/attempts", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT a.id, q.title AS "quizTitle", a.status, a.points, a.total_questions AS "totalQuestions",
      a.started_at AS "startedAt", a.finished_at AS "finishedAt"
     FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = $1 ORDER BY a.started_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json({ attempts: result.rows });
}));

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id && (req.body.role === "player" || req.body.disabled === true)) return res.status(400).json({ error: "You cannot remove your own admin access or disable your own account." });
  const role = req.body.role;
  if (role != null && !["admin", "player"].includes(role)) return res.status(400).json({ error: "Choose a valid role." });
  const disabled = req.body.disabled;
  if (disabled != null && typeof disabled !== "boolean") return res.status(400).json({ error: "Disabled must be true or false." });
  const result = await pool.query(
    "UPDATE users SET role = COALESCE($1, role), disabled = COALESCE($2, disabled) WHERE id = $3 RETURNING id",
    [role ?? null, disabled ?? null, targetId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found." });
  res.json({ saved: true });
}));

app.get("/api/admin/stats", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const quizId = req.query.quizId ? Number(req.query.quizId) : null;
  const from = req.query.from || "1970-01-01";
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  if (quizId && !Number.isInteger(quizId)) return res.status(400).json({ error: "Invalid quiz filter." });
  const overview = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM attempts WHERE status = 'completed' AND finished_at >= $1::date AND finished_at < $2::date + INTERVAL '1 day' AND ($3::int IS NULL OR quiz_id = $3)) AS "attemptsToday",
      (SELECT ROUND(AVG(points::numeric * 100 / NULLIF(total_questions, 0)), 1) FROM attempts WHERE status = 'completed' AND finished_at >= $1::date AND finished_at < $2::date + INTERVAL '1 day' AND ($3::int IS NULL OR quiz_id = $3)) AS "averageScore",
      (SELECT COUNT(*)::int FROM attempts WHERE status = 'completed' AND finished_at >= CURRENT_DATE AND ($3::int IS NULL OR quiz_id = $3)) AS "completedToday"`,
    [from, to, quizId]
  );
  const trends = await pool.query(
    `SELECT finished_at::date AS day, COUNT(*)::int AS attempts,
      ROUND(AVG(points::numeric * 100 / NULLIF(total_questions, 0)), 1) AS "averageScore"
     FROM attempts WHERE status = 'completed' AND finished_at >= $1::date AND finished_at < $2::date + INTERVAL '1 day'
       AND ($3::int IS NULL OR quiz_id = $3)
     GROUP BY day ORDER BY day`,
    [from, to, quizId]
  );
  const misses = await pool.query(
    `SELECT q.id, LEFT(q.question_text, 90) AS question, COUNT(*)::int AS "timesAnswered",
      ROUND(100.0 * COUNT(*) FILTER (WHERE NOT e.is_correct) / NULLIF(COUNT(*), 0), 1) AS "missRate"
     FROM answer_events e JOIN questions q ON q.id = e.question_id
       JOIN attempts a ON a.id = e.attempt_id
     WHERE a.status = 'completed' AND a.finished_at >= $1::date AND a.finished_at < $2::date + INTERVAL '1 day'
       AND ($3::int IS NULL OR a.quiz_id = $3)
     GROUP BY q.id ORDER BY "missRate" DESC, "timesAnswered" DESC LIMIT 10`,
    [from, to, quizId]
  );
  const scoreBands = await pool.query(
    `SELECT CASE
        WHEN points::numeric * 100 / NULLIF(total_questions, 0) < 20 THEN '0–19%'
        WHEN points::numeric * 100 / NULLIF(total_questions, 0) < 40 THEN '20–39%'
        WHEN points::numeric * 100 / NULLIF(total_questions, 0) < 60 THEN '40–59%'
        WHEN points::numeric * 100 / NULLIF(total_questions, 0) < 80 THEN '60–79%'
        ELSE '80–100%' END AS band, COUNT(*)::int AS attempts
     FROM attempts WHERE status = 'completed' AND finished_at >= $1::date AND finished_at < $2::date + INTERVAL '1 day'
       AND ($3::int IS NULL OR quiz_id = $3)
     GROUP BY band ORDER BY MIN(points::numeric / NULLIF(total_questions, 0))`,
    [from, to, quizId]
  );
  const rangeDays = Math.max(1, Math.ceil((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1);
  const previousFrom = new Date(new Date(`${from}T00:00:00Z`).getTime() - rangeDays * 86400000).toISOString().slice(0, 10);
  const previousTo = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const byQuiz = await pool.query(
    `SELECT q.id, q.title, COUNT(a.id)::int AS attempts,
      ROUND(AVG(a.points::numeric * 100 / NULLIF(a.total_questions, 0)), 1) AS "averageScore",
      ROUND(AVG(EXTRACT(EPOCH FROM (a.finished_at - a.started_at)))::numeric, 0) AS "averageSeconds",
      (SELECT ROUND(AVG(p.points::numeric * 100 / NULLIF(p.total_questions, 0)), 1)
       FROM attempts p WHERE p.quiz_id = q.id AND p.status = 'completed'
         AND p.finished_at >= $4::date AND p.finished_at < $5::date + INTERVAL '1 day') AS "previousAverageScore"
     FROM quizzes q LEFT JOIN attempts a ON a.quiz_id = q.id AND a.status = 'completed'
       AND a.finished_at >= $1::date AND a.finished_at < $2::date + INTERVAL '1 day'
     WHERE ($3::int IS NULL OR q.id = $3)
     GROUP BY q.id ORDER BY q.id`,
    [from, to, quizId, previousFrom, previousTo]
  );
  res.json({ overview: overview.rows[0], trends: trends.rows, scoreBands: scoreBands.rows, misses: misses.rows, quizzes: byQuiz.rows });
}));

app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route not found." });
  res.sendFile(path.join(__dirname, "public", "index.html"), (error) => error && next(error));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Quiz app listening on port ${PORT}`);
  });

  process.on("SIGTERM", async () => {
    await pool.end();
    process.exit(0);
  });
}

module.exports = { app, pool };
