// Fixed: Use environment variables for configuration
require('dotenv').config();

const databaseConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/dev_db',
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

// Validate required configuration
if (!databaseConfig.connectionString) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

module.exports = databaseConfig;
