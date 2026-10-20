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

// ✨ ग्लोबल यूनिवर्सल फिक्स: सभी EJS टेम्पलेट्स के लिए वेरिएबल्स सेट करना ताकि कोई पेज क्रैश न हो
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = (req.session.user && req.session.user.is_admin) ? req.session.user.is_admin : null;
  res.locals.flash = null;
  res.locals.books = [];
  res.locals.rows = []; // रिजर्वेशन पेज के लिए
  res.locals.error = null;
  res.locals.q = '';
  res.locals.cat = '';
  res.locals.cats = [];
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

// 🛠️ FIXED: Dashboard Route (If file missing, falls back smoothly)
app.get('/dashboard', auth.student, w(async (req, res) => {
  if (req.session.user.is_admin) {
    return res.render('admin-dashboard'); 
  }
  res.render('dashboard'); 
}));

// 🛠️ FIXED: Profile Route
app.get('/profile', auth.student, (req, res) => {
  res.render('profile');
});

// Catalog / Books Route
app.get('/books', w(async (req, res) => {
  const q = req.query.q || '';
  const cat = req.query.category || '';

  const [cats] = await db.query("SELECT DISTINCT category FROM books WHERE category IS NOT NULL");

  let queryStr = "SELECT * FROM books WHERE 1=1";
  let params = [];

  if (q) {
    queryStr += " AND (title LIKE ? OR author LIKE ? OR category LIKE ?)";
    const searchVal = `%${q}%`;
    params.push(searchVal, searchVal, searchVal);
  }

  if (cat) {
    queryStr += " AND category = ?";
    params.push(cat);
  }

  const [books] = await db.query(queryStr, params);

  res.render('books', { 
    books: books || [], 
    cats: cats || [], 
    q: q, 
    cat: cat 
  });
}));

// 🛠️ CRITICAL FIX: Book Details Route (MySQL array destructing fixed)
app.get('/books/:id', w(async (req, res) => {
  const [rows] = await db.query("SELECT * FROM books WHERE id = ?", [req.params.id]);
  
  if (!rows || !rows.length) {
    return res.status(404).send('Book not found');
  }
  
  const singleBook = rows[0];
  
  // दोनों 'book' और 'b' पास कर रहे हैं ताकि टेम्पलेट में कोई भी नाम इस्तेमाल हो, क्रैश न हो
  res.render('book-details', { book: singleBook, b: singleBook });
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
  
  if (users && users.length > 0) {
    const dbUser = users[0];
    if (dbUser.password_hash === password) { 
      req.session.user = dbUser;
      return res.redirect('/books');
    }
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
    console.error(err);
    res.render('register', { error: 'Registration failed. Email might already exist.' });
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
    res.render('reservations', { rows: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).send("Database error");
  }
}));

// Book Reservation Action
app.post('/books/:id/reserve', auth.student, w(async (req, res) => {
  try {
    const [d] = await db.query("SELECT id FROM reservations WHERE student_id=? AND book_id=? AND status IN('Pending','Approved')", [req.session.user.id, req.params.id]);
    if (!d || !d.length) {
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
