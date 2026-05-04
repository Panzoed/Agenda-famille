import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Cette ligne permet de lire les données envoyées par ton index.html
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { action, family_id, id } = body;

  try {
    // RECHERCHE SIMPLE DES ÉVÉNEMENTS
    if (action === 'list') {
      // On récupère toutes les clés qui commencent par "event:"
      const keys = await kv.keys('event:*');
      if (keys.length === 0) return res.status(200).json([]);
      
      const allEvents = await kv.mget(...keys);
      // On ne garde que ceux qui appartiennent à ta famille
      const filtered = allEvents.filter(e => e && e.family_id === family_id);
      
      return res.status(200).json(filtered);
    }

    // AJOUT SIMPLE
    if (action === 'add') {
      const eventId = body.id || Date.now().toString();
      // On enregistre avec la clé simple "event:ID"
      await kv.set(`event:${eventId}`, {
        ...body,
        id: eventId,
        created_at: new Date().toISOString()
      });
      return res.status(200).json({ success: true });
    }

    // SUPPRESSION SIMPLE
    if (action === 'delete') {
      await kv.del(`event:${id}`);
      return res.status(200).json({ success: true });
    }

    // MISE À JOUR SIMPLE
    if (action === 'update') {
      await kv.set(`event:${id}`, { ...body });
      return res.status(200).json({ success: true });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
