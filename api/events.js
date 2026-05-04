import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // On force le support du JSON
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { action, family_id, id } = body;

  try {
    // 1. LISTER LES ÉVÉNEMENTS
    if (action === 'list') {
      // Si pas de family_id, on ne peut rien chercher
      if (!family_id) return res.status(200).json([]);
      
      // On cherche toutes les clés qui commencent par event:
      const keys = await kv.keys(`event:${family_id}:*`);
      if (!keys || keys.length === 0) return res.status(200).json([]);
      
      const events = await kv.mget(...keys);
      return res.status(200).json(events.filter(e => e !== null));
    }

    // 2. AJOUTER UN ÉVÉNEMENT (AVEC RÉPÉTITION)
    if (action === 'add') {
      const { title, date_str, repeat_count, created_by, created_by_name } = body;
      
      let iterations = 1;
      let unit = 'month';
      const repeatVal = String(repeat_count || "1");

      if (repeatVal.startsWith('w')) {
        unit = 'week';
        iterations = parseInt(repeatVal.replace('w', '')) || 1;
      } else {
        iterations = parseInt(repeatVal) || 1;
      }

      const addedEvents = [];
      const now = Date.now();

      for (let i = 0; i < iterations; i++) {
        const eventId = `ev_${now}_${i}`;
        let eventDate = new Date(date_str + 'T12:00:00');

        if (unit === 'week') {
          eventDate.setDate(eventDate.getDate() + (i * 7));
        } else {
          eventDate.setMonth(eventDate.getMonth() + i);
        }

        const finalDateStr = eventDate.toISOString().split('T')[0];
        
        const newEvent = {
          ...body,
          id: eventId,
          date_str: finalDateStr,
          created_at: new Date().toISOString(),
          created_by_name: created_by_name || "Partenaire"
        };

        await kv.set(`event:${family_id}:${eventId}`, newEvent);
        addedEvents.push(newEvent);
      }
      return res.status(200).json(addedEvents);
    }

    // 3. SUPPRIMER UN ÉVÉNEMENT
    if (action === 'delete') {
      const allKeys = await kv.keys(`event:*:${id}`);
      for (const key of allKeys) {
        await kv.del(key);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action non reconnue' });

  } catch (error) {
    console.error("Erreur KV:", error);
    return res.status(500).json({ error: error.message });
  }
}
