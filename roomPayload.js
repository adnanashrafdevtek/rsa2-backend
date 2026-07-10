function normalizeRoomPayload(body = {}) {
  const name = String(body?.name || '').trim();
  const rawEventId = body?.event_id;
  const parsedEventId = rawEventId === '' || rawEventId === null || rawEventId === undefined ? null : Number(rawEventId);
  const eventId = parsedEventId === null || Number.isNaN(parsedEventId) || parsedEventId <= 0 ? null : parsedEventId;
  const classId = body?.class_id ? Number(body.class_id) : null;
  const period = String(body?.period || '').trim();

  return { name, eventId, classId, period };
}

async function resolveRoomEventId({ roomName, eventId, createEvent }) {
  if (eventId !== null) {
    return eventId;
  }

  const createdEvent = await createEvent({
    name: roomName || 'Untitled room',
    description: `Auto-generated for room ${roomName || 'Untitled room'}`
  });

  return createdEvent.insertId;
}

module.exports = { normalizeRoomPayload, resolveRoomEventId };
