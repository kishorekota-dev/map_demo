const { MemorySaver } = require('@langchain/langgraph');
const logger = require('./logger');
const config = require('../../config');

/**
 * LangGraph Checkpointer Setup
 * Provides memory persistence for workflow state across invocations
 * 
 * Uses sessionId as thread_id for conversation continuity
 */
class CheckpointerManager {
  constructor() {
    this.enabled = config.workflow?.checkpointEnabled !== false;
    
    if (this.enabled) {
      // Initialize MemorySaver for in-memory state persistence
      // For production, consider using SqliteSaver or PostgresSaver
      this.checkpointer = new MemorySaver();
      logger.info('Checkpointer initialized with MemorySaver');
    } else {
      this.checkpointer = null;
      logger.info('Checkpointer disabled');
    }
  }

  /**
   * Get checkpointer instance
   */
  getCheckpointer() {
    if (!this.enabled) {
      logger.warn('Checkpointer is disabled');
      return null;
    }
    return this.checkpointer;
  }

  /**
   * Check if checkpointer is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get checkpoint for a specific thread (session)
   */
  async getCheckpoint(threadId) {
    if (!this.enabled || !this.checkpointer) {
      return null;
    }

    try {
      const checkpoint = await this.checkpointer.get({
        configurable: { thread_id: threadId }
      });
      
      logger.debug('Retrieved checkpoint', {
        threadId,
        hasCheckpoint: !!checkpoint
      });

      return checkpoint;
    } catch (error) {
      logger.error('Failed to get checkpoint', {
        threadId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Clear checkpoint for a specific thread (session)
   */
  async clearCheckpoint(threadId) {
    if (!this.enabled || !this.checkpointer) {
      return;
    }

    try {
      // MemorySaver doesn't have a direct clear method
      // State will be cleared when the process restarts
      logger.info('Checkpoint clear requested', { threadId });
    } catch (error) {
      logger.error('Failed to clear checkpoint', {
        threadId,
        error: error.message
      });
    }
  }

  /**
   * Get all checkpoint history for a thread
   */
  async getCheckpointHistory(threadId, limit = 10) {
    if (!this.enabled || !this.checkpointer) {
      return [];
    }

    try {
      // Note: MemorySaver may not support history listing
      // This is a placeholder for future implementation with SqliteSaver
      logger.debug('Checkpoint history requested', { threadId, limit });
      return [];
    } catch (error) {
      logger.error('Failed to get checkpoint history', {
        threadId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get statistics about checkpointer usage
   */
  getStats() {
    return {
      enabled: this.enabled,
      type: 'MemorySaver',
      // Add more stats as needed
    };
  }
}

// Singleton instance
let checkpointerInstance = null;

/**
 * Get or create checkpointer instance
 */
function getCheckpointer() {
  if (!checkpointerInstance) {
    checkpointerInstance = new CheckpointerManager();
  }
  return checkpointerInstance;
}

module.exports = {
  CheckpointerManager,
  getCheckpointer
};
