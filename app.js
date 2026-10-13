// src/app.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "YOUR_MAILTRAP_USERNAME",
    pass: "YOUR_MAILTRAP_PASSWORD"
  }
});
const express = require('express');
const { createCorsMiddleware } = require('./cors');
const app = express();

// Mounted before every route so preflights and error responses both carry the
// CORS headers. See cors.js for how origins are trusted.
app.use(createCorsMiddleware());

const dbName="mydb2";
const username="admin";
const db = require('./db');
const { resolveRoomEventId } = require('./roomPayload');
const { parseImportRows, normalizeHeader } = require('./importUsers');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (err) {
  XLSX = null;
}

// Allowed filter columns per table to avoid SQL injection
const allowedColumns = {
  role: ['id', 'name'],
  user: ['id', 'first_name', 'last_name', 'email_address', 'role_id', 'password', 'grade'],
  class: ['id', 'name', 'teacher_id', 'room_id', 'room', 'period', 'time', 'grade_level', 'schedule_days'],
  room: ['id', 'name', 'event_id', 'class_id', 'period'],
  message: ['id', 'sender_id', 'receiver_id', 'message'],
  schedule: ['id', 'name', 'decription', 'event_id', 'student_id', 'student_name', 'time', 'period', 'teacher', 'room', 'class_name'],
  user_schedules: ['id', 'user_id', 'user_type', 'file_name', 'file_content'],
  student_class: ['id', 'grade_level', 'user_iduser', 'class_idclass'],
  club: ['id', 'name', 'description'],
  event: ['id', 'name', 'description', 'room', 'date'],
  club_has_event: ['club_id', 'event_id'],
  attendance: ['id', 'student_id', 'class_id', 'teacher_id', 'date', 'status', 'marked_by'],
  volunteer_requests: ['id', 'teacher_id', 'student_id', 'class_id', 'message', 'status', 'approved', 'approved_by', 'approved_at', 'created_at', 'updated_at'],
  volunteer_assignments: ['id', 'volunteer_request_id', 'student_id', 'class_id', 'teacher_id', 'assigned_by', 'status', 'approved', 'approved_by', 'approved_at', 'check_in', 'check_out', 'total_hours', 'created_at', 'updated_at', 'custom_teacher', 'custom_location'],
  volunteer_hours: [
  'id',
  'student_id',
  'class_id',
  'check_in',
  'check_out',
  'total_hours',
  'approved_by',
  'approved',
  'approval_status',
  'volunteer_request_id',
  'volunteer_assignment_id',
  'created_at',
  'updated_at'
  ],
  reviews: ['id', 'user_id', 'rating', 'comment', 'created_at'],
  announcements: ['id', 'title', 'content', 'created_by', 'created_at', 'target_all', 'target_teacher_ids']
};

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function buildQuery(table, filters) {
  const cols = allowedColumns[table] || [];
  let sql = `SELECT * FROM ${quoteIdentifier(table)}`;
  const where = [];
  const values = [];

  const searchTerm = String(filters?.q || '').trim();
  if (table === 'schedule' && searchTerm) {
    const searchColumns = ['student_id', 'student_name', 'time', 'period', 'teacher', 'room', 'class_name'];
    where.push(`(${searchColumns.map((column) => `${quoteIdentifier(column)} LIKE ?`).join(' OR ')})`);
    searchColumns.forEach(() => values.push(`%${searchTerm}%`));
  }

  for (const [k, v] of Object.entries(filters || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'q') continue;
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

async function ensureColumnDefinition(tableName, columnName, columnDefinition) {
  try {
    const [rows] = await db.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      [tableName, columnName]
    );

    if (!rows.length) {
      await db.query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnDefinition}`);
      return;
    }

    await db.query(`ALTER TABLE ${quoteIdentifier(tableName)} MODIFY COLUMN ${quoteIdentifier(columnName)} ${columnDefinition}`);
  } catch (err) {
    console.error(`Unable to ensure column definition ${tableName}.${columnName}:`, err.message);
  }
}

async function ensureRoomColumns() {
  await ensureColumn('room', 'class_id', 'INT NULL');
  await ensureColumn('room', 'period', 'VARCHAR(45) NULL');
}

async function ensureClassColumns() {
  await ensureColumnDefinition('class', 'room_id', 'INT NULL');
  await ensureColumn('class', 'room', 'VARCHAR(255) NULL');
  await ensureColumn('class', 'period', 'VARCHAR(45) NULL');
  await ensureColumn('class', 'time', 'VARCHAR(45) NULL');
  await ensureColumn('class', 'grade_level', 'VARCHAR(45) NULL');
  // Which schedule a class row belongs to: 'mon-thu' (default) or 'fri'
  await ensureColumn('class', 'schedule_days', "VARCHAR(10) NOT NULL DEFAULT 'mon-thu'");
}

async function ensureUserColumns() {
  await ensureColumnDefinition('user', 'password', 'VARCHAR(255) NULL');
  await ensureColumn('user', 'grade', 'VARCHAR(45) NULL');
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
        \`room\` VARCHAR(255) NULL,
        \`date\` DATETIME NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error('Unable to ensure event table:', err.message);
  }
}

async function ensureEventColumns() {
  await ensureColumnDefinition('event', 'date', 'DATETIME NULL');
  await ensureColumn('event', 'room', 'VARCHAR(255) NULL');
}

async function ensureAnnouncementTable() {
  try {
    await db.query(
      'CREATE TABLE IF NOT EXISTS `announcements` (' +
      ' `id` INT NOT NULL AUTO_INCREMENT,' +
      ' `title` VARCHAR(255) NOT NULL,' +
      ' `content` TEXT NOT NULL,' +
      ' `created_by` INT NULL,' +
      ' `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,' +
      ' `target_all` TINYINT(1) NOT NULL DEFAULT 0,' +
      ' `target_teacher_ids` TEXT NULL,' +
      ' PRIMARY KEY (`id`)' +
      ' ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
  } catch (err) {
    console.error('Unable to ensure announcements table:', err.message);
  }
}

async function ensureAnnouncementColumns() {
  await ensureColumn('announcements', 'target_all', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('announcements', 'target_teacher_ids', 'TEXT NULL');
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

async function ensureVolunteerTables() {
  try {
    const [legacyVolunteerHours] = await db.query("SHOW TABLES LIKE 'volunteerHours'");
    const [modernVolunteerHours] = await db.query("SHOW TABLES LIKE 'volunteer_hours'");

    if (legacyVolunteerHours.length && !modernVolunteerHours.length) {
      await db.query('RENAME TABLE `volunteerHours` TO `volunteer_hours`');
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS \`volunteer_requests\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`teacher_id\` INT NOT NULL,
        \`student_id\` INT NOT NULL,
        \`class_id\` INT NULL,
        \`message\` TEXT NULL,
        \`status\` VARCHAR(45) NOT NULL DEFAULT 'pending',
        \`approved\` TINYINT(1) NOT NULL DEFAULT 0,
        \`approved_by\` INT NULL,
        \`approved_at\` DATETIME NULL,
        \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_volunteer_requests_teacher\` (\`teacher_id\`),
        INDEX \`idx_volunteer_requests_student\` (\`student_id\`),
        INDEX \`idx_volunteer_requests_class\` (\`class_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS \`volunteer_assignments\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`volunteer_request_id\` INT NULL,
        \`student_id\` INT NOT NULL,
        \`class_id\` INT NOT NULL,
        \`teacher_id\` INT NOT NULL,
        \`assigned_by\` INT NULL,
        \`status\` VARCHAR(45) NOT NULL DEFAULT 'requested',
        \`approved\` TINYINT(1) NOT NULL DEFAULT 0,
        \`approved_by\` INT NULL,
        \`approved_at\` DATETIME NULL,
        \`check_in\` DATETIME NULL,
        \`check_out\` DATETIME NULL,
        \`total_hours\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_volunteer_assignments_request\` (\`volunteer_request_id\`),
        INDEX \`idx_volunteer_assignments_student\` (\`student_id\`),
        INDEX \`idx_volunteer_assignments_class\` (\`class_id\`),
        INDEX \`idx_volunteer_assignments_teacher\` (\`teacher_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS \`volunteer_hours\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`student_id\` INT NOT NULL,
        \`class_id\` INT NOT NULL,
        \`check_in\` DATETIME NULL,
        \`check_out\` DATETIME NULL,
        \`total_hours\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`approved_by\` INT NULL,
        \`approved\` TINYINT(1) NOT NULL DEFAULT 0,
        \`approval_status\` VARCHAR(45) NOT NULL DEFAULT 'pending',
        \`volunteer_request_id\` INT NULL,
        \`volunteer_assignment_id\` INT NULL,
        \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_volunteer_hours_student\` (\`student_id\`),
        INDEX \`idx_volunteer_hours_class\` (\`class_id\`),
        INDEX \`idx_volunteer_hours_request\` (\`volunteer_request_id\`),
        INDEX \`idx_volunteer_hours_assignment\` (\`volunteer_assignment_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS \`volunteer_hour_adjustments\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`student_id\` INT NOT NULL,
        \`hours_delta\` DECIMAL(10,2) NOT NULL,
        \`note\` VARCHAR(255) NULL,
        \`created_by\` INT NULL,
        \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_volunteer_adjustments_student\` (\`student_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureColumn('volunteer_requests', 'class_id', 'INT NULL');
    await ensureColumnDefinition('volunteer_requests', 'status', "VARCHAR(45) NOT NULL DEFAULT 'pending'");
    await ensureColumnDefinition('volunteer_requests', 'approved', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('volunteer_requests', 'approved_by', 'INT NULL');
    await ensureColumn('volunteer_requests', 'approved_at', 'DATETIME NULL');
    await ensureColumn('volunteer_requests', 'created_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
    await ensureColumn('volunteer_requests', 'updated_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    await ensureColumn('volunteer_assignments', 'volunteer_request_id', 'INT NULL');
    await ensureColumnDefinition('volunteer_assignments', 'status', "VARCHAR(45) NOT NULL DEFAULT 'requested'");
    await ensureColumnDefinition('volunteer_assignments', 'approved', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn('volunteer_assignments', 'approved_by', 'INT NULL');
    await ensureColumn('volunteer_assignments', 'approved_at', 'DATETIME NULL');
    await ensureColumn('volunteer_assignments', 'check_in', 'DATETIME NULL');
    await ensureColumn('volunteer_assignments', 'check_out', 'DATETIME NULL');
    await ensureColumnDefinition('volunteer_assignments', 'total_hours', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    await ensureColumn('volunteer_assignments', 'created_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
    await ensureColumn('volunteer_assignments', 'updated_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // Custom (free-text) assignments have no class or teacher account, so these must allow NULL.
    await ensureColumnDefinition('volunteer_assignments', 'class_id', 'INT NULL');
    await ensureColumnDefinition('volunteer_assignments', 'teacher_id', 'INT NULL');
    await ensureColumn('volunteer_assignments', 'custom_teacher', 'VARCHAR(255) NULL');
    await ensureColumn('volunteer_assignments', 'custom_location', 'VARCHAR(255) NULL');
    // Check-in copies the assignment's class_id into volunteer_hours, so it must allow NULL too.
    await ensureColumnDefinition('volunteer_hours', 'class_id', 'INT NULL');

    await ensureColumn('volunteer_hours', 'approved_by', 'INT NULL');
    await ensureColumnDefinition('volunteer_hours', 'approved', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumnDefinition('volunteer_hours', 'approval_status', "VARCHAR(45) NOT NULL DEFAULT 'pending'");
    await ensureColumn('volunteer_hours', 'volunteer_request_id', 'INT NULL');
    await ensureColumn('volunteer_hours', 'volunteer_assignment_id', 'INT NULL');
    await ensureColumn('volunteer_hours', 'created_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
    await ensureColumn('volunteer_hours', 'updated_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  } catch (err) {
    console.error('Unable to ensure volunteer tables:', err.message);
  }
}

async function syncActiveVolunteerHours() {
  try {
    const [activeHours] = await db.query(`
      SELECT
        id,
        student_id,
        check_in
      FROM \`volunteer_hours\`
      WHERE check_in IS NOT NULL
        AND check_out IS NULL
      ORDER BY id DESC
    `);

    const now = Date.now();

    for (const hour of activeHours) {
      const checkInTime = new Date(hour.check_in).getTime();

      if (!Number.isFinite(checkInTime)) {
        continue;
      }

      const elapsedHours = Math.max(
        (now - checkInTime) / (1000 * 60 * 60),
        0
      );

      await db.query(
        `
        UPDATE \`volunteer_hours\`
        SET
          total_hours = ?,
          approval_status = 'pending'
        WHERE id = ?
        `,
        [
          elapsedHours.toFixed(2),
          hour.id
        ]
      );
    }
  } catch (err) {
    console.error('Unable to sync active volunteer hours:', err.message);
  }
}

async function ensureScheduleColumns() {
  await ensureColumnDefinition('schedule', 'name', 'VARCHAR(45) NULL DEFAULT NULL');
  await ensureColumnDefinition('schedule', 'decription', 'VARCHAR(255) NULL DEFAULT NULL');
  await ensureColumnDefinition('schedule', 'event_id', 'INT NULL DEFAULT NULL');
  await ensureColumn('schedule', 'student_id', 'INT NULL');
  await ensureColumn('schedule', 'student_name', 'VARCHAR(255) NULL');
  await ensureColumn('schedule', 'time', 'VARCHAR(45) NULL');
  await ensureColumn('schedule', 'period', 'VARCHAR(45) NULL');
  await ensureColumn('schedule', 'teacher', 'VARCHAR(255) NULL');
  await ensureColumn('schedule', 'room', 'VARCHAR(255) NULL');
  await ensureColumn('schedule', 'class_name', 'VARCHAR(255) NULL');
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

function requireTeacherOrAdmin(req, res, next) {
  const role = getUserRole(req).toLowerCase();
  if (role === 'teacher' || role === 'admin') {
    return next();
  }

  return res.status(403).json({ status: 'error', message: 'Teacher or admin access required' });
}

async function createLinkedRoom(roomName, period) {
  const roomEventId = await resolveRoomEventId({
    roomName,
    eventId: null,
    createEvent: async ({ name, description }) => {
      const [result] = await db.query('INSERT INTO `event` (`name`, `description`) VALUES (?, ?)', [name, description]);
      return result;
    }
  });

  const [result] = await db.query('INSERT INTO `room` (`name`, `event_id`, `class_id`, `period`) VALUES (?, ?, NULL, ?)', [roomName, roomEventId, period || null]);
  return result.insertId;
}

ensureRoomColumns();
ensureClassColumns();
ensureUserColumns();
ensureScheduleColumns();
ensureUserSchedulesTable();
ensureStudentClassTable();
ensureEventTable();
ensureEventColumns();
ensureAnnouncementTable();
ensureAnnouncementColumns();
ensureAttendanceTable();
ensureVolunteerTables();
ensureSettingsTable();

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
      const roleId = Number(req.body.role_id);
      if (!Number.isInteger(roleId) || roleId <= 0) {
        return res.status(400).json({ status: 'error', message: 'Role ID is required' });
      }

      const [roleRows] = await db.query('SELECT id FROM `role` WHERE id = ? LIMIT 1', [roleId]);
      if (!roleRows.length) {
        return res.status(400).json({ status: 'error', message: 'Role not found' });
      }

      updates.push('`role_id` = ?');
      values.push(roleId);
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

app.delete('/users/:id', requireAdmin, async (req, res) => {
  const connection = await db.getConnection();

  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ status: 'error', message: 'A valid user ID is required' });
    }

    await connection.beginTransaction();

    const [userRows] = await connection.query(
      'SELECT id, role_id FROM `user` WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!userRows.length) {
      await connection.rollback();
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const [adminRoleRows] = await connection.query(
  "SELECT id FROM `role` WHERE LOWER(name) = 'admin' LIMIT 1"
);
const adminRoleId = adminRoleRows[0]?.id;

if (adminRoleId && Number(userRows[0].role_id) === adminRoleId) {
  const [adminRows] = await connection.query(
    'SELECT COUNT(*) AS count FROM `user` WHERE role_id = ?',
    [adminRoleId]
  );
  if (Number(adminRows[0].count) <= 1) {
    await connection.rollback();
    return res.status(400).json({ status: 'error', message: 'The last admin user cannot be deleted' });
  }
}

    await connection.query('UPDATE `class` SET teacher_id = NULL WHERE teacher_id = ?', [userId]);
    await connection.query('UPDATE `announcements` SET created_by = NULL WHERE created_by = ?', [userId]);
    await connection.query('DELETE FROM `student_class` WHERE user_iduser = ?', [userId]);
    await connection.query('DELETE FROM `message` WHERE sender_id = ? OR receiver_id = ?', [userId, userId]);
    await connection.query('DELETE FROM `schedule` WHERE student_id = ?', [userId]);
    await connection.query('DELETE FROM `user_schedules` WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM `attendance` WHERE student_id = ? OR teacher_id = ? OR marked_by = ?', [userId, userId, userId]);
    await connection.query('DELETE FROM `volunteer_hour_adjustments` WHERE student_id = ? OR created_by = ?', [userId, userId]);
    await connection.query('DELETE FROM `volunteer_hours` WHERE student_id = ? OR approved_by = ?', [userId, userId]);
    await connection.query('DELETE FROM `volunteer_assignments` WHERE student_id = ? OR teacher_id = ? OR assigned_by = ? OR approved_by = ?', [userId, userId, userId, userId]);
    await connection.query('DELETE FROM `volunteer_requests` WHERE student_id = ? OR teacher_id = ? OR approved_by = ?', [userId, userId, userId]);
    await connection.query('DELETE FROM `user` WHERE id = ?', [userId]);

    await connection.commit();
    res.json({ status: 'ok', message: 'User deleted successfully', userId });
  } catch (err) {
    await connection.rollback();
    console.error('Delete user error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    connection.release();
  }
});

app.post('/events', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const room = String(req.body?.room || '').trim();
    const date = String(req.body?.date || '').trim();

    if (!name || !description || !room || !date) {
      return res.status(400).json({ status: 'error', message: 'Event name, description, room, and date are required' });
    }

    const [result] = await db.query('INSERT INTO `event` (name, description, room, date) VALUES (?, ?, ?, ?)', [name, description, room, date]);
    res.status(201).json({ status: 'ok', message: 'Event created successfully', eventId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/clubs', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();

    if (!name) {
      return res.status(400).json({ status: 'error', message: 'Club name is required' });
    }

    const [result] = await db.query(
      'INSERT INTO `club` (name, description) VALUES (?, ?)',
      [name, description || null]
    );

    res.status(201).json({ status: 'ok', message: 'Club created successfully', clubId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

function decodeUploadBuffer(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (Array.isArray(payload)) return Buffer.from(payload);
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return Buffer.alloc(0);
    try {
      return Buffer.from(trimmed, 'base64');
    } catch (err) {
      return Buffer.from(trimmed);
    }
  }
  return Buffer.alloc(0);
}

function pickRowValue(row, candidates) {
  for (const key of candidates) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function normalizeScheduleImportRow(row) {
  const normalizedRow = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalizedRow[normalizeHeader(key)] = String(value ?? '').trim();
  });

  return {
    studentId: pickRowValue(normalizedRow, ['student_id', 'studentid', 'student id']),
    studentName: pickRowValue(normalizedRow, ['student_name', 'studentname', 'student name']),
    time: pickRowValue(normalizedRow, ['time', 'schedule_time', 'start_time', 'starttime']),
    period: pickRowValue(normalizedRow, ['period']),
    teacher: pickRowValue(normalizedRow, ['teacher', 'teacher_name', 'teachername']),
    room: pickRowValue(normalizedRow, ['room', 'room_name', 'roomname']),
    className: pickRowValue(normalizedRow, ['class_name', 'classname', 'class name'])
  };
}

function getImportRows(fileBuffer, fileName) {
  const ext = String(fileName || '').toLowerCase();
  const extName = ext.includes('.') ? ext.substring(ext.lastIndexOf('.')) : '';

  if (extName === '.csv') {
    return parseImportRows(fileBuffer, fileName);
  }

  if (extName === '.xlsx' || extName === '.xls') {
    if (!XLSX) {
      throw new Error('Excel parsing library is not available');
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    return rows.map((row) => {
      const normalizedRow = {};
      Object.entries(row).forEach(([key, value]) => {
        normalizedRow[normalizeHeader(key)] = String(value ?? '').trim();
      });
      return normalizedRow;
    });
  }

  throw new Error('Unsupported file type. Please upload a CSV or Excel file.');
}

async function insertScheduleRows(rows, fileName, defaults = {}) {
  const errors = [];
  let insertedCount = 0;

  for (const [index, row] of rows.entries()) {
    const normalizedRow = normalizeScheduleImportRow(row);
    const hasValues = Object.values(normalizedRow).some((value) => String(value || '').trim() !== '');

    if (!hasValues) {
      continue;
    }

    try {
      const fallbackStudentId = defaults.studentId ?? null;
      const studentIdValue = normalizedRow.studentId || fallbackStudentId;
      const numericStudentId = Number(studentIdValue);
      const studentId = Number.isInteger(numericStudentId) && numericStudentId > 0 ? numericStudentId : null;
      const studentName = normalizedRow.studentName || defaults.studentName || null;
      const teacherName = normalizedRow.teacher || defaults.teacher || null;
      const roomName = normalizedRow.room || defaults.room || null;
      const className = normalizedRow.className || defaults.className || null;

      await db.query(
        'INSERT INTO `schedule` (`name`, `decription`, `event_id`, `student_id`, `student_name`, `time`, `period`, `teacher`, `room`, `class_name`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          defaults.name || 'Imported schedule',
          defaults.description || null,
          defaults.eventId ?? null,
          studentId,
          studentName,
          normalizedRow.time || null,
          normalizedRow.period || null,
          teacherName,
          roomName,
          className
        ]
      );

      insertedCount += 1;
    } catch (rowErr) {
      errors.push({ index: index + 2, message: rowErr.message });
    }
  }

  return { insertedCount, errors };
}

app.post('/schedule/import-file', requireAdmin, async (req, res) => {
  try {
    const fileBuffer = decodeUploadBuffer(req.body?.fileBuffer || req.body?.buffer || req.body?.file || req.body);
    const fileName = String(req.body?.fileName || req.body?.file_name || req.body?.filename || 'import.csv');

    if (!fileBuffer || !fileBuffer.length) {
      return res.status(400).json({ status: 'error', message: 'A file upload is required' });
    }

    const rows = getImportRows(fileBuffer, fileName);
    if (!rows.length) {
      return res.json({ status: 'ok', insertedCount: 0, errors: [] });
    }
    const { insertedCount, errors } = await insertScheduleRows(rows, fileName);

    res.json({ status: 'ok', insertedCount, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

async function resolveRoleId(roleName) {
  const normalizedRoleName = String(roleName || '').trim() || 'Student';
  const [roleRows] = await db.query('SELECT id FROM `role` WHERE name = ? LIMIT 1', [normalizedRoleName]);
  if (roleRows.length) return roleRows[0].id;

  const [result] = await db.query('INSERT INTO `role` (name) VALUES (?)', [normalizedRoleName]);
  return result.insertId;
}

app.post('/user/import-file', async (req, res) => {
  try {
    const fileBuffer = decodeUploadBuffer(req.body?.fileBuffer || req.body?.buffer || req.body?.file || req.body);
    const fileName = String(req.body?.fileName || req.body?.file_name || req.body?.filename || 'import.csv');

    if (!fileBuffer || !fileBuffer.length) {
      return res.status(400).json({ status: 'error', message: 'A file upload is required' });
    }

    const rows = getImportRows(fileBuffer, fileName);
    if (!rows.length) {
      return res.json({ status: 'ok', insertedCount: 0, duplicateCount: 0, errors: [] });
    }

    const errors = [];
    let insertedCount = 0;
    let duplicateCount = 0;

    for (const [index, row] of rows.entries()) {
      const normalizedRow = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        normalizedRow[normalizeHeader(key)] = String(value ?? '').trim();
      });

      const firstName = pickRowValue(normalizedRow, ['first_name', 'firstname', 'firstName']);
      const lastName = pickRowValue(normalizedRow, ['last_name', 'lastname', 'lastName']);
      const emailAddress = pickRowValue(normalizedRow, ['email_address', 'email', 'emailaddress', 'emailAddress']);
      const roleName = pickRowValue(normalizedRow, ['role_name', 'role', 'rolename', 'roleName']);
      const password = pickRowValue(normalizedRow, ['password', 'user_password', 'pass']);
      const grade = pickRowValue(normalizedRow, ['grade', 'grade_level', 'student_grade']);

      if (!firstName || !lastName || !emailAddress) {
        errors.push({ index: index + 2, message: 'Missing required first_name, last_name, or email_address' });
        continue;
      }

      try {
        const roleId = await resolveRoleId(roleName || 'Student');
        const normalizedEmail = emailAddress.toLowerCase();
        const [existingRows] = await db.query('SELECT id FROM `user` WHERE email_address = ? LIMIT 1', [normalizedEmail]);

        if (existingRows.length) {
          duplicateCount += 1;
          errors.push({
            index: index + 2,
            message: `User already exists: ${normalizedEmail}`
          });
          continue;
        }

        await db.query(
          'INSERT INTO `user` (first_name, last_name, email_address, role_id, password, grade) VALUES (?, ?, ?, ?, ?, ?)',
          [firstName, lastName, normalizedEmail, roleId, password || null, grade || null]
        );

        insertedCount += 1;
      } catch (rowErr) {
        errors.push({ index: index + 2, message: rowErr.message });
      }
    }

    res.json({ status: 'ok', insertedCount, duplicateCount, errors });
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
      const [userRows] = await db.query('SELECT first_name, last_name, email_address FROM `user` WHERE id = ? LIMIT 1', [userId]);
      const userRecord = userRows[0] || {};
      const userLabel = `${userRecord.first_name || ''} ${userRecord.last_name || ''}`.trim() || userRecord.email_address || `User ${userId}`;
      const importResult = await insertScheduleRows(getImportRows(fileContent, fileName), fileName, {
        name: 'Imported schedule',
        studentId: userType.toLowerCase() === 'student' ? userId : null,
        studentName: userType.toLowerCase() === 'student' ? userLabel : null,
        teacher: userType.toLowerCase() === 'teacher' ? userLabel : null
      });

      return res.json({
        status: 'ok',
        message: 'Schedule updated successfully',
        importedCount: importResult.insertedCount,
        errors: importResult.errors
      });
    }

    const [result] = await db.query('INSERT INTO `user_schedules` (user_id, user_type, file_name, file_content) VALUES (?, ?, ?, ?)', [userId, userType, fileName, fileContent]);
    const [userRows] = await db.query('SELECT first_name, last_name, email_address FROM `user` WHERE id = ? LIMIT 1', [userId]);
    const userRecord = userRows[0] || {};
    const userLabel = `${userRecord.first_name || ''} ${userRecord.last_name || ''}`.trim() || userRecord.email_address || `User ${userId}`;
    const importResult = await insertScheduleRows(getImportRows(fileContent, fileName), fileName, {
      name: 'Imported schedule',
      studentId: userType.toLowerCase() === 'student' ? userId : null,
      studentName: userType.toLowerCase() === 'student' ? userLabel : null,
      teacher: userType.toLowerCase() === 'teacher' ? userLabel : null
    });

    res.status(201).json({
      status: 'ok',
      message: 'Schedule uploaded successfully',
      scheduleId: result.insertId,
      importedCount: importResult.insertedCount,
      errors: importResult.errors
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ---- Settings table (key/value store) ----
async function ensureSettingsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`settings\` (
        \`key\` VARCHAR(64) NOT NULL,
        \`value\` TEXT NULL,
        \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.error('Unable to ensure settings table:', err.message);
  }
}

async function getSetting(key, fallback = null) {
  try {
    const [rows] = await db.query('SELECT `value` FROM `settings` WHERE `key` = ? LIMIT 1', [key]);
    if (!rows.length) return fallback;
    return rows[0].value;
  } catch (err) {
    console.error(`getSetting(${key}) failed:`, err.message);
    return fallback;
  }
}

async function setSetting(key, value) {
  await db.query(
    'INSERT INTO `settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [key, String(value)]
  );
}

async function isRamadanModeOn() {
  const raw = await getSetting('ramadan_mode', '0');
  return String(raw).trim() === '1';
}

// ---- School clock: one source of truth for "what day/time is it at school" ----
// Every browser asks the server, so all computers agree on Friday vs Mon-Thu.
const SCHOOL_TIME_ZONE = process.env.SCHOOL_TIME_ZONE || 'America/Chicago';

function getSchoolClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const pick = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = pick('weekday'); // Mon, Tue, ... Sun
  let minutes = Number(pick('hour')) * 60 + Number(pick('minute'));

  let dayType = 'weekend';
  if (['Mon', 'Tue', 'Wed', 'Thu'].includes(weekday)) dayType = 'mon-thu';
  if (weekday === 'Fri') dayType = 'fri';

  // Testing only: set SCHEDULE_TEST_DAY (mon-thu | fri | weekend) and/or
  // SCHEDULE_TEST_TIME (HH:MM, 24h) in .env, restart, and remove when done.
  const testDay = String(process.env.SCHEDULE_TEST_DAY || '').trim().toLowerCase();
  if (['mon-thu', 'fri', 'weekend'].includes(testDay)) dayType = testDay;
  const testTime = String(process.env.SCHEDULE_TEST_TIME || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (testTime) minutes = Number(testTime[1]) * 60 + Number(testTime[2]);

  return { dayType, weekday, minutes, timeZone: SCHOOL_TIME_ZONE };
}

app.get('/api/schedule-now', async (req, res) => {
  try {
    const clock = getSchoolClock();
    const ramadanMode = await isRamadanModeOn();

    // Ramadan mode: Mon-Fri runs the Friday schedule. Weekend stays weekend.
    let effectiveDayType = clock.dayType;
    if (ramadanMode && (clock.dayType === 'mon-thu' || clock.dayType === 'fri')) {
      effectiveDayType = 'fri';
    }

    res.json({
      status: 'ok',
      ...clock,
      dayType: effectiveDayType,        // effective schedule for the whole school
      baseDayType: clock.dayType,       // what the clock says without Ramadan applied
      ramadanMode,
      iso: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Schedule clock error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Ramadan mode toggle: admin-only. Persists to the settings table.
app.get('/api/ramadan-mode', async (req, res) => {
  try {
    const enabled = await isRamadanModeOn();
    res.json({ status: 'ok', enabled, ramadanMode: enabled });
  } catch (err) {
    console.error('Ramadan mode read error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/ramadan-mode', requireAdmin, async (req, res) => {
  try {
    const enabled = req.body?.enabled === true || Number(req.body?.enabled) === 1;
    await setSetting('ramadan_mode', enabled ? '1' : '0');

    const clock = getSchoolClock();
    let effectiveDayType = clock.dayType;
    if (enabled && (clock.dayType === 'mon-thu' || clock.dayType === 'fri')) {
      effectiveDayType = 'fri';
    }

    res.json({
      status: 'ok',
      enabled,
      ramadanMode: enabled,
      ...clock,
      dayType: effectiveDayType,
      baseDayType: clock.dayType,
    });
  } catch (err) {
    console.error('Ramadan toggle error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Classes list. By default only Monday-Thursday rows are returned, so every
// existing screen behaves exactly as before. Ask for Friday rows with
// ?schedule_days=fri, or everything with ?schedule_days=all.
app.get(['/classes', '/class'], async (req, res) => {
  try {
    const { schedule_days: scheduleDaysParam, ...otherFilters } = req.query;
    const { sql, values } = buildQuery('class', otherFilters);

    const requested = String(scheduleDaysParam || '').trim().toLowerCase();
    let finalSql = sql;
    const finalValues = [...values];

    if (requested !== 'all') {
      const wanted = requested === 'fri' ? 'fri' : 'mon-thu';
      finalSql += (sql.includes(' WHERE ') ? ' AND ' : ' WHERE ') + '`schedule_days` = ?';
      finalValues.push(wanted);
    }

    const [rows] = await db.query(finalSql, finalValues);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

registerTableRoutes({ collectionPath: '/roles', table: 'role' });
registerTableRoutes({ collectionPath: '/users', table: 'user', aliases: ['/user'] });
registerTableRoutes({ collectionPath: '/classes', table: 'class', aliases: ['/class'] });
registerTableRoutes({ collectionPath: '/messages', table: 'message', aliases: ['/message'] });
registerTableRoutes({ collectionPath: '/schedules', table: 'schedule', aliases: ['/schedule'] });
registerTableRoutes({ collectionPath: '/student_classes', table: 'student_class', aliases: ['/student_class'] });
registerTableRoutes({ collectionPath: '/clubs', table: 'club', aliases: ['/club'] });
registerTableRoutes({ collectionPath: '/events', table: 'event', aliases: ['/event'] });
app.get(['/volunteers', '/volunteer', '/api/volunteers'], async (req, res) => {
  try {
    await syncActiveVolunteerHours();

    const searchTerm = String(req.query?.q || '').trim();

    const searchValues = [];
    let searchClause = '';

    if (searchTerm) {
      searchClause = `
        AND (
          u.first_name LIKE ?
          OR u.last_name LIKE ?
          OR u.email_address LIKE ?
          OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ?
        )
      `;

      const likeValue = `%${searchTerm}%`;
      searchValues.push(likeValue, likeValue, likeValue, likeValue);
    }

    const [rows] = await db.query(
      `
      SELECT
        u.id,
        u.id AS student_id,
        u.first_name,
        u.last_name,
        u.email_address,

        COALESCE(
          (
            SELECT SUM(vh.total_hours)
            FROM volunteer_hours vh
            WHERE vh.student_id = u.id
              AND vh.approval_status = 'approved'
          ),
          0
        ) AS total_hours,

        COALESCE(
          (
            SELECT SUM(vha.hours_delta)
            FROM volunteer_hour_adjustments vha
            WHERE vha.student_id = u.id
          ),
          0
        ) AS manual_hours,

        va.id AS assignment_id,
        va.class_id AS assigned_class_id,
        va.teacher_id AS assigned_teacher_id,
        va.status AS assignment_status,
        va.approved AS assignment_approved,
        va.check_in AS check_in,
        va.check_out AS check_out,
        va.total_hours AS assignment_hours,
        va.custom_teacher AS custom_teacher,
        va.custom_location AS custom_location

      FROM user u

      LEFT JOIN volunteer_assignments va
        ON va.id = (
          SELECT va2.id
          FROM volunteer_assignments va2
          WHERE va2.student_id = u.id
          ORDER BY
            CASE
              WHEN va2.status IN (
                'requested',
                'requesting_confirmation',
                'checked_in',
                'returning_confirmation'
              ) THEN 0
              ELSE 1
            END,
            va2.id DESC
          LIMIT 1
        )

      WHERE u.role_id = 3
      ${searchClause}

      ORDER BY u.last_name ASC, u.first_name ASC
      `,
      searchValues
    );

    const normalizedRows = rows.map((row) => {
      const assignmentStatus = String(row.assignment_status || '').trim().toLowerCase();

      let status = 'available';

      if (
        assignmentStatus === 'checked_in' ||
        assignmentStatus === 'checked in' ||
        assignmentStatus === 'currently volunteering'
      ) {
        status = 'checked_in';
      } else if (
        assignmentStatus === 'returning_confirmation' ||
        assignmentStatus === 'returning confirmation' ||
        assignmentStatus === 'pending return' ||
        assignmentStatus === 'requesting return'
      ) {
        status = 'returning_confirmation';
      } else if (
        assignmentStatus === 'requesting_confirmation' ||
        assignmentStatus === 'requesting confirmation' ||
        assignmentStatus === 'pending arrival' ||
        assignmentStatus === 'pending_arrival' ||
        assignmentStatus === 'requested'
      ) {
        status = 'requesting_confirmation';
      }

      // Only students with a live assignment keep its class/teacher details.
      // Otherwise a finished or cancelled assignment would still show up as their
      // "current" class, prefill the dropdown, and appear on that teacher's list.
      const hasLiveAssignment = status !== 'available';

      return {
        ...row,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        status,
        assigned_class_id: hasLiveAssignment ? (row.assigned_class_id || null) : null,
        assigned_teacher_id: hasLiveAssignment ? (row.assigned_teacher_id || null) : null,
        custom_teacher: hasLiveAssignment ? (row.custom_teacher || null) : null,
        custom_location: hasLiveAssignment ? (row.custom_location || null) : null,
        total_hours: (Number(row.total_hours || 0) + Number(row.manual_hours || 0)).toFixed(2),
        manual_hours: Number(row.manual_hours || 0).toFixed(2)
      };
    });

    res.json({
      status: 'ok',
      database: 'connected',
      mysqlResult: normalizedRows
    });
  } catch (err) {
    console.error('Unable to load students as volunteers:', err);
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});
registerTableRoutes({ collectionPath: '/volunteer_requests', table: 'volunteer_requests', aliases: ['/volunteer-requests'] });
registerTableRoutes({ collectionPath: '/volunteer_assignments', table: 'volunteer_assignments', aliases: ['/volunteer-assignments'] });
registerTableRoutes({ collectionPath: '/volunteer_hours', table: 'volunteer_hours', aliases: ['/volunteerHours', '/volunteer-hours'] });
registerTableRoutes({ collectionPath: '/reviews', table: 'reviews', aliases: ['/review', '/api/reviews'] });

app.post('/volunteerHours/adjust', requireAdmin, async (req, res) => {
  try {
    const studentId = Number(req.body?.student_id);
    const hours = Number(req.body?.hours);
    const operation = String(req.body?.operation || 'add').trim().toLowerCase();
    const note = String(req.body?.note || '').trim().slice(0, 255) || null;

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ status: 'error', message: 'A valid volunteer ID is required' });
    }

    if (!Number.isFinite(hours) || hours <= 0 || hours > 10000) {
      return res.status(400).json({ status: 'error', message: 'Hours must be greater than 0 and no more than 10000' });
    }

    if (!['add', 'remove'].includes(operation)) {
      return res.status(400).json({ status: 'error', message: 'Operation must be add or remove' });
    }

    const [studentRows] = await db.query(
      'SELECT id FROM `user` WHERE id = ? AND role_id = 3 LIMIT 1',
      [studentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({ status: 'error', message: 'Student volunteer not found' });
    }

    const delta = Number((operation === 'remove' ? -hours : hours).toFixed(2));
    const [result] = await db.query(
      `
      INSERT INTO \`volunteer_hour_adjustments\` (student_id, hours_delta, note, created_by)
      VALUES (?, ?, ?, NULL)
      `,
      [studentId, delta, note]
    );

    return res.status(201).json({
      status: 'ok',
      message: 'Volunteer hours adjusted successfully',
      adjustment_id: result.insertId,
      student_id: studentId,
      hours_delta: delta.toFixed(2)
    });
  } catch (err) {
    console.error('Volunteer hours adjustment error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get(['/announcements', '/announcement', '/api/announcements'], async (req, res) => {
  try {
    const { sql, values } = buildQuery('announcements', req.query)

    const whereIndex = sql.indexOf(' WHERE ')
    const whereClause = whereIndex >= 0 ? sql.slice(whereIndex) : ''

    const announcementSql = `
      SELECT
        a.*,
        CONCAT_WS(' ', u.first_name, u.last_name) AS created_by_name
      FROM \`announcements\` a
      LEFT JOIN \`user\` u ON u.id = a.created_by
      ${whereClause}
      ORDER BY a.created_at DESC, a.id DESC
    `

    const [rows] = await db.query(announcementSql, values)

    res.json({
      status: 'ok',
      database: 'connected',
      mysqlResult: rows
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      status: 'error',
      message: err.message
    })
  }
})

app.put('/volunteerHours/:id', requireAdmin, async (req, res) => {
  try {
    const hourId = Number(req.params.id);
    if (!hourId) {
      return res.status(400).json({ status: 'error', message: 'A valid volunteer hour ID is required' });
    }

    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'approved')) {
      const approved = Number(req.body.approved) === 1 ? 1 : 0;
      updates.push('`approved` = ?');
      values.push(approved);
      if (approved === 1 && !Object.prototype.hasOwnProperty.call(req.body || {}, 'approval_status')) {
        updates.push('`approval_status` = ?');
        values.push('approved');
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'approval_status')) {
      const approvalStatus = String(req.body.approval_status || 'pending').trim() || 'pending';
      updates.push('`approval_status` = ?');
      values.push(approvalStatus);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'approved_by')) {
      const approvedBy = req.body.approved_by === null || req.body.approved_by === '' ? null : Number(req.body.approved_by);
      updates.push('`approved_by` = ?');
      values.push(Number.isInteger(approvedBy) ? approvedBy : null);
    }

    if (!updates.length) {
      return res.status(400).json({ status: 'error', message: 'No volunteer hour fields were provided' });
    }

    values.push(hourId);
    await db.query(`UPDATE \`volunteer_hours\` SET ${updates.join(', ')} WHERE id = ?`, values);

        const [hourRows] = await db.query(
      'SELECT * FROM `volunteer_hours` WHERE id = ? LIMIT 1',
      [hourId]
    );

    const hourRow = hourRows[0] || null;

    if (hourRow) {
      const approvalStatus = String(
        hourRow.approval_status || req.body?.approval_status || ''
      ).toLowerCase();

      const approvedHours =
        hourRow.check_in && hourRow.check_out
          ? Math.max(
              (new Date(hourRow.check_out) - new Date(hourRow.check_in)) /
                (1000 * 60 * 60),
              0
            )
          : Number(hourRow.total_hours || 0);

      const [assignmentRows] = await db.query(
        `
        SELECT *
        FROM \`volunteer_assignments\`
        WHERE volunteer_request_id = ?
           OR student_id = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [
          hourRow.volunteer_request_id || null,
          hourRow.student_id
        ]
      );

      if (assignmentRows[0]) {
        await db.query(
          `
          UPDATE \`volunteer_assignments\`
          SET
            status = ?,
            approved = ?,
            approved_by = ?,
            approved_at = COALESCE(approved_at, NOW()),
            check_out = COALESCE(check_out, NOW()),
            total_hours = ?
          WHERE id = ?
          `,
          [
            approvalStatus === 'approved'
              ? 'completed'
              : 'dismissed',

            approvalStatus === 'approved' ? 1 : 0,

            Number.isInteger(Number(req.body.approved_by))
              ? Number(req.body.approved_by)
              : null,

            approvedHours.toFixed(2),

            assignmentRows[0].id
          ]
        );
      }
    }

    res.json({ status: 'ok', message: 'Volunteer hours updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/volunteer-requests', requireTeacherOrAdmin, async (req, res) => {
  try {
    const teacherId = Number(req.body?.teacher_id);
    const studentIds = Array.isArray(req.body?.student_ids)
      ? req.body.student_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const classId = req.body?.class_id !== undefined && req.body?.class_id !== null && String(req.body?.class_id).trim() !== ''
      ? Number(req.body.class_id)
      : null;
    const message = String(req.body?.message || '').trim();

    if (!teacherId || studentIds.length === 0) {
      return res.status(400).json({ status: 'error', message: 'teacher_id and at least one student_id are required' });
    }

    const requestIds = [];
    for (const studentId of studentIds) {
      const [result] = await db.query(
        'INSERT INTO `volunteer_requests` (`teacher_id`, `student_id`, `class_id`, `message`, `status`, `approved`, `approved_by`, `approved_at`) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL)',
        [teacherId, studentId, classId, message || null, 'pending']
      );
      requestIds.push(result.insertId);
    }

    res.status(201).json({ status: 'ok', message: 'Volunteer request(s) created successfully', requestIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.put('/volunteer-requests/:id', requireAdmin, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ status: 'error', message: 'A valid request ID is required' });
    }

    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
      updates.push('`status` = ?');
      values.push(String(req.body.status || 'pending').trim() || 'pending');
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'approved')) {
      updates.push('`approved` = ?');
      values.push(Number(req.body.approved) === 1 ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'approved_by')) {
      const approvedBy = req.body.approved_by === null || req.body.approved_by === '' ? null : Number(req.body.approved_by);
      updates.push('`approved_by` = ?');
      values.push(Number.isInteger(approvedBy) ? approvedBy : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'approved_at')) {
      updates.push('`approved_at` = ?');
      values.push(req.body.approved_at ? String(req.body.approved_at) : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'class_id')) {
      const newClassId = req.body.class_id === null || req.body.class_id === '' ? null : Number(req.body.class_id);
      updates.push('`class_id` = ?');
      values.push(Number.isInteger(newClassId) ? newClassId : null);
    }

    if (!updates.length) {
      return res.status(400).json({ status: 'error', message: 'No request fields were provided' });
    }

    values.push(requestId);
    await db.query(`UPDATE \`volunteer_requests\` SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ status: 'ok', message: 'Volunteer request updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

function normalizeTeacherIdList(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number(String(item).trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

app.post('/announcements', requireAdmin, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const createdBy = req.body?.created_by !== undefined && req.body?.created_by !== null && String(req.body?.created_by).trim() !== ''
      ? Number(req.body.created_by)
      : null;
    const targetAll = Number(req.body?.target_all) === 1 || req.body?.target_all === true;
    const teacherIds = Array.isArray(req.body?.teacher_ids)
      ? req.body.teacher_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
      : normalizeTeacherIdList(req.body?.teacher_ids);

    if (!title || !content) {
      return res.status(400).json({ status: 'error', message: 'Title and content are required' });
    }

    if (!targetAll && teacherIds.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Select at least one teacher or send to all teachers' });
    }

    const targetTeacherIds = targetAll ? null : teacherIds.join(',');
    const [result] = await db.query(
      'INSERT INTO `announcements` (`title`, `content`, `created_by`, `target_all`, `target_teacher_ids`) VALUES (?, ?, ?, ?, ?)',
      [title, content, createdBy, targetAll ? 1 : 0, targetTeacherIds]
    );

    res.status(201).json({ status: 'ok', message: 'Announcement created successfully', announcementId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/teacher_announcements', async (req, res) => {
  try {
    const teacherId = Number(req.query?.teacher_id);
    if (!teacherId) {
      return res.status(400).json({ status: 'error', message: 'Teacher ID is required' });
    }

    const [rows] = await db.query(
      'SELECT * FROM `announcements` ' +
      'WHERE `target_all` = 1 ' +
      'OR FIND_IN_SET(?, COALESCE(`target_teacher_ids`, \'\')) ' +
      'ORDER BY `created_at` DESC, `id` DESC',
      [teacherId]
    );

    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

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
    const room = String(req.body?.room || '').trim();
    const period = String(req.body?.period || '').trim();
    const time = String(req.body?.time || '').trim();
    const studentIds = Array.isArray(req.body?.student_ids)
      ? req.body.student_ids
      : String(req.body?.student_ids || '').split(',').map((value) => Number(value.trim())).filter(Boolean);
    const gradeLevel = String(req.body?.grade_level || '').trim() || null;

    if (!name || !teacherId || !room || !period || !time) {
      return res.status(400).json({ status: 'error', message: 'Class name, teacher ID, room, period, and time are required' });
    }

    const [teacherRows] = await db.query('SELECT id FROM `user` WHERE id = ?', [teacherId]);
    if (!teacherRows.length) {
      return res.status(400).json({ status: 'error', message: 'Teacher not found' });
    }

    const roomId = await createLinkedRoom(room, period);
    const [classResult] = await db.query('INSERT INTO `class` (name, teacher_id, room_id, room, period, time, grade_level) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, teacherId, roomId, room, period, time, gradeLevel]);
    const classId = classResult.insertId;

    await db.query('UPDATE `room` SET class_id = ? WHERE id = ?', [classId, roomId]);

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
    const room = String(req.body?.room || '').trim();
    const period = String(req.body?.period || '').trim();
    const time = String(req.body?.time || '').trim();
    const roomId = req.body?.room_id !== undefined && req.body?.room_id !== null && String(req.body?.room_id).trim() !== ''
      ? Number(req.body.room_id)
      : null;
    const gradeLevel = String(req.body?.grade_level || '').trim() || null;

    if (!classId || !name || !teacherId || !room || !period || !time) {
      return res.status(400).json({ status: 'error', message: 'Class ID, name, teacher ID, room, period, and time are required' });
    }

    const [classRows] = await db.query('SELECT id FROM `class` WHERE id = ?', [classId]);
    if (!classRows.length) {
      return res.status(404).json({ status: 'error', message: 'Class not found' });
    }

    const [currentClassRows] = await db.query('SELECT room_id FROM `class` WHERE id = ?', [classId]);
    const existingRoomId = currentClassRows[0]?.room_id || null;

    if (existingRoomId) {
      await db.query('UPDATE `room` SET name = ?, period = ?, class_id = ? WHERE id = ?', [room, period, classId, existingRoomId]);
      await db.query('UPDATE `class` SET name = ?, teacher_id = ?, room = ?, period = ?, time = ?, grade_level = ? WHERE id = ?', [name, teacherId, room, period, time, gradeLevel, classId]);
    } else {
      const newRoomId = await createLinkedRoom(room, period);
      await db.query('UPDATE `class` SET name = ?, teacher_id = ?, room_id = ?, room = ?, period = ?, time = ?, grade_level = ? WHERE id = ?', [name, teacherId, newRoomId, room, period, time, gradeLevel, classId]);
      await db.query('UPDATE `room` SET class_id = ? WHERE id = ?', [classId, newRoomId]);
    }

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

    const [classRows] = await db.query('SELECT room_id FROM `class` WHERE id = ?', [classId]);
    const roomId = classRows[0]?.room_id || null;
    if (roomId) {
      await db.query('UPDATE `room` SET class_id = NULL WHERE id = ?', [roomId]);
    }

    await db.query('DELETE FROM `student_class` WHERE class_idclass = ?', [classId]);
    await db.query('DELETE FROM `class` WHERE id = ?', [classId]);
    res.json({ status: 'ok', message: 'Class deleted successfully' });
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

    const [rows] = await db.query(
      `SELECT u.*, r.name AS role_name
       FROM \`user\` u
       JOIN \`role\` r ON r.id = u.role_id
       WHERE u.email_address = ? AND u.password = ?`,
      [username, password]
    );

    if (rows.length > 0) {
      const user = { ...rows[0] };
      delete user.password;
      delete user.reset_token;
      res.status(200).json({ status: 'ok', message: 'Login successful', user });
    } else {
      res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});
app.post('/api/request-reset', async (req, res) => {
  const { email } = req.body;
  const token = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    // 1. Save token to DB
    const [result] = await db.query('UPDATE `user` SET `reset_token` = ? WHERE `email_address` = ?', [token, email]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // 2. Log to console
    console.log(`Reset Token for ${email}: ${token}`);

    // 3. Attempt to send email, but don't crash if it fails
    try {
      await transporter.sendMail({
        from: '"System" <no-reply@yourdomain.com>',
        to: email,
        subject: "Password Reset Token",
        text: `Your token is: ${token}`
      });
    } catch (emailErr) {
      console.error("Mailtrap connection failed, check your credentials:", emailErr.message);
    }

    // Always respond with success if the token was generated
    res.json({ status: 'ok', message: 'Token generated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Database error' });
  }
});

app.get('/api/class-students', (req, res) => {
  const classId = req.query.class_id;
  const query = `
    SELECT sc.*, u.first_name, u.last_name
    FROM student_class sc
    JOIN user u ON sc.user_iduser = u.id
    WHERE sc.class_idclass = ?
  `;

  db.query(query, [classId], (err, results) => {
    if (err) {
      console.error('Error fetching class students:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ mysqlResult: results });
  });
});
app.get('/student_class', (req, res) => {
  const classId = req.query.class_idclass;
  const query = `
    SELECT sc.*, u.first_name, u.last_name
    FROM student_class sc
    JOIN user u ON sc.user_iduser = u.id
    WHERE sc.class_idclass = ?
  `;
  db.query(query, [classId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ mysqlResult: results });
  });
});
// Custom endpoint for fetching classes with optional teacher filter
app.get('/classes', async (req, res) => {
  try {
    const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
    let query = 'SELECT * FROM `class`';
    let values = [];

    if (teacherId) {
      query += ' WHERE teacher_id = ?';
      values.push(teacherId);
    }

    const [rows] = await db.query(query, values);
    res.json({ status: 'ok', database: 'connected', mysqlResult: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});
// Sends a volunteer either to a real class/teacher (teacher_id + class_id)
// or to a free-text custom destination (custom_teacher + custom_location).
app.post('/volunteerHours/send', async (req, res) => {
  try {
    const studentId = Number(req.body?.student_id);
    const customTeacher = String(req.body?.custom_teacher || '').trim().slice(0, 255);
    const customLocation = String(req.body?.custom_location || '').trim().slice(0, 255);
    const isCustom = Boolean(customTeacher || customLocation);

    let teacherId = null;
    let classId = null;
    let resolvedCustomTeacher = customTeacher;

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid student_id is required'
      });
    }

    if (isCustom) {
      if (!customTeacher || !customLocation) {
        return res.status(400).json({
          status: 'error',
          message: 'Both custom_teacher and custom_location are required'
        });
      }

      if (customTeacher.trim().split(/\s+/).length < 2) {
        return res.status(400).json({
          status: 'error',
          message: "Enter the teacher's first and last name"
        });
      }
    } else {
      teacherId = Number(req.body?.teacher_id);
      classId = Number(req.body?.class_id);

      if (
        !Number.isInteger(teacherId) ||
        teacherId <= 0 ||
        !Number.isInteger(classId) ||
        classId <= 0
      ) {
        return res.status(400).json({
          status: 'error',
          message: 'student_id, teacher_id, and class_id are required'
        });
      }
    }

    // Make sure the selected volunteer is an actual Student.
    const [studentRows] = await db.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email_address,
        role_id
      FROM \`user\`
      WHERE id = ?
        AND role_id = 3
      LIMIT 1
      `,
      [studentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Student volunteer not found'
      });
    }

    const student = studentRows[0];

    if (isCustom) {
      // The typed teacher must be a real teacher: exact first + last name,
      // case-insensitive. The assignment is then linked to that teacher's
      // account so it shows up on their dashboard.
      const normalizeName = (value) =>
        String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const wantedName = normalizeName(customTeacher);

      const [teacherNameRows] = await db.query(
        `
        SELECT id, first_name, last_name
        FROM \`user\`
        WHERE role_id = (
          SELECT id FROM \`role\` WHERE LOWER(name) = 'teacher' LIMIT 1
        )
        `
      );

      const nameMatches = teacherNameRows.filter(
        (row) =>
          normalizeName(`${row.first_name || ''} ${row.last_name || ''}`) === wantedName
      );

      if (!nameMatches.length) {
        return res.status(400).json({
          status: 'error',
          message: `No teacher named "${customTeacher}" was found. Enter the teacher's exact first and last name.`
        });
      }

      if (nameMatches.length > 1) {
        return res.status(400).json({
          status: 'error',
          message: `More than one teacher is named "${customTeacher}". Use the class dropdown instead.`
        });
      }

      teacherId = nameMatches[0].id;
      resolvedCustomTeacher = `${nameMatches[0].first_name || ''} ${nameMatches[0].last_name || ''}`.trim();
    }

    // Make sure the target teacher exists (skipped for custom destinations).
    if (!isCustom) {
      const [teacherRows] = await db.query(
        `
        SELECT
          id,
          first_name,
          last_name,
          email_address,
          role_id
        FROM \`user\`
        WHERE id = ?
        LIMIT 1
        `,
        [teacherId]
      );

      if (!teacherRows.length) {
        return res.status(404).json({
          status: 'error',
          message: 'Teacher not found'
        });
      }
    }

    // Make sure the student isn't already assigned to an active
    // volunteer assignment.
    const [activeAssignmentRows] = await db.query(
      `
      SELECT *
      FROM \`volunteer_assignments\`
      WHERE student_id = ?
        AND status IN (
          'requested',
          'requesting_confirmation',
          'checked_in',
          'returning_confirmation'
        )
      ORDER BY id DESC
      LIMIT 1
      `,
      [studentId]
    );

    if (activeAssignmentRows.length) {
      return res.status(400).json({
        status: 'error',
        message: 'This student already has an active volunteer assignment',
        assignment: activeAssignmentRows[0]
      });
    }

    const assignedBy = req.body?.assigned_by
      ? Number(req.body.assigned_by)
      : null;

    // Create the assignment.
    const [assignmentResult] = await db.query(
      `
      INSERT INTO \`volunteer_assignments\`
      (
        volunteer_request_id,
        student_id,
        class_id,
        teacher_id,
        assigned_by,
        status,
        approved,
        approved_by,
        approved_at,
        check_in,
        check_out,
        total_hours,
        custom_teacher,
        custom_location
      )
      VALUES (
        NULL,
        ?,
        ?,
        ?,
        ?,
        'requesting_confirmation',
        1,
        ?,
        NOW(),
        NULL,
        NULL,
        0.00,
        ?,
        ?
      )
      `,
      [
        studentId,
        classId,
        teacherId,
        assignedBy,
        assignedBy,
        isCustom ? resolvedCustomTeacher : null,
        isCustom ? customLocation : null
      ]
    );

    const assignmentId = assignmentResult.insertId;

    return res.json({
      status: 'ok',
      message: 'Student sent successfully',

      student: {
        id: student.id,
        student_id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        email_address: student.email_address
      },

      assignment: {
        id: assignmentId,
        student_id: studentId,
        class_id: classId,
        teacher_id: teacherId,
        custom_teacher: isCustom ? resolvedCustomTeacher : null,
        custom_location: isCustom ? customLocation : null,
        status: 'requesting_confirmation',
        approved: 1,
        total_hours: '0.00'
      }
    });
  } catch (err) {
    console.error('Send volunteer to teacher error:', err);

    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});
app.post('/volunteerHours/cancel', async (req, res) => {
  try {
    const studentId = Number(
      req.body?.student_id ??
      req.body?.volunteer_id ??
      req.body?.id
    );

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid student ID is required'
      });
    }

    const [assignmentRows] = await db.query(
      `
      SELECT id, status
      FROM \`volunteer_assignments\`
      WHERE student_id = ?
        AND status IN ('requesting_confirmation', 'requested')
      ORDER BY id DESC
      LIMIT 1
      `,
      [studentId]
    );

    const assignment = assignmentRows[0] || null;
    if (!assignment) {
      return res.status(400).json({
        status: 'error',
        message: 'This student is not waiting for teacher check-in'
      });
    }

    await db.query(
      `
      UPDATE \`volunteer_assignments\`
      SET
        status = 'cancelled',
        approved = 0,
        approved_by = NULL,
        approved_at = NULL,
        check_in = NULL,
        check_out = NULL,
        total_hours = 0.00
      WHERE id = ?
        AND status IN ('requesting_confirmation', 'requested')
      `,
      [assignment.id]
    );

    return res.json({
      status: 'ok',
      message: 'Volunteer assignment cancelled successfully',
      volunteer_assignment_id: assignment.id
    });
  } catch (err) {
    console.error('Cancel volunteer assignment error:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

app.post('/volunteerHours/check-in', async (req, res) => {
  try {
    const requestedStudentId = Number(
      req.body?.student_id ??
      req.body?.volunteer_id ??
      req.body?.id
    );

    if (!Number.isInteger(requestedStudentId) || requestedStudentId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid student ID is required'
      });
    }

    // The volunteer is now the actual user with role_id = 3.
    const [studentRows] = await db.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email_address,
        role_id
      FROM \`user\`
      WHERE id = ?
        AND role_id = 3
      LIMIT 1
      `,
      [requestedStudentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Student volunteer not found'
      });
    }

    const student = studentRows[0];

    const [assignmentRows] = await db.query(
      `
      SELECT *
      FROM \`volunteer_assignments\`
      WHERE student_id = ?
        AND status IN (
          'requesting_confirmation',
          'requested'
        )
      ORDER BY id DESC
      LIMIT 1
      `,
      [student.id]
    );
    const assignment = assignmentRows[0] || null;

    if (!assignment) {
      return res.status(400).json({
        status: 'error',
        message: 'This student does not have a volunteer assignment'
      });
    }

    const currentStatus = String(
      assignment.status || ''
    ).toLowerCase();

    /*
      The student must be in the confirmation state before
      the teacher can check them in.
    */
    if (!['requesting_confirmation', 'requested'].includes(currentStatus)) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot check in from status "${assignment.status}"`
      });
    }

    const checkInTime = new Date();

    // Prevent multiple active volunteer_hours records
    // for the same student.
    const [activeHourRows] = await db.query(
      `
      SELECT id
      FROM \`volunteer_hours\`
      WHERE student_id = ?
        AND check_in IS NOT NULL
        AND check_out IS NULL
      ORDER BY id DESC
      LIMIT 1
      `,
      [student.id]
    );

    let volunteerHourId;

    if (activeHourRows.length) {
      volunteerHourId = activeHourRows[0].id;

      await db.query(
        `
        UPDATE \`volunteer_hours\`
        SET
          check_in = ?,
          check_out = NULL,
          total_hours = 0.00,
          approval_status = 'pending',
          approved = 0
        WHERE id = ?
        `,
        [checkInTime, volunteerHourId]
      );
    } else {
      const [hourResult] = await db.query(
        `
        INSERT INTO \`volunteer_hours\`
        (
          student_id,
          class_id,
          check_in,
          check_out,
          total_hours,
          approved,
          approval_status,
          volunteer_request_id,
          volunteer_assignment_id
        )
        VALUES (?, ?, ?, NULL, 0.00, 0, 'pending', ?, ?)
        `,
        [
          student.id,
          assignment.class_id,
          checkInTime,
          assignment.volunteer_request_id || null,
          assignment.id
        ]
      );

      volunteerHourId = hourResult.insertId;
    }

    // Update the assignment itself.
    await db.query(
      `
      UPDATE \`volunteer_assignments\`
      SET
        status = 'checked_in',
        check_in = ?,
        check_out = NULL,
        total_hours = 0.00
      WHERE id = ?
      `,
      [checkInTime, assignment.id]
    );

    return res.json({
      status: 'ok',
      message: 'Volunteer checked in successfully',
      student: {
        id: student.id,
        student_id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        email_address: student.email_address
      },
      volunteer_assignment_id: assignment.id,
      volunteer_hours_id: volunteerHourId,
      check_in: checkInTime,
      check_out: null,
      total_hours: '0.00'
    });
  } catch (err) {
    console.error('Volunteer check-in error:', err);

    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

app.post('/volunteerHours/check-out', async (req, res) => {
  try {
    const requestedStudentId = Number(
      req.body?.student_id ??
      req.body?.volunteer_id ??
      req.body?.id
    );

    if (!Number.isInteger(requestedStudentId) || requestedStudentId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid student ID is required'
      });
    }

    // Confirm this is an actual Student user.
    const [studentRows] = await db.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email_address,
        role_id
      FROM \`user\`
      WHERE id = ?
        AND role_id = 3
      LIMIT 1
      `,
      [requestedStudentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Student volunteer not found'
      });
    }

    const student = studentRows[0];

    // Find the student's current assignment.
    const [assignmentRows] = await db.query(
      `
      SELECT *
      FROM \`volunteer_assignments\`
      WHERE student_id = ?
        AND status = 'checked_in'
      ORDER BY id DESC
      LIMIT 1
      `,
      [student.id]
    );

    const assignment = assignmentRows[0] || null;

    if (!assignment) {
      return res.status(400).json({
        status: 'error',
        message: 'This student does not have a volunteer assignment'
      });
    }

    const currentStatus = String(
      assignment.status || ''
    ).toLowerCase();

    if (currentStatus !== 'checked_in') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot check out from status "${assignment.status}"`
      });
    }

    /*
      Find the active volunteer_hours record.
      This is now the authoritative time record.
    */
    const [hourRows] = await db.query(
      `
      SELECT *
      FROM \`volunteer_hours\`
      WHERE student_id = ?
        AND check_in IS NOT NULL
        AND check_out IS NULL
      ORDER BY id DESC
      LIMIT 1
      `,
      [student.id]
    );

    const hourRow = hourRows[0] || null;

    if (!hourRow) {
      return res.status(400).json({
        status: 'error',
        message: 'No active volunteer check-in was found for this student'
      });
    }

    const checkOutTime = new Date();

    const checkInTime = new Date(hourRow.check_in);

    if (Number.isNaN(checkInTime.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'The volunteer check-in time is invalid'
      });
    }

    const hoursWorked = Math.max(
      (checkOutTime.getTime() - checkInTime.getTime()) /
        (1000 * 60 * 60),
      0
    );

    const formattedHours = hoursWorked.toFixed(2);

    // Finalize the current volunteer_hours session.
    await db.query(
      `
      UPDATE \`volunteer_hours\`
      SET
        check_out = ?,
        total_hours = ?,
        approval_status = 'pending',
        approved = 0
      WHERE id = ?
      `,
      [
        checkOutTime,
        formattedHours,
        hourRow.id
      ]
    );

    /*
      Do NOT mark the assignment completed yet.

      The existing workflow requires admin confirmation
      after the teacher checks the student out.
    */
    await db.query(
      `
      UPDATE \`volunteer_assignments\`
      SET
        status = 'returning_confirmation',
        check_out = ?,
        total_hours = ?
      WHERE id = ?
      `,
      [
        checkOutTime,
        formattedHours,
        assignment.id
      ]
    );

    return res.json({
      status: 'ok',
      message: 'Requesting admin confirmation',
      student: {
        id: student.id,
        student_id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        email_address: student.email_address
      },
      volunteer_assignment_id: assignment.id,
      volunteer_hours_id: hourRow.id,
      check_in: hourRow.check_in,
      check_out: checkOutTime,
      total_hours: formattedHours,
      approval_status: 'pending'
    });
  } catch (err) {
    console.error('Volunteer check-out error:', err);

    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});
app.post('/volunteerHours/confirm-return', async (req, res) => {
  try {
    const studentId = Number(
      req.body?.student_id ??
      req.body?.volunteer_id ??
      req.body?.id
    );

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid student ID is required'
      });
    }

    // Confirm that this is an actual Student user.
    const [studentRows] = await db.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email_address,
        role_id
      FROM \`user\`
      WHERE id = ?
        AND role_id = 3
      LIMIT 1
      `,
      [studentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Student volunteer not found'
      });
    }

    const student = studentRows[0];

    // Find the latest assignment waiting for admin confirmation.
    const [assignmentRows] = await db.query(
      `
      SELECT *
      FROM \`volunteer_assignments\`
      WHERE student_id = ?
        AND status = 'returning_confirmation'
      ORDER BY id DESC
      LIMIT 1
      `,
      [studentId]
    );

    const assignment = assignmentRows[0] || null;

    if (!assignment) {
      return res.status(400).json({
        status: 'error',
        message: 'This student is not waiting for return confirmation'
      });
    }

    // Find the corresponding volunteer-hours record.
    const [hourRows] = await db.query(
      `
      SELECT *
      FROM \`volunteer_hours\`
      WHERE student_id = ?
        AND volunteer_assignment_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [
        studentId,
        assignment.id
      ]
    );

    const hourRow = hourRows[0] || null;

    /*
      If a completed check-out exists, preserve the calculated
      hours. Otherwise use the assignment's total_hours.
    */
    const finalHours = hourRow
      ? Number(hourRow.total_hours || 0).toFixed(2)
      : Number(assignment.total_hours || 0).toFixed(2);

    // Mark the assignment completed.
    await db.query(
      `
      UPDATE \`volunteer_assignments\`
      SET
        status = 'completed',
        approved = 1,
        approved_by = ?,
        approved_at = NOW(),
        total_hours = ?
      WHERE id = ?
      `,
      [
        req.body?.approved_by
          ? Number(req.body.approved_by)
          : null,
        finalHours,
        assignment.id
      ]
    );

    // Mark the hours record approved as well.
    if (hourRow) {
      await db.query(
        `
        UPDATE \`volunteer_hours\`
        SET
          approved = 1,
          approved_by = ?,
          approval_status = 'approved',
          total_hours = ?
        WHERE id = ?
        `,
        [
          req.body?.approved_by
            ? Number(req.body.approved_by)
            : null,
          finalHours,
          hourRow.id
        ]
      );
    }

    return res.json({
      status: 'ok',
      message: 'Volunteer return confirmed successfully',

      student: {
        id: student.id,
        student_id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        email_address: student.email_address
      },

      assignment: {
        id: assignment.id,
        student_id: student.id,
        class_id: assignment.class_id,
        teacher_id: assignment.teacher_id,
        status: 'completed',
        total_hours: finalHours
      },

      volunteer_hours: hourRow
        ? {
            id: hourRow.id,
            total_hours: finalHours,
            approved: 1,
            approval_status: 'approved'
          }
        : null
    });
  } catch (err) {
    console.error('Confirm volunteer return error:', err);

    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});
app.post('/reviews', async (req, res) => {
  const { user_id, rating, comment } = req.body;
  try {
    const query = 'INSERT INTO reviews (user_id, rating, comment) VALUES (?, ?, ?)';
    const result = await db.execute(query, [user_id, rating, comment]);
    res.status(201).json({ success: true, result });
  } catch (err) {
    console.error('Error inserting review:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/classes/import-csv', requireAdmin, async (req, res) => {
  try {
    const fileBuffer = decodeUploadBuffer(req.body?.file_data);
    const fileName = String(req.body?.file_name || 'import.csv');

    if (!fileBuffer || !fileBuffer.length) {
      return res.status(400).json({ status: 'error', message: 'A file upload is required' });
    }

    const rows = getImportRows(fileBuffer, fileName);
    const errors = [];
    let insertedCount = 0;

    for (const [index, row] of rows.entries()) {
      const normalizedRow = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        normalizedRow[normalizeHeader(key)] = String(value ?? '').trim();
      });

      const className = pickRowValue(normalizedRow, ['class', 'class_name']);
      const room = pickRowValue(normalizedRow, ['room']);
      const teacherEmail = pickRowValue(normalizedRow, ['t_email', 'teacher_email']);
      const gradeLevel = pickRowValue(normalizedRow, ['grade', 'grade_level']);
      const time = pickRowValue(normalizedRow, ['timings', 'time']);
      const period = pickRowValue(normalizedRow, ['a_b_day', 'ab_day', 'period']);
      const rawDays = pickRowValue(normalizedRow, ['days', 'schedule_days', 'schedule_day']);
      const scheduleDays = /^fri/i.test(rawDays) ? 'fri' : 'mon-thu';

      if (!className) continue;

      try {
        // --- STEP 2: teacher lookup by email ---
        let teacherId = null;
        if (teacherEmail) {
          const [teacherRows] = await db.query(
            'SELECT id FROM `user` WHERE LOWER(TRIM(email_address)) = LOWER(TRIM(?)) LIMIT 1',
            [teacherEmail]
          );
          if (teacherRows.length) {
            teacherId = teacherRows[0].id;
          } else {
            errors.push({ index: index + 2, message: `No user found with email "${teacherEmail}" — class saved without a teacher.` });
          }
        }
        // --- end step 2 ---

        // Skip exact duplicates (same class, teacher, time and schedule day)
        const [duplicateRows] = await db.query(
          'SELECT id FROM `class` WHERE name = ? AND `time` <=> ? AND teacher_id <=> ? AND schedule_days = ? LIMIT 1',
          [className, time || null, teacherId, scheduleDays]
        );
        if (duplicateRows.length) {
          errors.push({ index: index + 2, message: `"${className}" at ${time || 'no time'} already exists — skipped.` });
          continue;
        }

        await db.query(
          'INSERT INTO `class` (name, teacher_id, room, grade_level, time, period, schedule_days) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [className, teacherId, room || null, gradeLevel || null, time || null, period || null, scheduleDays]
        );
        insertedCount += 1;
      } catch (rowErr) {
        errors.push({ index: index + 2, message: rowErr.message });
      }
    }

    res.json({ status: 'ok', message: 'Classes imported successfully!', insertedCount, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));