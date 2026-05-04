import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Gestion du CORS pour éviter les blocages navigateurs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Lecture sécurisée du corps de la requête
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, family_id, id } = body;

    // --- 1. LISTER LES ÉVÉNEMENTS ---
    if (action === 'list') {
      if (!family_id) return res.status(200).json([]);
      
      // On cherche toutes les clés liées à cette famille
      const keys = await kv.keys(`ev:${family_id}:*`);
      if (!keys || keys.length === 0) return res.status(200).json([]);
      
      const events = await kv.mget(...keys);
      // On trie pour ne garder que les données valides
      return res.status(200).json(events.filter(e => e !== null));
    }

    // --- 2. AJOUTER UN ÉVÉNEMENT ---
    if (action === 'add' || action === 'update') {
      const { title, date_str, repeat_count, created_by_name } = body;
      
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
        const eventId = action === 'update' && i === 0 ? id : `e${now}${i}`;
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
          created_by_name: created_by_name || "Famille"
        };

        // Sauvegarde avec une clé simplifiée "ev:family_id:event_id"
        await kv.set(`ev:${family_id}:${eventId}`, newEvent);
        addedEvents.push(newEvent);
      }
      return res.status(200).json(addedEvents);
    }

    // --- 3. SUPPRIMER UN ÉVÉNEMENT ---
    if (action === 'delete') {
      // On scanne les clés pour trouver celle qui contient l'ID
      const allKeys = await kv.keys(`ev:*:${id}`);
      for (const key of allKeys) {
        await kv.del(key);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action non reconnue' });

  } catch (error) {
    console.error("Erreur Backend:", error);
    return res.status(500).json({ error: "Erreur technique" });
  }
}
