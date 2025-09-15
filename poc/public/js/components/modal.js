// Modal Component Module
class ModalManager {
  constructor() {
    this.activeModals = new Set();
    this.escKeyHandler = this.handleEscKey.bind(this);
  }

  show(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.error(`Modal with ID '${modalId}' not found`);
      return false;
    }

    // Add to active modals
    this.activeModals.add(modalId);

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('show');

    // Focus management
    this.trapFocus(modal);

    // Add event listeners
    this.addEventListeners(modal);

    // Add ESC key listener if it's the first modal
    if (this.activeModals.size === 1) {
      document.addEventListener('keydown', this.escKeyHandler);
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Emit custom event
    modal.dispatchEvent(new CustomEvent('modal:show', {
      detail: { modalId }
    }));

    return true;
  }

  hide(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal || !this.activeModals.has(modalId)) {
      return false;
    }

    // Remove from active modals
    this.activeModals.delete(modalId);

    // Hide modal with animation
    modal.classList.add('hiding');
    
    setTimeout(() => {
      modal.classList.remove('show', 'hiding');
      modal.classList.add('hidden');
      
      // Restore body scroll if no modals are active
      if (this.activeModals.size === 0) {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', this.escKeyHandler);
      }

      // Remove event listeners
      this.removeEventListeners(modal);

      // Emit custom event
      modal.dispatchEvent(new CustomEvent('modal:hide', {
        detail: { modalId }
      }));
    }, 300);

    return true;
  }

  hideAll() {
    const modalIds = Array.from(this.activeModals);
    modalIds.forEach(id => this.hide(id));
  }

  toggle(modalId) {
    if (this.isVisible(modalId)) {
      return this.hide(modalId);
    } else {
      return this.show(modalId);
    }
  }

  isVisible(modalId) {
    return this.activeModals.has(modalId);
  }

  addEventListeners(modal) {
    // Close button handler
    const closeBtn = modal.querySelector('.btn-close, [data-modal-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', this.handleCloseClick.bind(this, modal));
    }

    // Backdrop click handler
    modal.addEventListener('click', this.handleBackdropClick.bind(this, modal));

    // Prevent modal content clicks from closing modal
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.addEventListener('click', this.handleContentClick);
    }
  }

  removeEventListeners(modal) {
    // Remove all event listeners by cloning the modal
    // This is a simple way to remove all event listeners
    const newModal = modal.cloneNode(true);
    modal.parentNode.replaceChild(newModal, modal);
  }

  handleCloseClick(modal, event) {
    event.preventDefault();
    const modalId = modal.id;
    this.hide(modalId);
  }

  handleBackdropClick(modal, event) {
    if (event.target === modal) {
      const modalId = modal.id;
      this.hide(modalId);
    }
  }

  handleContentClick(event) {
    event.stopPropagation();
  }

  handleEscKey(event) {
    if (event.key === 'Escape' && this.activeModals.size > 0) {
      // Close the most recently opened modal
      const lastModalId = Array.from(this.activeModals).pop();
      this.hide(lastModalId);
    }
  }

  trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element
    firstElement.focus();

    // Add tab trap
    const trapFocus = (event) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    modal.addEventListener('keydown', trapFocus);
    
    // Store trap function for cleanup
    modal._focusTrap = trapFocus;
  }

  // Create dynamic modal
  createModal(id, title, content, options = {}) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal hidden';

    const showClose = options.showClose !== false;
    const size = options.size || 'medium';

    modal.innerHTML = `
      <div class="modal-content modal-${size}">
        <div class="modal-header">
          <h2>${ValidationUtils.escapeHtml(title)}</h2>
          ${showClose ? '<button class="btn-close"><i class="fas fa-times"></i></button>' : ''}
        </div>
        <div class="modal-body">
          ${content}
        </div>
        ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(modal);

    // Show modal if requested
    if (options.show) {
      this.show(id);
    }

    return modal;
  }

  // Remove modal from DOM
  destroyModal(modalId) {
    this.hide(modalId);
    
    setTimeout(() => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.parentNode.removeChild(modal);
      }
    }, 350);
  }

  // Confirm dialog
  confirm(message, title = 'Confirm', options = {}) {
    return new Promise((resolve) => {
      const modalId = `confirm_${Date.now()}`;
      
      const footer = `
        <button class="btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn-primary" data-action="confirm">Confirm</button>
      `;

      const modal = this.createModal(modalId, title, `<p>${ValidationUtils.escapeHtml(message)}</p>`, {
        footer,
        show: true,
        showClose: false
      });

      // Add button handlers
      modal.addEventListener('click', (event) => {
        const action = event.target.dataset.action;
        if (action === 'confirm') {
          resolve(true);
          this.destroyModal(modalId);
        } else if (action === 'cancel') {
          resolve(false);
          this.destroyModal(modalId);
        }
      });

      // Handle ESC as cancel
      modal.addEventListener('modal:hide', () => {
        resolve(false);
      });
    });
  }

  // Alert dialog
  alert(message, title = 'Alert', options = {}) {
    return new Promise((resolve) => {
      const modalId = `alert_${Date.now()}`;
      
      const footer = `
        <button class="btn-primary" data-action="ok">OK</button>
      `;

      const modal = this.createModal(modalId, title, `<p>${ValidationUtils.escapeHtml(message)}</p>`, {
        footer,
        show: true,
        ...options
      });

      // Add button handler
      modal.addEventListener('click', (event) => {
        if (event.target.dataset.action === 'ok') {
          resolve();
          this.destroyModal(modalId);
        }
      });

      // Handle modal close
      modal.addEventListener('modal:hide', () => {
        resolve();
      });
    });
  }
}

// Create global modal manager instance
window.modalManager = new ModalManager();