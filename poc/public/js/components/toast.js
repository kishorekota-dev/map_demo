// Toast Component Module
class ToastManager {
  constructor() {
    this.toasts = new Map();
    this.defaultDuration = 5000;
    this.maxToasts = 3;
  }

  show(message, type = 'info', duration = this.defaultDuration, options = {}) {
    const toastId = this.generateId();
    
    // Remove oldest toast if we have too many
    if (this.toasts.size >= this.maxToasts) {
      const oldestId = this.toasts.keys().next().value;
      this.hide(oldestId);
    }

    const toastElement = this.createToastElement(toastId, message, type, options);
    document.body.appendChild(toastElement);

    // Add to tracking
    this.toasts.set(toastId, {
      element: toastElement,
      timeout: null,
      type,
      message,
      duration
    });

    // Animate in
    requestAnimationFrame(() => {
      toastElement.classList.add('show');
    });

    // Auto-hide after duration
    if (duration > 0) {
      const timeout = setTimeout(() => {
        this.hide(toastId);
      }, duration);
      
      this.toasts.get(toastId).timeout = timeout;
    }

    return toastId;
  }

  hide(toastId) {
    const toast = this.toasts.get(toastId);
    if (!toast) return;

    // Clear timeout
    if (toast.timeout) {
      clearTimeout(toast.timeout);
    }

    // Animate out
    toast.element.classList.add('hiding');
    
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(toastId);
    }, 300);
  }

  hideAll() {
    const toastIds = Array.from(this.toasts.keys());
    toastIds.forEach(id => this.hide(id));
  }

  createToastElement(id, message, type, options) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.toastId = id;

    const icon = this.getIcon(type);
    const closeButton = options.showClose !== false;

    toast.innerHTML = `
      <div class="toast-content">
        <i class="${icon}"></i>
        <span>${ValidationUtils.escapeHtml(message)}</span>
      </div>
      ${closeButton ? '<button class="toast-close"><i class="fas fa-times"></i></button>' : ''}
    `;

    // Add click handler for close button
    if (closeButton) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => {
        this.hide(id);
      });
    }

    // Add click handler for entire toast (optional)
    if (options.clickToClose) {
      toast.addEventListener('click', () => {
        this.hide(id);
      });
    }

    // Add hover pause functionality
    if (options.pauseOnHover !== false) {
      const toastData = this.toasts.get(id) || { timeout: null };
      
      toast.addEventListener('mouseenter', () => {
        if (toastData.timeout) {
          clearTimeout(toastData.timeout);
          toastData.timeout = null;
        }
      });

      toast.addEventListener('mouseleave', () => {
        if (toastData.duration > 0) {
          toastData.timeout = setTimeout(() => {
            this.hide(id);
          }, 1000); // Resume with shorter delay
        }
      });
    }

    return toast;
  }

  getIcon(type) {
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-triangle',
      warning: 'fas fa-exclamation-circle',
      info: 'fas fa-info-circle'
    };
    return icons[type] || icons.info;
  }

  generateId() {
    return `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Convenience methods
  success(message, duration, options) {
    return this.show(message, 'success', duration, options);
  }

  error(message, duration, options) {
    return this.show(message, 'error', duration, options);
  }

  warning(message, duration, options) {
    return this.show(message, 'warning', duration, options);
  }

  info(message, duration, options) {
    return this.show(message, 'info', duration, options);
  }

  // Update existing toast
  update(toastId, message, type) {
    const toast = this.toasts.get(toastId);
    if (!toast) return false;

    const messageElement = toast.element.querySelector('.toast-content span');
    const iconElement = toast.element.querySelector('.toast-content i');
    
    if (messageElement) {
      messageElement.textContent = message;
    }
    
    if (iconElement && type) {
      iconElement.className = this.getIcon(type);
      toast.element.className = `toast toast-${type}`;
    }

    return true;
  }

  // Get active toasts count
  getActiveCount() {
    return this.toasts.size;
  }

  // Check if toast exists
  exists(toastId) {
    return this.toasts.has(toastId);
  }
}

// Create global toast manager instance
window.toastManager = new ToastManager();