const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BREVO_KEY = process.env.BREVO_KEY;
const EMAIL_ADMIN = 'siciliano_messinese@hotmail.it';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, email, password, name, family_name, user_id } = req.body || {};
  const emailClean = (email || '').toLowerCase().trim();

  // ─── CONNEXION ───────────────────────────────────────────────────────────
  if (action === 'login') {
    const { data: user } = await supabase
      .from('agenda_users')
      .select('*')
      .eq('email', emailClean)
      .single();

    if (!user) return res.status(404).json({ error: 'Email non trouvé' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Votre compte est en attente d\'approbation par Emmanuel' });
    if (user.status === 'rejected') return res.status(403).json({ error: 'Votre demande a été refusée' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      family_id: user.family_id,
      role: user.role
    });
  }

  // ─── INSCRIPTION ─────────────────────────────────────────────────────────
  if (action === 'register') {
    if (!name || !emailClean || !password || !family_name) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
    }

    // Vérifier si email déjà utilisé
    const { data: existing } = await supabase
      .from('agenda_users')
      .select('id')
      .eq('email', emailClean)
      .single();

    if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' });

    // Créer la famille
    const { data: family } = await supabase
      .from('agenda_families')
      .insert({ name: family_name })
      .select()
      .single();

    // Hasher le mot de passe
    const password_hash = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    await supabase.from('agenda_users').insert({
      name,
      email: emailClean,
      password_hash,
      family_id: family.id,
      role: 'admin',
      status: 'pending'
    });

    // Envoyer email à Emmanuel pour approbation
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Agenda Famille', email: EMAIL_ADMIN },
        to: [{ email: EMAIL_ADMIN, name: 'Emmanuel' }],
        subject: '🆕 Nouvelle inscription : ' + name,
        htmlContent: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2>
            <p>Bonjour Emmanuel,</p>
            <p>Une nouvelle demande d'inscription a été reçue :</p>
            <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:8px;margin:16px 0">
              <div><strong>Nom :</strong> ${name}</div>
              <div><strong>Email :</strong> ${emailClean}</div>
              <div><strong>Famille :</strong> ${family_name}</div>
            </div>
            <p>Connecte-toi à l'agenda pour approuver ou refuser cette demande.</p>
            <a href="https://agenda-famille.vercel.app" style="background:#F59E0B;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Gérer les demandes</a>
          </div>
        `
      })
    }).catch(() => {});

    return res.json({ ok: true, message: 'Demande envoyée, en attente d\'approbation' });
  }

  // ─── LISTE DES DEMANDES EN ATTENTE (admin) ───────────────────────────────
  if (action === 'pending_list') {
    const { data } = await supabase
      .from('agenda_users')
      .select('id, name, email, family_id, created_at, status')
      .eq('status', 'pending')
      .order('created_at');
    return res.json(data || []);
  }

  // ─── APPROUVER UN UTILISATEUR (admin) ────────────────────────────────────
  if (action === 'approve') {
    const { data: user } = await supabase
      .from('agenda_users')
      .update({ status: 'approved' })
      .eq('id', user_id)
      .select()
      .single();

    // Email de confirmation à l'utilisateur
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Agenda Famille', email: EMAIL_ADMIN },
        to: [{ email: user.email, name: user.name }],
        subject: '✅ Votre compte Agenda Famille est approuvé !',
        htmlContent: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2>
            <p>Bonjour ${user.name},</p>
            <p>Votre compte a été <strong style="color:#16A34A">approuvé</strong> ! 🎉</p>
            <p>Vous pouvez maintenant vous connecter à votre agenda famille.</p>
            <a href="https://agenda-famille.vercel.app" style="background:#F59E0B;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Accéder à mon agenda</a>
          </div>
        `
      })
    }).catch(() => {});

    return res.json({ ok: true });
  }

  // ─── REFUSER UN UTILISATEUR (admin) ──────────────────────────────────────
  if (action === 'reject') {
    const { data: user } = await supabase
      .from('agenda_users')
      .update({ status: 'rejected' })
      .eq('id', user_id)
      .select()
      .single();

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Agenda Famille', email: EMAIL_ADMIN },
        to: [{ email: user.email, name: user.name }],
        subject: '❌ Demande d\'inscription refusée',
        htmlContent: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2>
            <p>Bonjour ${user.name},</p>
            <p>Votre demande d'inscription n'a pas pu être acceptée.</p>
            <p>Pour plus d'informations, contactez Emmanuel.</p>
          </div>
        `
      })
    }).catch(() => {});

    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
