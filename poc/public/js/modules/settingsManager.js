// Settings Manager Module
class SettingsManager {
  constructor() {
    this.defaultSettings = {
      confidenceThreshold: 0.7,
      enableSound: true,
      showIntentInfo: true,
      theme: 'light',
      enableNotifications: false,
      autoScroll: true,
      typingAnimation: true,
      showTimestamps: true
    };
    
    this.currentSettings = { ...this.defaultSettings };
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEventListeners();
    this.applySettings();
  }

  setupEventListeners() {
    // Settings modal toggle
    const settingsButton = document.getElementById('toggleSettings');
    if (settingsButton) {
      settingsButton.addEventListener('click', () => {
        this.openSettingsModal();
      });
    }

    // Settings modal handlers
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
      // Close settings modal
      const closeButton = document.getElementById('closeSettings');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          modalManager.hide('settingsModal');
        });
      }

      // Save settings
      const saveButton = document.getElementById('saveSettings');
      if (saveButton) {
        saveButton.addEventListener('click', () => {
          this.saveSettings();
        });
      }

      // Reset settings
      const resetButton = document.getElementById('resetSettings');
      if (resetButton) {
        resetButton.addEventListener('click', () => {
          this.resetSettings();
        });
      }

      // Real-time updates for range inputs
      const thresholdSlider = document.getElementById('confidenceThreshold');
      if (thresholdSlider) {
        thresholdSlider.addEventListener('input', (event) => {
          this.updateThresholdDisplay(event.target.value);
        });
      }
    }
  }

  openSettingsModal() {
    this.populateSettingsForm();
    modalManager.show('settingsModal');
  }

  populateSettingsForm() {
    // Confidence threshold
    const thresholdSlider = document.getElementById('confidenceThreshold');
    const thresholdValue = document.getElementById('thresholdValue');
    if (thresholdSlider && thresholdValue) {
      thresholdSlider.value = this.currentSettings.confidenceThreshold;
      thresholdValue.textContent = this.currentSettings.confidenceThreshold;
    }

    // Enable sound
    const enableSoundCheckbox = document.getElementById('enableSound');
    if (enableSoundCheckbox) {
      enableSoundCheckbox.checked = this.currentSettings.enableSound;
    }

    // Show intent info
    const showIntentInfoCheckbox = document.getElementById('showIntentInfo');
    if (showIntentInfoCheckbox) {
      showIntentInfoCheckbox.checked = this.currentSettings.showIntentInfo;
    }
  }

  updateThresholdDisplay(value) {
    const thresholdValue = document.getElementById('thresholdValue');
    if (thresholdValue) {
      thresholdValue.textContent = value;
    }
  }

  saveSettings() {
    try {
      // Get values from form
      const thresholdSlider = document.getElementById('confidenceThreshold');
      const enableSoundCheckbox = document.getElementById('enableSound');
      const showIntentInfoCheckbox = document.getElementById('showIntentInfo');

      const newSettings = {
        ...this.currentSettings,
        confidenceThreshold: parseFloat(thresholdSlider?.value || this.defaultSettings.confidenceThreshold),
        enableSound: enableSoundCheckbox?.checked || this.defaultSettings.enableSound,
        showIntentInfo: showIntentInfoCheckbox?.checked || this.defaultSettings.showIntentInfo
      };

      // Validate settings
      const validation = this.validateSettings(newSettings);
      if (!validation.isValid) {
        toastManager.error(validation.errors[0]);
        return;
      }

      // Apply new settings
      this.currentSettings = newSettings;
      this.applySettings();
      
      // Save to storage
      storageManager.saveSettings(this.currentSettings);
      
      // Close modal
      modalManager.hide('settingsModal');
      
      toastManager.success('Settings saved successfully');

    } catch (error) {
      console.error('Failed to save settings:', error);
      toastManager.error('Failed to save settings. Please try again.');
    }
  }

  resetSettings() {
    modalManager.confirm(
      'Are you sure you want to reset all settings to their default values?',
      'Reset Settings'
    ).then((confirmed) => {
      if (confirmed) {
        this.currentSettings = { ...this.defaultSettings };
        this.applySettings();
        this.populateSettingsForm();
        storageManager.saveSettings(this.currentSettings);
        toastManager.success('Settings reset to defaults');
      }
    });
  }

  validateSettings(settings) {
    const errors = [];

    // Validate confidence threshold
    const thresholdValidation = ValidationUtils.validateConfidenceThreshold(settings.confidenceThreshold);
    if (!thresholdValidation.isValid) {
      errors.push(thresholdValidation.error);
    }

    // Validate boolean settings
    if (typeof settings.enableSound !== 'boolean') {
      errors.push('Enable sound setting must be a boolean value');
    }

    if (typeof settings.showIntentInfo !== 'boolean') {
      errors.push('Show intent info setting must be a boolean value');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  applySettings() {
    // Apply confidence threshold to API client
    if (window.apiClient) {
      // This would require API support for dynamic threshold changes
      console.log('Confidence threshold set to:', this.currentSettings.confidenceThreshold);
    }

    // Apply theme
    this.applyTheme(this.currentSettings.theme);

    // Update intent display settings
    if (window.intentDisplay) {
      // Intent display will check settings when rendering
    }

    // Apply sound settings
    this.applySoundSettings(this.currentSettings.enableSound);

    // Apply other visual settings
    this.applyVisualSettings();
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Add theme-specific classes
    document.body.className = document.body.className
      .replace(/theme-\w+/g, '')
      .trim();
    
    if (theme !== 'light') {
      document.body.classList.add(`theme-${theme}`);
    }
  }

  applySoundSettings(enableSound) {
    // Store sound preference for use in other components
    window.audioEnabled = enableSound;
    
    if (enableSound) {
      // Preload notification sounds (if any)
      this.preloadSounds();
    }
  }

  preloadSounds() {
    // Create audio elements for notification sounds
    if (!this.sounds) {
      this.sounds = {
        notification: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBB+G0O7CaiMEJ4TM6dOSQwwOUrjn5K9MFAVL'),
        error: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBB+G0O7CaiMEJ4TM6dOSQwwOUrjn5K9MFAVL'),
        success: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBB+G0O7CaiMEJ4TM6dOSQwwOUrjn5K9MFAVL')
      };
    }
  }

  applyVisualSettings() {
    // Apply auto-scroll setting
    if (window.chatManager) {
      window.chatManager.autoScroll = this.currentSettings.autoScroll;
    }

    // Apply timestamp visibility
    const timestampElements = document.querySelectorAll('.message-time');
    timestampElements.forEach(element => {
      element.style.display = this.currentSettings.showTimestamps ? 'inline' : 'none';
    });
  }

  loadSettings() {
    const savedSettings = storageManager.getSettings();
    this.currentSettings = { ...this.defaultSettings, ...savedSettings };
  }

  // Play notification sound
  playSound(type = 'notification') {
    if (!this.currentSettings.enableSound || !this.sounds) {
      return;
    }

    const sound = this.sounds[type];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(error => {
        console.warn('Failed to play notification sound:', error);
      });
    }
  }

  // Get current settings
  getSettings() {
    return { ...this.currentSettings };
  }

  // Update specific setting
  updateSetting(key, value) {
    if (this.defaultSettings.hasOwnProperty(key)) {
      this.currentSettings[key] = value;
      this.applySettings();
      storageManager.saveSettings(this.currentSettings);
      return true;
    }
    return false;
  }

  // Export settings
  exportSettings() {
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      settings: this.currentSettings
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatbot-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    toastManager.success('Settings exported successfully');
  }

  // Import settings
  importSettings(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const importData = JSON.parse(event.target.result);
          
          if (importData.settings) {
            const validation = this.validateSettings(importData.settings);
            
            if (validation.isValid) {
              this.currentSettings = { ...this.defaultSettings, ...importData.settings };
              this.applySettings();
              storageManager.saveSettings(this.currentSettings);
              
              toastManager.success('Settings imported successfully');
              resolve(this.currentSettings);
            } else {
              throw new Error(validation.errors[0]);
            }
          } else {
            throw new Error('Invalid settings file format');
          }
        } catch (error) {
          toastManager.error(`Failed to import settings: ${error.message}`);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        const error = new Error('Failed to read settings file');
        toastManager.error(error.message);
        reject(error);
      };
      
      reader.readAsText(file);
    });
  }
}

// Create global SettingsManager instance
window.SettingsManager = SettingsManager;