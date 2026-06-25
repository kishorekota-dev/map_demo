const logger = require('../utils/logger');

/**
 * Circuit Breaker
 *
 * Deterministic, per-service circuit breaker used by the proxy layer to stop
 * forwarding traffic to a downstream service that is repeatedly failing.
 *
 * State machine (per service):
 *   CLOSED    -> normal operation. Failures are counted. When the failure count
 *                reaches the configured threshold the breaker trips to OPEN.
 *   OPEN      -> all calls are short-circuited (isOpen() === true) until the
 *                reset timeout elapses. After the timeout the breaker moves to
 *                HALF_OPEN to probe the service.
 *   HALF_OPEN -> a single probe is allowed. A success closes the breaker; a
 *                failure re-opens it and restarts the reset timeout.
 *
 * Thresholds are sourced from environment variables so behaviour is
 * configurable and deterministic (no randomness):
 *   CIRCUIT_BREAKER_THRESHOLD  - consecutive failures before tripping (default 5)
 *   CIRCUIT_BREAKER_TIMEOUT    - reset timeout in ms before probing (default 60000)
 */

const STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
});

class CircuitBreaker {
  constructor(options = {}) {
    // Read thresholds from env (with sane defaults) so behaviour is deterministic.
    this.failureThreshold =
      options.failureThreshold || parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5;
    this.resetTimeout =
      options.resetTimeout || parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000;

    // Per-service state. Keyed by service name.
    // { state, failureCount, openedAt }
    this.breakers = new Map();

    logger.info('Circuit Breaker initialized', {
      failureThreshold: this.failureThreshold,
      resetTimeout: this.resetTimeout
    });
  }

  /**
   * Lazily get (or create) the breaker state for a service.
   */
  getState(serviceName) {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, {
        state: STATES.CLOSED,
        failureCount: 0,
        openedAt: null
      });
    }
    return this.breakers.get(serviceName);
  }

  /**
   * Determine whether the breaker for a service is currently OPEN (i.e. calls
   * should be short-circuited). Also advances OPEN -> HALF_OPEN once the reset
   * timeout has elapsed so the next call can probe the service.
   */
  isOpen(serviceName) {
    const breaker = this.getState(serviceName);

    if (breaker.state === STATES.OPEN) {
      // Has the cool-down period elapsed? If so, allow a single probe.
      if (Date.now() - breaker.openedAt >= this.resetTimeout) {
        breaker.state = STATES.HALF_OPEN;
        logger.info('Circuit breaker half-open (probing)', { service: serviceName });
        return false;
      }
      return true;
    }

    // CLOSED and HALF_OPEN allow the call to proceed.
    return false;
  }

  /**
   * Record a successful call. Closes the breaker and resets failure tracking.
   */
  recordSuccess(serviceName) {
    const breaker = this.getState(serviceName);

    if (breaker.state !== STATES.CLOSED || breaker.failureCount > 0) {
      logger.info('Circuit breaker reset to closed', { service: serviceName });
    }

    breaker.state = STATES.CLOSED;
    breaker.failureCount = 0;
    breaker.openedAt = null;
  }

  /**
   * Record a failed call. Trips the breaker to OPEN once the failure threshold
   * is reached, or immediately re-opens it if a HALF_OPEN probe failed.
   */
  recordFailure(serviceName) {
    const breaker = this.getState(serviceName);

    // A failed probe immediately re-opens the breaker and restarts the timer.
    if (breaker.state === STATES.HALF_OPEN) {
      breaker.state = STATES.OPEN;
      breaker.openedAt = Date.now();
      logger.warn('Circuit breaker re-opened after failed probe', { service: serviceName });
      return;
    }

    breaker.failureCount++;

    if (breaker.failureCount >= this.failureThreshold && breaker.state === STATES.CLOSED) {
      breaker.state = STATES.OPEN;
      breaker.openedAt = Date.now();
      logger.error('Circuit breaker tripped to open', {
        service: serviceName,
        failureCount: breaker.failureCount,
        threshold: this.failureThreshold
      });
    }
  }

  /**
   * Execute an async function guarded by the breaker. Throws immediately if the
   * breaker is open; otherwise records success/failure based on the outcome.
   */
  async execute(serviceName, fn) {
    if (this.isOpen(serviceName)) {
      const error = new Error(`Circuit breaker is open for service: ${serviceName}`);
      error.code = 'CIRCUIT_BREAKER_OPEN';
      throw error;
    }

    try {
      const result = await fn();
      this.recordSuccess(serviceName);
      return result;
    } catch (error) {
      this.recordFailure(serviceName);
      throw error;
    }
  }

  /**
   * Inspect the current state of a service breaker (useful for diagnostics).
   */
  getStatus(serviceName) {
    const breaker = this.getState(serviceName);
    return {
      service: serviceName,
      state: breaker.state,
      failureCount: breaker.failureCount,
      openedAt: breaker.openedAt
    };
  }

  /**
   * Reset all breakers (primarily for tests/diagnostics).
   */
  reset() {
    this.breakers.clear();
    logger.info('Circuit breaker state reset');
  }
}

// Singleton instance shared across the gateway so state is consistent.
let instance = null;

module.exports = {
  getInstance: (options) => {
    if (!instance) {
      instance = new CircuitBreaker(options);
    }
    return instance;
  },
  CircuitBreaker,
  STATES
};
