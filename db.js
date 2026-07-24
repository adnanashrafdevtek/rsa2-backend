// src/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:             process.env.DB_HOST || 'localhost',
  port:             parseInt(process.env.DB_PORT || '3306'),
  user:             process.env.DB_USER || 'root',
  password:         process.env.DB_PASSWORD || 'Admin123',
  database:         process.env.DB_NAME || 'mydb2',
  connectionLimit:  20,
  waitForConnections: true,
  queueLimit:       50,
  timezone:         'Z',
});

module.exports = pool;