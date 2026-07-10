require('dotenv').config();
const db = require('./db');

async function addTestData() {
  try {
    console.log('Adding test data...');
    
    // Add a test class with teacher_id = 1 (Arham)
    await db.query('INSERT INTO `class` (name, teacher_id, grade_level) VALUES (?, ?, ?)', ['10-A', 1, '10']);
    console.log('Added class: 10-A');
    
    // Get the class ID
    const [classResult] = await db.query('SELECT id FROM `class` WHERE teacher_id = 1');
    const classId = classResult[0]?.id;
    
    if (classId) {
      // Add student assignments
      await db.query('INSERT INTO `student_class` (user_iduser, class_idclass, grade_level) VALUES (?, ?, ?)', [2, classId, '10']);
      console.log('Added student assignment: user 2 to class ' + classId);
    }
    
    // Add test events
    await db.query('INSERT INTO `event` (name, description) VALUES (?, ?)', ['Physics Exam', 'Annual Physics Examination']);
    console.log('Added event: Physics Exam');
    
    await db.query('INSERT INTO `event` (name, description) VALUES (?, ?)', ['Math Quiz', 'Monthly mathematics quiz']);
    console.log('Added event: Math Quiz');
    
    console.log('\nTest data added successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

addTestData();
