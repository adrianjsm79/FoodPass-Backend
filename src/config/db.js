import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  // ← quita allowExitOnIdle
});

pool.on('error', (err) => {
  console.error('Error en el pool:', err.message);
});

export async function testConnection() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT NOW()');
    console.log('✅ Conexión a PostgreSQL exitosa:', rows[0].now);
  } finally {
    client.release();
  }
}

export default pool;