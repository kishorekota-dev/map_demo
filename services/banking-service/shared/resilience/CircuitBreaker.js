/**
 * Circuit Breaker implementation for fault tolerance
 * Prevents cascading failures by stopping requests to failing services
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5; // Number of failures before opening
    this.timeout = options.timeout || 60000; // Time before attempting to close (ms)
    this.resetTimeout = options.resetTimeout || 30000; // Time in half-open state
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.lastStateChange = Date.now();
  }

  /**
   * Execute function with circuit breaker logic
   */
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN. Next attempt at ${new Date(this.nextAttempt).toISOString()}`);
      }
      // Transition to HALF_OPEN
      this.state = 'HALF_OPEN';
      this.lastStateChange = Date.now();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        // Close circuit after 2 successful calls
        this.close();
      }
    }
  }

  /**
   * Handle failed execution
   */
  onFailure() {
    this.failureCount++;
    this.successCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.open();
    } else if (this.failureCount >= this.threshold) {
      this.open();
    }
  }

  /**
   * Open the circuit
   */
  open() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.timeout;
    this.lastStateChange = Date.now();
  }

  /**
   * Close the circuit
   */
  close() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: new Date(this.nextAttempt).toISOString(),
      lastStateChange: new Date(this.lastStateChange).toISOString()
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.close();
  }
}

module.exports = CircuitBreaker;
