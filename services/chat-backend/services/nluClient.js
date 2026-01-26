/**
 * NLU Service Client
 * Handles communication with the NLU service for intent detection and analysis
 */

const axios = require('axios');
const logger = require('./logger');

class NLUClient {
    constructor() {
        this.serviceUrl = process.env.NLU_SERVICE_URL || 'http://localhost:3003';
        this.timeout = parseInt(process.env.NLU_TIMEOUT) || 10000;
        this.retryAttempts = parseInt(process.env.NLU_RETRY_ATTEMPTS) || 2;
        this.retryDelay = parseInt(process.env.NLU_RETRY_DELAY) || 1000;
        this.fallbackEnabled = process.env.NLU_FALLBACK_ENABLED !== 'false';
        
        // Circuit breaker state
        this.circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.failureThreshold = 5;
        this.resetTimeout = 60000; // 1 minute
        this.lastFailureTime = null;
        
        logger.info('NLU Client initialized', {
            serviceUrl: this.serviceUrl,
            timeout: this.timeout,
            retryAttempts: this.retryAttempts,
            fallbackEnabled: this.fallbackEnabled
        });
    }

    /**
     * Analyze user input using the NLU service
     * Primary method for chat backend integration
     */
    async analyzeUserInput(userInput, sessionId, userId, languageCode = 'en-US') {
        try {
            logger.debug('Analyzing user input via NLU service', {
                inputLength: userInput?.length,
                sessionId,
                userId
            });

            // Check circuit breaker
            if (this.circuitState === 'OPEN') {
                if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                    this.circuitState = 'HALF_OPEN';
                    logger.info('Circuit breaker transitioning to HALF_OPEN');
                } else {
                    logger.warn('Circuit breaker is OPEN, using fallback');
                    return this.getFallbackResponse(userInput, sessionId, userId);
                }
            }

            const response = await this.makeRequest('/api/nlu/analyze', {
                user_input: userInput,
                sessionId: sessionId || 'default-session',
                userId: userId || 'default-user',
                languageCode: languageCode || 'en-US'
            });

            if (response.success) {
                // Reset circuit breaker on success
                this.onSuccess();
                
                logger.info('NLU analysis successful', {
                    intent: response.data?.intent,
                    confidence: response.data?.confidence,
                    sessionId
                });

                return {
                    success: true,
                    intent: response.data?.intent || 'unknown',
                    confidence: response.data?.confidence || 0,
                    dialogflow: response.data?.dialogflow || {},
                    banking: response.data?.banking || {},
                    entities: response.data?.entities || [],
                    metadata: response.data?.metadata || {},
                    source: 'nlu-service'
                };
            } else {
                throw new Error(response.error || 'NLU analysis failed');
            }

        } catch (error) {
            logger.error('Error analyzing user input', {
                error: error.message,
                sessionId,
                userId,
                circuitState: this.circuitState
            });

            this.onFailure(error);

            if (this.fallbackEnabled) {
                return this.getFallbackResponse(userInput, sessionId, userId);
            }

            throw error;
        }
    }

    /**
     * Detect intent from message
     */
    async detectIntent(message, userId, sessionId) {
        try {
            const response = await this.makeRequest('/api/nlu/intents', {
                message,
                userId: userId || 'default-user',
                sessionId: sessionId || 'default-session'
            });

            if (response.success) {
                this.onSuccess();
                return response.data;
            }

            throw new Error(response.error || 'Intent detection failed');

        } catch (error) {
            logger.error('Error detecting intent', { error: error.message });
            this.onFailure(error);

            if (this.fallbackEnabled) {
                return this.getBasicIntentFallback(message);
            }

            throw error;
        }
    }

    /**
     * Detect banking-specific intent
     */
    async detectBankingIntent(message) {
        try {
            const response = await this.makeRequest('/api/nlu/banking', {
                message
            });

            if (response.success) {
                this.onSuccess();
                return response.data;
            }

            throw new Error(response.error || 'Banking intent detection failed');

        } catch (error) {
            logger.error('Error detecting banking intent', { error: error.message });
            this.onFailure(error);

            if (this.fallbackEnabled) {
                return this.getBankingIntentFallback(message);
            }

            throw error;
        }
    }

    /**
     * Extract entities from message
     */
    async extractEntities(message, domain = 'general') {
        try {
            const response = await this.makeRequest('/api/nlu/entities', {
                message,
                domain
            });

            if (response.success) {
                this.onSuccess();
                return response.data;
            }

            throw new Error(response.error || 'Entity extraction failed');

        } catch (error) {
            logger.error('Error extracting entities', { error: error.message });
            this.onFailure(error);
            return [];
        }
    }

    /**
     * Update session context
     */
    async updateContext(sessionId, context) {
        try {
            const response = await this.makeRequest(
                `/api/nlu/context/${sessionId}`,
                { context },
                'POST'
            );

            if (response.success) {
                this.onSuccess();
                return true;
            }

            return false;

        } catch (error) {
            logger.error('Error updating context', { error: error.message, sessionId });
            return false;
        }
    }

    /**
     * Get session context
     */
    async getContext(sessionId) {
        try {
            const response = await this.makeRequest(
                `/api/nlu/context/${sessionId}`,
                null,
                'GET'
            );

            if (response.success) {
                this.onSuccess();
                return response.data;
            }

            return null;

        } catch (error) {
            logger.error('Error getting context', { error: error.message, sessionId });
            return null;
        }
    }

    /**
     * Check NLU service health
     */
    async checkHealth() {
        try {
            const response = await axios.get(`${this.serviceUrl}/health`, {
                timeout: 5000
            });

            return response.status === 200 && response.data?.status === 'healthy';

        } catch (error) {
            logger.warn('NLU service health check failed', { error: error.message });
            return false;
        }
    }

    /**
     * Make HTTP request to NLU service with retry logic
     */
    async makeRequest(endpoint, data = null, method = 'POST') {
        let lastError;

        for (let attempt = 1; attempt <= this.retryAttempts + 1; attempt++) {
            try {
                const config = {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Client': 'poc-chat-backend',
                        'X-Attempt': attempt
                    }
                };

                let response;
                if (method === 'GET') {
                    response = await axios.get(`${this.serviceUrl}${endpoint}`, config);
                } else if (method === 'POST') {
                    response = await axios.post(`${this.serviceUrl}${endpoint}`, data, config);
                } else if (method === 'DELETE') {
                    response = await axios.delete(`${this.serviceUrl}${endpoint}`, config);
                }

                return response.data;

            } catch (error) {
                lastError = error;
                
                logger.warn(`NLU service request failed (attempt ${attempt})`, {
                    endpoint,
                    error: error.message,
                    code: error.code,
                    status: error.response?.status
                });

                // Don't retry on client errors (4xx)
                if (error.response?.status >= 400 && error.response?.status < 500) {
                    throw error;
                }

                // Wait before retry
                if (attempt <= this.retryAttempts) {
                    await this.delay(this.retryDelay * attempt);
                }
            }
        }

        throw lastError;
    }

    /**
     * Handle successful request
     */
    onSuccess() {
        if (this.circuitState === 'HALF_OPEN') {
            this.circuitState = 'CLOSED';
            this.failureCount = 0;
            logger.info('Circuit breaker closed - service recovered');
        } else if (this.circuitState === 'CLOSED' && this.failureCount > 0) {
            this.failureCount = 0;
        }
    }

    /**
     * Handle failed request
     */
    onFailure(error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.circuitState === 'HALF_OPEN') {
            this.circuitState = 'OPEN';
            logger.warn('Circuit breaker opened - service still unavailable');
        } else if (this.failureCount >= this.failureThreshold) {
            this.circuitState = 'OPEN';
            logger.error('Circuit breaker opened - too many failures', {
                failureCount: this.failureCount,
                threshold: this.failureThreshold
            });
        }
    }

    /**
     * Get fallback response when NLU service is unavailable
     */
    getFallbackResponse(userInput, sessionId, userId) {
        logger.warn('Using fallback NLU response', { sessionId, userId });

        // Simple keyword-based intent detection
        const intent = this.detectFallbackIntent(userInput);

        return {
            success: true,
            intent: intent.name,
            confidence: intent.confidence,
            dialogflow: {
                fulfillmentText: intent.response,
                parameters: {},
                languageCode: 'en-US',
                allRequiredParamsPresent: false
            },
            banking: {
                intent: intent.name,
                confidence: intent.confidence,
                entities: []
            },
            entities: [],
            metadata: {
                source: 'fallback',
                sessionId,
                userId,
                timestamp: new Date().toISOString(),
                fallbackReason: 'NLU service unavailable'
            },
            source: 'fallback'
        };
    }

    /**
     * Simple keyword-based intent detection for fallback
     */
    detectFallbackIntent(message) {
        const lowerMessage = message.toLowerCase();

        const intents = [
            {
                name: 'check_balance',
                keywords: ['balance', 'how much', 'account total', 'funds'],
                response: 'I can help you check your account balance. Please wait while I retrieve that information.',
                confidence: 0.6
            },
            {
                name: 'transfer_funds',
                keywords: ['transfer', 'send money', 'pay', 'payment'],
                response: 'I can help you transfer funds. Could you provide more details?',
                confidence: 0.6
            },
            {
                name: 'transaction_history',
                keywords: ['transactions', 'history', 'statement', 'recent activity'],
                response: 'I can show you your recent transactions. Let me fetch that for you.',
                confidence: 0.6
            },
            {
                name: 'card_services',
                keywords: ['card', 'credit', 'debit', 'atm', 'pin'],
                response: 'I can assist with your card services. What would you like to know?',
                confidence: 0.6
            },
            {
                name: 'loan_inquiry',
                keywords: ['loan', 'mortgage', 'borrow', 'credit'],
                response: 'I can provide information about our loan products. What are you interested in?',
                confidence: 0.6
            }
        ];

        for (const intent of intents) {
            if (intent.keywords.some(keyword => lowerMessage.includes(keyword))) {
                return intent;
            }
        }

        return {
            name: 'general_inquiry',
            confidence: 0.4,
            response: 'I understand you need assistance. How can I help you with your banking needs today?'
        };
    }

    /**
     * Get basic intent fallback
     */
    getBasicIntentFallback(message) {
        const intent = this.detectFallbackIntent(message);
        return {
            intent: intent.name,
            confidence: intent.confidence,
            entities: []
        };
    }

    /**
     * Get banking intent fallback
     */
    getBankingIntentFallback(message) {
        const intent = this.detectFallbackIntent(message);
        return {
            intent: intent.name,
            confidence: intent.confidence,
            category: 'general',
            entities: []
        };
    }

    /**
     * Delay helper for retries
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get circuit breaker status
     */
    getStatus() {
        return {
            serviceUrl: this.serviceUrl,
            circuitState: this.circuitState,
            failureCount: this.failureCount,
            failureThreshold: this.failureThreshold,
            lastFailureTime: this.lastFailureTime,
            fallbackEnabled: this.fallbackEnabled
        };
    }
}

// Export singleton instance
module.exports = new NLUClient();
