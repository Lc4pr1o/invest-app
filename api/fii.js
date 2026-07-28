// Vercel Serverless Function: proxy para dados de FII via Fundamentus + classificacao
// Papel/Tijolo via Investidor10 (pagina publica, sem sessao necessaria).
// Um FII nao tem LPA/VPA (nao e uma empresa com balanco no formato DFP/ITR); a
// metodologia de valuation depende do tipo:
// - Papel (recebiveis/CRIs): preco justo via P/VP, teto via Bazin a 10% a.a.
// - Tijolo (imoveis fisicos): preco justo via Gordon (dividendos descontados),
//   teto via Bazin a 10% a.a.

async function fetchFundType(ticker) {
    try {
        const res = await fetch(`https://investidor10.com.br/fiis/${encodeURIComponent(ticker.toLowerCase())}/`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestApp/1.0)' }
        });
        if (!res.ok) return null;
        const html = await res.text();
        if (html.includes('Fundo de Papel')) return 'papel';
        if (html.includes('Fundo de Tijolo')) return 'tijolo';
        return 'hibrido';
    } catch {
        return null;
    }
}

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
        const [upstream, fundType] = await Promise.all([
            fetch(`https://www.fundamentus.com.br/detalhes.php?papel=${encodeURIComponent(ticker)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestApp/1.0)' }
            }),
            fetchFundType(ticker)
        ]);

        if (!upstream.ok) {
            res.status(502).json({ error: 'Falha ao consultar o Fundamentus.' });
            return;
        }

        const buffer = await upstream.arrayBuffer();
        const html = Buffer.from(buffer).toString('latin1');

        const extract = (label) => {
            const idx = html.indexOf('>' + label + '<');
            if (idx === -1) return NaN;
            const m = html.slice(idx, idx + 200).match(/<span class="txt">\s*([\-\d.,]+)/);
            if (!m) return NaN;
            return parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
        };

        const price = extract('Cotação');
        const pvp = extract('P/VP');
        const dyPct = extract('Div. Yield');

        if (!Number.isFinite(price) || price <= 0) {
            res.status(404).json({ error: 'FII não encontrado ou dados indisponíveis.' });
            return;
        }

        res.status(200).json({
            ticker,
            price,
            pvp: Number.isFinite(pvp) && pvp > 0 ? pvp : null,
            dy: Number.isFinite(dyPct) ? dyPct / 100 : null,
            fundType
        });
    } catch (err) {
        res.status(502).json({ error: 'Falha ao consultar o Fundamentus.' });
    }
}
