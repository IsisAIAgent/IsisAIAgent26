// ============================================
// api/lib/cors.js v2.0 — DEFINITIVO
// ============================================
export function withCors(handler) {
  return async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
      return await handler(req, res);
    } catch (err) {
      console.error('Handler error:', err);
      const buffer = Buffer.from(JSON.stringify({ error: 'Erro interno' }), 'utf-8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(500).end(buffer);
    }
  };
}
