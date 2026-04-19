const bcrypt = require('bcryptjs');

const USERS = [
  {
    id: '1',
    name: 'Emmanuel',
    email: 'siciliano_messinese@hotmail.it',
    hash: '$2a$10$L6fazVzdi3o5Hqp1R6EE4eAdGwm2s.XMTK.WfWRatsOsof7O.0N9O'
  },
  {
    id: '2',
    name: 'Laetitia',
    email: 'laeti_0101@hotmail.com',
    hash: '$2a$10$R3aF31fAMK2GJYn1mYQPaO5NBywzuye7xukZYsrFg9RkqWotoAlQi'
  }
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, password } = req.body || {};
  const email = (req.body?.email || '').toLowerCase().trim();

  if (action === 'login') {
    const user = USERS.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'Email non trouvé' });
    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    return res.json({ id: user.id, name: user.name, email: user.email });
  }

  return res.status(400).json({ error: 'Action inconnue' });
};
