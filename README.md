# Smart Library & Book Reservation System
Node.js + Express + EJS + MySQL (mysql2), sessions, bcrypt hashing (bcryptjs, no native build needed on Windows).

## Setup (Windows, VS Code, PowerShell)
1. Install Node.js LTS (nodejs.org) and MySQL Community Server + Workbench (dev.mysql.com).
2. In the project folder:
   ```
   npm install
   copy .env.example .env      # then edit .env: DB_PASSWORD and a long random SESSION_SECRET
   mysql -u root -p < sql/schema.sql
   npm run create-admin -- admin YourStrongPassword1
   npm start
   ```
3. Open http://localhost:3000

## Test checklist
- Register a student, log in, search/filter the catalogue, open a book, reserve it.
- Try reserving it again (duplicate blocked); reserve a book with 0 copies (blocked).
- Cancel a pending reservation from "My Reservations".
- Admin login at /admin/login: add/edit/delete books, view students, approve/reject reservations, mark returned (copies adjust).
- Visit /nonsense for the 404 page.

## Reservation rules
Pending requests don't hold a copy; approval decrements availability (row-locked transaction, never negative); return or admin-cancel of an approved loan restores it.
