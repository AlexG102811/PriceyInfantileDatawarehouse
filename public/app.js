const state = {
  user: null,
  view: "home",
  authMode: "login",
  quizzes: [],
  attempts: [],
  boardMode: "overall",
  boardQuiz: "",
  attempt: null,
  result: null,
  adminTab: "quizzes",
  adminQuizzes: [],
  selectedQuiz: null,
  adminQuestions: [],
  questionEdit: null,
  csvPreview: null,
  csvFile: null,
  adminUsers: [],
  selectedAdminUser: null,
  selectedUserAttempts: [],
  stats: null,
  adminQuizForm: false,
  statsFrom: "",
  statsTo: "",
  statsQuiz: "",
  modalAction: null
};

const appRoot = document.querySelector("#app");
const difficultyNames = { easy: "Easy", easy_medium: "Easy–medium", medium: "Medium", hard: "Hard", expert: "Expert" };
const topicIcons = { Science: "✳", "World History": "⌛", Geography: "⌖", Literature: "Aa", Technology: "⌘" };
let pendingSaves = Promise.resolve();
let questionShownAt = Date.now();
let timerInterval = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function initials(name = "?") {
  return escapeHtml(name.trim().slice(0, 1).toUpperCase() || "?");
}

function fmtDate(value, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", ...options }).format(new Date(value));
}

function fmtDuration(start, finish) {
  if (!start || !finish) return "—";
  const seconds = Math.max(0, Math.round((new Date(finish) - new Date(start)) / 1000));
  const mins = Math.floor(seconds / 60);
  return mins ? `${mins}m ${seconds % 60}s` : `${seconds}s`;
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof Blob) && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { credentials: "same-origin", ...options, headers });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.fields = payload.fields;
    throw error;
  }
  return payload;
}

function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast${type === "error" ? " error" : ""}`;
  element.textContent = message;
  document.querySelector("#toast-region").append(element);
  setTimeout(() => element.remove(), 3400);
}

function navLink(view, label, icon = "") {
  const active = state.view === view || (view === "admin" && state.view.startsWith("admin"));
  return `<button class="nav-link${active ? " active" : ""}" data-view="${view}">${icon ? `<span class="nav-icon">${icon}</span>` : ""}${label}</button>`;
}

function header() {
  const isAdmin = state.user?.role === "admin";
  return `<header class="topbar"><div class="topbar-inner">
    <a class="brand" href="#" data-view="home"><span class="brand-mark">B</span> Brightside</a>
    <nav class="nav-links" aria-label="Main navigation">
      ${navLink("home", "Home")}${navLink("quizzes", "Quizzes")}${navLink("leaderboard", "Leaderboard")}${navLink("history", "My history")}
      ${isAdmin ? navLink("admin", "Teacher tools") : ""}
    </nav>
    <div class="top-user"><button class="avatar" data-view="profile" aria-label="Open profile">${initials(state.user?.username)}</button><span class="user-name">${escapeHtml(state.user?.username)}</span><button class="button quiet small" data-action="logout">Sign out</button></div>
  </div></header>
  <nav class="mobile-nav" aria-label="Mobile navigation">
    ${navLink("home", "Home", "⌂")}${navLink("quizzes", "Quizzes", "▤")}${navLink("leaderboard", "Leaders", "♙")}${navLink("history", "History", "◷")}${state.user?.role === "admin" ? navLink("admin", "Admin", "⚙") : ""}
  </nav>`;
}

function pageHead(eyebrow, title, subtitle, action = "") {
  return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}</div>${action}</div>`;
}

function quizCard(quiz) {
  const limit = quiz.timeLimitSeconds ? `<span>◷ ${Math.round(quiz.timeLimitSeconds / 60)} min</span>` : "<span>Untimed</span>";
  const best = quiz.myBest != null ? `<span>Best <strong>${quiz.myBest}/${quiz.questionCount}</strong></span>` : "";
  return `<article class="card quiz-card">
    <div class="quiz-top"><span class="topic-icon">${topicIcons[quiz.topic] || "✦"}</span><span class="difficulty ${escapeHtml(quiz.difficulty)}">${escapeHtml(difficultyNames[quiz.difficulty] || quiz.difficulty)}</span></div>
    <h3>${escapeHtml(quiz.title)}</h3><p class="topic">${escapeHtml(quiz.topic)}</p>
    <div class="quiz-meta"><span>${quiz.questionCount} questions</span>${limit}${best}</div>
    <div class="quiz-footer"><span class="muted" style="font-size:12px">${quiz.myCompletions ? `${quiz.myCompletions} ${quiz.myCompletions === 1 ? "try" : "tries"}` : "Ready when you are"}</span>
      <button class="button small" data-action="start-quiz" data-id="${quiz.id}">Play <span aria-hidden="true">→</span></button>
    </div>
  </article>`;
}

async function loadQuizzes() {
  const data = await api("/api/quizzes");
  state.quizzes = data.quizzes;
}

async function loadAttempts() {
  const data = await api("/api/me/attempts");
  state.attempts = data.attempts;
}

function homePage() {
  const completed = state.attempts.filter((attempt) => attempt.status === "completed");
  const best = completed.length ? Math.max(...completed.map((attempt) => Math.round(attempt.points * 100 / attempt.totalQuestions))) : null;
  const last = state.attempts.find((attempt) => attempt.status === "in_progress");
  const action = last ? `<button class="button" data-action="resume-quiz" data-id="${last.id}">Continue quiz <span>→</span></button>` : `<button class="button" data-view="quizzes">Find a quiz <span>→</span></button>`;
  return `<main class="main">
    <section class="welcome"><div class="welcome-copy"><p class="eyebrow">A little curiosity goes a long way</p>
      <h1>Hey ${escapeHtml(state.user.username)}, ready to surprise yourself?</h1>
      <p>Pick a topic, trust what you know, and learn something new along the way. Your next tiny victory is just a few questions away.</p>${action}
    </div><div class="welcome-art" aria-hidden="true"><span>?</span></div></section>
    <section class="stats-grid">
      <div class="card stat-card"><p class="stat-label">Quizzes completed</p><p class="stat-value">${completed.length}</p><p class="stat-note">Every attempt counts</p></div>
      <div class="card stat-card"><p class="stat-label">Personal best</p><p class="stat-value">${best == null ? "—" : `${best}%`}</p><p class="stat-note">Across completed quizzes</p></div>
      <div class="card stat-card"><p class="stat-label">Topics to explore</p><p class="stat-value">${state.quizzes.length}</p><p class="stat-note">Pick one that sparks joy</p></div>
    </section>
    <div class="section-row"><h2>Pick up something new</h2><button class="text-link" data-view="quizzes">See all quizzes →</button></div>
    <section class="quiz-grid">${state.quizzes.slice(0, 3).map(quizCard).join("")}</section>
  </main>`;
}

function quizzesPage() {
  const active = state.attempts.find((attempt) => attempt.status === "in_progress");
  const continueCard = active ? `<div class="alert info" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span>You have a quiz in progress. Its timer keeps running if it is timed.</span><button class="button small" data-action="resume-quiz" data-id="${active.id}">Resume</button></div>` : "";
  return `<main class="main">${pageHead("Choose your next challenge", "Explore quizzes", "Five curious corners to explore. Pick a topic that sounds fun.")}${continueCard}<section class="quiz-grid">${state.quizzes.map(quizCard).join("") || `<div class="card empty"><div class="empty-icon">✦</div><h3>No published quizzes yet</h3><p>Ask your teacher to publish a quiz, then it will show up here.</p></div>`}</section></main>`;
}

function leaderboardTable(entries, kind, me) {
  if (!entries?.length) return `<div class="card empty"><div class="empty-icon">♙</div><h3>You're early to the leaderboard</h3><p>Finish a quiz to earn your first spot here.</p><button class="button" data-view="quizzes">Browse quizzes</button></div>`;
  const isQuiz = kind === "quiz";
  return `<div class="card table-card"><div class="table-scroll"><table class="mobile-stack">
    <thead><tr><th>Rank</th><th>Player</th>${isQuiz ? "<th>Best score</th><th>Attempts</th><th>Achieved</th>" : "<th>Completed attempts</th><th>Quizzes played</th><th>Member since</th>"}</tr></thead>
    <tbody>${entries.map((entry, index) => {
      const rank = Number(entry.rank);
      const medal = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
      return `<tr><td data-label="Rank"><span class="rank ${medal}">${rank}</span></td>
        <td data-label="Player"><span class="user-cell"><span class="avatar">${initials(entry.username)}</span>${escapeHtml(entry.username)}${entry.id === state.user.id ? `<span class="you-tag">You</span>` : ""}</span></td>
        ${isQuiz
          ? `<td data-label="Best score"><strong>${entry.bestPoints}</strong> pts <span class="muted">· ${Math.round(entry.bestPoints * 100 / (state.selectedQuiz?.questionCount || 10))}%</span></td><td data-label="Attempts">${entry.attempts}</td><td data-label="Achieved">${fmtDate(entry.bestAchievedAt)}</td>`
          : `<td data-label="Completed attempts"><strong>${entry.totalAttempts}</strong></td><td data-label="Quizzes played">${entry.quizzesPlayed}</td><td data-label="Member since">${fmtDate(entry.joinedAt)}</td>`}
      </tr>`;
    }).join("")}</tbody></table></div></div>
    ${me && !entries.some((entry) => entry.id === state.user.id) ? `<div class="alert info" style="margin-top:14px;margin-bottom:0">Your best: <strong>#${me.rank}</strong> · ${isQuiz ? `${me.bestPoints} points in ${me.attempts} attempts` : `${me.totalAttempts} completed attempts`}</div>` : ""}`;
}

async function leaderboardPage() {
  let entries = [];
  let me = null;
  if (state.boardMode === "overall") {
    const data = await api("/api/leaderboard/overall");
    entries = data.entries;
    me = data.me;
  } else {
    const quizId = state.boardQuiz || state.quizzes[0]?.id;
    if (!quizId) return `<main class="main">${pageHead("The friendly competition", "Leaderboard", "See who's been collecting points.")}<div class="card empty"><p>No quizzes are available.</p></div></main>`;
    state.boardQuiz = String(quizId);
    const [data, quizInfo] = await Promise.all([
      api(`/api/leaderboard/quizzes/${quizId}`),
      api(`/api/quizzes/${quizId}`)
    ]);
    entries = data.entries;
    me = data.me;
    state.selectedQuiz = quizInfo.quiz;
  }
  const controls = `<div class="board-controls"><div class="tabs"><button class="tab${state.boardMode === "overall" ? " active" : ""}" data-action="board-mode" data-mode="overall">Overall</button><button class="tab${state.boardMode === "quiz" ? " active" : ""}" data-action="board-mode" data-mode="quiz">By quiz</button></div>
    ${state.boardMode === "quiz" ? `<select class="select" id="board-quiz" aria-label="Choose a quiz">${state.quizzes.map((quiz) => `<option value="${quiz.id}" ${String(quiz.id) === state.boardQuiz ? "selected" : ""}>${escapeHtml(quiz.title)}</option>`).join("")}</select>` : ""}</div>`;
  return `<main class="main">${pageHead("The friendly competition", "Leaderboard", "A little bragging-rights board for the curious.", controls)}${leaderboardTable(entries, state.boardMode, me)}</main>`;
}

function historyPage() {
  const rows = state.attempts;
  const body = rows.map((attempt) => {
    const status = attempt.status === "in_progress" ? `<span class="pill">In progress</span>` : attempt.status === "abandoned" ? `<span class="pill hidden">Abandoned</span>` : `<span class="pill published">Completed</span>`;
    return `<tr><td data-label="Quiz"><strong>${escapeHtml(attempt.quizTitle)}</strong></td><td data-label="Status">${status}</td>
      <td data-label="Score">${attempt.status === "completed" ? `<strong>${attempt.points}/${attempt.totalQuestions}</strong> <span class="muted">· ${Math.round(attempt.points * 100 / attempt.totalQuestions)}%</span>` : "—"}</td>
      <td data-label="Date">${fmtDate(attempt.finishedAt || attempt.startedAt)}</td><td data-label="Time">${fmtDuration(attempt.startedAt, attempt.finishedAt)}</td>
      <td data-label="Action">${attempt.status === "in_progress" ? `<button class="button small" data-action="resume-quiz" data-id="${attempt.id}">Resume</button><button class="button quiet small" data-action="abandon" data-id="${attempt.id}">Discard</button>` : attempt.status === "completed" ? `<button class="button secondary small" data-action="view-result" data-id="${attempt.id}">Review</button><button class="button quiet small" data-action="retry-quiz" data-id="${attempt.quizId}">Retry</button>` : "—"}</td></tr>`;
  }).join("");
  return `<main class="main">${pageHead("Your journey so far", "My history", "Every finished attempt is saved here, including retries.")}${rows.length
    ? `<div class="card table-card"><div class="table-scroll"><table class="mobile-stack"><thead><tr><th>Quiz</th><th>Status</th><th>Score</th><th>Date</th><th>Time</th><th>Action</th></tr></thead><tbody>${body}</tbody></table></div></div>`
    : `<div class="card empty"><div class="empty-icon">◷</div><h3>Your story starts here</h3><p>Once you finish a quiz, you’ll find your score and retry options here.</p><button class="button" data-view="quizzes">Choose a quiz</button></div>`}</main>`;
}

function profilePage() {
  return `<main class="main">${pageHead("Your account", "Profile", "Keep your player details up to date.")}<div class="card profile-card">
    <div class="profile-heading"><span class="avatar large">${initials(state.user.username)}</span><div><h2>${escapeHtml(state.user.username)}</h2><p>${escapeHtml(state.user.email)} · ${state.user.role === "admin" ? "Teacher / admin" : "Player"}</p></div></div>
    <form id="profile-form"><div class="form-grid">
      <div class="field"><label for="profile-username">Username</label><input id="profile-username" name="username" maxlength="24" required value="${escapeHtml(state.user.username)}"></div>
      <div class="field"><label for="profile-email">Email address</label><input id="profile-email" name="email" type="email" required value="${escapeHtml(state.user.email)}"></div>
    </div><div class="separator"></div><h3>Change password</h3><p class="subtitle" style="margin-bottom:18px">Leave these empty if you want to keep your current password.</p>
    <div class="form-grid"><div class="field"><label for="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password"></div><div class="field"><label for="new-password">New password</label><input id="new-password" name="newPassword" type="password" minlength="10" autocomplete="new-password"><span class="field-hint">At least 10 characters.</span></div></div>
    <button class="button" type="submit">Save profile</button></form>
    <div class="separator"></div><h3>Delete your account</h3><p class="subtitle" style="margin-bottom:15px">This permanently removes your account and leaderboard entries.</p><button class="button danger" data-action="delete-account">Delete account</button>
  </div></main>`;
}

function questionRow(question) {
  return `<tr><td data-label="#">${question.position}</td><td data-label="Question"><strong>${escapeHtml(question.questionText.length > 65 ? `${question.questionText.slice(0, 62)}…` : question.questionText)}</strong></td>
    <td data-label="Correct">${question.correctChoice.toUpperCase()}</td><td data-label="Status"><span class="pill ${question.hidden ? "hidden" : "published"}">${question.hidden ? "Hidden" : "Active"}</span></td>
    <td data-label="Actions"><div class="admin-actions"><button class="button secondary small" data-action="edit-question" data-id="${question.id}">Edit</button><button class="button quiet small" data-action="toggle-question" data-id="${question.id}" data-hidden="${question.hidden}">${question.hidden ? "Show" : "Hide"}</button><button class="button danger small" data-action="delete-question" data-id="${question.id}">Delete</button></div></td></tr>`;
}

function questionForm(question = null) {
  const row = question || {};
  const choices = ["a", "b", "c", "d"];
  return `<section class="card editor-card"><h3>${question ? `Editing Q${question.position} — ${escapeHtml(question.questionText.slice(0, 44))}` : "Add a question"}</h3>
    <form id="question-form" data-question-id="${question?.id || ""}">
      ${question ? `<div class="field" style="max-width:360px"><label for="question-quiz">Quiz assignment</label><select id="question-quiz" class="select" name="quizId">${state.adminQuizzes.map((quiz) => `<option value="${quiz.id}" ${quiz.id === state.selectedQuiz.id ? "selected" : ""}>${escapeHtml(quiz.title)}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label for="question-text">Question text</label><textarea id="question-text" name="questionText" rows="3" maxlength="500" minlength="3" required placeholder="Enter the question">${escapeHtml(row.questionText || "")}</textarea><span class="field-hint"><span id="question-char-count">${(row.questionText || "").length}</span>/500 characters</span></div>
      <div class="choices-editor">${choices.map((letter) => `<div class="field"><label for="choice-${letter}">Choice ${letter.toUpperCase()}</label><div class="choice-input"><span class="choice-letter">${letter.toUpperCase()}</span><input id="choice-${letter}" name="choice_${letter}" maxlength="200" required value="${escapeHtml(row[`choice_${letter}`] || "")}"></div>
        <label class="correct-choice"><input type="radio" name="correct_choice" value="${letter}" ${row.correctChoice === letter ? "checked" : ""}> This is the correct answer</label></div>`).join("")}</div>
      <div class="field" style="max-width:220px"><label for="question-position">Position</label><input id="question-position" name="position" type="number" min="1" step="1" value="${row.position || ""}" placeholder="Next available"></div>
      <div class="admin-actions"><button class="button" type="submit">Save question</button><button class="button quiet" type="button" data-action="cancel-question">Cancel</button></div>
    </form></section>`;
}

function quizSettings(quiz) {
  return `<section class="card editor-card"><h3>Quiz details</h3><form id="quiz-settings-form" data-quiz-id="${quiz.id}">
    <div class="form-grid"><div class="field"><label for="quiz-title">Title</label><input id="quiz-title" name="title" value="${escapeHtml(quiz.title)}" maxlength="100" required></div>
    <div class="field"><label for="quiz-topic">Topic</label><input id="quiz-topic" name="topic" value="${escapeHtml(quiz.topic)}" maxlength="60" required></div>
    <div class="field"><label for="quiz-difficulty">Difficulty</label><select id="quiz-difficulty" class="select" name="difficulty">${Object.entries(difficultyNames).map(([value, label]) => `<option value="${value}" ${quiz.difficulty === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
    <div class="field"><label for="quiz-time-limit">Time limit in minutes</label><input id="quiz-time-limit" name="timeLimitMinutes" type="number" min="1" max="120" value="${quiz.timeLimitSeconds ? Math.round(quiz.timeLimitSeconds / 60) : ""}" placeholder="Leave empty for untimed"></div></div>
    <label class="correct-choice" style="font-size:13px;margin:0 0 16px"><input type="checkbox" name="isPublished" ${quiz.isPublished ? "checked" : ""}> Published and visible to players</label>
    <p class="field-hint">Changing the question set during a competition makes quiz scores harder to compare.</p><button class="button secondary" type="submit">Save quiz details</button></form></section>`;
}

function csvPreviewMarkup(preview) {
  if (!preview) return "";
  const rows = preview.rows.map((row) => `<tr><td>${row.row}</td><td>${escapeHtml(row.question.length > 60 ? `${row.question.slice(0, 57)}…` : row.question)}</td>
    ${row.choices.map((choice) => `<td>${escapeHtml(choice)}</td>`).join("")}<td><strong>${row.correct.toUpperCase()}</strong></td><td class="${row.status === "valid" ? "csv-good" : "muted"}">${row.status === "valid" ? "Valid" : "Duplicate"}</td></tr>`).join("");
  return `<div class="editor-card card"><h3>Import preview</h3><div class="stats-grid">
    <div class="stat-card"><p class="stat-label">Valid</p><p class="stat-value">${preview.summary.valid}</p></div>
    <div class="stat-card"><p class="stat-label">Duplicates skipped</p><p class="stat-value">${preview.summary.skipped}</p></div>
    <div class="stat-card"><p class="stat-label">Errors</p><p class="stat-value">${preview.summary.errors}</p></div></div>
    ${preview.warnings.map((warning) => `<div class="alert info" style="margin-top:12px">${escapeHtml(warning)}</div>`).join("")}
    ${preview.errors.length ? `<div class="alert" style="margin:14px 0 0"><strong>Rows to fix</strong>${preview.errors.map((error) => `<div class="csv-error">Row ${error.row}: ${escapeHtml(error.reason)}</div>`).join("")}</div>` : ""}
    <div class="csv-table"><table><thead><tr><th>Row</th><th>Question</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Correct</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='8'>No non-empty rows to preview.</td></tr>"}</tbody></table></div>
    <div class="admin-actions" style="margin-top:16px"><button class="button" data-action="commit-csv" ${preview.summary.valid ? "" : "disabled"}>Import ${preview.summary.valid} questions</button>${preview.errors.length ? `<button class="button secondary" data-action="download-csv-errors">Download error report</button>` : ""}<button class="button quiet" data-action="cancel-csv">Cancel</button></div>
  </div>`;
}

function adminQuizEditor() {
  const quiz = state.selectedQuiz;
  if (!quiz) return "";
  const warning = quiz.attempts > 0 ? `<div class="alert info">This quiz already has completed attempts. Editing questions does not change old scores, but changing the question count can make the leaderboard harder to compare.</div>` : "";
  return `<div class="admin-actions" style="margin-bottom:16px"><button class="button quiet small" data-action="back-admin-quizzes">← All quizzes</button><span class="muted">${escapeHtml(quiz.title)}</span></div>
    ${warning}${quizSettings(quiz)}
    <div class="section-row"><div><h2>Questions <span class="muted">(${state.adminQuestions.length})</span></h2><p class="subtitle">Keep each question clear and give players four distinct choices.</p></div>
      <div class="admin-actions"><button class="button secondary small" data-action="show-csv">Upload CSV</button><input id="csv-file" type="file" accept=".csv,text/csv" hidden><button class="button small" data-action="new-question">+ Add question</button></div></div>
    ${state.questionEdit !== undefined ? questionForm(state.questionEdit) : ""}
    ${state.csvPreview ? csvPreviewMarkup(state.csvPreview) : ""}
    <div class="card table-card"><div class="table-scroll"><table class="mobile-stack"><thead><tr><th>#</th><th>Question</th><th>Correct</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${state.adminQuestions.map(questionRow).join("") || `<tr><td colspan="5"><div class="empty"><h3>No questions yet</h3><p>Add one question at a time or upload a CSV file.</p></div></td></tr>`}
    </tbody></table></div></div>`;
}

function adminQuizzesPage() {
  if (state.selectedQuiz) return adminQuizEditor();
  const rows = state.adminQuizzes.map((quiz) => `<tr><td data-label="Quiz"><strong>${escapeHtml(quiz.title)}</strong><div class="muted">${escapeHtml(quiz.topic)}</div></td>
    <td data-label="Difficulty"><span class="difficulty ${quiz.difficulty}">${difficultyNames[quiz.difficulty]}</span></td><td data-label="Questions">${quiz.questionCount}</td><td data-label="Attempts">${quiz.attempts}</td>
    <td data-label="Status"><span class="pill ${quiz.isPublished ? "published" : "hidden"}">${quiz.isPublished ? "Published" : "Draft"}</span></td>
    <td data-label="Action"><button class="button secondary small" data-action="edit-quiz" data-id="${quiz.id}">Edit quiz</button></td></tr>`).join("");
  return `${pageHead("Manage the question bank", "Quizzes & questions", "Create quizzes, tune the timer, and keep questions up to date.", `<button class="button" data-action="new-quiz">+ New quiz</button>`)}
    ${state.adminQuizForm ? `<section class="card editor-card"><h3>Create a quiz</h3><form id="new-quiz-form"><div class="form-grid">
      <div class="field"><label>Title</label><input name="title" required maxlength="100"></div><div class="field"><label>Topic</label><input name="topic" required maxlength="60"></div>
      <div class="field"><label>Difficulty</label><select class="select" name="difficulty">${Object.entries(difficultyNames).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
      <div class="field"><label>Time limit (minutes)</label><input name="timeLimitMinutes" type="number" min="1" max="120" placeholder="Untimed"></div></div>
      <label class="correct-choice" style="font-size:13px;margin-bottom:16px"><input type="checkbox" name="isPublished" checked> Published</label><div class="admin-actions"><button class="button">Create quiz</button><button type="button" class="button quiet" data-action="cancel-new-quiz">Cancel</button></div></form></section>` : ""}
    <div class="card table-card"><div class="table-scroll"><table class="mobile-stack"><thead><tr><th>Quiz</th><th>Difficulty</th><th>Questions</th><th>Attempts</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function adminUsersPage() {
  const rows = state.adminUsers.map((user) => `<tr><td data-label="Player"><span class="user-cell"><span class="avatar">${initials(user.username)}</span>${escapeHtml(user.username)}${user.id === state.user.id ? `<span class="you-tag">You</span>` : ""}</span><div class="muted">${escapeHtml(user.email)}</div></td>
    <td data-label="Role"><select class="select user-role" data-id="${user.id}" ${user.id === state.user.id ? "disabled" : ""}><option value="player" ${user.role === "player" ? "selected" : ""}>Player</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>Teacher / admin</option></select></td>
    <td data-label="Status"><span class="pill ${user.disabled ? "hidden" : "published"}">${user.disabled ? "Disabled" : "Active"}</span></td>
    <td data-label="Activity">${user.totalAttempts} attempts · ${user.quizzesPlayed} quizzes</td><td data-label="Joined">${fmtDate(user.joinedAt)}</td>
    <td data-label="Actions"><div class="admin-actions"><button class="button secondary small" data-action="user-history" data-id="${user.id}">History</button>${user.id !== state.user.id ? `<button class="button ${user.disabled ? "secondary" : "danger"} small" data-action="toggle-user" data-id="${user.id}" data-disabled="${user.disabled}">${user.disabled ? "Re-enable" : "Disable"}</button>` : ""}</div></td></tr>`).join("");
  const detail = state.selectedAdminUser ? `<section class="card editor-card"><div class="section-row" style="margin-top:0"><div><h3 style="margin:0">${escapeHtml(state.selectedAdminUser.username)}’s attempts</h3><p class="subtitle">Read-only account history.</p></div><button class="button quiet small" data-action="close-user-history">Close</button></div>
    ${state.selectedUserAttempts.length ? `<div class="table-scroll"><table><thead><tr><th>Quiz</th><th>Status</th><th>Score</th><th>Date</th></tr></thead><tbody>${state.selectedUserAttempts.map((attempt) => `<tr><td>${escapeHtml(attempt.quizTitle)}</td><td>${escapeHtml(attempt.status)}</td><td>${attempt.points == null ? "—" : `${attempt.points}/${attempt.totalQuestions}`}</td><td>${fmtDate(attempt.finishedAt || attempt.startedAt)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No attempts yet.</p>`}</section>` : "";
  return `${pageHead("Accounts & access", "Players", "Review activity and manage player access. Passwords are never shown.")}${detail}
    <div class="card table-card"><div class="table-scroll"><table class="mobile-stack"><thead><tr><th>Player</th><th>Role</th><th>Status</th><th>Activity</th><th>Joined</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderBars(items, key, valueKey, color = "#8580ef") {
  if (!items.length) return `<div class="empty" style="padding:28px 10px"><p>No data for this date range.</p></div>`;
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey]) || 0));
  return `<div class="bars">${items.map((item) => {
    const value = Number(item[valueKey]) || 0;
    return `<div class="bar-group" title="${escapeHtml(item[key])}: ${value}"><span class="bar" style="height:${Math.max(3, value / max * 100)}%;background:${color}"></span><span class="bar-label">${escapeHtml(String(item[key]).slice(5) || "—")}</span></div>`;
  }).join("")}</div>`;
}

function adminStatsPage() {
  const stats = state.stats;
  if (!stats) return `<div class="empty"><p>Loading analytics…</p></div>`;
  return `<div class="filter-bar card"><div class="field"><label for="stats-from">From</label><input id="stats-from" type="date" value="${escapeHtml(state.statsFrom)}"></div>
    <div class="field"><label for="stats-to">To</label><input id="stats-to" type="date" value="${escapeHtml(state.statsTo)}"></div>
    <div class="field"><label for="stats-quiz">Quiz</label><select class="select" id="stats-quiz"><option value="">All quizzes</option>${state.adminQuizzes.map((quiz) => `<option value="${quiz.id}" ${String(quiz.id) === state.statsQuiz ? "selected" : ""}>${escapeHtml(quiz.title)}</option>`).join("")}</select></div>
    <button class="button small" data-action="apply-stats">Apply</button></div>
    <section class="stats-grid"><div class="card stat-card"><p class="stat-label">Registered players</p><p class="stat-value">${stats.overview.users}</p></div>
    <div class="card stat-card"><p class="stat-label">Completed in range</p><p class="stat-value">${stats.overview.attemptsToday}</p><p class="stat-note">Completed attempts in the selected dates</p></div>
    <div class="card stat-card"><p class="stat-label">Average score</p><p class="stat-value">${stats.overview.averageScore == null ? "—" : `${stats.overview.averageScore}%`}</p></div></section>
    <section class="analytics-grid"><div class="card chart-card"><h3>Completed quizzes over time</h3><p class="subtitle">Daily attempts in the selected range</p>${renderBars(stats.trends, "day", "attempts")}</div>
    <div class="card chart-card"><h3>Score distribution</h3><p class="subtitle">Completed attempts by percentage band</p>${renderBars(stats.scoreBands.map((band) => ({ ...band, day: band.band, attempts: band.attempts })), "day", "attempts", "#65b583")}</div>
    <div class="card chart-card"><h3>Most-missed questions</h3><p class="subtitle">Questions with the highest incorrect-answer share</p>
      ${stats.misses.length ? stats.misses.map((item) => `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:10px;font-size:12px"><span>${escapeHtml(item.question)}</span><strong>${item.missRate}%</strong></div><div class="quiz-progress" style="height:6px;margin:7px 0"><span style="width:${Math.min(100, item.missRate)}%;background:#e27661"></span></div><span class="field-hint">${item.timesAnswered} answers</span></div>`).join("") : `<p class="muted" style="margin-top:20px">No answer data in this range.</p>`}
    </div></section>
    <div class="section-row"><h2>Quiz performance</h2></div><div class="card table-card"><div class="table-scroll"><table class="mobile-stack"><thead><tr><th>Quiz</th><th>Attempts</th><th>Average score</th><th>Average time</th><th>vs. prior range</th></tr></thead><tbody>${stats.quizzes.map((quiz) => {
      const change = quiz.averageScore == null || quiz.previousAverageScore == null ? "—" : `${Number(quiz.averageScore) - Number(quiz.previousAverageScore) > 0 ? "+" : ""}${(Number(quiz.averageScore) - Number(quiz.previousAverageScore)).toFixed(1)} pts`;
      return `<tr><td data-label="Quiz"><strong>${escapeHtml(quiz.title)}</strong></td><td data-label="Attempts">${quiz.attempts}</td><td data-label="Average score">${quiz.averageScore == null ? "—" : `${quiz.averageScore}%`}</td><td data-label="Average time">${quiz.averageSeconds == null ? "—" : `${Math.floor(quiz.averageSeconds / 60)}m ${quiz.averageSeconds % 60}s`}</td><td data-label="vs. prior range">${change}</td></tr>`;
    }).join("")}</tbody></table></div></div>`;
}

async function loadAdmin() {
  const data = await api("/api/admin/quizzes");
  state.adminQuizzes = data.quizzes;
  if (state.selectedQuiz) state.selectedQuiz = state.adminQuizzes.find((quiz) => quiz.id === state.selectedQuiz.id) || null;
  if (state.adminTab === "users") {
    state.adminUsers = (await api("/api/admin/users")).users;
    if (state.selectedAdminUser) state.selectedAdminUser = state.adminUsers.find((user) => user.id === state.selectedAdminUser.id) || null;
  }
  if (state.adminTab === "stats") await loadStats();
}

async function loadStats() {
  const today = new Date().toISOString().slice(0, 10);
  state.statsFrom ||= new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  state.statsTo ||= today;
  const params = new URLSearchParams({ from: state.statsFrom, to: state.statsTo });
  if (state.statsQuiz) params.set("quizId", state.statsQuiz);
  state.stats = await api(`/api/admin/stats?${params}`);
}

function adminPage() {
  const tabs = [
    ["quizzes", "Quizzes & questions"],
    ["users", "Players"],
    ["stats", "Analytics"]
  ];
  const content = state.adminTab === "users" ? adminUsersPage() : state.adminTab === "stats" ? adminStatsPage() : adminQuizzesPage();
  return `<main class="main"><div class="admin-layout"><aside class="card admin-side">${tabs.map(([value, label]) => `<button class="nav-link ${state.adminTab === value ? "active" : ""}" data-action="admin-tab" data-tab="${value}">${label}</button>`).join("")}</aside><div class="admin-content">${content}</div></div></main>`;
}

function playPage() {
  const attempt = state.attempt;
  if (!attempt) return `<main class="main"><div class="card empty"><h3>Quiz not found</h3><button class="button" data-view="quizzes">Back to quizzes</button></div></main>`;
  const question = attempt.questions[attempt.index];
  if (!question) return `<main class="main"><div class="card empty"><h3>This question is no longer available.</h3><button class="button" data-action="finish-quiz">Finish quiz</button></div></main>`;
  const letters = ["a", "b", "c", "d"];
  const selected = attempt.answers[question.id] || "";
  const secondsLeft = attempt.timeLimitSeconds ? Math.max(0, Math.ceil((new Date(attempt.startedAt).getTime() + attempt.timeLimitSeconds * 1000 - Date.now()) / 1000)) : null;
  const timer = secondsLeft == null ? "" : `<span class="timer${secondsLeft < 60 ? " urgent" : ""}" id="timer-chip" data-seconds="${secondsLeft}">◷ ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}</span>`;
  const resumeNotice = state.resumeNotice ? `<div class="alert info" style="margin-top:18px;margin-bottom:0">Time kept running while you were away. Your remaining time is shown above.</div>` : "";
  state.resumeNotice = false;
  return `<main class="main"><div class="play-header"><div><p class="eyebrow">${escapeHtml(attempt.quizTitle || "Quiz in progress")}</p><h1 style="font-size:26px">Stay curious</h1></div>
    <div class="admin-actions">${timer}<button class="button quiet small" data-action="leave-quiz">Save & exit</button></div></div>
    <div class="quiz-progress" aria-label="Quiz progress"><span style="width:${Math.round((attempt.index + 1) / attempt.questions.length * 100)}%"></span></div>
    ${resumeNotice}<section class="card question-card"><span class="question-count">QUESTION ${attempt.index + 1} OF ${attempt.questions.length}</span>
      <h2>${escapeHtml(question.questionText)}</h2><div class="answer-list">${letters.map((letter, index) => `<button class="answer-option${selected === letter ? " selected" : ""}" data-action="choose-answer" data-choice="${letter}"><span class="choice-letter">${String.fromCharCode(65 + index)}</span>${escapeHtml(question[letter])}</button>`).join("")}</div>
      <div class="play-footer"><div class="question-dots">${attempt.questions.map((item, index) => `<button class="question-dot${attempt.answers[item.id] ? " answered" : ""}${index === attempt.index ? " current" : ""}" data-action="go-question" data-index="${index}" aria-label="Question ${index + 1}">${index + 1}</button>`).join("")}</div>
      <div class="admin-actions">${attempt.index > 0 ? `<button class="button secondary" data-action="previous-question">Back</button>` : ""}${attempt.index < attempt.questions.length - 1 ? `<button class="button" data-action="next-question">Next question →</button>` : `<button class="button" data-action="finish-quiz">Finish quiz</button>`}</div></div>
    </section></main>`;
}

function resultsPage() {
  const result = state.result;
  if (!result) return `<main class="main"><div class="card empty"><p>Loading your result…</p></div></main>`;
  const attempt = result.attempt;
  const percent = Math.round(attempt.points * 100 / attempt.totalQuestions);
  const review = result.questions.map((question, index) => {
    const isCorrect = question.isCorrect;
    return `<article class="review-item ${isCorrect ? "correct" : "incorrect"}"><strong>${index + 1}. ${escapeHtml(question.questionText)}</strong>
      <p>Your answer: ${question.chosen ? escapeHtml(question[question.chosen]) : "No answer"}</p>
      ${!isCorrect ? `<p class="right-answer">Correct answer: ${escapeHtml(question[question.correct])}</p>` : ""}</article>`;
  }).join("");
  return `<main class="main"><section class="result-hero"><p class="eyebrow">Quiz complete</p><h1>${escapeHtml(attempt.quizTitle)}</h1>
    <div class="result-score">${attempt.points}<small> / ${attempt.totalQuestions}</small></div><h2>${percent}% correct</h2>
    <p class="subtitle">Finished ${fmtDate(attempt.finishedAt, { hour: "numeric", minute: "2-digit" })} · Time ${fmtDuration(attempt.startedAt, attempt.finishedAt)}</p>
    <div class="admin-actions" style="justify-content:center;margin-top:21px"><button class="button" data-action="retry-quiz" data-id="${attempt.quizId}">Try again</button><button class="button secondary" data-action="quiz-leaderboard" data-id="${attempt.quizId}">Quiz leaderboard</button><button class="button quiet" data-view="history">My history</button></div>
    </section><div class="section-row"><h2>Question review</h2><span class="muted" style="font-size:13px">${attempt.points} correct answers</span></div><section class="review-list">${review}</section></main>`;
}

function authPage() {
  const register = state.authMode === "register";
  return `<main class="auth-page"><section class="auth-side"><a class="brand" href="#"><span class="brand-mark">B</span> Brightside</a>
    <div class="auth-copy"><p class="eyebrow">Curiosity looks good on you</p><h1>A little quiz. A lot to learn.</h1><p>Pick a topic, take a few minutes, and see where your curiosity takes you.</p></div><p class="auth-foot">A friendly place to test what you know — and find out what you don’t.</p></section>
    <section class="auth-main"><div class="auth-box"><span class="brand-mark">B</span><h2>${register ? "Make yourself at home" : "Welcome back"}</h2><p>${register ? "Create your player account and pick your first quiz." : "Sign in to see your quizzes and pick up where you left off."}</p>
      <div class="auth-switch"><button class="${!register ? "active" : ""}" data-action="auth-mode" data-mode="login">Sign in</button><button class="${register ? "active" : ""}" data-action="auth-mode" data-mode="register">Create account</button></div>
      <div id="auth-error" aria-live="polite"></div><form class="auth-form" id="auth-form" data-mode="${state.authMode}">
        ${register ? `<div class="field"><label for="auth-username">Username</label><input id="auth-username" name="username" autocomplete="username" minlength="3" maxlength="24" required placeholder="Your player name"><span class="field-hint">3–24 letters, numbers, dashes, or underscores.</span></div>` : `<div class="field"><label for="auth-identity">Username or email</label><input id="auth-identity" name="identity" autocomplete="username" required placeholder="Your username or email"></div>`}
        ${register ? `<div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>` : ""}
        <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="${register ? "10" : "1"}" required placeholder="${register ? "At least 10 characters" : "Your password"}"></div>
        <button class="button" type="submit">${register ? "Create account" : "Sign in"} <span>→</span></button>
      </form><p class="field-hint" style="margin-top:16px">Your password is securely hashed and never stored as plain text.</p>
    </div></section></main>`;
}

function modalMarkup() {
  const modal = state.modal;
  if (!modal) return "";
  return `<div class="modal-backdrop" role="presentation"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <p class="eyebrow">${escapeHtml(modal.eyebrow || "One quick check")}</p><h2 id="modal-title">${escapeHtml(modal.title)}</h2><p>${escapeHtml(modal.message)}</p>
    ${modal.input ? `<div class="field"><label for="modal-input">${escapeHtml(modal.inputLabel || "Password")}</label><input id="modal-input" type="${modal.inputType || "password"}" autocomplete="current-password"></div>` : ""}
    <div class="modal-actions"><button class="button quiet" data-action="close-modal">${escapeHtml(modal.cancelLabel || "Cancel")}</button>
    ${modal.alternative ? `<button class="button secondary" data-action="modal-alternative">${escapeHtml(modal.alternative.label)}</button>` : ""}
    <button class="button ${modal.danger ? "danger" : ""}" data-action="modal-confirm">${escapeHtml(modal.confirmLabel || "Confirm")}</button></div></section></div>`;
}

function render() {
  clearInterval(timerInterval);
  timerInterval = null;
  if (!state.user) {
    appRoot.innerHTML = authPage();
    return;
  }
  let content;
  if (state.view === "home") content = homePage();
  else if (state.view === "quizzes") content = quizzesPage();
  else if (state.view === "leaderboard") content = typeof leaderboardPageResult === "string" ? leaderboardPageResult : `<main class="main"><div class="card empty"><p>Loading leaderboard…</p></div></main>`;
  else if (state.view === "history") content = historyPage();
  else if (state.view === "profile") content = profilePage();
  else if (state.view === "admin") content = adminPage();
  else if (state.view === "play") content = playPage();
  else if (state.view === "results") content = resultsPage();
  else content = homePage();

  appRoot.innerHTML = `<div class="app-shell">${header()}${content}${modalMarkup()}</div>`;
  if (state.view === "play" && state.attempt?.timeLimitSeconds) {
    timerInterval = setInterval(() => {
      const chip = document.querySelector("#timer-chip");
      if (!chip || !state.attempt) return;
      const remaining = Math.max(0, Math.ceil((new Date(state.attempt.startedAt).getTime() + state.attempt.timeLimitSeconds * 1000 - Date.now()) / 1000));
      chip.textContent = `◷ ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
      chip.classList.toggle("urgent", remaining < 60);
      if (remaining <= 0) {
        clearInterval(timerInterval);
        toast("Time is up — submitting your answers.", "error");
        finishAttempt(true);
      }
    }, 1000);
  }
}

let leaderboardPageResult = "";

async function navigate(view) {
  state.view = view;
  state.modal = null;
  state.result = null;
  state.questionEdit = null;
  state.csvPreview = null;
  try {
    if (view === "home" || view === "quizzes" || view === "leaderboard") {
      await Promise.all([loadQuizzes(), loadAttempts()]);
      leaderboardPageResult = "";
      if (view === "leaderboard") leaderboardPageResult = await leaderboardPage();
    }
    if (view === "history") await loadAttempts();
    if (view === "admin") {
      if (state.user.role !== "admin") throw new Error("Teacher access is required.");
      await loadAdmin();
    }
    if (view === "play" && !state.attempt) return navigate("quizzes");
    if (view === "results" && !state.result) return navigate("history");
    render();
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      render();
    } else {
      toast(error.message, "error");
      render();
    }
  }
}

async function loadProfile() {
  const data = await api("/api/auth/me");
  state.user = data.user;
}

async function startQuiz(id) {
  try {
    const data = await api(`/api/quizzes/${id}/attempts`, { method: "POST", body: "{}" });
    state.attempt = {
      id: data.attempt.id,
      startedAt: data.attempt.startedAt,
      timeLimitSeconds: data.attempt.timeLimitSeconds,
      quizTitle: state.quizzes.find((quiz) => quiz.id === Number(id))?.title || "Quiz",
      quizId: Number(id),
      questions: data.questions,
      answers: {},
      index: 0
    };
    questionShownAt = Date.now();
    await navigate("play");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function resumeQuiz(id) {
  try {
    const data = await api(`/api/attempts/${id}`);
    state.attempt = {
      id: Number(id), ...data.attempt,
      questions: data.questions,
      answers: Object.fromEntries(data.answers.map((answer) => [answer.questionId, answer.choice])),
      index: Math.max(0, data.questions.findIndex((question) => !data.answers.some((answer) => answer.questionId === question.id)))
    };
    state.resumeNotice = Boolean(state.attempt.timeLimitSeconds);
    if (state.attempt.index === -1) state.attempt.index = 0;
    questionShownAt = Date.now();
    await navigate("play");
  } catch (error) {
    if (error.status === 409) {
      await api(`/api/attempts/${id}/finish`, { method: "POST", body: "{}" }).catch(() => {});
      await viewResult(id);
    } else toast(error.message, "error");
  }
}

async function viewResult(id) {
  try {
    const data = await api(`/api/attempts/${id}/results`);
    state.result = data;
    state.view = "results";
    render();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function finishAttempt(auto = false) {
  if (!state.attempt || state.finishing) return;
  state.finishing = true;
  try {
    await pendingSaves.catch(() => {});
    await api(`/api/attempts/${state.attempt.id}/finish`, { method: "POST", body: "{}" });
    const id = state.attempt.id;
    state.finishing = false;
    state.attempt = null;
    if (auto) toast("Your time is up. Your score is ready.");
    await viewResult(id);
  } catch (error) {
    state.finishing = false;
    toast(error.message, "error");
  }
}

function confirmModal(config) {
  state.modal = config;
  render();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function clearFormErrors(container) {
  container.querySelectorAll(".alert").forEach((alert) => alert.remove());
}

function showFormError(form, message) {
  const alert = document.createElement("div");
  alert.className = "alert";
  alert.textContent = message;
  form.prepend(alert);
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  clearFormErrors(form);

  if (form.id === "auth-form") {
    const values = formValues(form);
    try {
      const endpoint = form.dataset.mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const result = await api(endpoint, { method: "POST", body: JSON.stringify(values) });
      state.user = result.user;
      state.view = "home";
      await navigate("home");
    } catch (error) {
      document.querySelector("#auth-error").innerHTML = `<div class="alert">${escapeHtml(error.message)}</div>`;
    }
    return;
  }
  if (form.id === "profile-form") {
    try {
      const result = await api("/api/me", { method: "PATCH", body: JSON.stringify(formValues(form)) });
      state.user = result.user;
      toast("Profile saved.");
      render();
    } catch (error) { showFormError(form, error.message); }
    return;
  }
  if (form.id === "question-form") {
    const body = formValues(form);
    body.position = body.position || null;
    const id = form.dataset.questionId;
    try {
      await api(id ? `/api/admin/questions/${id}` : `/api/admin/quizzes/${state.selectedQuiz.id}/questions`, { method: id ? "PATCH" : "POST", body: JSON.stringify(body) });
      toast(id ? "Question updated." : "Question added.");
      state.questionEdit = undefined;
      await loadAdmin();
      await loadAdminQuestions();
      render();
    } catch (error) { showFormError(form, error.message); }
    return;
  }
  if (form.id === "quiz-settings-form") {
    const values = formValues(form);
    const timeLimitSeconds = values.timeLimitMinutes ? Number(values.timeLimitMinutes) * 60 : null;
    try {
      await api(`/api/admin/quizzes/${form.dataset.quizId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: values.title, topic: values.topic, difficulty: values.difficulty, timeLimitSeconds, isPublished: form.elements.isPublished.checked })
      });
      toast("Quiz details saved.");
      await loadAdmin();
      state.selectedQuiz = state.adminQuizzes.find((quiz) => quiz.id === Number(form.dataset.quizId));
      render();
    } catch (error) { showFormError(form, error.message); }
    return;
  }
  if (form.id === "new-quiz-form") {
    const values = formValues(form);
    try {
      const result = await api("/api/admin/quizzes", { method: "POST", body: JSON.stringify({
        title: values.title, topic: values.topic, difficulty: values.difficulty,
        timeLimitSeconds: values.timeLimitMinutes ? Number(values.timeLimitMinutes) * 60 : null,
        isPublished: form.elements.isPublished.checked
      }) });
      state.adminQuizForm = false;
      await loadAdmin();
      state.selectedQuiz = state.adminQuizzes.find((quiz) => quiz.id === result.id);
      if (state.selectedQuiz) await loadAdminQuestions();
      toast("Quiz created. Add your first question.");
      render();
    } catch (error) { showFormError(form, error.message); }
  }
}

async function loadAdminQuestions() {
  if (!state.selectedQuiz) return;
  const data = await api(`/api/admin/quizzes/${state.selectedQuiz.id}/questions`);
  state.adminQuestions = data.questions;
}

async function refreshSelectedQuiz() {
  await loadAdmin();
  await loadAdminQuestions();
}

async function selectAdminQuiz(id) {
  const quiz = state.adminQuizzes.find((item) => item.id === Number(id));
  if (!quiz) return;
  state.selectedQuiz = quiz;
  state.questionEdit = undefined;
  state.csvPreview = null;
  await loadAdminQuestions();
  render();
}

async function actionClick(action, button) {
  const id = button.dataset.id;
  if (action === "logout") {
    await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
    state.user = null;
    state.view = "home";
    render();
  } else if (action === "auth-mode") {
    state.authMode = button.dataset.mode;
    render();
  } else if (action === "start-quiz" || action === "retry-quiz") {
    await startQuiz(Number(id));
  } else if (action === "resume-quiz") {
    await resumeQuiz(id);
  } else if (action === "view-result") {
    await viewResult(id);
  } else if (action === "choose-answer") {
    const attempt = state.attempt;
    const question = attempt?.questions[attempt.index];
    if (!question || state.finishing) return;
    attempt.answers[question.id] = button.dataset.choice;
    render();
    const msTaken = Math.max(0, Date.now() - questionShownAt);
    questionShownAt = Date.now();
    const body = JSON.stringify({ answers: [{ questionId: question.id, choice: button.dataset.choice, msTaken }] });
    pendingSaves = pendingSaves.then(() => api(`/api/attempts/${attempt.id}`, { method: "PATCH", body }));
    pendingSaves.catch((error) => toast(error.message, "error"));
  } else if (action === "next-question" || action === "previous-question") {
    const attempt = state.attempt;
    attempt.index = Math.max(0, Math.min(attempt.questions.length - 1, attempt.index + (action === "next-question" ? 1 : -1)));
    questionShownAt = Date.now();
    render();
  } else if (action === "go-question") {
    state.attempt.index = Number(button.dataset.index);
    questionShownAt = Date.now();
    render();
  } else if (action === "finish-quiz") {
    confirmModal({ title: "Finish this quiz?", message: "Your answers will be submitted and this attempt will count toward your history and the leaderboard.", confirmLabel: "Finish quiz", danger: false, onConfirm: () => finishAttempt() });
  } else if (action === "leave-quiz") {
    confirmModal({ title: "Save and exit?", message: "Your progress is saved. You can continue later, but the timer keeps running on timed quizzes.", confirmLabel: "Exit to home", onConfirm: () => navigate("home") });
  } else if (action === "abandon") {
    confirmModal({ title: "Discard this attempt?", message: "This unfinished attempt will be marked abandoned. It will not count toward your score or leaderboard.", confirmLabel: "Discard attempt", danger: true, onConfirm: async () => {
      await api(`/api/attempts/${id}/abandon`, { method: "POST", body: "{}" });
      toast("Attempt discarded.");
      await navigate("history");
    } });
  } else if (action === "board-mode") {
    state.boardMode = button.dataset.mode;
    await navigate("leaderboard");
  } else if (action === "quiz-leaderboard") {
    state.boardMode = "quiz";
    state.boardQuiz = id;
    await navigate("leaderboard");
  } else if (action === "admin-tab") {
    state.adminTab = button.dataset.tab;
    state.selectedQuiz = null;
    await navigate("admin");
  } else if (action === "new-quiz") {
    state.adminQuizForm = true;
    render();
  } else if (action === "cancel-new-quiz") {
    state.adminQuizForm = false;
    render();
  } else if (action === "edit-quiz") {
    await selectAdminQuiz(id);
  } else if (action === "back-admin-quizzes") {
    state.selectedQuiz = null;
    state.questionEdit = null;
    state.csvPreview = null;
    render();
  } else if (action === "new-question") {
    state.questionEdit = null;
    render();
  } else if (action === "edit-question") {
    state.questionEdit = state.adminQuestions.find((question) => question.id === Number(id));
    render();
  } else if (action === "cancel-question") {
    state.questionEdit = undefined;
    render();
  } else if (action === "toggle-question") {
    try {
      await api(`/api/admin/questions/${id}/visibility`, { method: "PATCH", body: JSON.stringify({ hidden: button.dataset.hidden !== "true" }) });
      await refreshSelectedQuiz();
      render();
      toast(button.dataset.hidden === "true" ? "Question is visible." : "Question hidden.");
    } catch (error) { toast(error.message, "error"); }
  } else if (action === "delete-question") {
    confirmModal({ title: "Delete this question?", message: "If it has answer history, you can hide it to preserve analytics or permanently delete it and remove its answer events. Past attempt scores are not recalculated.", confirmLabel: "Delete anyway", alternative: { label: "Hide instead", run: async () => {
      await api(`/api/admin/questions/${id}/visibility`, { method: "PATCH", body: JSON.stringify({ hidden: true }) });
      await refreshSelectedQuiz();
      toast("Question hidden. Answer history is preserved.");
      render();
    } }, danger: true, onConfirm: async () => {
      try {
        await api(`/api/admin/questions/${id}`, { method: "DELETE", body: JSON.stringify({ force: true }) });
        await refreshSelectedQuiz();
        toast("Question deleted.");
        render();
      } catch (error) { toast(error.message, "error"); }
    } });
  } else if (action === "show-csv") {
    state.csvPreview = null;
    document.querySelector("#csv-file")?.click();
  } else if (action === "cancel-csv") {
    state.csvPreview = null;
    state.csvFile = null;
    render();
  } else if (action === "commit-csv") {
    try {
      const data = await api(`/api/admin/quizzes/${state.selectedQuiz.id}/import/commit`, { method: "POST", body: JSON.stringify({ token: state.csvPreview.token }) });
      state.csvPreview = null;
      state.csvFile = null;
      await refreshSelectedQuiz();
      toast(`${data.added} questions added, ${data.skipped} skipped.`);
      render();
    } catch (error) { toast(error.message, "error"); }
  } else if (action === "download-csv-errors") {
    const csv = ["row,reason", ...state.csvPreview.errors.map((error) => `${error.row},"${error.reason.replace(/"/g, '""')}"`)].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "quiz-import-errors.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  } else if (action === "user-history") {
    const data = await api(`/api/admin/users/${id}/attempts`);
    state.selectedAdminUser = state.adminUsers.find((user) => user.id === Number(id));
    state.selectedUserAttempts = data.attempts;
    render();
  } else if (action === "close-user-history") {
    state.selectedAdminUser = null;
    state.selectedUserAttempts = [];
    render();
  } else if (action === "toggle-user") {
    const disabled = button.dataset.disabled !== "true";
    confirmModal({ title: disabled ? "Disable this account?" : "Re-enable this account?", message: disabled ? "This player will no longer be able to sign in or start a quiz. Their attempt history stays saved." : "This player will be able to sign in and start quizzes again.", confirmLabel: disabled ? "Disable account" : "Re-enable account", danger: disabled, onConfirm: async () => {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ disabled }) });
      await loadAdmin();
      toast(disabled ? "Account disabled." : "Account re-enabled.");
      render();
    } });
  } else if (action === "apply-stats") {
    state.statsFrom = document.querySelector("#stats-from").value;
    state.statsTo = document.querySelector("#stats-to").value;
    state.statsQuiz = document.querySelector("#stats-quiz").value;
    try {
      await loadStats();
      render();
    } catch (error) { toast(error.message, "error"); }
  } else if (action === "delete-account") {
    confirmModal({ title: "Delete your account?", message: "This permanently deletes your account, quiz history, and leaderboard entries. This cannot be undone.", confirmLabel: "Delete my account", input: true, danger: true, onConfirm: async () => {
      const password = document.querySelector("#modal-input").value;
      await api("/api/me", { method: "DELETE", body: JSON.stringify({ password }) });
      state.user = null;
      state.modal = null;
      toast("Your account has been deleted.");
      render();
    } });
  } else if (action === "close-modal") {
    state.modal = null;
    render();
  } else if (action === "modal-confirm") {
    const callback = state.modal?.onConfirm;
    state.modal = null;
    if (callback) {
      try { await callback(); }
      catch (error) { toast(error.message, "error"); render(); }
    } else render();
  } else if (action === "modal-alternative") {
    const callback = state.modal?.alternative?.run;
    state.modal = null;
    if (callback) {
      try { await callback(); } catch (error) { toast(error.message, "error"); render(); }
    } else render();
  }
}

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    event.preventDefault();
    await navigate(viewButton.dataset.view);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    await actionClick(actionButton.dataset.action, actionButton);
    return;
  }
  if (event.target.classList.contains("modal-backdrop")) {
    state.modal = null;
    render();
  }
});

document.addEventListener("submit", handleSubmit);

document.addEventListener("input", (event) => {
  if (event.target.id === "question-text") {
    const count = document.querySelector("#question-char-count");
    if (count) count.textContent = String(event.target.value.length);
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "board-quiz") {
    state.boardQuiz = event.target.value;
    await navigate("leaderboard");
  } else if (event.target.id === "csv-file") {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 5 * 1024 * 1024) {
      toast("Choose a CSV file smaller than 5 MB.", "error");
      return;
    }
    state.csvFile = file;
    try {
      const result = await api(`/api/admin/quizzes/${state.selectedQuiz.id}/import/preview`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: file
      });
      state.csvPreview = result;
      render();
    } catch (error) {
      toast(error.message, "error");
      if (state.selectedQuiz) render();
    }
  } else if (event.target.matches(".user-role")) {
    const id = event.target.dataset.id;
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ role: event.target.value }) });
      toast("Player role updated.");
      await loadAdmin();
      render();
    } catch (error) { toast(error.message, "error"); }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modal) {
    state.modal = null;
    render();
  }
});

async function boot() {
  try {
    await loadProfile();
    if (state.user) await navigate("home");
    else render();
  } catch (error) {
    state.user = null;
    render();
  }
}

boot();
