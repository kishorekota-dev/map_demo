// Intent Display Component Module
class IntentDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentIntent = 'none';
    this.currentConfidence = 0;
    this.intentHistory = [];
    this.maxHistory = 20;
  }

  // Update current intent display
  updateIntent(intent, confidence) {
    this.currentIntent = intent || 'none';
    this.currentConfidence = confidence || 0;

    // Update display elements
    this.updateIntentValue();
    this.updateConfidenceBar();
    
    // Add to history
    this.addToHistory(intent, confidence);

    // Trigger visual feedback
    this.animateUpdate();
  }

  updateIntentValue() {
    const intentElement = document.getElementById('lastIntent');
    if (intentElement) {
      intentElement.textContent = this.currentIntent;
      
      // Add CSS class based on intent type
      intentElement.className = `intent-value intent-${this.currentIntent}`;
    }
  }

  updateConfidenceBar() {
    const confidenceElement = document.getElementById('lastConfidence');
    const confidenceBar = document.getElementById('confidenceBar');
    
    if (confidenceElement) {
      const percentage = Math.round(this.currentConfidence * 100);
      confidenceElement.textContent = `${percentage}%`;
      
      // Add color class based on confidence level
      confidenceElement.className = this.getConfidenceClass(this.currentConfidence);
    }
    
    if (confidenceBar) {
      const percentage = this.currentConfidence * 100;
      confidenceBar.style.width = `${percentage}%`;
      
      // Add smooth transition
      confidenceBar.style.transition = 'width 0.3s ease-in-out';
    }
  }

  getConfidenceClass(confidence) {
    if (confidence >= 0.8) return 'confidence-value confidence-high';
    if (confidence >= 0.5) return 'confidence-value confidence-medium';
    return 'confidence-value confidence-low';
  }

  animateUpdate() {
    if (!this.container) return;

    // Add pulse animation to the entire intent display
    this.container.classList.add('updating');
    
    setTimeout(() => {
      this.container.classList.remove('updating');
    }, 600);
  }

  addToHistory(intent, confidence) {
    const historyItem = {
      intent: intent || 'unknown',
      confidence: confidence || 0,
      timestamp: new Date()
    };

    this.intentHistory.unshift(historyItem);
    
    // Limit history size
    if (this.intentHistory.length > this.maxHistory) {
      this.intentHistory = this.intentHistory.slice(0, this.maxHistory);
    }

    // Update history display
    this.updateHistoryDisplay();
  }

  updateHistoryDisplay() {
    const historyContainer = document.getElementById('chatHistory');
    if (!historyContainer) return;

    const historyItems = this.intentHistory.slice(0, 5); // Show last 5 items
    
    historyContainer.innerHTML = historyItems.map(item => `
      <div class="history-item">
        <div class="history-intent">
          <span class="intent-name">${item.intent}</span>
          <span class="intent-confidence">${Math.round(item.confidence * 100)}%</span>
        </div>
        <div class="history-time">${this.formatHistoryTime(item.timestamp)}</div>
      </div>
    `).join('');
  }

  formatHistoryTime(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    
    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    } else if (diff < 86400000) { // Less than 1 day
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    } else {
      return timestamp.toLocaleDateString();
    }
  }

  // Load available intents from API
  async loadAvailableIntents() {
    try {
      const response = await apiClient.getAvailableIntents();
      
      if (response.success && response.data) {
        this.displayAvailableIntents(response.data.intents);
      }
    } catch (error) {
      console.error('Failed to load available intents:', error);
      toastManager.error('Failed to load intent information');
    }
  }

  displayAvailableIntents(intents) {
    const intentsContainer = document.getElementById('intentsList');
    if (!intentsContainer) return;

    intentsContainer.innerHTML = intents.map(intent => `
      <div class="intent-item-list" data-intent="${intent.name}">
        <div class="intent-info">
          <div class="intent-name">${intent.name}</div>
          <div class="intent-patterns">${intent.keywords.slice(0, 3).join(', ')}</div>
        </div>
        <div class="intent-badge">${intent.patterns.length} patterns</div>
      </div>
    `).join('');

    // Add click handlers for intent items (for testing)
    intentsContainer.addEventListener('click', (event) => {
      const intentItem = event.target.closest('.intent-item-list');
      if (intentItem) {
        const intentName = intentItem.dataset.intent;
        this.onIntentItemClick(intentName);
      }
    });
  }

  onIntentItemClick(intentName) {
    // This could be used to show example messages or test the intent
    const examples = this.getExampleMessages(intentName);
    
    if (examples.length > 0) {
      const randomExample = examples[Math.floor(Math.random() * examples.length)];
      
      // Show suggestion to user
      toastManager.info(`Try saying: "${randomExample}"`, 3000);
    }
  }

  getExampleMessages(intentName) {
    const examples = {
      greeting: ['Hello', 'Hi there', 'Good morning', 'Hey'],
      question: ['What can you do?', 'How does this work?', 'Can you help me?'],
      help: ['I need help', 'Can you assist me?', 'What are your capabilities?'],
      goodbye: ['Goodbye', 'See you later', 'Thanks', 'Bye'],
      affirmation: ['Yes', 'That\'s correct', 'Right', 'Okay'],
      negation: ['No', 'That\'s wrong', 'Not really', 'Nope'],
      complaint: ['This isn\'t working', 'I have a problem', 'Something is broken'],
      compliment: ['Great job', 'You\'re helpful', 'Excellent', 'Well done']
    };
    
    return examples[intentName] || [];
  }

  // Clear history
  clearHistory() {
    this.intentHistory = [];
    this.updateHistoryDisplay();
  }

  // Get statistics
  getStatistics() {
    if (this.intentHistory.length === 0) {
      return {
        totalIntents: 0,
        averageConfidence: 0,
        mostCommonIntent: null,
        confidenceDistribution: {}
      };
    }

    const intentCounts = {};
    let totalConfidence = 0;

    this.intentHistory.forEach(item => {
      intentCounts[item.intent] = (intentCounts[item.intent] || 0) + 1;
      totalConfidence += item.confidence;
    });

    const mostCommonIntent = Object.keys(intentCounts).reduce((a, b) => 
      intentCounts[a] > intentCounts[b] ? a : b
    );

    const averageConfidence = totalConfidence / this.intentHistory.length;

    // Confidence distribution
    const confidenceDistribution = {
      high: this.intentHistory.filter(item => item.confidence >= 0.8).length,
      medium: this.intentHistory.filter(item => item.confidence >= 0.5 && item.confidence < 0.8).length,
      low: this.intentHistory.filter(item => item.confidence < 0.5).length
    };

    return {
      totalIntents: this.intentHistory.length,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      mostCommonIntent,
      intentCounts,
      confidenceDistribution
    };
  }

  // Export history data
  exportHistory() {
    const data = {
      exportDate: new Date().toISOString(),
      intentHistory: this.intentHistory,
      statistics: this.getStatistics()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intent-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
}

// Create global IntentDisplay class
window.IntentDisplay = IntentDisplay;