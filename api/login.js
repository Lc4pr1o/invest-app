import { setAuthCookie } from '../lib/auth.js';

export default async function handler(req, res) {
    // Endpoint autenticado por cookie -- sem CORS, so aceita chamadas same-origin.
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
        res.status(500).json({ error: 'APP_PASSWORD não configurada no servidor.' });
        return;
    }

    const { password } = req.body || {};
    if (password !== appPassword) {
        res.status(401).json({ error: 'Senha incorreta.' });
        return;
    }

    setAuthCookie(res, appPassword);
    res.status(200).json({ ok: true });
}
