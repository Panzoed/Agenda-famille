import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const { action, family_id, id } = req.body;

    // 1. LISTER LES ÉVÉNEMENTS
    if (action === 'list') {
      if (!family_id) return res.status(400).json({ error: 'family_id manquant' });
      const keys = await kv.keys(`event:${family_id}:*`);
      if (!keys || keys.length === 0) return res.status(200).json([]);
      const events = await kv.mget(...keys);
      // On filtre les nuls et on trie par date
      const validEvents = events.filter(e => e !== null);
      return res.status(200).json(validEvents);
    }

    // 2. AJOUTER (AVEC RÉPÉTITION SEMAINES/MOIS)
    if (action === 'add') {
      const { title, description, date_str, time_str, type, repeat_count, created_by, created_by_name } = req.body;
      
      let iterations = 1;
      let unit = 'month';
      const repeatVal = String(repeat_count || "1");

      // Détection Semaines vs Mois
      if (repeatVal.startsWith('w')) {
        unit = 'week';
        iterations = parseInt(repeatVal.replace('w', '')) || 1;
      } else {
        unit = 'month';
        iterations = parseInt(repeatVal) || 1;
      }

      const newEvents = [];
      const baseTimestamp = Date.now();

      for (let i = 0; i < iterations; i++) {
        const eventId = baseTimestamp + i;
        let eventDate = new Date(date_str + 'T12:00:00');

        if (unit === 'week') {
          eventDate.setDate(eventDate.getDate() + (i * 7));
        } else {
          eventDate.setMonth(eventDate.getMonth() + i);
        }

        const finalDateStr = eventDate.toISOString().split('T')[0];
        const event = {
          id: eventId,
          family_id,
          title,
          description: description || "",
          date_str: finalDateStr,
          time_str: time_str || null,
          type: type || "task",
          created_by: created_by || "Inconnu",
          created_by_name: created_by_name || "Partenaire",
          created_at: new Date().toISOString()
        };
        
        await kv.set(`event:${family_id}:${eventId}`, event);
        newEvents.push(event);
      }
      return res.status(200).json(newEvents);
    }

    // 3. SUPPRIMER
    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'ID manquant' });
      // On cherche la clé dans toutes les familles pour être sûr
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
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}
