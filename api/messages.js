// ============================================
// api/messages.js v4.4
// ============================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { Pool } = await import('pg').then(m => m.default || m);
        const jwt = await import('jsonwebtoken').then(m => m.default || m);

        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        const token = req.headers['authorization']?.split(' ')[1];

        if (!token) {
            await pool.end();
            return res.status(401).json({ error: 'Não autorizado' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            await pool.end();
            return res.status(401).json({ error: 'Token inválido' });
        }

        const companyId = decoded.company_id;
        const { lead_id, phone, limit = 50 } = req.query;

        if (req.method === 'GET') {
            if (!lead_id && !phone) {
                await pool.end();
                return res.status(400).json({ error: 'lead_id ou phone obrigatório' });
            }

            const query = `
                SELECT m.*, l.name as lead_name, l.phone as lead_phone
                FROM messages m
                JOIN leads l ON m.lead_id = l.id
                WHERE m.company_id = $1 ${lead_id ? 'AND m.lead_id = $2' : 'AND l.phone = $2'}
                ORDER BY m.created_at ASC
                LIMIT $3`;

            const result = await pool.query(query, [
                companyId,
                lead_id || phone,
                Math.min(Number(limit), 200)
            ]);

            await pool.end();
            return res.status(200).json({ success: true, messages: result.rows });
        }

        if (req.method === 'POST') {
            const { lead_id: lid, content, direction = 'inbound' } = req.body || {};

            if (!lid || !content) {
                await pool.end();
                return res.status(400).json({ error: 'lead_id e content obrigatórios' });
            }

            const leadCheck = await pool.query(
                'SELECT id FROM leads WHERE id = $1 AND company_id = $2',
                [lid, companyId]
            );

            if (leadCheck.rows.length === 0) {
                await pool.end();
                return res.status(404).json({ error: 'Lead não encontrado' });
            }

            const result = await pool.query(
                `INSERT INTO messages (company_id, lead_id, content, direction, sent_by_ai)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [companyId, lid, content, direction, direction === 'outbound']
            );

            await pool.query(
                'UPDATE leads SET last_contact_at = NOW() WHERE id = $1',
                [lid]
            );

            await pool.end();
            return res.status(201).json({ success: true, message: result.rows[0] });
        }

        await pool.end();
        return res.status(405).json({ error: 'Método não permitido' });

    } catch (err) {
        console.error('Erro messages:', err);
        return res.status(500).json({ error: 'Erro interno' });
    }
}
