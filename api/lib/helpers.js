// ============================================
// api/lib/helpers.js — Utilitários compartilhados
// ============================================
import pg from 'pg';
const { Pool } = pg;

let pool;

export function getPool() {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL não configurada');
        }
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });
    }
    return pool;
}

export function parseAuthHeader(authHeader) {
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    return parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
}
