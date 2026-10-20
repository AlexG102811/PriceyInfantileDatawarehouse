# Brightside Quiz App

A responsive quiz app built with plain HTML, CSS, and JavaScript, Node.js 24, Express 5, and PostgreSQL.

## Start the app

Replit provides `DATABASE_URL` and `SESSION_SECRET` in the project environment. The app does not run schema changes automatically when it starts.

1. Apply the development schema once with `npm run db:setup`.
2. Add `ADMIN_USERNAME` and `ADMIN_PASSWORD` to Replit Secrets, then run `npm run seed`. `ADMIN_EMAIL` is optional. The admin password must be at least 12 characters.
3. Start the server with `npm run dev` (or `npm start`).
4. Register a player account from the sign-in screen.

The seed command adds five quizzes with ten questions each: three about baseball and two about Rainbow Six Siege. It does not overwrite existing question sets. It archives the original general-knowledge sample quizzes without deleting their questions or attempt history. Regular registration always creates a player account.

For production, publish the development schema through Replit's Publish flow. Do not run the development setup command against a production database. Seed production content and the initial admin separately using that environment's approved database workflow.


## Run the regression tests

Run `npm test` in the development environment. Tests use `DATABASE_URL` to create a uniquely named temporary schema, apply the app schema there, and drop it when the run finishes. They do not read or modify the app's regular tables or seed data, and refuse to run with `NODE_ENV=production`.

## Included features

- Player registration, sign-in, sign-out, and profile/password updates.
- Hashed passwords and signed, HTTP-only, seven-day sliding session cookies.
- Five seeded quizzes, each with ten questions; timed quizzes use server-side elapsed-time enforcement.
- Saved completed, in-progress, and abandoned attempts; score review, history, and retry.
- Overall and per-quiz leaderboards with deterministic tie-breaking.
- Admin quiz/question management, question visibility controls, validated CSV preview/import, user role/access management, and analytics.

## CSV template

The first line must contain `question,choice_a,choice_b,choice_c,choice_d,correct`. An optional `position` column is supported. The CSV preview checks up to 500 data rows before saving anything.
