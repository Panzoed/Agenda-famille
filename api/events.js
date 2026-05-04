const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BREVO_KEY = process.env.BREVO_KEY;
const EMAIL_ADMIN = 'siciliano_messinese@hotmail.it';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { 
    action, id, title, description, date_str, time_str, 
    type, created_by, created_by_name, family_id, 
    repeat_count // Nouveau paramètre : nombre de mois à répéter
  } = req.body || {};

  // ─── LISTE (filtrée par famille) ─────────────────────────────────────────
  if (action === 'list') {
    let query = supabase.from('agenda_events').select('*').order('date_str').order('time_str');
    if (family_id) query = query.eq('family_id', family_id);
    const { data } = await query;
    return res.json(data || []);
  }

  // ─── AJOUTER (avec option de répétition) ──────────────────────────────────
  if (action === 'add') {
    const iterations = parseInt(repeat_count) || 1;
    const eventsToInsert = [];

    // On prépare les événements pour les X mois demandés
    for (let i = 0; i < iterations; i++) {
      let d = new Date(date_str + 'T12:00:00');
      d.setMonth(d.getMonth() + i);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const newDateStr = `${yyyy}-${mm}-${dd}`;

      eventsToInsert.push({
        title,
        description,
        date_str: newDateStr,
        time_str,
        type: type || 'task',
        created_by,
        family_id: family_id || null
      });
    }

    const { data, error } = await supabase
      .from('agenda_events')
      .insert(eventsToInsert)
      .select();

    if (error) return res.status(500).json({ error: 'Erreur ajout' });

    // Notifier les autres membres de la famille (on n'envoie qu'un mail récapitulatif)
    if (family_id) {
      const { data: members } = await supabase
        .from('agenda_users')
        .select('email, name')
        .eq('family_id', family_id)
        .eq('status', 'approved')
        .neq('email', created_by);

      if (members && members.length > 0) {
        const dateFormatted = new Date(date_str + 'T12:00:00').toLocaleDateString('fr-BE', {
          weekday: 'long', day: 'numeric', month: 'long'
        });

        const repeatText = iterations > 1 ? ` (Répété sur ${iterations} mois)` : '';

        for (const member of members) {
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'Agenda Famille', email: EMAIL_ADMIN },
              to: [{ email: member.email, name: member.name }],
              subject: '📅 Nouvel événement : ' + title,
              htmlContent: `
                <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
                  <h2 style="color:#F59E0B">📅 Agenda Famille</h2>
                  <p>Bonjour ${member.name},</p>
                  <p><strong>${created_by_name}</strong> a ajouté un événement${repeatText} :</p>
                  <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:8px;margin:16px 0">
                    <div style="font-size:18px;font-weight:bold;color:#92400E">${title}</div>
                    <div style="color:#B45309;margin-top:4px">📆 À partir du ${dateFormatted}${time_str ? ' à ' + time_str : ''}</div>
                    ${description ? `<div style="color:#78350F;margin-top:4px">📝 ${description}</div>` : ''}
                  </div>
                  <p style="color:#9CA3AF;font-size:11px">Créé par Emmanuel Acabo</p>
                </div>
              `
            })
          }).catch(() => {});
        }
      }
    }

    return res.json(data[0]);
  }

  // ─── MODIFIER ─────────────────────────────────────────────────────────────
  if (action === 'update') {
    const { data } = await supabase
      .from('agenda_events')
      .update({ title, description, date_str, time_str, type })
      .eq('id', id)
      .select()
      .single();
    return res.json(data);
  }

  // ─── SUPPRIMER ────────────────────────────────────────────────────────────
  if (action === 'delete') {
    await supabase.from('agenda_events').delete().eq('id', id);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
