// Vercel Serverless Function: proxy para a taxa CDI anualizada via API do Banco
// Central (SGS, serie 4392) -- publica, sem chave, sem limite de requisicoes.
// Usada no criterio de Yield vs. CDI+spread para FIIs de papel.

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    try {
        const upstream = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.4392/dados/ultimos/1?formato=json');
        if (!upstream.ok) {
            res.status(502).json({ error: 'Falha ao consultar o Banco Central.' });
            return;
        }

        const data = await upstream.json();
        const last = Array.isArray(data) ? data[data.length - 1] : null;
        const cdi = last ? parseFloat(String(last.valor).replace(',', '.')) : NaN;

        if (!Number.isFinite(cdi)) {
            res.status(502).json({ error: 'Resposta inesperada do Banco Central.' });
            return;
        }

        res.status(200).json({ cdi: cdi / 100, referenceDate: last.data });
    } catch (err) {
        res.status(502).json({ error: 'Falha ao consultar o Banco Central.' });
    }
}
