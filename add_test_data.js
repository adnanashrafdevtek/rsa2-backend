require('dotenv').config();
const db = require('./db');

async function addTestData() {
  try {
    console.log('Adding test data...');

    async function ensureRole(name) {
      const [rows] = await db.query('SELECT id FROM `role` WHERE name = ? LIMIT 1', [name]);
      if (rows.length) return rows[0].id;
      const [result] = await db.query('INSERT INTO `role` (name) VALUES (?)', [name]);
      return result.insertId;
    }

    async function ensureUser({ firstName, lastName, email, roleId, password = 'test' }) {
      const [rows] = await db.query('SELECT id FROM `user` WHERE email_address = ? LIMIT 1', [email]);
      if (rows.length) {
        await db.query('UPDATE `user` SET first_name = ?, last_name = ?, role_id = ?, password = ? WHERE id = ?', [firstName, lastName, roleId, password, rows[0].id]);
        return rows[0].id;
      }

      const [result] = await db.query(
        'INSERT INTO `user` (first_name, last_name, email_address, role_id, password) VALUES (?, ?, ?, ?, ?)',
        [firstName, lastName, email, roleId, password]
      );
      return result.insertId;
    }

    async function ensureClass(name, teacherId, roomId, extra = {}) {
      const [rows] = await db.query('SELECT id FROM `class` WHERE name = ? AND teacher_id = ? LIMIT 1', [name, teacherId]);
      if (rows.length) return rows[0].id;

      const [result] = await db.query(
        'INSERT INTO `class` (name, teacher_id, room_id, room, period, time, grade_level) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, teacherId, roomId, extra.room || null, extra.period || null, extra.time || null, extra.grade_level || null]
      );
      return result.insertId;
    }

    async function ensureStudentClass(studentId, classId, gradeLevel) {
      const [rows] = await db.query('SELECT id FROM `student_class` WHERE user_iduser = ? AND class_idclass = ? LIMIT 1', [studentId, classId]);
      if (rows.length) return rows[0].id;
      const [result] = await db.query('INSERT INTO `student_class` (grade_level, user_iduser, class_idclass) VALUES (?, ?, ?)', [gradeLevel, studentId, classId]);
      return result.insertId;
    }

    async function ensureEvent(name, description, room, date) {
      const [rows] = await db.query('SELECT id FROM `event` WHERE name = ? LIMIT 1', [name]);
      if (rows.length) return rows[0].id;
      const [result] = await db.query('INSERT INTO `event` (name, description, room, date) VALUES (?, ?, ?, ?)', [name, description, room, date]);
      return result.insertId;
    }

    async function ensureRoom(name, eventId, period) {
      const [rows] = await db.query('SELECT id FROM `room` WHERE name = ? LIMIT 1', [name]);
      if (rows.length) {
        await db.query('UPDATE `room` SET event_id = ?, period = ? WHERE id = ?', [eventId, period || null, rows[0].id]);
        return rows[0].id;
      }

      const [result] = await db.query('INSERT INTO `room` (name, event_id, class_id, period) VALUES (?, ?, NULL, ?)', [name, eventId, period || null]);
      return result.insertId;
    }

    async function ensureSchedule(data) {
      const [rows] = await db.query(
        'SELECT id FROM `schedule` WHERE student_id = ? AND period = ? AND class_name = ? AND time = ? LIMIT 1',
        [data.student_id, data.period, data.class_name, data.time]
      );
      if (rows.length) return rows[0].id;

      const [result] = await db.query(
        'INSERT INTO `schedule` (`name`, `decription`, `event_id`, `student_id`, `student_name`, `time`, `period`, `teacher`, `room`, `class_name`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [data.name, data.description, data.event_id || null, data.student_id || null, data.student_name || null, data.time || null, data.period || null, data.teacher || null, data.room || null, data.class_name || null]
      );
      return result.insertId;
    }

    async function ensureVolunteer(studentId, firstName, lastName, email, status, totalHours) {
      const [rows] = await db.query('SELECT id FROM `volunteers` WHERE email_address = ? LIMIT 1', [email]);
      if (rows.length) {
        await db.query(
          'UPDATE `volunteers` SET first_name = ?, last_name = ?, status = ?, student_id = ?, total_hours = ? WHERE id = ?',
          [firstName, lastName, status, studentId, totalHours, rows[0].id]
        );
        return rows[0].id;
      }

      const [result] = await db.query(
        'INSERT INTO `volunteers` (first_name, last_name, email_address, status, student_id, total_hours) VALUES (?, ?, ?, ?, ?, ?)',
        [firstName, lastName, email, status, studentId, totalHours]
      );
      return result.insertId;
    }

    async function ensureVolunteerRequest(payload) {
      const [rows] = await db.query(
        'SELECT id FROM `volunteer_requests` WHERE teacher_id = ? AND student_id = ? AND class_id <=> ? LIMIT 1',
        [payload.teacher_id, payload.student_id, payload.class_id]
      );
      if (rows.length) return rows[0].id;

      const [result] = await db.query(
        'INSERT INTO `volunteer_requests` (`teacher_id`, `student_id`, `class_id`, `message`, `status`, `approved`, `approved_by`, `approved_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [payload.teacher_id, payload.student_id, payload.class_id, payload.message, payload.status, payload.approved, payload.approved_by, payload.approved_at]
      );
      return result.insertId;
    }

    async function ensureVolunteerAssignment(payload) {
      const [rows] = await db.query(
        'SELECT id FROM `volunteer_assignments` WHERE student_id = ? AND class_id = ? AND teacher_id = ? LIMIT 1',
        [payload.student_id, payload.class_id, payload.teacher_id]
      );
      if (rows.length) return rows[0].id;

      const [result] = await db.query(
        'INSERT INTO `volunteer_assignments` (`volunteer_request_id`, `student_id`, `class_id`, `teacher_id`, `assigned_by`, `status`, `approved`, `approved_by`, `approved_at`, `check_in`, `check_out`, `total_hours`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [payload.volunteer_request_id, payload.student_id, payload.class_id, payload.teacher_id, payload.assigned_by, payload.status, payload.approved, payload.approved_by, payload.approved_at, payload.check_in, payload.check_out, payload.total_hours]
      );
      return result.insertId;
    }

    async function ensureVolunteerHours(payload) {
      const [rows] = await db.query(
        'SELECT id FROM `volunteer_hours` WHERE student_id = ? AND class_id = ? AND check_in <=> ? AND check_out <=> ? LIMIT 1',
        [payload.student_id, payload.class_id, payload.check_in, payload.check_out]
      );
      if (rows.length) return rows[0].id;

      const [result] = await db.query(
        'INSERT INTO `volunteer_hours` (`student_id`, `class_id`, `check_in`, `check_out`, `total_hours`, `approved_by`, `approved`, `approval_status`, `volunteer_request_id`, `volunteer_assignment_id`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [payload.student_id, payload.class_id, payload.check_in, payload.check_out, payload.total_hours, payload.approved_by, payload.approved, payload.approval_status || 'pending', payload.volunteer_request_id, payload.volunteer_assignment_id]
      );
      return result.insertId;
    }

    const teacherRoleId = await ensureRole('Teacher');
    const adminRoleId = await ensureRole('Admin');
    const studentRoleId = await ensureRole('Student');

    const adminId = await ensureUser({ firstName: 'Amina', lastName: 'Khan', email: 'admin@example.com', roleId: adminRoleId });
    const teacherOneId = await ensureUser({ firstName: 'Maya', lastName: 'Patel', email: 'maya.patel@example.com', roleId: teacherRoleId });
    const teacherTwoId = await ensureUser({ firstName: 'Jordan', lastName: 'Lee', email: 'jordan.lee@example.com', roleId: teacherRoleId });
    const studentOneId = await ensureUser({ firstName: 'Noah', lastName: 'Reed', email: 'noah.reed@example.com', roleId: studentRoleId });
    const studentTwoId = await ensureUser({ firstName: 'Lila', lastName: 'Santos', email: 'lila.santos@example.com', roleId: studentRoleId });
    const studentThreeId = await ensureUser({ firstName: 'Ethan', lastName: 'Nguyen', email: 'ethan.nguyen@example.com', roleId: studentRoleId });
    const studentFourId = await ensureUser({ firstName: 'Zara', lastName: 'Ali', email: 'zara.ali@example.com', roleId: studentRoleId });

    const orientationId = await ensureEvent('Orientation', 'Welcome and information session', 'Auditorium', '2026-07-05 12:30:00');
    const scienceFairId = await ensureEvent('Science Fair', 'Student science projects and volunteer showcase', 'Lab 1', '2026-07-15 09:00:00');
    const roomOneId = await ensureRoom('Auditorium', orientationId, 'A1');
    const roomTwoId = await ensureRoom('Lab 1', scienceFairId, 'B2');
    const roomThreeId = await ensureRoom('Library', orientationId, 'C3');
    const algebraId = await ensureClass('Algebra I', teacherOneId, roomOneId, { room: 'Room 101', period: 'A1', time: '08:00-08:50', grade_level: '10' });
    const biologyId = await ensureClass('Biology Lab', teacherTwoId, roomTwoId, { room: 'Lab 1', period: 'B2', time: '10:05-10:55', grade_level: '11' });
    const studyHallId = await ensureClass('Study Hall Support', teacherOneId, roomThreeId, { room: 'Library', period: 'C3', time: '12:15-01:00', grade_level: 'All' });

    await ensureStudentClass(studentOneId, algebraId, '10');
    await ensureStudentClass(studentTwoId, biologyId, '11');
    await ensureStudentClass(studentThreeId, studyHallId, '10');
    await ensureStudentClass(studentFourId, biologyId, '11');

    await ensureSchedule({ name: 'Math Class', description: 'Regular class period', event_id: null, student_id: studentOneId, student_name: 'Noah Reed', time: '08:00-08:50', period: 'A1', teacher: 'Maya Patel', room: 'Room 101', class_name: 'Algebra I' });
    await ensureSchedule({ name: 'Independent Period', description: 'Independent study time', event_id: null, student_id: studentOneId, student_name: 'Noah Reed', time: '09:00-09:45', period: 'A2', teacher: null, room: 'Library', class_name: 'Independent Period' });
    await ensureSchedule({ name: 'Study Hall', description: 'Supervised study hall', event_id: null, student_id: studentTwoId, student_name: 'Lila Santos', time: '12:15-01:00', period: 'C3', teacher: 'Jordan Lee', room: 'Library', class_name: 'Study Hall' });
    await ensureSchedule({ name: 'Biology Lab', description: 'Regular class period', event_id: scienceFairId, student_id: studentTwoId, student_name: 'Lila Santos', time: '10:05-10:55', period: 'B2', teacher: 'Jordan Lee', room: 'Lab 1', class_name: 'Biology Lab' });
    await ensureSchedule({ name: 'Orientation', description: 'School opening event', event_id: orientationId, student_id: studentThreeId, student_name: 'Ethan Nguyen', time: '12:30-01:30', period: 'Advisory', teacher: null, room: 'Auditorium', class_name: 'Event' });

    const volunteerOneId = await ensureVolunteer(studentOneId, 'Noah', 'Reed', 'noah.reed@example.com', 'available', 12.50);
    const volunteerTwoId = await ensureVolunteer(studentTwoId, 'Lila', 'Santos', 'lila.santos@example.com', 'checked_in', 8.25);
    const volunteerThreeId = await ensureVolunteer(studentThreeId, 'Ethan', 'Nguyen', 'ethan.nguyen@example.com', 'returning_confirmation', 15.00);

    const requestOneId = await ensureVolunteerRequest({
      teacher_id: teacherOneId,
      student_id: studentOneId,
      class_id: algebraId,
      message: 'Need a volunteer for the lab cleanup block.',
      status: 'pending',
      approved: 0,
      approved_by: null,
      approved_at: null
    });

    const requestTwoId = await ensureVolunteerRequest({
      teacher_id: teacherTwoId,
      student_id: studentTwoId,
      class_id: biologyId,
      message: 'Approved for study hall support during second period.',
      status: 'approved',
      approved: 1,
      approved_by: adminId,
      approved_at: '2026-07-01 09:30:00'
    });

    const assignmentOneId = await ensureVolunteerAssignment({
      volunteer_request_id: requestOneId,
      student_id: studentOneId,
      class_id: algebraId,
      teacher_id: teacherOneId,
      assigned_by: adminId,
      status: 'requested',
      approved: 0,
      approved_by: null,
      approved_at: null,
      check_in: null,
      check_out: null,
      total_hours: 0.00
    });

    const assignmentTwoId = await ensureVolunteerAssignment({
      volunteer_request_id: requestTwoId,
      student_id: studentTwoId,
      class_id: biologyId,
      teacher_id: teacherTwoId,
      assigned_by: adminId,
      status: 'arrived',
      approved: 1,
      approved_by: adminId,
      approved_at: '2026-07-01 10:00:00',
      check_in: '2026-07-01 10:05:00',
      check_out: '2026-07-01 11:35:00',
      total_hours: 1.50
    });

    await ensureVolunteerHours({
      student_id: studentThreeId,
      class_id: studyHallId,
      check_in: '2026-07-02 12:10:00',
      check_out: '2026-07-02 01:00:00',
      total_hours: 0.83,
      approved_by: adminId,
      approved: 1,
      approval_status: 'approved',
      volunteer_request_id: requestTwoId,
      volunteer_assignment_id: assignmentTwoId
    });

    await ensureVolunteerHours({
      student_id: studentTwoId,
      class_id: biologyId,
      check_in: '2026-07-03 10:00:00',
      check_out: '2026-07-03 11:30:00',
      total_hours: 1.50,
      approved_by: adminId,
      approved: 1,
      approval_status: 'approved',
      volunteer_request_id: requestTwoId,
      volunteer_assignment_id: assignmentTwoId
    });

    console.log('Added test volunteers:', volunteerOneId, volunteerTwoId, volunteerThreeId);
    console.log('Added test requests:', requestOneId, requestTwoId);
    console.log('Added test assignment:', assignmentOneId, assignmentTwoId);
    console.log('Added classes:', algebraId, biologyId, studyHallId);
    console.log('Added events:', orientationId, scienceFairId);

    console.log('\nTest data added successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

addTestData();
