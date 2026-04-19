const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BREVO_KEY = process.env.BREVO_KEY;
const EMAIL_EMMANUEL = 'siciliano_messinese@hotmail.it';
const EMAIL_LAETITIA = 'laeti_0101@hotmail.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, id, title, description, date_str, time_str, type, created_by, created_by_name } = req.body || {};

  if (action === 'list') {
    const { data } = await supabase.from('agenda_events').select('*').order('date_str').order('time_str');
    return res.json(data || []);
  }

  if (action === 'add') {
    const { data, error } = await supabase.from('agenda_events').insert({
      title, description, date_str, time_str, type: type || 'task', created_by
    }).select().single();
    if (error) return res.status(500).json({ error: 'Erreur ajout' });

    const otherEmail = created_by === EMAIL_EMMANUEL ? EMAIL_LAETITIA : EMAIL_EMMANUEL;
    const otherName = created_by === EMAIL_EMMANUEL ? 'Laetitia' : 'Emmanuel';
    const dateFormatted = new Date(date_str + 'T12:00:00').toLocaleDateString('fr-BE', { weekday:'long', day:'numeric', month:'long' });

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Agenda Famille', email: EMAIL_EMMANUEL },
        to: [{ email: otherEmail, name: otherName }],
        subject: '📅 Nouvel événement : ' + title,
        htmlContent: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#F59E0B">📅 Agenda Famille</h2><p>Bonjour ' + otherName + ',</p><p><strong>' + created_by_name + '</strong> a ajouté un événement :</p><div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:8px;margin:16px 0"><div style="font-size:18px;font-weight:bold;color:#92400E">' + title + '</div><div style="color:#B45309;margin-top:4px">📆 ' + dateFormatted + (time_str ? ' à ' + time_str : '') + '</div>' + (description ? '<div style="color:#78350F;margin-top:4px">📝 ' + description + '</div>' : '') + '</div><p style="color:#9CA3AF;font-size:11px">Créé par Emmanuel Acabo</p></div>'
      })
    }).catch(() => {});

    return res.json(data);
  }

  if (action === 'delete') {
    await supabase.from('agenda_events').delete().eq('id', id);
    return res.json({ ok: true });
  }

  if (action === 'update') {
    const { data } = await supabase.from('agenda_events').update({ title, description, date_str, time_str, type }).eq('id', id).select().single();
    return res.json(data);
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
