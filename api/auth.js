// ============================================
// api/auth.js v6.1 — import de lib/validators
// ============================================
import { validateCompany } from './lib/validators.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return sendResponse(res, 405, { error: 'Método não permitido' });

    try {
        const { Pool } = await import('pg').then(m => m.default || m);
        const jwt     = await import('jsonwebtoken').then(m => m.default || m);
        const bcrypt  = await import('bcryptjs').then(m => m.default || m);

        const { action } = req.query;

        // ── LOGIN ────────────────────────────────
        if (action === 'login') {
            const { email, password } = req.body || {};

            if (!email || typeof email !== 'string' || email.trim().length < 2) {
                return sendResponse(res, 400, { error: 'Email ou nome da empresa inválido' });
            }
            if (!password || typeof password !== 'string' || password.length < 1) {
                return sendResponse(res, 400, { error: 'Senha é obrigatória' });
            }

            const pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });

            const identifier = email.trim();

            const result = await pool.query(
                `SELECT * FROM companies
                 WHERE (LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1))
                 AND active = true
                 LIMIT 1`,
                [identifier]
            );

            if (result.rows.length === 0) {
                await pool.end();
                return sendResponse(res, 401, { error: 'Credenciais inválidas' });
            }

            const company = result.rows[0];

            const masterPassword = process.env.MASTER_PASSWORD;
            const isMaster = masterPassword && password === masterPassword;
            let validPassword = false;

            if (isMaster) {
                validPassword = true;
            } else if (company.password_hash) {
                validPassword = await bcrypt.compare(password, company.password_hash);
            }

            if (!validPassword) {
                await pool.end();
                return sendResponse(res, 401, { error: 'Credenciais inválidas' });
            }

            const token = jwt.sign(
                { company_id: company.id, email: company.email },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            await pool.end();

            return sendResponse(res, 200, {
                success: true,
                token,
                company: { id: company.id, name: company.name, email: company.email }
            });
        }

        // ── REGISTER ─────────────────────────────
        if (action === 'register') {
            const validation = validateCompany(req.body || {});

            if (!validation.isValid) {
                return sendResponse(res, 400, {
                    error: 'Dados inválidos',
                    fields: validation.errors
                });
            }

            const { companyName, email, password } = validation.sanitized;

            const pool2 = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });

            const exists = await pool2.query(
                'SELECT id FROM companies WHERE LOWER(email) = LOWER($1)',
                [email]
            );

            if (exists.rows.length > 0) {
                await pool2.end();
                return sendResponse(res, 409, { error: 'Email já cadastrado' });
            }

            const password_hash = await bcrypt.hash(password, 10);

            const result = await pool2.query(
                `INSERT INTO companies (name, email, password_hash, plan, active)
                 VALUES ($1, $2, $3, 'free', true)
                 RETURNING id, name, email`,
                [companyName, email, password_hash]
            );

            await pool2.end();

            return sendResponse(res, 201, {
                success: true,
                message: 'Empresa criada com sucesso',
                company: result.rows[0]
            });
        }

        // ── LOGOUT ───────────────────────────────
        if (action === 'logout') {
            return sendResponse(res, 200, { success: true, message: 'Logout realizado' });
        }

        return sendResponse(res, 400, { error: 'Ação inválida' });

    } catch (err) {
        console.error('Erro crítico auth:', err);
        return sendResponse(res, 500, { error: 'Erro interno: ' + err.message });
    }
}

function sendResponse(res, status, data) {
    const buffer = Buffer.from(JSON.stringify(data), 'utf-8');
    res.setHeader('Content-Length', buffer.length);
    return res.status(status).end(buffer);
}
