// src/app.js
 require('dotenv').config();
const express = require('express');
const app = express();
const dbName="mydb2";
const username="admin";
const db = require('./db');
const { normalizeRoomPayload, resolveRoomEventId } = require('./roomPayload');

// Allowed filter columns per table to avoid SQL injection
const allowedColumns = {
  role: ['id', 'name'],
  user: ['id', 'first_name', 'last_name', 'email_address', 'role_id'],
  class: ['id', 'name', 'teacher_id', 'room_id', 'grade_level'],
  room: ['id', 'name', 'event_id', 'class_id', 'period'],
  message: ['id', 'sender_id', 'receiver_id', 'message'],
  schedule: ['id', 'name', 'decription', 'event_id'],
  user_schedules: ['id', 'user_id', 'user_type', 'file_name', 'file_content'],
  student_class: ['id', 'grade_level', 'user_iduser', 'class_idclass'],
  club: ['id', 'name', 'description'],
  event: ['id', 'name', 'description'],
  club_has_event: ['club_id', 'event_id'],
  attendance: ['id', 'student_id', 'class_id', 'teacher_id', 'date', 'status', 'marked_by']
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
    if (!cols.includes(k)) continue;

    const rawValue = String(v).trim();
    if (!rawValue) continue;

    const isNumeric = /^-?\d+$/.test(rawValue);
    if (isNumeric) {
      where.push(`${quoteIdentifier(k)} = ?`);
      values.push(Number(rawValue));
    } else {
      where.push(`${quoteIdentifier(k)} LIKE ?`);
      values.push(`%${rawValue}%`);
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

async function ensureColumn(tableName, columnName, columnDefinition) {
  try {
    const [rows] = await db.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      [tableName, columnName]
    );

    if (rows.length) return;

    await db.query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnDefinition}`);
  } catch (err) {
    console.error(`Unable to ensure column ${tableName}.${columnName}:`, err.message);
  }
}

async function ensureRoomColumns() {
  await ensureColumn('room', 'class_id', 'INT NULL');
  await ensureColumn('room', 'period', 'VARCHAR(45) NULL');
}

async function ensureClassColumns() {
  await ensureColumn('class', 'grade_level', 'VARCHAR(45) NULL');
}

async function ensureUserSchedulesTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`user_schedules\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        \`user_type\` VARCHAR(45) NOT NULL,
        \`file_name\` VARCHAR(255) NOT NULL,
        \`file_content\` LONGTEXT NULL,
        \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error('Unable to ensure user_schedules table:', err.message);
  }
}

async function ensureStudentClassTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`student_class\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`grade_level\` VARCHAR(45) NULL,
        \`user_iduser\` INT NOT NULL,
        \`class_idclass\` INT NOT NULL,
        PRIMARY KEY (\`id\`, \`user_iduser\`, \`class_idclass\`),
        INDEX \`fk_student_class_user1_idx\` (\`user_iduser\` ASC),
        INDEX \`fk_student_class_class1_idx\` (\`class_idclass\` ASC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error('Unable to ensure student_class table:', err.message);
  }
}

async function ensureEventTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`event\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(255) NOT NULL,
        \`description\` VARCHAR(255) NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error('Unable to ensure event table:', err.message);
  }
}

async function ensureAttendanceTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`attendance\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`student_id\` INT NOT NULL,
        \`class_id\` INT NOT NULL,
        \`teacher_id\` INT NOT NULL,
        \`date\` DATE NOT NULL,
        \`status\` VARCHAR(45) NOT NULL DEFAULT 'present',
        \`marked_by\` VARCHAR(255) NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`unique_attendance\` (\`student_id\`, \`class_id\`, \`date\`),
        INDEX \`idx_class_date\` (\`class_id\`, \`date\` ASC),
        INDEX \`idx_teacher_date\` (\`teacher_id\`, \`date\` ASC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error('Unable to ensure attendance table:', err.message);
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
ensureUserSchedulesTable();
ensureStudentClassTable();
ensureEventTable();
ensureAttendanceTable();

// Simple CORS middleware for local development
// Replace your existing CORS middleware with this block
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
  // ADD x-user-role AND x-role HERE
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-role, x-role');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ status: 'error', message: 'A valid user ID is required' });
    }

    const updates = [];
    const values = [];

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'first_name')) {
      updates.push('`first_name` = ?');
      values.push(String(req.body.first_name ?? '').trim());
    }

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'last_name')) {
      updates.push('`last_name` = ?');
      values.push(String(req.body.last_name ?? '').trim());
    }

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'email_address')) {
      updates.push('`email_address` = ?');
      values.push(String(req.body.email_address ?? '').trim());
    }

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'role_name')) {
      const roleName = String(req.body.role_name ?? '').trim();
      if (!roleName) {
        return res.status(400).json({ status: 'error', message: 'Role name is required' });
      }

      const [roleRows] = await db.query('SELECT id FROM `role` WHERE name = ? LIMIT 1', [roleName]);
      if (!roleRows.length) {
        return res.status(400).json({ status: 'error', message: 'Role not found' });
      }

      updates.push('`role_id` = ?');
      values.push(roleRows[0].id);
    } else if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'role_id')) {
      updates.push('`role_id` = ?');
      values.push(Number(req.body.role_id));
    }

    if (!updates.length) {
      return res.status(400).json({ status: 'error', message: 'No user fields were provided' });
    }

    values.push(userId);
    await db.query(`UPDATE \`user\` SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ status: 'ok', message: 'User updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/events', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!name || !description) {
      return res.status(400).json({ status: 'error', message: 'Announcement title and message are required' });
    }

    const [result] = await db.query('INSERT INTO `event` (name, description) VALUES (?, ?)', [name, description]);
    res.status(201).json({ status: 'ok', message: 'Announcement created successfully', eventId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/user_schedules', async (req, res) => {
  try {
    const { sql, values } = buildQuery('user_schedules', req.query);
    const [rows] = await db.query(sql, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/user_schedules', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.body?.user_id);
    const userType = String(req.body?.user_type || '').trim();
    const fileName = String(req.body?.file_name || '').trim();
    const fileContent = String(req.body?.file_content || '').trim();

    if (!userId || !userType || !fileName) {
      return res.status(400).json({ status: 'error', message: 'User, type, and file name are required' });
    }

    const [existingRows] = await db.query('SELECT id FROM `user_schedules` WHERE user_id = ? AND user_type = ? LIMIT 1', [userId, userType]);
    if (existingRows.length) {
      await db.query('UPDATE `user_schedules` SET file_name = ?, file_content = ? WHERE id = ?', [fileName, fileContent, existingRows[0].id]);
      return res.json({ status: 'ok', message: 'Schedule updated successfully' });
    }

    const [result] = await db.query('INSERT INTO `user_schedules` (user_id, user_type, file_name, file_content) VALUES (?, ?, ?, ?)', [userId, userType, fileName, fileContent]);
    res.status(201).json({ status: 'ok', message: 'Schedule uploaded successfully', scheduleId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
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

app.put('/classes/:id', requireAdmin, async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    const teacherId = Number(req.body?.teacher_id);
    const roomId = Number(req.body?.room_id);
    const gradeLevel = String(req.body?.grade_level || '').trim() || null;

    if (!classId || !name || !teacherId || !roomId) {
      return res.status(400).json({ status: 'error', message: 'Class ID, name, teacher ID, and room ID are required' });
    }

    const [classRows] = await db.query('SELECT id FROM `class` WHERE id = ?', [classId]);
    if (!classRows.length) {
      return res.status(404).json({ status: 'error', message: 'Class not found' });
    }

    await db.query('UPDATE `class` SET name = ?, teacher_id = ?, room_id = ?, grade_level = ? WHERE id = ?', [name, teacherId, roomId, gradeLevel, classId]);
    res.json({ status: 'ok', message: 'Class updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/classes/:id', requireAdmin, async (req, res) => {
  try {
    const classId = Number(req.params.id);
    if (!classId) {
      return res.status(400).json({ status: 'error', message: 'Class ID is required' });
    }

    await db.query('DELETE FROM `student_class` WHERE class_idclass = ?', [classId]);
    await db.query('DELETE FROM `class` WHERE id = ?', [classId]);
    res.json({ status: 'ok', message: 'Class deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/rooms', requireAdmin, async (req, res) => {
  try {
    let { name, eventId, classId, period } = normalizeRoomPayload(req.body);

    if (!name) {
      return res.status(400).json({ status: 'error', message: 'Room name is required' });
    }

    if (eventId !== null) {
      const [eventRows] = await db.query('SELECT id FROM `event` WHERE id = ?', [eventId]);
      if (!eventRows.length) {
        return res.status(400).json({ status: 'error', message: 'Event not found' });
      }
    } else {
      const resolvedEventId = await resolveRoomEventId({
        roomName: name,
        eventId,
        createEvent: async ({ name: eventName, description }) => {
          const [result] = await db.query('INSERT INTO `event` (name, description) VALUES (?, ?)', [eventName, description]);
          return result;
        }
      });
      eventId = resolvedEventId;
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

app.put('/rooms/:id', requireAdmin, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const { name, eventId, classId, period } = normalizeRoomPayload(req.body);

    if (!roomId || !name) {
      return res.status(400).json({ status: 'error', message: 'Room ID and name are required' });
    }

    const [roomRows] = await db.query('SELECT id FROM `room` WHERE id = ?', [roomId]);
    if (!roomRows.length) {
      return res.status(404).json({ status: 'error', message: 'Room not found' });
    }

    if (eventId !== null) {
      const [eventRows] = await db.query('SELECT id FROM `event` WHERE id = ?', [eventId]);
      if (!eventRows.length) {
        return res.status(400).json({ status: 'error', message: 'Event not found' });
      }
    }

    await db.query('UPDATE `room` SET name = ?, event_id = ?, class_id = ?, period = ? WHERE id = ?', [name, eventId, classId, period || null, roomId]);
    res.json({ status: 'ok', message: 'Room updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/rooms/:id', requireAdmin, async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    if (!roomId) {
      return res.status(400).json({ status: 'error', message: 'Room ID is required' });
    }

    await db.query('DELETE FROM `room` WHERE id = ?', [roomId]);
    res.json({ status: 'ok', message: 'Room deleted successfully' });
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

// Attendance endpoints
app.get('/attendance', async (req, res) => {
  try {
    const filters = req.query;
    const query = buildQuery('attendance', filters);
    const [rows] = await db.query(query.sql, query.values);
    res.json({ status: 'ok', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/attendance', async (req, res) => {
  try {
    const { student_id, class_id, teacher_id, date, status, marked_by } = req.body;
    
    if (!student_id || !class_id || !teacher_id || !date) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    // Check for existing attendance
    const [existing] = await db.query(
      'SELECT id FROM `attendance` WHERE `student_id` = ? AND `class_id` = ? AND `date` = ?',
      [student_id, class_id, date]
    );

    if (existing.length > 0) {
      // Update existing
      await db.query(
        'UPDATE `attendance` SET `status` = ?, `marked_by` = ? WHERE `student_id` = ? AND `class_id` = ? AND `date` = ?',
        [status || 'present', marked_by, student_id, class_id, date]
      );
      res.json({ status: 'ok', message: 'Attendance updated' });
    } else {
      // Create new
      await db.query(
        'INSERT INTO `attendance` (`student_id`, `class_id`, `teacher_id`, `date`, `status`, `marked_by`) VALUES (?, ?, ?, ?, ?, ?)',
        [student_id, class_id, teacher_id, date, status || 'present', marked_by]
      );
      res.json({ status: 'ok', message: 'Attendance created' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/attendance/bulk', async (req, res) => {
  try {
    const { records } = req.body;
    
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Records array required' });
    }

    // Delete existing attendance for the same date and class
    if (records.length > 0) {
      const firstRecord = records[0];
      await db.query(
        'DELETE FROM `attendance` WHERE `class_id` = ? AND `date` = ?',
        [firstRecord.class_id, firstRecord.date]
      );
    }

    // Insert all new records
    for (const record of records) {
      const { student_id, class_id, teacher_id, date, status, marked_by } = record;
      if (student_id && class_id && teacher_id && date) {
        await db.query(
          'INSERT INTO `attendance` (`student_id`, `class_id`, `teacher_id`, `date`, `status`, `marked_by`) VALUES (?, ?, ?, ?, ?, ?)',
          [student_id, class_id, teacher_id, date, status || 'present', marked_by]
        );
      }
    }

    res.json({ status: 'ok', message: 'Attendance records saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/attendance/:id', async (req, res) => {
  try {
    const { status, marked_by } = req.body;
    
    if (!status) {
      return res.status(400).json({ status: 'error', message: 'Status required' });
    }

    await db.query(
      'UPDATE `attendance` SET `status` = ?, `marked_by` = ? WHERE `id` = ?',
      [status, marked_by, req.params.id]
    );

    res.json({ status: 'ok', message: 'Attendance updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body; 
    
    // Ensure you are querying 'email_address' and 'password'
    const [rows] = await db.query(
      'SELECT * FROM `user` WHERE `email_address` = ? AND `password` = ?', 
      [username, password]
    );
    
    if (rows.length > 0) {
      res.status(200).json({ status: 'ok', message: 'Login successful', user: rows[0] });
    } else {
      res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

