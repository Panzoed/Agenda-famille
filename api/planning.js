const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, family_id, mode, ref_week, ref_year, ref_shift, custom_days } = req.body || {};

  // ─── CHARGER ─────────────────────────────────────────────────────────────
  if (action === 'get') {
    const { data } = await supabase.from('agenda_planning').select('*').eq('family_id', family_id).single();
    return res.json(data || null);
  }

  // ─── SAUVEGARDER ─────────────────────────────────────────────────────────
  if (action === 'save') {
    const { data: existing } = await supabase.from('agenda_planning').select('id').eq('family_id', family_id).single();
    if (existing) {
      const { data } = await supabase.from('agenda_planning').update({ mode, ref_week, ref_year, ref_shift, custom_days }).eq('family_id', family_id).select().single();
      return res.json(data);
    } else {
      const { data } = await supabase.from('agenda_planning').insert({ family_id, mode, ref_week, ref_year, ref_shift, custom_days }).select().single();
      return res.json(data);
    }
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
