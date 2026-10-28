CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ranked_points INTEGER NOT NULL DEFAULT 0 CHECK (ranked_points >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ranked_points INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'easy_medium', 'medium', 'hard', 'expert')),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  time_limit_seconds INTEGER CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL CHECK (char_length(question_text) BETWEEN 3 AND 500),
  choice_a TEXT NOT NULL CHECK (char_length(choice_a) BETWEEN 1 AND 200),
  choice_b TEXT NOT NULL CHECK (char_length(choice_b) BETWEEN 1 AND 200),
  choice_c TEXT NOT NULL CHECK (char_length(choice_c) BETWEEN 1 AND 200),
  choice_d TEXT NOT NULL CHECK (char_length(choice_d) BETWEEN 1 AND 200),
  correct_choice CHAR(1) NOT NULL CHECK (correct_choice IN ('a', 'b', 'c', 'd')),
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL CHECK (position >= 1)
);

CREATE INDEX IF NOT EXISTS questions_quiz_position_idx ON questions(quiz_id, position, id);

CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  points INTEGER,
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  ranked_points_change INTEGER NOT NULL DEFAULT 0,
  ranked_points_after INTEGER NOT NULL DEFAULT 0 CHECK (ranked_points_after >= 0),
  question_snapshot INTEGER[] NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  CHECK ((status = 'completed' AND points IS NOT NULL AND finished_at IS NOT NULL)
      OR status <> 'completed')
);
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS ranked_points_change INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS ranked_points_after INTEGER NOT NULL DEFAULT 0;

WITH RECURSIVE ordered_attempts AS (
  SELECT id, user_id, ranked_points_change,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY finished_at, id) AS sequence
  FROM attempts
  WHERE status = 'completed'
), ranked_history AS (
  SELECT id, user_id, sequence, GREATEST(0, ranked_points_change)::int AS points_after
  FROM ordered_attempts
  WHERE sequence = 1
  UNION ALL
  SELECT next_attempt.id, next_attempt.user_id, next_attempt.sequence,
    GREATEST(0, ranked_history.points_after + next_attempt.ranked_points_change)::int
  FROM ordered_attempts next_attempt
  JOIN ranked_history
    ON ranked_history.user_id = next_attempt.user_id
    AND next_attempt.sequence = ranked_history.sequence + 1
)
UPDATE attempts a
SET ranked_points_after = ranked_history.points_after
FROM ranked_history
WHERE ranked_history.id = a.id;

CREATE INDEX IF NOT EXISTS attempts_user_finished_idx ON attempts(user_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS attempts_quiz_status_idx ON attempts(quiz_id, status);

CREATE TABLE IF NOT EXISTS answer_events (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  chosen_choice CHAR(1) NOT NULL CHECK (chosen_choice IN ('a', 'b', 'c', 'd')),
  is_correct BOOLEAN NOT NULL,
  ms_taken INTEGER NOT NULL DEFAULT 0 CHECK (ms_taken >= 0),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS answer_events_question_idx ON answer_events(question_id);
