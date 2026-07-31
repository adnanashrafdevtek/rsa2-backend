// src/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:             process.env.DB_HOST || 'localhost',
  port:             parseInt(process.env.DB_PORT || '3306'),
  user:             process.env.DB_USER || 'root',
<<<<<<< HEAD
  password:         process.env.DB_PASSWORD || '',
=======
  password:         process.env.DB_PASSWORD || '3474',
>>>>>>> 00ef2961e6bc81eb3e3bedf891ec3f93c60205c3
  database:         process.env.DB_NAME || 'mydb2',
  connectionLimit:  20,
  waitForConnections: true,
  queueLimit:       50,
  timezone:         'Z',
});

module.exports = pool;