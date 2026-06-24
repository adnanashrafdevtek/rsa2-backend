const fs = require('fs');
const mysql = require('mysql2/promise');

(async () => {
  try {
    const sql = fs.readFileSync('db.sql', 'utf8');

    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '3474',
      multipleStatements: true,
    });

    console.log('Connected to MySQL, executing db.sql...');
    const [result] = await conn.query(sql);
    console.log('Execution finished.');
    await conn.end();
  } catch (err) {
    console.error('Error executing SQL:', err.message || err);
    process.exit(1);
  }
})();
