// ============================================
// api/health.js v2.0
// ============================================
import { withCors } from './lib/cors.js';
import { getPool } from './lib/helpers.js';

async function handler(req, res) {
  const pool = getPool();
  const result = await pool.query('SELECT NOW() as time');
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db_time: result.rows[0].time,
    version: '2.0.0'
  });
}

export default withCors(handler);
