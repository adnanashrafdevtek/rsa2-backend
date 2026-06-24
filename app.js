// src/app.js
// require('dotenv').config();
const express = require('express');
const app = express();
const dbName="planner";
const username="admin";
const db = require('./db');

// Allowed filter columns per table to avoid SQL injection
const allowedColumns = {
  role: ['id', 'name'],
  user: ['id', 'first_name', 'last_name', 'email_address', 'role_id'],
  class: ['id', 'name', 'teacher_id', 'room_id'],
  room: ['id', 'name', 'event_id'],
  message: ['id', 'sender_id', 'receiver_id', 'message'],
  schedule: ['id', 'name', 'decription', 'event_id'],
  student_class: ['id', 'grade_level', 'user_iduser', 'class_idclass'],
  club: ['id', 'name', 'description'],
  event: ['id', 'name', 'description'],
  club_has_event: ['club_id', 'event_id']
};

function buildQuery(table, filters) {
  const cols = allowedColumns[table] || [];
  let sql = `SELECT * FROM ${table}`;
  const where = [];
  const values = [];

  for (const [k, v] of Object.entries(filters || {})) {
    if (!v) continue;
    if (cols.includes(k)) {
      where.push(`\`${k}\` = ?`);
      values.push(v);
    }
  }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  return { sql, values };
}

app.use(express.json());

// Simple CORS middleware for local development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/roles', async (req, res) => {
  try {
    const { sql, values } = buildQuery('role', req.query);
    const [rows] = await db.query(sql, values);

    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/roles/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM role WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/user', async (req, res) => {
  try {
    const { sql, values } = buildQuery('user', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/user/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM user WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/class', async (req, res) => {
  try {
    const { sql, values } = buildQuery('class', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/class/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM class WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/rooms', async (req, res) => {
  try {
    const { sql, values } = buildQuery('room', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/rooms/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM room WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/messages', async (req, res) => {
  try {
    const { sql, values } = buildQuery('message', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/messages/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM message WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/schedules', async (req, res) => {
  try {
    const { sql, values } = buildQuery('schedule', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/schedules/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM schedule WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/student_classes', async (req, res) => {
  try {
    const { sql, values } = buildQuery('student_class', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/student_classes/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM student_class WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/clubs', async (req, res) => {
  try {
    const { sql, values } = buildQuery('club', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/clubs/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM club WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/events', async (req, res) => {
  try {
    const { sql, values } = buildQuery('event', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/events/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM event WHERE id = ?', [req.params.id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/club_has_event', async (req, res) => {
  try {
    const { sql, values } = buildQuery('club_has_event', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/club_has_event/:club_id/:event_id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM club_has_event WHERE club_id = ? AND event_id = ?', [req.params.club_id, req.params.event_id]);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

