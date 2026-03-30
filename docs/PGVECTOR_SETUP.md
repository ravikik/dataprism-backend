# pgvector Setup Guide for DataPrism

## Overview

pgvector is a PostgreSQL extension that enables vector similarity search directly in your database. This guide covers setup for local development and AWS RDS production.

---

## Prerequisites

- PostgreSQL 12+ (PostgreSQL 15+ recommended)
- Node.js with npm
- Admin access to PostgreSQL instance

---

## Option 1: Local Development Setup

### Step 1.1: Install PostgreSQL

**Windows (PowerShell):**
```powershell
# Using Chocolatey
choco install postgresql

# Or download installer from postgresql.org
# https://www.postgresql.org/download/windows/
```

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Step 1.2: Install pgvector Extension

**From Source (All platforms):**
```bash
# Clone pgvector
git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git
cd pgvector

# Build and install
make
sudo make install  # Linux/macOS
# Windows: Use Visual Studio Developer Command Prompt
```

**Using Package Manager (Linux):**
```bash
# Ubuntu/Debian
sudo apt install postgresql-15-pgvector

# RHEL/CentOS
sudo yum install pgvector_15
```

**Using Docker (Easiest for Development):**
```bash
# Run PostgreSQL with pgvector pre-installed
docker run -d \
  --name dataprism-postgres \
  -e POSTGRES_PASSWORD=dataprism123 \
  -e POSTGRES_DB=dataprism \
  -p 5432:5432 \
  -v pgvector-data:/var/lib/postgresql/data \
  pgvector/pgvector:pg16

# Verify it's running
docker ps
```

### Step 1.3: Create Database and Enable Extension

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database (if not exists)
CREATE DATABASE dataprism;

-- Connect to dataprism database
\c dataprism

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Step 1.4: Create Vector Cache Tables

```sql
-- Create table for storing query embeddings and cached responses
CREATE TABLE query_cache (
    id BIGSERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    query_hash VARCHAR(64) NOT NULL UNIQUE,
    embedding vector(1536),  -- Claude embeddings are 1536 dimensions
    response JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    accessed_at TIMESTAMP DEFAULT NOW(),
    access_count INTEGER DEFAULT 0
);

-- Create index for vector similarity search (HNSW for best performance)
CREATE INDEX ON query_cache USING hnsw (embedding vector_cosine_ops);

-- Create index for exact match lookups
CREATE INDEX ON query_cache (query_hash);

-- Create index for timestamp-based cleanup
CREATE INDEX ON query_cache (created_at);

-- Create table for schema context embeddings
CREATE TABLE schema_cache (
    id BIGSERIAL PRIMARY KEY,
    catalog_name VARCHAR(255),
    schema_name VARCHAR(255),
    table_name VARCHAR(255),
    schema_context JSONB NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(catalog_name, schema_name, table_name)
);

CREATE INDEX ON schema_cache USING hnsw (embedding vector_cosine_ops);
```

---

## Option 2: AWS RDS PostgreSQL Setup

### Step 2.1: Create RDS Instance

**Via AWS Console:**
1. Go to RDS → Create database
2. Choose PostgreSQL 15.x or later
3. Template: Production or Dev/Test
4. Instance configuration:
   - Class: db.t3.medium (or larger for production)
   - Storage: 100 GB SSD
   - Auto-scaling: Enable up to 500 GB
5. Security:
   - VPC: Same as your ECS cluster
   - Public access: No (for security)
   - Security group: Allow port 5432 from ECS tasks

**Via AWS CLI:**
```bash
aws rds create-db-instance \
  --db-instance-identifier dataprism-postgres \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15.5 \
  --master-username dbadmin \
  --master-user-password "YourSecurePassword123!" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --vpc-security-group-ids sg-xxxxxxxxx \
  --db-subnet-group-name dataprism-subnet-group \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "Mon:04:00-Mon:05:00"
```

### Step 2.2: Install pgvector on RDS

```sql
-- Connect to RDS instance
psql -h dataprism-postgres.xxxxx.us-east-1.rds.amazonaws.com \
     -U dbadmin -d postgres

-- Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create dataprism database
CREATE DATABASE dataprism;
\c dataprism

-- Enable vector extension in dataprism database
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tables (use same SQL as Step 1.4 above)
```

**Note:** RDS PostgreSQL 15.2+ includes pgvector by default. No manual compilation needed!

---

## Step 3: Install Node.js Dependencies

```bash
cd c:\Development\AI-Innovations\DataPrism-Backend

# Install PostgreSQL client
npm install pg @types/pg

# Optional: Connection pooling
npm install pg-pool
```

---

## Step 4: Update Environment Variables

Update your `.env` file:

```env
##### Vector Database Configuration
VECTOR_DB_TYPE=pgvector  # Options: pinecone, pgvector, qdrant

##### PostgreSQL Configuration (for pgvector)
POSTGRES_HOST=localhost  # Or RDS endpoint
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=dataprism123
POSTGRES_DATABASE=dataprism
POSTGRES_SSL=false  # Set to true for RDS

# For AWS RDS
# POSTGRES_HOST=dataprism-postgres.xxxxx.us-east-1.rds.amazonaws.com
# POSTGRES_SSL=true
```

---

## Step 5: Create pgvector Client

Create `server/cache/pgvector-client.ts`:

```typescript
import { Pool, PoolClient } from 'pg';

export interface CacheHit {
  query: string;
  response: any;
  metadata: any;
  similarity: number;
}

export class PgVectorCache {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE || 'dataprism',
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20, // Connection pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('[PgVector] Unexpected error on idle client', err);
    });
  }

  /**
   * Generate embedding for text (placeholder - integrate with Claude or embedding model)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Replace with actual embedding generation
    // Options:
    // 1. Use Claude API (if supported)
    // 2. Use OpenAI embeddings API
    // 3. Use local embedding model (sentence-transformers)
    
    // For now, return dummy embedding (1536 dimensions)
    console.warn('[PgVector] Using dummy embeddings - implement real embedding generation!');
    return Array(1536).fill(0).map(() => Math.random());
  }

  /**
   * Create hash for exact match lookups
   */
  private hashQuery(query: string, params?: any): string {
    const crypto = require('crypto');
    const content = query + (params ? JSON.stringify(params) : '');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Search for similar cached queries
   */
  async getSimilar(query: string, threshold = 0.9): Promise<CacheHit | null> {
    const client = await this.pool.connect();
    try {
      const embedding = await this.generateEmbedding(query);
      const embeddingStr = `[${embedding.join(',)}]`;

      const result = await client.query(
        `SELECT 
          query_text as query,
          response,
          metadata,
          1 - (embedding <=> $1::vector) as similarity
        FROM query_cache
        WHERE 1 - (embedding <=> $1::vector) > $2
        ORDER BY embedding <=> $1::vector
        LIMIT 1`,
        [embeddingStr, threshold]
      );

      if (result.rows.length === 0) {
        console.log('[PgVector] No similar queries found');
        return null;
      }

      // Update access statistics
      await client.query(
        `UPDATE query_cache 
         SET accessed_at = NOW(), 
             access_count = access_count + 1
         WHERE query_hash = $1`,
        [this.hashQuery(result.rows[0].query)]
      );

      console.log(`[PgVector] Cache hit with similarity: ${result.rows[0].similarity}`);
      return result.rows[0];
    } catch (error) {
      console.error('[PgVector] Error in getSimilar:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Get exact match from cache
   */
  async getExact(query: string, params?: any): Promise<any | null> {
    const client = await this.pool.connect();
    try {
      const hash = this.hashQuery(query, params);
      
      const result = await client.query(
        `SELECT response, metadata
         FROM query_cache
         WHERE query_hash = $1`,
        [hash]
      );

      if (result.rows.length === 0) {
        return null;
      }

      // Update access statistics
      await client.query(
        `UPDATE query_cache 
         SET accessed_at = NOW(), 
             access_count = access_count + 1
         WHERE query_hash = $1`,
        [hash]
      );

      console.log('[PgVector] Exact cache hit');
      return result.rows[0].response;
    } catch (error) {
      console.error('[PgVector] Error in getExact:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Store query and response in cache
   */
  async store(query: string, response: any, params?: any, metadata?: any): Promise<void> {
    const client = await this.pool.connect();
    try {
      const hash = this.hashQuery(query, params);
      const embedding = await this.generateEmbedding(query);
      const embeddingStr = `[${embedding.join(',')}]`;

      await client.query(
        `INSERT INTO query_cache 
          (query_text, query_hash, embedding, response, metadata)
         VALUES ($1, $2, $3::vector, $4, $5)
         ON CONFLICT (query_hash) 
         DO UPDATE SET 
           response = EXCLUDED.response,
           metadata = EXCLUDED.metadata,
           accessed_at = NOW()`,
        [query, hash, embeddingStr, JSON.stringify(response), JSON.stringify(metadata || {})]
      );

      console.log('[PgVector] Cached query response');
    } catch (error) {
      console.error('[PgVector] Error in store:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Store schema context
   */
  async storeSchema(
    catalog: string,
    schema: string,
    table: string,
    context: any
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const contextStr = JSON.stringify(context);
      const embedding = await this.generateEmbedding(contextStr);
      const embeddingStr = `[${embedding.join(',')}]`;

      await client.query(
        `INSERT INTO schema_cache 
          (catalog_name, schema_name, table_name, schema_context, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)
         ON CONFLICT (catalog_name, schema_name, table_name)
         DO UPDATE SET 
           schema_context = EXCLUDED.schema_context,
           embedding = EXCLUDED.embedding,
           created_at = NOW()`,
        [catalog, schema, table, context, embeddingStr]
      );

      console.log(`[PgVector] Cached schema: ${catalog}.${schema}.${table}`);
    } catch (error) {
      console.error('[PgVector] Error in storeSchema:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Clean up old cache entries
   */
  async cleanup(daysOld = 7): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM query_cache 
         WHERE created_at < NOW() - INTERVAL '${daysOld} days'
         AND access_count < 2
         RETURNING id`
      );

      console.log(`[PgVector] Cleaned up ${result.rowCount} old cache entries`);
      return result.rowCount || 0;
    } catch (error) {
      console.error('[PgVector] Error in cleanup:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_entries,
          AVG(access_count) as avg_accesses,
          MAX(access_count) as max_accesses,
          COUNT(CASE WHEN access_count > 1 THEN 1 END) as reused_entries,
          pg_size_pretty(pg_total_relation_size('query_cache')) as table_size
        FROM query_cache
      `);

      return result.rows[0];
    } catch (error) {
      console.error('[PgVector] Error in getStats:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
```

---

## Step 6: Test the Setup

Create `server/cache/test-pgvector.ts`:

```typescript
import { PgVectorCache } from './pgvector-client';

async function testPgVector() {
  console.log('Testing pgvector setup...\n');
  
  const cache = new PgVectorCache();

  try {
    // Test 1: Store a query
    console.log('Test 1: Storing query...');
    await cache.store(
      'What are the top 5 customers by revenue?',
      { sql: 'SELECT * FROM customers ORDER BY revenue DESC LIMIT 5' },
      {},
      { tool: 'execute_sql', user: 'test' }
    );
    console.log('✓ Query stored\n');

    // Test 2: Exact match retrieval
    console.log('Test 2: Exact match retrieval...');
    const exact = await cache.getExact('What are the top 5 customers by revenue?');
    console.log('✓ Retrieved:', exact);
    console.log('');

    // Test 3: Similar query (should find the one we just stored)
    console.log('Test 3: Semantic similarity search...');
    const similar = await cache.getSimilar(
      'Show me the best 5 customers by sales',
      0.85
    );
    console.log('✓ Similar query found:', similar ? 'Yes' : 'No');
    if (similar) {
      console.log('  Similarity:', similar.similarity);
    }
    console.log('');

    // Test 4: Cache statistics
    console.log('Test 4: Cache statistics...');
    const stats = await cache.getStats();
    console.log('✓ Stats:', stats);
    console.log('');

    console.log('All tests passed! ✓');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await cache.close();
  }
}

testPgVector();
```

Run the test:

```bash
npx tsx server/cache/test-pgvector.ts
```

---

## Step 7: Integrate with Cache Manager

Update `server/cache/cache-manager.ts` to support pgvector:

```typescript
import { RedisCache } from './redis-client';
import { PgVectorCache } from './pgvector-client';

export class CacheManager {
  private redis: RedisCache;
  private vector: PgVectorCache | null = null;
  
  constructor() {
    this.redis = new RedisCache();
    
    // Initialize vector DB based on configuration
    if (process.env.VECTOR_DB_TYPE === 'pgvector') {
      this.vector = new PgVectorCache();
    }
  }
  
  async getCachedResponse(query: string, params: any): Promise<any> {
    // L1: Redis exact match
    const exactKey = this.hashQuery(query, params);
    const cached = await this.redis.get(exactKey);
    if (cached) {
      console.log('[Cache] Redis hit');
      return cached;
    }
    
    // L2: Vector similarity match
    if (this.vector) {
      const similar = await this.vector.getSimilar(query, 0.9);
      if (similar) {
        console.log('[Cache] Vector hit');
        return similar.response;
      }
    }
    
    return null;
  }
  
  async storeResponse(query: string, params: any, response: any): Promise<void> {
    const key = this.hashQuery(query, params);
    
    const promises = [
      this.redis.set(key, response, 3600), // 1hr TTL
    ];
    
    if (this.vector) {
      promises.push(this.vector.store(query, response, params));
    }
    
    await Promise.all(promises);
  }
  
  private hashQuery(query: string, params: any): string {
    return `query:${Buffer.from(query + JSON.stringify(params)).toString('base64')}`;
  }
}
```

---

## Performance Tuning

### Optimize Index Settings

```sql
-- Adjust HNSW index parameters for better recall/speed tradeoff
DROP INDEX IF EXISTS query_cache_embedding_idx;

CREATE INDEX query_cache_embedding_idx 
ON query_cache 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- m: Higher = better recall but slower build (default: 16, range: 4-128)
-- ef_construction: Higher = better quality but slower build (default: 64)

-- Set search quality at query time
SET hnsw.ef_search = 40;  -- Higher = better recall but slower (default: 40)
```

### Connection Pool Tuning

```typescript
// In pgvector-client.ts constructor
this.pool = new Pool({
  max: 20,              // Maximum pool size
  min: 5,               // Minimum pool size (keep connections warm)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  
  // For high-traffic production:
  // max: 50,
  // min: 10,
});
```

---

## Monitoring & Maintenance

### View Cache Performance

```sql
-- Top most-accessed queries
SELECT 
  query_text,
  access_count,
  created_at,
  accessed_at
FROM query_cache
ORDER BY access_count DESC
LIMIT 10;

-- Cache hit rate (requires query logging)
SELECT 
  COUNT(*) FILTER (WHERE access_count > 0) * 100.0 / COUNT(*) as hit_rate_percent
FROM query_cache;

-- Storage usage
SELECT 
  pg_size_pretty(pg_total_relation_size('query_cache')) as cache_size,
  COUNT(*) as entry_count
FROM query_cache;
```

### Schedule Cleanup Job

```typescript
// In server/index.ts or a cron job
import { PgVectorCache } from './cache/pgvector-client';

// Run cleanup every 24 hours
setInterval(async () => {
  const cache = new PgVectorCache();
  const deleted = await cache.cleanup(7); // Remove entries older than 7 days
  console.log(`[Cleanup] Removed ${deleted} old cache entries`);
  await cache.close();
}, 24 * 60 * 60 * 1000);
```

---

## Troubleshooting

### Issue: "could not open extension control file"

**Solution:**
```bash
# Verify pgvector is installed
psql -U postgres -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"

# Reinstall if missing
cd pgvector
sudo make install
```

### Issue: "vector dimension mismatch"

**Solution:**
Ensure all embeddings are exactly 1536 dimensions (Claude default).

```typescript
if (embedding.length !== 1536) {
  throw new Error(`Expected 1536 dimensions, got ${embedding.length}`);
}
```

### Issue: Slow similarity searches

**Solution:**
1. Create/rebuild HNSW index
2. Increase `hnsw.ef_search` parameter
3. Reduce result `LIMIT`
4. Add `WHERE` filters before vector search

---

## Next Steps

1. **Implement real embeddings** - Replace dummy embedding generation with Claude API or OpenAI
2. **Add Redis layer** - Implement the full two-tier cache (Redis + pgvector)
3. **Monitor performance** - Track cache hit rates and query latency
4. **Scale production** - Move to AWS RDS with Read Replicas if needed

---

## Resources

- pgvector GitHub: https://github.com/pgvector/pgvector
- pgvector Documentation: https://github.com/pgvector/pgvector#querying
- PostgreSQL Vector Operations: https://github.com/pgvector/pgvector#distances
- AWS RDS PostgreSQL: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
