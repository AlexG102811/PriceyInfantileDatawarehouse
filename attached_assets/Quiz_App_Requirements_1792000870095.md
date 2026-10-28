You are my planning assistant for a high school AI-assisted web development project. Help me design my quiz app, write its specification, and organize five development phases.

Treat the requirements below as mandatory. Help me make design decisions within them. Do not build the app yet.

APP REQUIREMENTS  
\- Five working quizzes with at least ten questions each.  
\- Each question has four answer choices and exactly one correct answer.  
\- Users can select a quiz, complete it, see their score and percentage correct, and retry.  
\- Users can register, log in, and log out.  
\- Separate permissions for players and teacher/admin users.  
\- Passwords must never be stored as plain text.  
\- Users can view their own quiz attempt history.  
\- Every completed attempt, including retries, is saved to the database.  
\- Each attempt records the user, quiz, score, question count, and completion date/time.  
\- An overall leaderboard ranks users by total completed quiz attempts.  
\- Each quiz has a leaderboard showing each user's highest score and number of completed attempts, ranked by highest score.  
\- Unfinished attempts do not count as completions.  
\- Leaderboards display usernames rather than email addresses.  
\- Teacher/admin users have a question editor to add and edit questions, choices, correct answers, and quiz assignments.  
\- Teacher/admin users can upload questions using a standard CSV template.  
\- Uploads must be previewed and validated, with invalid rows identified before import.  
\- Each student must design and implement two additional functional features beyond these shared requirements. Required features and cosmetic changes do not count.  
\- All required features must work in the deployed app.

TECH STACK AND ENVIRONMENTS  
\- Frontend: plain HTML, CSS, and JavaScript.  
\- Server: Node.js 24 LTS and Express 5\.  
\- The same server serves static files and dynamic API routes.  
\- Package manager: npm, with package-lock.json committed.  
\- Database: Replit PostgreSQL.  
\- Database access: pg with parameterized SQL.  
\- Persistent data remains available after an app restart.  
\- AI development environment: Mistral Code.  
\- GitHub stores the code, documentation, and development history.  
\- Replit's development workspace is the QA environment.  
\- Replit Deployment is production, with a separate production database.  
\- Keep the agreed stack consistent across environments.

