// src/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const poolConfig = {
  user: process.env.DB_USER || 'root',
  database: process.env.DB_NAME || 'mydb',
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 50,
  timezone: 'Z',
};

if (process.env.DB_SOCKET) {
  poolConfig.socketPath = process.env.DB_SOCKET;
} else {
  poolConfig.host = process.env.DB_HOST || 'localhost';
  poolConfig.port = parseInt(process.env.DB_PORT || '3306', 10);
}

if (process.env.DB_PASSWORD) {
  poolConfig.password = process.env.DB_PASSWORD;
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;
