// Usage: node scripts/create-admin.js <username> <password>
const bcrypt=require('bcryptjs'),db=require('../config/db');
(async()=>{const [u,p]=process.argv.slice(2);
if(!u||!p||p.length<8){console.log('Usage: node scripts/create-admin.js <username> <password (min 8 chars)>');process.exit(1);}
await db.query('INSERT INTO admins(username,password_hash) VALUES(?,?)',[u,await bcrypt.hash(p,12)]);
console.log('Admin created:',u);process.exit(0);})().catch(e=>{console.error(e.message);process.exit(1);});
