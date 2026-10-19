require('dotenv').config();
const express=require('express'),session=require('express-session'),bcrypt=require('bcryptjs'),path=require('path');
const db=require('./config/db'),auth=require('./middleware/auth');
const app=express();
app.set('view engine','ejs');app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:false}));app.use(express.static(path.join(__dirname,'public')));
app.use(session({secret:process.env.SESSION_SECRET||'dev-only',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',maxAge:4*36e5}}));
app.use((req,res,next)=>{res.locals.user=req.session.user||null;res.locals.flash=req.session.flash||null;delete req.session.flash;next();});
const w=fn=>(req,res,next)=>fn(req,res,next).catch(next);
const flash=(req,type,msg)=>{req.session.flash={type,msg};};
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean=s=>String(s||'').trim();

// ---------- Public / auth ----------
app.get('/',w(async(req,res)=>{const [b]=await db.query('SELECT * FROM books ORDER BY id DESC LIMIT 4');res.render('index',{books:b});}));
app.get('/register',(req,res)=>res.render('register'));
app.post('/register',w(async(req,res)=>{
  const name=clean(req.body.name),email=clean(req.body.email).toLowerCase(),pw=req.body.password||'';
  if(name.length<2||!emailRe.test(email)||pw.length<8){flash(req,'error','Enter a valid name, email and a password of at least 8 characters.');return res.redirect('/register');}
  try{await db.query('INSERT INTO students(name,email,password_hash) VALUES(?,?,?)',[name,email,await bcrypt.hash(pw,12)]);}
  catch(e){if(e.code==='ER_DUP_ENTRY'){flash(req,'error','That email is already registered.');return res.redirect('/register');}throw e;}
  flash(req,'success','Registration successful. Please log in.');res.redirect('/login');}));
app.get('/login',(req,res)=>res.render('login',{admin:false}));
app.get('/admin/login',(req,res)=>res.render('login',{admin:true}));
const doLogin=admin=>w(async(req,res)=>{
  const id=clean(req.body.id),pw=req.body.password||'';
  const [r]=admin?await db.query('SELECT id,username AS name,password_hash FROM admins WHERE username=?',[id])
                 :await db.query('SELECT id,name,password_hash FROM students WHERE email=?',[id.toLowerCase()]);
  if(!r[0]||!(await bcrypt.compare(pw,r[0].password_hash))){flash(req,'error','Invalid credentials.');return res.redirect(admin?'/admin/login':'/login');}
  req.session.regenerate(()=>{req.session.user={id:r[0].id,name:r[0].name,role:admin?'admin':'student'};res.redirect(admin?'/admin':'/dashboard');});});
app.post('/login',doLogin(false));app.post('/admin/login',doLogin(true));
app.post('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));

// ---------- Student ----------
app.get('/dashboard',auth.student,w(async(req,res)=>{
  const [s]=await db.query("SELECT COUNT(*) total,SUM(status='Pending') pending,SUM(status='Approved') approved FROM reservations WHERE student_id=?",[req.session.user.id]);
  const [[a]]=await db.query('SELECT COALESCE(SUM(available_qty),0) n FROM books');
  res.render('dashboard',{s:s[0],avail:a.n});}));
app.get('/books',w(async(req,res)=>{
  const q=clean(req.query.q),cat=clean(req.query.category),like='%'+q+'%';
  const [books]=await db.query('SELECT * FROM books WHERE (title LIKE ? OR author LIKE ? OR category LIKE ?) AND (?="" OR category=?) ORDER BY title',[like,like,like,cat,cat]);
  const [cats]=await db.query('SELECT DISTINCT category FROM books ORDER BY category');
  res.render('books',{books,cats,q,cat});}));
app.get('/books/:id',w(async(req,res,next)=>{
  const [[b]]=await db.query('SELECT * FROM books WHERE id=?',[req.params.id]);if(!b)return next();
  res.render('book',{b});}));
app.post('/books/:id/reserve',auth.student,w(async(req,res)=>{
  const c=await db.getConnection();let msg=['success','Reservation request submitted. Awaiting admin approval.'];
  try{await c.beginTransaction();
    const [[b]]=await c.query('SELECT available_qty FROM books WHERE id=? FOR UPDATE',[req.params.id]);
    if(!b)msg=['error','Book not found.'];
    else if(b.available_qty<1)msg=['error','Sorry, no copies are currently available.'];
    else{const [d]=await c.query("SELECT id FROM reservations WHERE student_id=? AND book_id=? AND status IN('Pending','Approved')",[req.session.user.id,req.params.id]);
      if(d.length)msg=['error','You already have an active reservation for this book.'];
      else await c.query('INSERT INTO reservations(student_id,book_id) VALUES(?,?)',[req.session.user.id,req.params.id]);}
    await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
  flash(req,...msg);res.redirect(msg[0]==='success'?'/reservations':'/books/'+req.params.id);}));
app.get('/reservations', auth.student, w(async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT r.id, b.title, b.author, r.status, r.reservation_date FROM reservations r JOIN books b ON r.book_id = b.id WHERE r.student_id = ?",
      [req.session.user.id]
    );
    res.render('reservations', { rows });
  } catch (e) {
    throw e;
  }
}));
app.post('/reservations/:id/cancel',auth.student,w(async(req,res)=>{
  const [r]=await db.query("UPDATE reservations SET status='Cancelled' WHERE id=? AND student_id=? AND status='Pending'",[req.params.id,req.session.user.id]);
  flash(req,r.affectedRows?'success':'error',r.affectedRows?'Reservation cancelled.':'Only pending reservations can be cancelled.');res.redirect('/reservations');}));
app.get('/profile',auth.student,w(async(req,res)=>{
  const [[p]]=await db.query('SELECT name,email,created_at FROM students WHERE id=?',[req.session.user.id]);res.render('profile',{p});}));

// ---------- Admin ----------
app.get('/admin',auth.admin,w(async(req,res)=>{
  const [[st]]=await db.query(`SELECT (SELECT COUNT(*) FROM books) books,(SELECT COALESCE(SUM(available_qty),0) FROM books) available,
   (SELECT COUNT(*) FROM students) students,(SELECT COUNT(*) FROM reservations) reservations,(SELECT COUNT(*) FROM reservations WHERE status='Pending') pending`);
  res.render('admin-dashboard',{st});}));
app.get('/admin/books',auth.admin,w(async(req,res)=>{
  const q='%'+clean(req.query.q)+'%';
  const [books]=await db.query('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? OR category LIKE ? OR isbn LIKE ? ORDER BY id DESC',[q,q,q,q]);
  res.render('admin-books',{books,q:clean(req.query.q)});}));
const bookData=b=>({title:clean(b.title),author:clean(b.author),category:clean(b.category),isbn:clean(b.isbn),description:clean(b.description),qty:parseInt(b.total_qty,10)});
const bookOk=d=>d.title&&d.author&&d.category&&d.isbn&&Number.isInteger(d.qty)&&d.qty>=0;
app.post('/admin/books',auth.admin,w(async(req,res)=>{
  const d=bookData(req.body);if(!bookOk(d)){flash(req,'error','Fill all required fields with a valid quantity.');return res.redirect('/admin/books');}
  try{await db.query('INSERT INTO books(title,author,category,isbn,description,total_qty,available_qty) VALUES(?,?,?,?,?,?,?)',[d.title,d.author,d.category,d.isbn,d.description,d.qty,d.qty]);flash(req,'success','Book added.');}
  catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;flash(req,'error','ISBN already exists.');}
  res.redirect('/admin/books');}));
app.post('/admin/books/:id/edit',auth.admin,w(async(req,res)=>{
  const d=bookData(req.body);if(!bookOk(d)){flash(req,'error','Invalid book data.');return res.redirect('/admin/books');}
  const c=await db.getConnection();let m=['success','Book updated.'];
  try{await c.beginTransaction();
    const [[o]]=await c.query('SELECT total_qty,available_qty FROM books WHERE id=? FOR UPDATE',[req.params.id]);
    const na=o.available_qty+(d.qty-o.total_qty);
    if(na<0)m=['error','Quantity too low: more copies are currently reserved.'];
    else await c.query('UPDATE books SET title=?,author=?,category=?,isbn=?,description=?,total_qty=?,available_qty=? WHERE id=?',[d.title,d.author,d.category,d.isbn,d.description,d.qty,na,req.params.id]);
    await c.commit();}catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')m=['error','ISBN already exists.'];else throw e;}finally{c.release();}
  flash(req,...m);res.redirect('/admin/books');}));
app.post('/admin/books/:id/delete',auth.admin,w(async(req,res)=>{
  try{await db.query('DELETE FROM books WHERE id=?',[req.params.id]);flash(req,'success','Book deleted.');}
  catch(e){if(e.code!=='ER_ROW_IS_REFERENCED_2')throw e;flash(req,'error','Cannot delete: this book has reservation history.');}
  res.redirect('/admin/books');}));
app.get('/admin/students',auth.admin,w(async(req,res)=>{
  const q='%'+clean(req.query.q)+'%';
  const [rows]=await db.query('SELECT id,name,email,created_at FROM students WHERE name LIKE ? OR email LIKE ? ORDER BY id DESC',[q,q]);
  res.render('admin-students',{rows,q:clean(req.query.q)});}));
app.get('/admin/reservations',auth.admin,w(async(req,res)=>{
  const q='%'+clean(req.query.q)+'%',status=clean(req.query.status);
  const [rows]=await db.query('SELECT r.*,b.title,s.name,s.email FROM reservations r JOIN books b ON b.id=r.book_id JOIN students s ON s.id=r.student_id WHERE (b.title LIKE ? OR s.name LIKE ?) AND (?="" OR r.status=?) ORDER BY r.id DESC',[q,q,status,status]);
  res.render('admin-reservations',{rows,q:clean(req.query.q),status});}));
// approve: Pending->Approved (-1 copy) | reject: Pending->Rejected | return: Approved->Returned (+1) | cancel: Approved->Cancelled (+1)
app.post('/admin/reservations/:id/:action',auth.admin,w(async(req,res)=>{
  const rules={approve:['Pending','Approved',-1],reject:['Pending','Rejected',0],return:['Approved','Returned',1],cancel:['Approved','Cancelled',1]};
  const rule=rules[req.params.action];if(!rule){flash(req,'error','Unknown action.');return res.redirect('/admin/reservations');}
  const c=await db.getConnection();let m=['success','Reservation updated to '+rule[1]+'.'];
  try{await c.beginTransaction();
    const [[r]]=await c.query('SELECT book_id,status FROM reservations WHERE id=? FOR UPDATE',[req.params.id]);
    if(!r||r.status!==rule[0])m=['error','This reservation is not in the '+rule[0]+' state.'];
    else{const [[b]]=await c.query('SELECT available_qty,total_qty FROM books WHERE id=? FOR UPDATE',[r.book_id]);
      const n=b.available_qty+rule[2];
      if(n<0||n>b.total_qty)m=['error','No copies available to approve this request.'];
      else{await c.query('UPDATE books SET available_qty=? WHERE id=?',[n,r.book_id]);await c.query('UPDATE reservations SET status=? WHERE id=?',[rule[1],req.params.id]);}}
    await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
  flash(req,...m);res.redirect('/admin/reservations');}));

app.use((req,res)=>res.status(404).render('404'));
app.use((err,req,res,next)=>{console.error(err);res.status(500).send('Something went wrong. Please try again.');});

