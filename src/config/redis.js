const Redis = require("ioredis");
const { config } = require("./env");
const logger = require("../utils/logger");

let redisClient = null;
let isConnected = false;

/**
 * Create and configure Redis client with error handling.
 * If Redis is unavailable, the app continues to work without caching.
 */
const createRedisClient = () => {
  try {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn("Redis: max reconnection attempts reached, giving up");
          return null; // Stop retrying
        }
        return Math.min(times * 500, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on("connect", () => {
      isConnected = true;
      logger.info("Redis: connected successfully");
    });

    redisClient.on("error", (err) => {
      isConnected = false;
      logger.warn(`Redis: connection error - ${err.message}`);
    });

    redisClient.on("close", () => {
      isConnected = false;
      logger.info("Redis: connection closed");
    });

    // Attempt to connect (non-blocking)
    redisClient.connect().catch((err) => {
      isConnected = false;
      logger.warn(`Redis: initial connection failed - ${err.message}. Falling back to database queries.`);
    });
  } catch (err) {
    logger.warn(`Redis: failed to create client - ${err.message}. Caching disabled.`);
    redisClient = null;
    isConnected = false;
  }
};

/**
 * Check if Redis is ready to accept commands
 * @returns {boolean}
 */
const isRedisReady = () => {
  return redisClient !== null && isConnected;
};

/**
 * Get the Redis client instance
 * @returns {Redis|null}
 */
const getRedisClient = () => {
  return redisClient;
};

/**
 * Gracefully disconnect Redis
 */
const disconnectRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info("Redis: disconnected gracefully");
    } catch (err) {
      logger.warn(`Redis: error during disconnect - ${err.message}`);
    }
  }
};

// Initialize on module load
createRedisClient();

module.exports = { getRedisClient, isRedisReady, disconnectRedis };
