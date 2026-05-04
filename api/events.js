import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const { action, family_id, id, title, description, date_str, time_str, type, repeat_count, created_by, created_by_name } = req.body;

    // 1. LISTER LES ÉVÉNEMENTS
    if (action === 'list') {
      if (!family_id) return res.status(400).json({ error: 'family_id manquant' });
      const keys = await kv.keys(`event:${family_id}:*`);
      if (!keys || keys.length === 0) return res.status(200).json([]);
      const events = await kv.mget(...keys);
      return res.status(200).json(events.filter(e => e !== null));
    }

    // 2. AJOUTER / MODIFIER
    if (action === 'add' || action === 'update') {
      const iterations = parseInt(repeat_count) || 1;
      const baseTimestamp = Date.now();
      const addedEvents = [];

      for (let i = 0; i < iterations; i++) {
        // Si c'est un update, on garde l'ID existant pour le premier, sinon on crée
        const eventId = (action === 'update' && i === 0) ? id : `ev_${baseTimestamp}_${i}`;
        
        let eventDate = new Date(date_str + 'T12:00:00');
        eventDate.setMonth(eventDate.getMonth() + i); // Répétition mensuelle
        const finalDateStr = eventDate.toISOString().split('T')[0];

        const eventData = {
          id: eventId,
          family_id,
          title,
          description: description || "",
          date_str: finalDateStr,
          time_str: time_str || null,
          type: type || "task",
          created_by: created_by || "Inconnu",
          created_by_name: created_by_name || "Membre",
          created_at: new Date().toISOString()
        };

        await kv.set(`event:${family_id}:${eventId}`, eventData);
        addedEvents.push(eventData);
      }
      return res.status(200).json(addedEvents);
    }

    // 3. SUPPRIMER
    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'ID manquant' });
      // On cherche la clé exacte dans la base
      const allKeys = await kv.keys(`event:*:${id}`);
      if (allKeys && allKeys.length > 0) {
        for (const key of allKeys) {
          await kv.del(key);
        }
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action non reconnue' });

  } catch (error) {
    console.error("Erreur API Events:", error);
    return res.status(500).json({ error: 'Erreur interne' });
  }
}
