require('dotenv').config();
const db = require('./db');

async function checkAndAddTestData() {
  try {
    // Check users
    try {
      const [users] = await db.query('SELECT user_id as id, first_name, user_type FROM `user` LIMIT 5');
      console.log('Users:', users);
    } catch (err) {
      console.log('Error querying users:', err.message);
    }
    
    // Check classes
    try {
      const [classes] = await db.query('SELECT * FROM `class` LIMIT 5');
      console.log('Classes:', classes);
    } catch (err) {
      console.log('Error querying classes:', err.message);
    }
    
    // Check student_class
    try {
      const [studentClasses] = await db.query('SELECT * FROM `student_class` LIMIT 5');
      console.log('Student Classes:', studentClasses);
    } catch (err) {
      console.log('Error querying student_class:', err.message);
    }
    
    // Check events
    try {
      const [events] = await db.query('SELECT * FROM `event` LIMIT 5');
      console.log('Events:', events);
    } catch (err) {
      console.log('Error querying events:', err.message);
    }
    
    console.log('\nDatabase check complete!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkAndAddTestData();
