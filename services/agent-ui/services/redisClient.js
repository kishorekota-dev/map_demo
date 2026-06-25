const redis = require('redis');
const logger = require('./logger');

/**
 * Shared Redis client helper for agent + queue state persistence.
 *
 * The service already depends on Redis for express-session. This module
 * provides a single redis@4 client (using the existing REDIS_* env vars)
 * that AgentService and QueueService use to persist their state so it
 * survives restarts and is consistent across instances.
 *
 * If Redis is unavailable, getRedisClient() resolves to null and callers
 * fall back to in-memory Maps (with a clear warning logged).
 */

let clientPromise = null;
let unavailable = false;

/**
 * Build a redis@4 client from REDIS_* env vars.
 * Supports either REDIS_URL or discrete REDIS_HOST/REDIS_PORT/REDIS_PASSWORD.
 */
function buildClient() {
    if (process.env.REDIS_URL) {
        return redis.createClient({ url: process.env.REDIS_URL });
    }

    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT, 10) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    return redis.createClient({
        socket: { host, port },
        password
    });
}

/**
 * Lazily connect (once) and return a ready Redis client, or null if Redis
 * could not be reached. Never throws — callers should treat null as
 * "fall back to in-memory".
 */
async function getRedisClient() {
    if (unavailable) {
        return null;
    }

    if (!clientPromise) {
        clientPromise = (async () => {
            try {
                const client = buildClient();
                client.on('error', (err) => {
                    // Avoid crashing on transient errors; log at debug to reduce noise.
                    logger.debug('Redis client error', { error: err.message });
                });
                await client.connect();
                logger.info('Connected to Redis for agent/queue state persistence');
                return client;
            } catch (error) {
                unavailable = true;
                logger.warn(
                    'Redis unavailable for agent/queue persistence, falling back to in-memory state',
                    { error: error.message }
                );
                return null;
            }
        })();
    }

    return clientPromise;
}

/**
 * Close the shared client (used during graceful shutdown / tests).
 */
async function closeRedisClient() {
    if (!clientPromise) {
        return;
    }
    try {
        const client = await clientPromise;
        if (client && client.isOpen) {
            await client.quit();
        }
    } catch (error) {
        logger.debug('Error closing Redis client', { error: error.message });
    } finally {
        clientPromise = null;
    }
}

module.exports = { getRedisClient, closeRedisClient };
