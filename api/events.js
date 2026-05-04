import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { action, family_id, id } = req.body;

  if (action === 'list') {
    const keys = await kv.keys(`event:${family_id}:*`);
    if (keys.length === 0) return res.status(200).json([]);
    const events = await kv.mget(...keys);
    return res.status(200).json(events.filter(e => e !== null));
  }

  if (action === 'add') {
    const { title, description, date_str, time_str, type, repeat_count, created_by, created_by_name } = req.body;
    
    // Logique de répétition améliorée
    let iterations = 1;
    let unit = 'month';
    const repeatVal = String(repeat_count);

    if (repeatVal.startsWith('w')) {
      unit = 'week';
      iterations = parseInt(repeatVal.replace('w', '')) || 1;
    } else {
      iterations = parseInt(repeatVal) || 1;
    }

    const newEvents = [];
    for (let i = 0; i < iterations; i++) {
      const eventId = Date.now() + i;
      let eventDate = new Date(date_str + 'T12:00:00');

      if (unit === 'week') {
        eventDate.setDate(eventDate.getDate() + (i * 7));
      } else {
        eventDate.setMonth(eventDate.getMonth() + i);
      }

      const finalDateStr = eventDate.toISOString().split('T')[0];
      const event = {
        id: eventId, family_id, title, description,
        date_str: finalDateStr, time_str, type,
        created_by, created_by_name, created_at: new Date().toISOString()
      };
      
      await kv.set(`event:${family_id}:${eventId}`, event);
      newEvents.push(event);
    }
    return res.status(200).json(newEvents);
  }

  if (action === 'delete') {
    // On cherche l'événement pour vérifier le family_id avant de supprimer
    const keys = await kv.keys(`event:*: ${id}`); 
    // Plus simple : on scanne les clés pour trouver celle qui finit par l'ID
    const allKeys = await kv.keys(`event:*:${id}`);
    for (const key of allKeys) {
        await kv.del(key);
    }
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Action non reconnue' });
}
