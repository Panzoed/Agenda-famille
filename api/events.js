const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BREVO_KEY = process.env.BREVO_KEY;
const EMAIL_ADMIN = 'siciliano_messinese@hotmail.it';

function toDS(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function buildDates(date_str, repeat_mode) {
  const base = new Date(date_str + 'T12:00:00');
  const endOfYear = new Date(base.getFullYear(), 11, 31);
  const dates = [];
  if (!repeat_mode || repeat_mode === 'none') return [date_str];
  if (repeat_mode === 'weekly') { let cur = new Date(base); while (cur <= endOfYear) { dates.push(toDS(cur)); cur.setDate(cur.getDate() + 7); } return dates; }
  if (repeat_mode === 'biweekly') { let cur = new Date(base); while (cur <= endOfYear) { dates.push(toDS(cur)); cur.setDate(cur.getDate() + 14); } return dates; }
  if (repeat_mode === 'monthly') { let cur = new Date(base); while (cur <= endOfYear) { dates.push(toDS(cur)); cur.setMonth(cur.getMonth() + 1); } return dates; }
  return [date_str];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, id, title, description, date_str, time_str, type, created_by, created_by_name, family_id, repeat_mode, pinned, color } = req.body || {};

  if (action === 'list') {
    let query = supabase.from('agenda_events').select('*').order('pinned', { ascending: false }).order('date_str').order('time_str');
    if (family_id) query = query.eq('family_id', family_id);
    const { data } = await query;
    return res.json(data || []);
  }

  if (action === 'add') {
    const dates = buildDates(date_str, repeat_mode);
    const eventsToInsert = dates.map(d => ({ title, description, date_str: d, time_str, type: type || 'task', created_by, created_by_name: created_by_name || '', family_id: family_id || null, repeat_mode: repeat_mode || 'none', pinned: pinned || false, color: color || '#EC4899', done: false }));
    const { data, error } = await supabase.from('agenda_events').insert(eventsToInsert).select();
    if (error) return res.status(500).json({ error: 'Erreur ajout' });
    if (family_id) {
      const { data: members } = await supabase.from('agenda_users').select('email, name').eq('family_id', family_id).eq('status', 'approved').neq('email', created_by);
      if (members && members.length > 0) {
        const dateFormatted = new Date(date_str + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
        const repeatLabels = { weekly: ' (chaque semaine)', biweekly: ' (tous les 15 jours)', monthly: ' (chaque mois)', none: '' };
        for (const member of members) {
          await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: 'Agenda Famille', email: EMAIL_ADMIN }, to: [{ email: member.email, name: member.name }], subject: '📅 Nouvel événement : ' + title, htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#F59E0B">📅 Agenda Famille</h2><p>Bonjour ${member.name},</p><p><strong>${created_by_name}</strong> a ajouté un événement${repeatLabels[repeat_mode] || ''} :</p><div style="background:#FEF3C7;border-left:4px solid ${color || '#EC4899'};padding:12px;border-radius:8px;margin:16px 0"><div style="font-size:18px;font-weight:bold;">${title}</div><div>📆 ${dateFormatted}${time_str ? ' à ' + time_str : ''}</div>${description ? '<div>📝 ' + description + '</div>' : ''}</div></div>` }) }).catch(() => {});
        }
      }
    }
    return res.json(data[0]);
  }

  if (action === 'update') {
    const { data } = await supabase.from('agenda_events').update({ title, description, date_str, time_str, type, pinned: pinned || false, color: color || '#EC4899' }).eq('id', id).select().single();
    return res.json(data);
  }

  if (action === 'toggle_pin') {
    const { data: ev } = await supabase.from('agenda_events').select('pinned').eq('id', id).single();
    const { data } = await supabase.from('agenda_events').update({ pinned: !ev.pinned }).eq('id', id).select().single();
    return res.json(data);
  }

  if (action === 'toggle_done') {
    const { data: ev } = await supabase.from('agenda_events').select('done').eq('id', id).single();
    const { data } = await supabase.from('agenda_events').update({ done: !ev.done }).eq('id', id).select().single();
    return res.json(data);
  }

  if (action === 'delete') {
    await supabase.from('agenda_events').delete().eq('id', id);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
