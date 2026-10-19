CREATE DATABASE IF NOT EXISTS smart_library;
USE smart_library;
CREATE TABLE IF NOT EXISTS students(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,email VARCHAR(150) NOT NULL UNIQUE,password_hash VARCHAR(100) NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admins(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(50) NOT NULL UNIQUE,password_hash VARCHAR(100) NOT NULL);
CREATE TABLE IF NOT EXISTS books(id INT AUTO_INCREMENT PRIMARY KEY,title VARCHAR(200) NOT NULL,author VARCHAR(150) NOT NULL,category VARCHAR(60) NOT NULL,isbn VARCHAR(20) NOT NULL UNIQUE,description TEXT,total_qty INT NOT NULL DEFAULT 1,available_qty INT NOT NULL DEFAULT 1,
 CONSTRAINT chk_qty CHECK(available_qty>=0 AND available_qty<=total_qty),INDEX idx_title(title),INDEX idx_author(author),INDEX idx_cat(category));
CREATE TABLE IF NOT EXISTS reservations(id INT AUTO_INCREMENT PRIMARY KEY,student_id INT NOT NULL,book_id INT NOT NULL,reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 status ENUM('Pending','Approved','Rejected','Cancelled','Returned') NOT NULL DEFAULT 'Pending',
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,FOREIGN KEY(book_id) REFERENCES books(id),INDEX idx_status(status),INDEX idx_sb(student_id,book_id));
INSERT IGNORE INTO books(title,author,category,isbn,description,total_qty,available_qty) VALUES
('Clean Code','Robert C. Martin','Programming','9780132350884','A handbook of agile software craftsmanship.',4,4),
('Introduction to Algorithms','Thomas H. Cormen','Computer Science','9780262033848','The standard algorithms textbook.',3,3),
('Database System Concepts','Abraham Silberschatz','Databases','9780078022159','Core concepts of database systems.',5,5),
('Eloquent JavaScript','Marijn Haverbeke','Programming','9781593279509','A modern introduction to JavaScript.',2,2),
('A Brief History of Time','Stephen Hawking','Science','9780553380163','Cosmology for the general reader.',3,3),
('Wings of Fire','A.P.J. Abdul Kalam','Biography','9788173711466','Autobiography of Dr. Kalam.',2,2),
('The Discovery of India','Jawaharlal Nehru','History','9780143031031','Nehru on India history and culture.',2,2),
('Python Crash Course','Eric Matthes','Programming','9781593279288','Hands-on, project-based Python.',1,1);
