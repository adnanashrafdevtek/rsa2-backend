// src/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

// Build two candidate configs: try passwordless first, then with env password
const baseConfig = {
  host:             process.env.DB_HOST || 'localhost',
  port:             parseInt(process.env.DB_PORT || '3306'),
  user:             process.env.DB_USER || 'root',
  database:         process.env.DB_NAME || 'mydb2',
  connectionLimit:  20,
  waitForConnections: true,
  queueLimit:       50,
  timezone:         'Z',
};

const envPassword = typeof process.env.DB_PASSWORD === 'string' ? process.env.DB_PASSWORD.trim() : '';

async function createWorkingPool() {
  // Try passwordless config first
  const tryConfigs = [];
  tryConfigs.push({ ...baseConfig });
  if (envPassword) tryConfigs.push({ ...baseConfig, password: envPassword });

  for (const cfg of tryConfigs) {
    const candidate = mysql.createPool(cfg);
    try {
      const conn = await candidate.getConnection();
      conn.release();
      console.log('DB connection successful using', cfg.password ? 'password' : 'no password');
      return candidate;
    } catch (err) {
      try { await candidate.end(); } catch (e) {}
      // continue to next candidate
    }
  }

  // As a last resort, return a pool created from baseConfig+envPassword (if any)
  if (envPassword) return mysql.createPool({ ...baseConfig, password: envPassword });
  return mysql.createPool(baseConfig);
}

const poolPromise = createWorkingPool();

// Export an object that proxies query/getConnection to the resolved pool
const exported = {
  async query(sql, params) {
    const pool = await poolPromise;
    return pool.query(sql, params);
  },
  async getConnection() {
    const pool = await poolPromise;
    return pool.getConnection();
  },
  async end() {
    const pool = await poolPromise;
    return pool.end();
  }
};

module.exports = exported;