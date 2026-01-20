import { pool } from '../src/db/index.js';

async function migrate() {
  console.log('Running migrations...');
  
  const client = await pool.connect();
  
  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Create services table
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        team_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        description TEXT,
        metadata JSONB,
        embedding vector(1536),
        correlation_id TEXT,
        parent_event_id UUID,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create indexes for events
    await client.query('CREATE INDEX IF NOT EXISTS events_service_id_idx ON events(service_id)');
    await client.query('CREATE INDEX IF NOT EXISTS events_event_type_idx ON events(event_type)');
    await client.query('CREATE INDEX IF NOT EXISTS events_occurred_at_idx ON events(occurred_at)');
    await client.query('CREATE INDEX IF NOT EXISTS events_correlation_id_idx ON events(correlation_id)');
    
    // Create vector similarity index (IVFFlat for faster search)
    await client.query(`
      CREATE INDEX IF NOT EXISTS events_embedding_idx 
      ON events 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `).catch(() => {
      // IVFFlat requires data to be present, fall back to HNSW or skip
      console.log('Vector index creation deferred (no data yet)');
    });
    
    // Create api_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        authorized_services TEXT[] NOT NULL,
        created_by TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    console.log('Migrations completed successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
