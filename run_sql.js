const fs = require('fs');
const mysql = require('mysql2/promise');

(async () => {
  try {
    const sql = fs.readFileSync('db.sql', 'utf8');

    const connConfig = {
      user: process.env.DB_USER || 'root',
      multipleStatements: true,
    };

    if (process.env.DB_SOCKET) {
      connConfig.socketPath = process.env.DB_SOCKET;
    } else {
      connConfig.host = process.env.DB_HOST || 'localhost';
      connConfig.port = parseInt(process.env.DB_PORT || '3306');
    }

    if (process.env.DB_PASSWORD) {
      connConfig.password = process.env.DB_PASSWORD;
    }

    const conn = await mysql.createConnection(connConfig);

    console.log('Connected to MySQL, executing db.sql...');
    await conn.query(sql);
    console.log('Execution finished.');
    await conn.end();
  } catch (err) {
    console.error('Error executing SQL:', err.message || err);
    process.exit(1);
  }
})();
