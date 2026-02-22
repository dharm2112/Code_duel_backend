const { getRedisClient, isRedisReady } = require("../config/redis");
const logger = require("../utils/logger");

const CACHE_PREFIX = "leaderboard:";
const DEFAULT_TTL = 60; // seconds

// In-memory fallback cache (used when Redis is unavailable)
const memoryCache = new Map();

/**
 * Build the cache key for a challenge leaderboard
 * @param {string} challengeId
 * @returns {string}
 */
const buildKey = (challengeId) => `${CACHE_PREFIX}${challengeId}`;

/**
 * Get data from in-memory fallback cache
 * @param {string} key
 * @returns {*|null}
 */
const memoryGet = (key) => {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        memoryCache.delete(key);
        return null;
    }
    return entry.data;
};

/**
 * Set data in in-memory fallback cache
 * @param {string} key
 * @param {*} data
 * @param {number} ttl - Time to live in seconds
 */
const memorySet = (key, data, ttl) => {
    memoryCache.set(key, {
        data,
        expiresAt: Date.now() + ttl * 1000,
    });
};

/**
 * Delete data from in-memory fallback cache
 * @param {string} key
 */
const memoryDel = (key) => {
    memoryCache.delete(key);
};

/**
 * Get cached leaderboard data for a challenge.
 * Tries Redis first, falls back to in-memory cache.
 * Returns parsed data or null if cache miss.
 * @param {string} challengeId
 * @returns {Promise<Array|null>}
 */
const getLeaderboardCache = async (challengeId) => {
    const key = buildKey(challengeId);

    // Try Redis first
    if (isRedisReady()) {
        try {
            const data = await getRedisClient().get(key);
            if (data) {
                logger.info(`Cache HIT (Redis) for leaderboard:${challengeId}`);
                return JSON.parse(data);
            }
            logger.info(`Cache MISS for leaderboard:${challengeId}`);
            return null;
        } catch (err) {
            logger.warn(`Redis read error for leaderboard:${challengeId} - ${err.message}`);
        }
    }

    // Fallback to in-memory cache
    const memData = memoryGet(key);
    if (memData) {
        logger.info(`Cache HIT (in-memory) for leaderboard:${challengeId}`);
        return memData;
    }

    logger.info(`Cache MISS for leaderboard:${challengeId}`);
    return null;
};

/**
 * Store leaderboard data in cache with TTL.
 * Stores in both Redis and in-memory fallback.
 * Silently fails if errors occur.
 * @param {string} challengeId
 * @param {Array} data
 * @param {number} ttl - Time to live in seconds (default 60)
 */
const setLeaderboardCache = async (challengeId, data, ttl = DEFAULT_TTL) => {
    const key = buildKey(challengeId);

    // Always store in in-memory fallback
    memorySet(key, data, ttl);

    // Try Redis
    if (isRedisReady()) {
        try {
            await getRedisClient().set(key, JSON.stringify(data), "EX", ttl);
            logger.info(`Cache SET (Redis) for leaderboard:${challengeId} (TTL: ${ttl}s)`);
        } catch (err) {
            logger.warn(`Redis write error for leaderboard:${challengeId} - ${err.message}`);
        }
    } else {
        logger.info(`Cache SET (in-memory) for leaderboard:${challengeId} (TTL: ${ttl}s)`);
    }
};

/**
 * Invalidate (delete) cached leaderboard data for a challenge.
 * Called when leaderboard-affecting data changes.
 * Clears both Redis and in-memory cache.
 * Silently fails if errors occur.
 * @param {string} challengeId
 */
const invalidateLeaderboardCache = async (challengeId) => {
    const key = buildKey(challengeId);

    // Always clear in-memory fallback
    memoryDel(key);

    // Try Redis
    if (isRedisReady()) {
        try {
            await getRedisClient().del(key);
            logger.info(`Cache INVALIDATED for leaderboard:${challengeId}`);
        } catch (err) {
            logger.warn(`Cache invalidation error for leaderboard:${challengeId} - ${err.message}`);
        }
    }
};

module.exports = {
    getLeaderboardCache,
    setLeaderboardCache,
    invalidateLeaderboardCache,
};
