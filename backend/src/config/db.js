const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL no está definida en el archivo .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a Supabase:', err.message);
  } else {
    console.log('✅ Conectado a Supabase correctamente');
    release();
  }
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool:', err.message);
});

module.exports = pool;