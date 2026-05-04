import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Cette ligne est la clé : elle accepte les deux formats (texte ou objet)
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { action, family_id, id, title, description, date_str, time_str, type, repeat_count, created_by, created_by_name } = body;

  try {
    // RETROUVER TES ÉVÉNEMENTS
    if (action === 'list') {
      const keys = await kv.keys(`event:${family_id}:*`);
      if (keys.length === 0) return res.status(200).json([]);
      const evs = await kv.mget(...keys);
      return res.status(200).json(evs.filter(e => e != null));
    }

    // AJOUTER (Avec ta demande de répétition mensuelle)
    if (action === 'add') {
      const count = parseInt(repeat_count) || 1;
      const baseId = Date.now();
      for (let i = 0; i < count; i++) {
        const evId = `${baseId}_${i}`;
        let d = new Date(date_str + 'T12:00:00');
        d.setMonth(d.getMonth() + i);
        const newDate = d.toISOString().split('T')[0];

        const newEv = {
          id: evId, family_id, title, description,
          date_str: newDate, time_str, type,
          created_by, created_by_name,
          created_at: new Date().toISOString()
        };
        await kv.set(`event:${family_id}:${evId}`, newEv);
      }
      return res.status(200).json({ success: true });
    }

    // SUPPRIMER
    if (action === 'delete') {
      await kv.del(`event:${family_id}:${id}`);
      return res.status(200).json({ success: true });
    }

    // MODIFIER
    if (action === 'update') {
      const key = `event:${family_id}:${id}`;
      const existing = await kv.get(key);
      const updated = { ...existing, title, description, date_str, time_str, type };
      await kv.set(key, updated);
      return res.status(200).json(updated);
    }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
