import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { action, family_id, id, title, description, date_str, time_str, type, repeat_count, created_by, created_by_name } = JSON.parse(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  try {
    // 1. LISTER LES ÉVÉNEMENTS (C'est ici que tes événements réapparaissent)
    if (action === 'list') {
      const keys = await kv.keys(`event:${family_id}:*`);
      if (keys.length === 0) return res.status(200).json([]);
      const evs = await kv.mget(...keys);
      return res.status(200).json(evs.filter(e => e != null).sort((a, b) => a.date_str.localeCompare(b.date_str)));
    }

    // 2. AJOUTER UN ÉVÉNEMENT (Avec la répétition de 1 à 12 mois)
    if (action === 'add') {
      const count = parseInt(repeat_count) || 1;
      const results = [];
      const baseId = Date.now();

      for (let i = 0; i < count; i++) {
        const evId = `${baseId}_${i}`;
        let d = new Date(date_str + 'T12:00:00');
        d.setMonth(d.getMonth() + i);
        const newDateStr = d.toISOString().split('T')[0];

        const newEv = {
          id: evId,
          family_id,
          title,
          description: description || '',
          date_str: newDateStr,
          time_str: time_str || null,
          type: type || 'task',
          created_by,
          created_by_name,
          created_at: new Date().toISOString()
        };
        await kv.set(`event:${family_id}:${evId}`, newEv);
        results.push(newEv);
      }
      return res.status(200).json(results);
    }

    // 3. MODIFIER
    if (action === 'update') {
      const existing = await kv.get(`event:${family_id}:${id}`);
      const updated = { ...existing, title, description, date_str, time_str, type };
      await kv.set(`event:${family_id}:${id}`, updated);
      return res.status(200).json(updated);
    }

    // 4. SUPPRIMER
    if (action === 'delete') {
      await kv.del(`event:${family_id}:${id}`);
      return res.status(200).json({ success: true });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
