const need = role => (req,res,next) => {
  if (req.session.user && req.session.user.role === role) return next();
  req.session.flash = {type:'error',msg:'Please log in to continue.'};
  res.redirect(role === 'admin' ? '/admin/login' : '/login');
};
module.exports = {student:need('student'), admin:need('admin')};
