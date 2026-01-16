import { MongoClient, Db } from 'mongodb';

/**
 * MongoDB Connection Manager (Singleton Pattern)
 * Manages the connection pool to MongoDB Atlas
 */

let mongoClient: MongoClient | null = null;
let db: Db | null = null;

/**
 * Initialize MongoDB connection
 */
export async function initializeDatabase(): Promise<void> {
  if (mongoClient && db) {
    console.log('[DB] MongoDB already connected');
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  try {
    mongoClient = new MongoClient(uri, {
      serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true,
      },
    });

    // Connect to MongoDB
    await mongoClient.connect();

    // Get database
    const dbName = process.env.MONGODB_DB || 'tiktok-scout';
    db = mongoClient.db(dbName);

    // Verify connection
    await db.admin().ping();
    console.log(`[DB] ✅ MongoDB connected to database: ${dbName}`);
  } catch (error) {
    console.error('[DB] ❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}

/**
 * Get MongoDB database instance
 */
export function getDatabase(): Db {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() first.'
    );
  }
  return db;
}

/**
 * Get MongoDB client instance
 */
export function getMongoClient(): MongoClient {
  if (!mongoClient) {
    throw new Error('MongoDB client not initialized. Call initializeDatabase() first.');
  }
  return mongoClient;
}

/**
 * Close MongoDB connection
 */
export async function closeDatabase(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
    console.log('[DB] ✅ MongoDB connection closed');
  }
}

/**
 * Health check for MongoDB connection
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (!db) return false;
    await db.admin().ping();
    return true;
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return false;
  }
}
