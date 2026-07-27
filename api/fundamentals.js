// Vercel Serverless Function: proxy para a API da Bolsai (https://usebolsai.com).
// Mantém a chave (API_BOLSAI) apenas no servidor e libera CORS para o front-end estático.

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.trim().toUpperCase() : '';
    if (!/^[A-Z0-9.\-]{4,12}$/.test(ticker)) {
        res.status(400).json({ error: 'Parâmetro "ticker" inválido ou ausente.' });
        return;
    }

    const apiKey = process.env.API_BOLSAI;
    if (!apiKey) {
        res.status(500).json({ error: 'API_BOLSAI não configurada no servidor.' });
        return;
    }

    try {
        const upstream = await fetch(`https://api.usebolsai.com/api/v1/fundamentals/${encodeURIComponent(ticker)}`, {
            headers: { 'X-API-Key': apiKey }
        });

        const data = await upstream.json();
        res.status(upstream.status).json(data);
    } catch (err) {
        res.status(502).json({ error: 'Falha ao consultar a API da Bolsai.' });
    }
}
