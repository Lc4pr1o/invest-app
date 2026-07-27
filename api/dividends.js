// Vercel Serverless Function: proxy para Dividend Yield via Fundamentus.
// Nem a brapi.dev nem a Bolsai liberam DY no plano gratuito. O Fundamentus
// publica o indicador "Div. Yield" em uma pagina HTML publica, sem login
// e sem chave de API.

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

    try {
        const upstream = await fetch(`https://www.fundamentus.com.br/detalhes.php?papel=${encodeURIComponent(ticker)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestApp/1.0)' }
        });

        if (!upstream.ok) {
            res.status(502).json({ error: 'Falha ao consultar o Fundamentus.' });
            return;
        }

        const buffer = await upstream.arrayBuffer();
        const html = Buffer.from(buffer).toString('latin1');

        const match = html.match(/Div\.\s*Yield<\/span><\/td>\s*<td class="data"><span class="txt">\s*([\d.,]+)\s*%/);
        if (!match) {
            res.status(404).json({ error: 'Dividend yield não encontrado para este ticker.' });
            return;
        }

        const dy = parseFloat(match[1].replace(',', '.')) / 100;
        res.status(200).json({ ticker, dy });
    } catch (err) {
        res.status(502).json({ error: 'Falha ao consultar o Fundamentus.' });
    }
}
