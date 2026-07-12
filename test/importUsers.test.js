const test = require('node:test');
const assert = require('node:assert/strict');
const { parseImportRows } = require('../importUsers');

test('parseImportRows extracts headers and data from CSV content', () => {
  const rows = parseImportRows(
    Buffer.from('first_name,last_name,email_address,role_name\nJane,Doe,jane@example.com,Student\n'),
    'users.csv'
  );

  assert.deepEqual(rows, [
    {
      first_name: 'Jane',
      last_name: 'Doe',
      email_address: 'jane@example.com',
      role_name: 'Student'
    }
  ]);
});
