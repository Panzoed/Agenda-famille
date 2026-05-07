const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BREVO_KEY = process.env.BREVO_KEY;
const EMAIL_ADMIN = 'siciliano_messinese@hotmail.it';
const APP_URL = 'https://agenda-famille.vercel.app';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, email, password, name, family_name, partner_email, user_id, invite_email, invite_name, new_password, current_password } = req.body || {};
  const emailClean = (email || '').toLowerCase().trim();

  // ─── CONNEXION ───────────────────────────────────────────────────────────
  if (action === 'login') {
    const { data: user } = await supabase.from('agenda_users').select('*').eq('email', emailClean).single();
    if (!user) return res.status(404).json({ error: 'Email non trouvé' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Votre compte est en attente d\'approbation' });
    if (user.status === 'rejected') return res.status(403).json({ error: 'Votre demande a été refusée' });
    if (user.status === 'invited') return res.status(403).json({ error: 'Vous avez été invité ! Définissez votre mot de passe via le lien reçu par email.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    return res.json({ id: user.id, name: user.name, email: user.email, family_id: user.family_id, role: user.role });
  }

  // ─── INSCRIPTION ─────────────────────────────────────────────────────────
  if (action === 'register') {
    if (!name || !emailClean || !password || !family_name) return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
    const { data: existing } = await supabase.from('agenda_users').select('id').eq('email', emailClean).single();
    if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    const { data: family } = await supabase.from('agenda_families').insert({ name: family_name }).select().single();
    const password_hash = await bcrypt.hash(password, 10);
    await supabase.from('agenda_users').insert({ name, email: emailClean, password_hash, family_id: family.id, role: 'admin', status: 'pending' });
    if (partner_email) {
      const partnerEmailClean = partner_email.toLowerCase().trim();
      const { data: existingPartner } = await supabase.from('agenda_users').select('id').eq('email', partnerEmailClean).single();
      if (!existingPartner) {
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await supabase.from('agenda_users').insert({ name: 'Partenaire', email: partnerEmailClean, password_hash: await bcrypt.hash(token, 10), family_id: family.id, role: 'member', status: 'invited', invite_token: token });
        await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: 'Agenda Famille', email: EMAIL_ADMIN }, to: [{ email: partnerEmailClean }], subject: '👨‍👩‍👧 ' + name + ' vous invite sur Agenda Famille !', htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2><p><strong>${name}</strong> vous a invité(e) à partager son agenda famille !</p><a href="${APP_URL}?token=${token}&email=${partnerEmailClean}" style="display:inline-block;margin-top:16px;background:#F59E0B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Rejoindre l'agenda 🚀</a></div>` }) }).catch(() => {});
      }
    }
    await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: 'Agenda Famille', email: EMAIL_ADMIN }, to: [{ email: EMAIL_ADMIN }], subject: '🆕 Nouvelle inscription : ' + name, htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2><div style="background:#FEF3C7;padding:12px;border-radius:8px"><div><strong>Nom :</strong> ${name}</div><div><strong>Email :</strong> ${emailClean}</div><div><strong>Famille :</strong> ${family_name}</div>${partner_email ? '<div><strong>Partenaire :</strong> ' + partner_email + '</div>' : ''}</div></div>` }) }).catch(() => {});
    return res.json({ ok: true });
  }

  // ─── DÉFINIR MOT DE PASSE (invitation) ────────────────────────────────────
  if (action === 'set_password') {
    const { token } = req.body;
    const emailInvite = (req.body.email || '').toLowerCase().trim();
    const { data: user } = await supabase.from('agenda_users').select('*').eq('email', emailInvite).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const password_hash = await bcrypt.hash(password, 10);
    const { data: updated } = await supabase.from('agenda_users').update({ password_hash, status: 'approved', name: name || user.name, invite_token: null }).eq('email', emailInvite).select().single();
    return res.json({ id: updated.id, name: updated.name, email: updated.email, family_id: updated.family_id, role: updated.role });
  }

  // ─── MOT DE PASSE OUBLIÉ ─────────────────────────────────────────────────
  if (action === 'forgot_password') {
    const { data: user } = await supabase.from('agenda_users').select('*').eq('email', emailClean).single();
    if (!user) return res.status(404).json({ error: 'Aucun compte trouvé avec cet email' });
    if (user.status === 'pending' || user.status === 'rejected') return res.status(400).json({ error: 'Ce compte n\'est pas encore activé' });
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    await supabase.from('agenda_users').update({ invite_token: token }).eq('email', emailClean);
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Agenda Famille', email: EMAIL_ADMIN },
        to: [{ email: emailClean, name: user.name }],
        subject: '🔑 Réinitialisation de votre mot de passe',
        htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2>
          <p>Bonjour ${user.name},</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
          <a href="${APP_URL}?reset=1&token=${token}&email=${emailClean}" 
             style="display:inline-block;margin-top:16px;background:#F59E0B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Réinitialiser mon mot de passe 🔑
          </a>
          <p style="color:#9CA3AF;font-size:12px;margin-top:16px;">Ce lien est valable 24h. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        </div>`
      })
    }).catch(() => {});
    return res.json({ ok: true });
  }

  // ─── RÉINITIALISER MOT DE PASSE (depuis lien email) ──────────────────────
  if (action === 'reset_password') {
    const { token } = req.body;
    const emailReset = (req.body.email || '').toLowerCase().trim();
    const { data: user } = await supabase.from('agenda_users').select('*').eq('email', emailReset).eq('invite_token', token).single();
    if (!user) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    const password_hash = await bcrypt.hash(new_password, 10);
    await supabase.from('agenda_users').update({ password_hash, invite_token: null, status: 'approved' }).eq('email', emailReset);
    return res.json({ ok: true });
  }

  // ─── CHANGER MOT DE PASSE ────────────────────────────────────────────────
  if (action === 'change_password') {
    const { data: user } = await supabase.from('agenda_users').select('*').eq('email', emailClean).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Minimum 6 caractères' });
    const password_hash = await bcrypt.hash(new_password, 10);
    await supabase.from('agenda_users').update({ password_hash }).eq('email', emailClean);
    return res.json({ ok: true });
  }

  // ─── RESET MOT DE PASSE PAR ADMIN ────────────────────────────────────────
  if (action === 'admin_reset_password') {
    // Vérifier que c'est bien l'admin qui fait la requête
    const { admin_email } = req.body;
    if ((admin_email || '').toLowerCase().trim() !== EMAIL_ADMIN) return res.status(403).json({ error: 'Non autorisé' });
    const { data: user } = await supabase.from('agenda_users').select('*').eq('id', user_id).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    await supabase.from('agenda_users').update({ invite_token: token }).eq('id', user_id);
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Agenda Famille', email: EMAIL_ADMIN },
        to: [{ email: user.email, name: user.name }],
        subject: '🔑 Réinitialisation de votre mot de passe - Agenda Famille',
        htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2>
          <p>Bonjour ${user.name},</p>
          <p>L'administrateur a réinitialisé votre mot de passe. Cliquez ci-dessous pour en définir un nouveau :</p>
          <a href="${APP_URL}?reset=1&token=${token}&email=${user.email}" 
             style="display:inline-block;margin-top:16px;background:#F59E0B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Définir mon nouveau mot de passe 🔑
          </a>
        </div>`
      })
    }).catch(() => {});
    return res.json({ ok: true });
  }

  // ─── INVITER UN PARTENAIRE ────────────────────────────────────────────────
  if (action === 'invite') {
    const { family_id } = req.body;
    const inviteEmailClean = (invite_email || '').toLowerCase().trim();
    const { data: existing } = await supabase.from('agenda_users').select('id').eq('email', inviteEmailClean).single();
    if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    await supabase.from('agenda_users').insert({ name: invite_name || 'Partenaire', email: inviteEmailClean, password_hash: await bcrypt.hash(token, 10), family_id, role: 'member', status: 'invited', invite_token: token });
    await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: 'Agenda Famille', email: EMAIL_ADMIN }, to: [{ email: inviteEmailClean, name: invite_name || 'Partenaire' }], subject: '👨‍👩‍👧 Vous êtes invité(e) sur Agenda Famille !', htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2><p>Bonjour ${invite_name || ''},</p><p>Vous avez été invité(e) à rejoindre un agenda famille partagé !</p><a href="${APP_URL}?token=${token}&email=${inviteEmailClean}" style="display:inline-block;margin-top:16px;background:#F59E0B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Rejoindre l'agenda 🚀</a></div>` }) }).catch(() => {});
    return res.json({ ok: true });
  }

  // ─── LISTE EN ATTENTE ────────────────────────────────────────────────────
  if (action === 'pending_list') {
    const { data } = await supabase.from('agenda_users').select('id, name, email, family_id, created_at, status').eq('status', 'pending').order('created_at');
    return res.json(data || []);
  }

  // ─── LISTE TOUS LES UTILISATEURS (admin) ─────────────────────────────────
  if (action === 'all_users') {
    const { admin_email } = req.body;
    if ((admin_email || '').toLowerCase().trim() !== EMAIL_ADMIN) return res.status(403).json({ error: 'Non autorisé' });
    const { data } = await supabase.from('agenda_users').select('id, name, email, status, role, created_at').neq('status', 'pending').order('created_at');
    return res.json(data || []);
  }

  // ─── APPROUVER ────────────────────────────────────────────────────────────
  if (action === 'approve') {
    const { data: user } = await supabase.from('agenda_users').update({ status: 'approved' }).eq('id', user_id).select().single();
    await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: 'Agenda Famille', email: EMAIL_ADMIN }, to: [{ email: user.email, name: user.name }], subject: '✅ Votre compte Agenda Famille est approuvé !', htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2><p>Bonjour ${user.name},</p><p>Votre compte a été <strong style="color:#16A34A">approuvé</strong> ! 🎉</p><a href="${APP_URL}" style="background:#F59E0B;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Accéder à mon agenda</a></div>` }) }).catch(() => {});
    return res.json({ ok: true });
  }

  // ─── REFUSER ──────────────────────────────────────────────────────────────
  if (action === 'reject') {
    const { data: user } = await supabase.from('agenda_users').update({ status: 'rejected' }).eq('id', user_id).select().single();
    await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: 'Agenda Famille', email: EMAIL_ADMIN }, to: [{ email: user.email, name: user.name }], subject: '❌ Demande d\'inscription refusée', htmlContent: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2 style="color:#F59E0B">👨‍👩‍👧 Agenda Famille</h2><p>Bonjour ${user.name},</p><p>Votre demande d'inscription n'a pas pu être acceptée.</p></div>` }) }).catch(() => {});
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
