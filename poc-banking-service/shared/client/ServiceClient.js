const axios = require('axios');
const CircuitBreaker = require('../resilience/CircuitBreaker');
const Logger = require('../logging/Logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Service Client for inter-service communication
 * Handles HTTP calls, retries, circuit breaking, and correlation IDs
 */
class ServiceClient {
  constructor(serviceName, baseURL, options = {}) {
    this.serviceName = serviceName;
    this.baseURL = baseURL;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.logger = Logger.getLogger(`ServiceClient:${serviceName}`);
    
    // Circuit breaker configuration
    this.circuitBreaker = new CircuitBreaker({
      threshold: options.circuitBreakerThreshold || 5,
      timeout: options.circuitBreakerTimeout || 60000,
      resetTimeout: options.circuitBreakerResetTimeout || 30000
    });

    // Axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor for correlation ID
    this.client.interceptors.request.use((config) => {
      config.headers['X-Correlation-ID'] = config.correlationId || uuidv4();
      config.headers['X-Source-Service'] = process.env.SERVICE_NAME || 'unknown';
      this.logger.debug(`Request to ${serviceName}`, {
        method: config.method,
        url: config.url,
        correlationId: config.headers['X-Correlation-ID']
      });
      return config;
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug(`Response from ${serviceName}`, {
          status: response.status,
          correlationId: response.config.headers['X-Correlation-ID']
        });
        return response;
      },
      (error) => {
        this.logger.error(`Error from ${serviceName}`, {
          message: error.message,
          status: error.response?.status,
          correlationId: error.config?.headers['X-Correlation-ID']
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Execute request with circuit breaker and retry logic
   */
  async execute(config) {
    return this.circuitBreaker.execute(async () => {
      return this.executeWithRetry(config);
    });
  }

  /**
   * Execute request with retry logic
   */
  async executeWithRetry(config, attempt = 1) {
    try {
      const response = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (attempt < this.retries && this.isRetryable(error)) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.warn(`Retrying request to ${this.serviceName}`, {
          attempt,
          delay,
          error: error.message
        });
        await this.sleep(delay);
        return this.executeWithRetry(config, attempt + 1);
      }
      throw this.formatError(error);
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    if (!error.response) return true; // Network errors are retryable
    const status = error.response.status;
    return status === 408 || status === 429 || status >= 500;
  }

  /**
   * Format error for consistent error handling
   */
  formatError(error) {
    if (error.response) {
      return {
        service: this.serviceName,
        status: error.response.status,
        message: error.response.data?.message || error.message,
        data: error.response.data,
        correlationId: error.config?.headers['X-Correlation-ID']
      };
    }
    return {
      service: this.serviceName,
      message: error.message,
      correlationId: error.config?.headers['X-Correlation-ID']
    };
  }

  /**
   * Sleep utility for retries
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // HTTP Methods

  async get(path, config = {}) {
    return this.execute({
      method: 'GET',
      url: path,
      ...config
    });
  }

  async post(path, data, config = {}) {
    return this.execute({
      method: 'POST',
      url: path,
      data,
      ...config
    });
  }

  async put(path, data, config = {}) {
    return this.execute({
      method: 'PUT',
      url: path,
      data,
      ...config
    });
  }

  async patch(path, data, config = {}) {
    return this.execute({
      method: 'PATCH',
      url: path,
      data,
      ...config
    });
  }

  async delete(path, config = {}) {
    return this.execute({
      method: 'DELETE',
      url: path,
      ...config
    });
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return {
        service: this.serviceName,
        status: 'healthy',
        data: response.data
      };
    } catch (error) {
      return {
        service: this.serviceName,
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = ServiceClient;
