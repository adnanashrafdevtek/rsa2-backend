// src/db.js
require('dotenv').config()
const fs = require('fs')
const mysql = require('mysql2/promise')

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '3474',
  database: process.env.DB_NAME || 'mydb',
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 50,
  timezone: 'Z',
}

if (process.platform !== 'win32' && process.env.DB_SOCKET && fs.existsSync(process.env.DB_SOCKET)) {
  poolConfig.socketPath = process.env.DB_SOCKET
}

const pool = mysql.createPool(poolConfig)

module.exports = pool
