// ============================================
// api/leads.js v5.2 — import de lib/validators
// ============================================
import { validateLead } from './lib/validators.js';

function sendJSON(res, status, data) {
    const buffer = Buffer.from(JSON.stringify(data), 'utf-8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(status).end(buffer);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');

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
            return sendJSON(res, 401, { error: 'Não autorizado' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            await pool.end();
            return sendJSON(res, 401, { error: 'Token inválido' });
        }

        const companyId = decoded.company_id;

        // ── GET ──────────────────────────────────
        if (req.method === 'GET') {
            const result = await pool.query(
                `SELECT id, name, phone, email, interesse, status, temperature,
                        signature_key, created_at, updated_at
                 FROM leads
                 WHERE company_id = $1
                 ORDER BY created_at DESC`,
                [companyId]
            );
            await pool.end();
            return sendJSON(res, 200, { success: true, leads: result.rows });
        }

        // ── POST ─────────────────────────────────
        if (req.method === 'POST') {
            const validation = validateLead(req.body || {});

            if (!validation.isValid) {
                await pool.end();
                return sendJSON(res, 400, { error: 'Dados inválidos', fields: validation.errors });
            }

            const { name, phone, email, interesse } = validation.sanitized;
            const status = req.body.status || 'novo';
            const temperature = req.body.temperature || 'morno';
            const signatureKey = Math.random().toString(36).substring(2, 15);

            const result = await pool.query(
                `INSERT INTO leads (company_id, name, phone, email, interesse, status, temperature, signature_key)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [companyId, name, phone, email || null, interesse || null, status, temperature, signatureKey]
            );

            await pool.end();
            return sendJSON(res, 201, { success: true, lead: result.rows[0] });
        }

        // ── PATCH ────────────────────────────────
        if (req.method === 'PATCH') {
            const { id, ...updates } = req.body || {};

            if (!id) {
                await pool.end();
                return sendJSON(res, 400, { error: 'ID do lead obrigatório' });
            }

            const allowedFields = ['name', 'phone', 'email', 'interesse', 'status', 'temperature'];
            const fields = [];
            const values = [];
            let paramCount = 1;

            for (const [key, value] of Object.entries(updates)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    fields.push(`${key} = $${paramCount}`);
                    values.push(value);
                    paramCount++;
                }
            }

            if (fields.length === 0) {
                await pool.end();
                return sendJSON(res, 400, { error: 'Nenhum campo válido para atualizar' });
            }

            values.push(id, companyId);

            const result = await pool.query(
                `UPDATE leads SET ${fields.join(', ')}, updated_at = NOW()
                 WHERE id = $${paramCount} AND company_id = $${paramCount + 1}
                 RETURNING *`,
                values
            );

            await pool.end();

            if (result.rows.length === 0) {
                return sendJSON(res, 404, { error: 'Lead não encontrado' });
            }

            return sendJSON(res, 200, { success: true, lead: result.rows[0] });
        }

        // ── DELETE ───────────────────────────────
        if (req.method === 'DELETE') {
            const { id } = req.query;

            if (!id) {
                await pool.end();
                return sendJSON(res, 400, { error: 'ID do lead obrigatório' });
            }

            const result = await pool.query(
                'DELETE FROM leads WHERE id = $1 AND company_id = $2 RETURNING id',
                [id, companyId]
            );

            await pool.end();

            if (result.rows.length === 0) {
                return sendJSON(res, 404, { error: 'Lead não encontrado' });
            }

            return sendJSON(res, 200, { success: true, message: 'Lead removido' });
        }

        await pool.end();
        return sendJSON(res, 405, { error: 'Método não permitido' });

    } catch (err) {
        console.error('Erro leads:', err);
        return sendJSON(res, 500, { error: 'Erro interno do servidor' });
    }
}
