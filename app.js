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
  class: ['id', 'name', 'teacher_id', 'room_id', 'grade_level'],
  room: ['id', 'name', 'event_id', 'class_id', 'period'],
  message: ['id', 'sender_id', 'receiver_id', 'message'],
  schedule: ['id', 'name', 'decription', 'event_id'],
  student_class: ['id', 'grade_level', 'user_iduser', 'class_idclass'],
  club: ['id', 'name', 'description'],
  event: ['id', 'name', 'description'],
  club_has_event: ['club_id', 'event_id']
};

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function buildQuery(table, filters) {
  const cols = allowedColumns[table] || [];
  let sql = `SELECT * FROM ${quoteIdentifier(table)}`;
  const where = [];
  const values = [];

  for (const [k, v] of Object.entries(filters || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (cols.includes(k)) {
      where.push(`${quoteIdentifier(k)} = ?`);
      values.push(v);
    }
  }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  return { sql, values };
}

async function sendTableRows(res, table, filters) {
  const { sql, values } = buildQuery(table, filters);
  const [rows] = await db.query(sql, values);
  res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
}

function registerTableRoutes({ collectionPath, table, aliases = [], idField = 'id' }) {
  const paths = Array.from(new Set([collectionPath, ...aliases]));

  paths.forEach((routePath) => {
    app.get(routePath, async (req, res) => {
      try {
        await sendTableRows(res, table, req.query);
      } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: err.message });
      }
    });
  });

  const detailPaths = paths.map((routePath) => `${routePath}/:${idField}`);
  detailPaths.forEach((routePath) => {
    app.get(routePath, async (req, res) => {
      try {
        const [rows] = await db.query(
          `SELECT * FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(idField)} = ?`,
          [req.params[idField]]
        );
        res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
      } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: err.message });
      }
    });
  });
}

app.use(express.json());

async function ensureRoomColumns() {
  try {
    await db.query('ALTER TABLE `room` ADD COLUMN IF NOT EXISTS `class_id` INT NULL');
    await db.query('ALTER TABLE `room` ADD COLUMN IF NOT EXISTS `period` VARCHAR(45) NULL');
  } catch (err) {
    console.error('Unable to ensure room columns:', err.message);
  }
}

async function ensureClassColumns() {
  try {
    await db.query('ALTER TABLE `class` ADD COLUMN IF NOT EXISTS `grade_level` VARCHAR(45) NULL');
  } catch (err) {
    console.error('Unable to ensure class columns:', err.message);
  }
}

function getUserRole(req) {
  return String(req.get('x-user-role') || req.get('x-role') || 'Student').trim();
}

function requireAdmin(req, res, next) {
  if (getUserRole(req).toLowerCase() === 'admin') {
    return next();
  }

  return res.status(403).json({ status: 'error', message: 'Admin access required' });
}

ensureRoomColumns();
ensureClassColumns();

// Simple CORS middleware for local development
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

registerTableRoutes({ collectionPath: '/roles', table: 'role' });
registerTableRoutes({ collectionPath: '/users', table: 'user', aliases: ['/user'] });
registerTableRoutes({ collectionPath: '/classes', table: 'class', aliases: ['/class'] });
registerTableRoutes({ collectionPath: '/rooms', table: 'room', aliases: ['/room'] });
registerTableRoutes({ collectionPath: '/messages', table: 'message', aliases: ['/message'] });
registerTableRoutes({ collectionPath: '/schedules', table: 'schedule', aliases: ['/schedule'] });
registerTableRoutes({ collectionPath: '/student_classes', table: 'student_class', aliases: ['/student_class'] });
registerTableRoutes({ collectionPath: '/clubs', table: 'club', aliases: ['/club'] });
registerTableRoutes({ collectionPath: '/events', table: 'event', aliases: ['/event'] });

app.get('/club_has_event', async (req, res) => {
  try {
    await sendTableRows(res, 'club_has_event', req.query);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/classes', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const teacherId = Number(req.body?.teacher_id);
    const roomId = Number(req.body?.room_id);
    const studentIds = Array.isArray(req.body?.student_ids)
      ? req.body.student_ids
      : String(req.body?.student_ids || '').split(',').map((value) => Number(value.trim())).filter(Boolean);
    const gradeLevel = String(req.body?.grade_level || '').trim() || null;

    if (!name || !teacherId || !roomId) {
      return res.status(400).json({ status: 'error', message: 'Class name, teacher ID, and room ID are required' });
    }

    const [teacherRows] = await db.query('SELECT id FROM `user` WHERE id = ?', [teacherId]);
    if (!teacherRows.length) {
      return res.status(400).json({ status: 'error', message: 'Teacher not found' });
    }

    const [roomRows] = await db.query('SELECT id FROM `room` WHERE id = ?', [roomId]);
    if (!roomRows.length) {
      return res.status(400).json({ status: 'error', message: 'Room not found' });
    }

    const [classResult] = await db.query('INSERT INTO `class` (name, teacher_id, room_id, grade_level) VALUES (?, ?, ?, ?)', [name, teacherId, roomId, gradeLevel]);
    const classId = classResult.insertId;

    for (const studentId of studentIds) {
      const [studentRows] = await db.query('SELECT id FROM `user` WHERE id = ?', [studentId]);
      if (!studentRows.length) continue;

      const [studentClassRows] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM `student_class`');
      const nextStudentClassId = studentClassRows[0].next_id;
      await db.query('INSERT INTO `student_class` (id, grade_level, user_iduser, class_idclass) VALUES (?, ?, ?, ?)', [nextStudentClassId, gradeLevel, studentId, classId]);
    }

    res.status(201).json({ status: 'ok', message: 'Class created successfully', classId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/rooms', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const eventId = Number(req.body?.event_id);
    const classId = req.body?.class_id ? Number(req.body.class_id) : null;
    const period = String(req.body?.period || '').trim();

    if (!name || !eventId) {
      return res.status(400).json({ status: 'error', message: 'Room name and event ID are required' });
    }

    const [eventRows] = await db.query('SELECT id FROM `event` WHERE id = ?', [eventId]);
    if (!eventRows.length) {
      return res.status(400).json({ status: 'error', message: 'Event not found' });
    }

    if (classId) {
      const [classRows] = await db.query('SELECT id FROM `class` WHERE id = ?', [classId]);
      if (!classRows.length) {
        return res.status(400).json({ status: 'error', message: 'Class not found' });
      }
    }

    const [result] = await db.query('INSERT INTO `room` (name, event_id, class_id, period) VALUES (?, ?, ?, ?)', [name, eventId, classId, period || null]);
    res.status(201).json({ status: 'ok', message: 'Room created successfully', roomId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/student_classes', requireAdmin, async (req, res) => {
  try {
    const classId = Number(req.body?.class_id);
    const userId = Number(req.body?.user_id);
    const gradeLevel = String(req.body?.grade_level || '').trim() || null;

    if (!classId || !userId) {
      return res.status(400).json({ status: 'error', message: 'Class ID and user ID are required' });
    }

    const [classRows] = await db.query('SELECT id FROM `class` WHERE id = ?', [classId]);
    if (!classRows.length) {
      return res.status(400).json({ status: 'error', message: 'Class not found' });
    }

    const [userRows] = await db.query('SELECT id FROM `user` WHERE id = ?', [userId]);
    if (!userRows.length) {
      return res.status(400).json({ status: 'error', message: 'Student not found' });
    }

    const [studentClassRows] = await db.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM `student_class`');
    const nextStudentClassId = studentClassRows[0].next_id;
    await db.query('INSERT INTO `student_class` (id, grade_level, user_iduser, class_idclass) VALUES (?, ?, ?, ?)', [nextStudentClassId, gradeLevel, userId, classId]);

    res.status(201).json({ status: 'ok', message: 'Student assigned to class' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/club_has_event/:club_id/:event_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM ${quoteIdentifier('club_has_event')} WHERE ${quoteIdentifier('club_id')} = ? AND ${quoteIdentifier('event_id')} = ?`,
      [req.params.club_id, req.params.event_id]
    );
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

