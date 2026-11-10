const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, user_id, base, days, va } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id manquant' });

  // ─── CHARGER ─────────────────────────────────────────────────────────────
  if (action === 'get') {
    const { data, error } = await supabase
      .from('agenda_overtime')
      .select('base, days, va')
      .eq('user_id', String(user_id))
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.json({ exists: false });
    return res.json({ exists: true, base: data.base || 0, days: data.days || {}, va: data.va || {} });
  }

  // ─── SAUVEGARDER ─────────────────────────────────────────────────────────
  if (action === 'save') {
    const row = { user_id: String(user_id), base: Math.round(base || 0), days: days || {}, updated_at: new Date().toISOString() };
    if (va !== undefined) row.va = va || {};
    const { error } = await supabase
      .from('agenda_overtime')
      .upsert(row, { onConflict: 'user_id' });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
