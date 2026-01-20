import pg from 'pg';

const { Pool } = pg;

console.log('Testing connection with:');
console.log('  Host:', process.env.DB_HOST);
console.log('  Port:', process.env.DB_PORT);
console.log('  User:', process.env.DB_USER);
console.log('  Password:', process.env.DB_PASSWORD ? '***' : 'NOT SET');
console.log('  Database:', process.env.DB_NAME);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'pei',
  password: process.env.DB_PASSWORD || 'pei_dev_password',
  database: process.env.DB_NAME || 'platform_events',
});

try {
  const client = await pool.connect();
  console.log('\n✓ Connection successful!');
  
  const result = await client.query('SELECT version()');
  console.log('✓ Query successful!');
  console.log('PostgreSQL version:', result.rows[0].version.split('\n')[0]);
  
  client.release();
  await pool.end();
} catch (error) {
  console.error('\n✗ Connection failed:', error);
  process.exit(1);
}
