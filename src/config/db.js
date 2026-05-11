import pg from 'pg';
 
const { Pool } = pg;
 
/**
 * Pool único de conexiones a PostgreSQL.
 * La variable DATABASE_URL se genera automáticamente en Render
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
 
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
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
 