// Importa a carteira publica do Investidor10 e gera um "codigo de carteira"
// compativel com o botao IMPORTAR do invest-app (cole o codigo no painel
// "Codigo da Carteira" -> IMPORTAR CODIGO).
//
// Uso:
//   npm install --no-save playwright   (uma vez)
//   npx playwright install chromium    (uma vez)
//   node scripts/import-investidor10.mjs
//
// Le LINK_CARTEIRA_IV10 do .env (link publico "Compartilhar carteira" do Investidor10).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Em redes corporativas com inspecao SSL (ex: firewall Fortinet), o Node
// nao confia no certificado raiz que o Windows ja confia. Se existir um
// certificado salvo localmente e a variavel ainda nao foi setada, relanca
// o processo com NODE_EXTRA_CA_CERTS apontando pra ele.
const corporateCaPath = path.join(ROOT, '.certs', 'corporate-ca.pem');
if (!process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(corporateCaPath)) {
    const result = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
        stdio: 'inherit',
        env: { ...process.env, NODE_EXTRA_CA_CERTS: corporateCaPath }
    });
    process.exit(result.status ?? 1);
}

const FUNDAMENTALS_BASE = 'https://invest-app-fawn.vercel.app';
const BRAPI_TOKEN = 'oFmq3TNueUU1ivaS2KbScJ';
const DEFAULT_GROWTH = 10;

function loadEnv() {
    const envPath = path.join(ROOT, '.env');
    const env = {};
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
            if (m) env[m[1]] = m[2].trim();
        }
    }
    return env;
}

async function fetchActivesFromInvestidor10(walletUrl) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const found = [];
    page.on('response', async (res) => {
        if (res.url().includes('/summary/actives/')) {
            try {
                const json = await res.json();
                if (Array.isArray(json.data)) found.push(...json.data);
            } catch { /* resposta nao-JSON ou ja consumida */ }
        }
    });

    await page.goto(walletUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    await browser.close();

    return found;
}

function firstFinite(...values) {
    for (const v of values) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return NaN;
}

function extractValuationInputs(stock) {
    const price = firstFinite(stock.regularMarketPrice, stock.close, stock.price);

    let lpa = firstFinite(
        stock.earningsPerShare, stock.eps, stock.trailingEps,
        stock.defaultKeyStatistics?.earningsPerShare, stock.defaultKeyStatistics?.trailingEps
    );
    const pe = firstFinite(stock.priceEarnings, stock.trailingPE, stock.defaultKeyStatistics?.trailingPE);
    if ((!Number.isFinite(lpa) || lpa <= 0) && price > 0 && pe > 0) lpa = price / pe;

    const pb = firstFinite(stock.priceToBook, stock.defaultKeyStatistics?.priceToBook, stock.priceToNav);
    let vpa = firstFinite(stock.bookValue, stock.defaultKeyStatistics?.bookValue, stock.navPerShare);
    if ((!Number.isFinite(vpa) || vpa <= 0) && price > 0 && pb > 0) vpa = price / pb;

    let dy = firstFinite(
        stock.dividendYield, stock.defaultKeyStatistics?.yield,
        stock.defaultKeyStatistics?.dividendYield, stock.dividendYield12m
    );
    if (!Number.isFinite(dy) || dy <= 0) {
        const annualDividend = firstFinite(stock.trailingAnnualDividendRate, stock.dividendRate);
        if (annualDividend > 0 && price > 0) dy = annualDividend / price;
    }
    if (Number.isFinite(dy) && dy > 1) dy = dy / 100;

    return { price, lpa, vpa, pe, dy };
}

async function fetchQuoteWithFallback(ticker) {
    const urls = [
        `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?dividends=true&token=${BRAPI_TOKEN}`,
        `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${BRAPI_TOKEN}`,
        `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?fundamental=true&dividends=true&token=${BRAPI_TOKEN}`,
        `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?fundamental=true&token=${BRAPI_TOKEN}`
    ];

    for (const url of urls) {
        const res = await fetch(url).catch(() => null);
        if (res && res.ok) return res.json();
        if (res && (res.status === 400 || res.status === 403 || res.status === 404)) continue;
        return null;
    }
    return null;
}

async function fetchValuation(ticker) {
    const fundamentalsUrl = `${FUNDAMENTALS_BASE}/api/fundamentals?ticker=${encodeURIComponent(ticker)}`;

    const [data, fundRes] = await Promise.all([
        fetchQuoteWithFallback(ticker),
        fetch(fundamentalsUrl).catch(() => null)
    ]);

    if (!data) return null;
    const stock = data.results?.[0];
    if (!stock) return null;

    let { price, lpa, vpa, pe, dy } = extractValuationInputs(stock);

    if (fundRes && fundRes.ok) {
        const fundamentals = await fundRes.json().catch(() => null);
        if (fundamentals && !fundamentals.error) {
            if (Number.isFinite(fundamentals.lpa)) lpa = fundamentals.lpa;
            if (Number.isFinite(fundamentals.vpa) && fundamentals.vpa > 0) vpa = fundamentals.vpa;
            if (Number.isFinite(fundamentals.pl) && fundamentals.pl > 0) pe = fundamentals.pl;
        }
    }

    if (!Number.isFinite(price) || price <= 0) return null;
    const pl = Number.isFinite(pe) && pe > 0 ? pe : (lpa > 0 ? price / lpa : 0);

    const roe = (Number.isFinite(lpa) && Number.isFinite(vpa) && vpa !== 0) ? lpa / vpa : NaN;
    const growth = Number.isFinite(roe) ? Math.min(Math.max(roe * 100 * 0.5, 2), 25) : DEFAULT_GROWTH;

    const graham = (lpa > 0 && vpa > 0) ? Math.sqrt(22.5 * lpa * vpa) : null;
    const dyOk = Number.isFinite(dy) && dy > 0;
    const bazin = dyOk ? (price * dy) / 0.06 : null;
    const lynch = pl > 0 ? (growth + (dyOk ? dy * 100 : 0)) / pl : null;

    return {
        vpa: vpa > 0 ? vpa : null,
        dy: dyOk ? dy : null,
        growth,
        lpa: Number.isFinite(lpa) ? lpa : null,
        pl: Number.isFinite(pl) && pl > 0 ? pl : null,
        graham,
        bazin,
        lynch,
        roe: Number.isFinite(roe) ? roe : null
    };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    const env = loadEnv();
    const walletUrl = env.LINK_CARTEIRA_IV10;
    if (!walletUrl) {
        console.error('LINK_CARTEIRA_IV10 nao encontrado no .env');
        process.exit(1);
    }

    console.log('Buscando ativos no Investidor10...');
    const actives = await fetchActivesFromInvestidor10(walletUrl);
    if (actives.length === 0) {
        console.error('Nenhum ativo encontrado. O link publico pode ter mudado de formato.');
        process.exit(1);
    }
    console.log(`Encontrados ${actives.length} ativos: ${actives.map(a => a.ticker_name).join(', ')}`);

    const portfolio = {};
    for (let i = 0; i < actives.length; i++) {
        const a = actives[i];
        const ticker = a.ticker_name;
        process.stdout.write(`  [${i + 1}/${actives.length}] ${ticker}... `);

        const valuation = await fetchValuation(ticker);
        if (!valuation) {
            console.log('falhou (sem dados de mercado), pulando');
            continue;
        }

        portfolio[ticker] = {
            ...valuation,
            quantity: Number.isFinite(a.quantity) ? a.quantity : null,
            avgPrice: Number.isFinite(a.avg_price) ? a.avg_price : null
        };
        console.log('ok');

        if (i < actives.length - 1) await sleep(700);
    }

    const payload = { version: 1, createdAt: new Date().toISOString(), portfolio };
    const code = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

    const outPath = path.join(ROOT, 'carteira-investidor10.txt');
    fs.writeFileSync(outPath, code);

    console.log(`\nCodigo de carteira gerado (${Object.keys(portfolio).length} ativos).`);
    console.log(`Salvo em: ${outPath}`);
    console.log('\nNo invest-app: Minha Carteira -> IMPORTAR -> cole o conteudo desse arquivo -> IMPORTAR CODIGO.\n');
}

main().catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
});
