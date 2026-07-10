const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRoomPayload, resolveRoomEventId } = require('../roomPayload');

test('treats a blank event id as optional for room payloads', () => {
  assert.deepStrictEqual(
    normalizeRoomPayload({ name: 'Room A', event_id: '', class_id: '', period: '1st' }),
    { name: 'Room A', eventId: null, classId: null, period: '1st' }
  );
});

test('keeps a numeric event id when provided', () => {
  assert.deepStrictEqual(
    normalizeRoomPayload({ name: 'Room B', event_id: '12', class_id: '3', period: '2nd' }),
    { name: 'Room B', eventId: 12, classId: 3, period: '2nd' }
  );
});

test('creates a new event id when no event id is supplied', async () => {
  const createdId = await resolveRoomEventId({
    roomName: 'Room C',
    eventId: null,
    createEvent: async () => ({ insertId: 77 })
  });

  assert.equal(createdId, 77);
});
