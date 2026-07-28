import { getDb, ensureSchema } from '../lib/db.js';
import { isAuthenticated } from '../lib/auth.js';

export default async function handler(req, res) {
    // Endpoint autenticado por cookie -- sem CORS, so aceita chamadas same-origin.
    if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
    }

    try {
        await ensureSchema();
        const db = getDb();

        if (req.method === 'GET') {
            const result = await db.execute('SELECT ticker, data FROM portfolio');
            const portfolio = {};
            for (const row of result.rows) {
                try { portfolio[row.ticker] = JSON.parse(row.data); }
                catch { /* linha corrompida, ignora */ }
            }
            res.status(200).json({ portfolio });
            return;
        }

        if (req.method === 'PUT') {
            const portfolio = req.body?.portfolio;
            if (!portfolio || typeof portfolio !== 'object' || Array.isArray(portfolio)) {
                res.status(400).json({ error: 'Corpo inválido: esperado { portfolio: {...} }.' });
                return;
            }

            const tickers = Object.keys(portfolio);
            const statements = [
                { sql: 'DELETE FROM portfolio', args: [] },
                ...tickers.map(ticker => ({
                    sql: "INSERT INTO portfolio (ticker, data, updated_at) VALUES (?, ?, datetime('now'))",
                    args: [ticker, JSON.stringify(portfolio[ticker])]
                }))
            ];
            await db.batch(statements, 'write');

            res.status(200).json({ ok: true, count: tickers.length });
            return;
        }

        res.status(405).json({ error: 'Método não permitido.' });
    } catch (err) {
        res.status(502).json({ error: 'Falha ao acessar o banco de dados.' });
    }
}
