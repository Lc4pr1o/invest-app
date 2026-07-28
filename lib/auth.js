const COOKIE_NAME = 'invest_auth';

export function isAuthenticated(req) {
    const password = process.env.APP_PASSWORD;
    if (!password) return true; // sem senha configurada, nao bloqueia
    const cookies = parseCookies(req.headers.cookie || '');
    return cookies[COOKIE_NAME] === password;
}

export function setAuthCookie(res, password) {
    const isProd = process.env.VERCEL === '1';
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(password)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=' + 60 * 60 * 24 * 90 // 90 dias
    ];
    if (isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

function parseCookies(header) {
    const out = {};
    header.split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (key) out[key] = decodeURIComponent(value);
    });
    return out;
}
