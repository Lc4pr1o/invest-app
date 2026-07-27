// Vercel Serverless Function: proxy para busca de empresas (Bolsai /companies?search=).
// Usado quando o usuário digita um nome em vez de um ticker.

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

    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query || query.length > 60) {
        res.status(400).json({ error: 'Parâmetro "q" inválido ou ausente.' });
        return;
    }

    const apiKey = process.env.API_BOLSAI;
    if (!apiKey) {
        res.status(500).json({ error: 'API_BOLSAI não configurada no servidor.' });
        return;
    }

    try {
        const upstream = await fetch(`https://api.usebolsai.com/api/v1/companies/?search=${encodeURIComponent(query)}&limit=5`, {
            headers: { 'X-API-Key': apiKey }
        });

        const data = await upstream.json();
        res.status(upstream.status).json(data);
    } catch (err) {
        res.status(502).json({ error: 'Falha ao consultar a API da Bolsai.' });
    }
}
