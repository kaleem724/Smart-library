const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./config/db'); // डेटाबेस कनेक्शन

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'smart_library_secret_key',
  resave: false,
  saveUninitialized: false
}));

// ✨ ग्लोबल यूनिवर्सल फिक्स: सभी EJS टेम्पलेट्स के लिए वेरिएबल्स सेट करना
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = (req.session.user && req.session.user.is_admin) ? req.session.user.is_admin : null;
  res.locals.flash = null;
  res.locals.books = [];
  res.locals.rows = []; // रिजर्वेशन पेज के लिए
  next();
});

// Helper wrapper for async routes
const w = fn => (req, res, next) => fn(req, res, next).catch(next);

// Authentication Middleware
const auth = {
  student: (req, res, next) => req.session.user ? next() : res.redirect('/login'),
  admin: (req, res, next) => (req.session.user && req.session.user.is_admin) ? next() : res.redirect('/login')
};

// ==================== ROUTES ====================

// Home Route
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/books');
  }
  res.render('index');
});

// Catalog / Books Route
app.get('/books', w(async (req, res) => {
  const [books] = await db.query("SELECT * FROM books");
  res.render('books', { books });
}));

// Book Details Route
app.get('/books/:id', w(async (req, res) => {
  const [b] = await db.query("SELECT * FROM books WHERE id = ?", [req.params.id]);
  if (!b.length) return res.status(404).send('Book not found');
  res.render('book-details', { book: b[0] || b });
}));

// Login Routes
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/books');
  }
  res.render('login');
});

app.post('/login', w(async (req, res) => {
  const { email, password } = req.body;
  const [users] = await db.query("SELECT * FROM students WHERE email = ?", [email]);
  
  // यहाँ फिक्स किया: users.length चेक करने के बाद users[0] को पासवर्ड से मैच किया
  if (users.length && users[0].password_hash === password) { 
    req.session.user = users[0]; 
    return res.redirect('/books');
  }
  res.render('login', { error: 'Invalid username or password' });
}));

// Register Routes
app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/books');
  }
  res.render('register');
});

app.post('/register', w(async (req, res) => {
  const { name, email, password } = req.body;
  try {
    await db.query("INSERT INTO students (name, email, password_hash) VALUES (?, ?, ?)", [name, email, password]);
    res.redirect('/login');
  } catch (err) {
    res.render('register', { error: 'Registration failed. Try again.' });
  }
}));

// Logout Route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// --- RESERVATIONS PAGE ROUTE ---
app.get('/reservations', auth.student, w(async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT r.id, b.title, b.author, r.status, r.reservation_date FROM reservations r JOIN books b ON r.book_id = b.id WHERE r.student_id = ?",
      [req.session.user.id]
    );
    res.render('reservations', { rows });
  } catch (e) {
    console.error(e);
    res.status(500).send("Database error");
  }
}));

// Book Reservation Action
app.post('/books/:id/reserve', auth.student, w(async (req, res) => {
  try {
    const [d] = await db.query("SELECT id FROM reservations WHERE student_id=? AND book_id=? AND status IN('Pending','Approved')", [req.session.user.id, req.params.id]);
    if (!d.length) {
      await db.query('INSERT INTO reservations(student_id, book_id) VALUES(?,?)', [req.session.user.id, req.params.id]);
    }
  } catch (e) {
    throw e;
  }
  res.redirect('/reservations');
}));

// Cancel Reservation Action
app.post('/reservations/:id/cancel', auth.student, w(async (req, res) => {
  await db.query("UPDATE reservations SET status = 'Cancelled' WHERE id = ? AND student_id = ?", [req.params.id, req.session.user.id]);
  res.redirect('/reservations');
}));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong on the server.');
});

// --- FIXED HOST & PORT FOR RAILWAY ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});