require('dotenv').config();
const db = require('./db');

async function describeTable() {
  try {
    const [columns] = await db.query('DESCRIBE `user`');
    console.log('User table columns:');
    columns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}${col.Key ? ' (' + col.Key + ')' : ''}`);
    });
    
    const [classColumns] = await db.query('DESCRIBE `class`');
    console.log('\nClass table columns:');
    classColumns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}${col.Key ? ' (' + col.Key + ')' : ''}`);
    });
    
    const [scColumns] = await db.query('DESCRIBE `student_class`');
    console.log('\nStudent_class table columns:');
    scColumns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}${col.Key ? ' (' + col.Key + ')' : ''}`);
    });
    
    const [eventColumns] = await db.query('DESCRIBE `event`');
    console.log('\nEvent table columns:');
    eventColumns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type}${col.Key ? ' (' + col.Key + ')' : ''}`);
    });
    
    // Also check existing data
    const [users] = await db.query('SELECT * FROM `user` LIMIT 5');
    console.log('\nExisting users:', users.length);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

describeTable();
