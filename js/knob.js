/**
 * DJ Mix Web - Knob Controller
 * Interactive rotary knob control
 */

class Knob {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            min: parseFloat(element.dataset.min) || -12,
            max: parseFloat(element.dataset.max) || 12,
            value: parseFloat(element.dataset.value) || 0,
            step: options.step || 0.5,
            sensitivity: options.sensitivity || 0.5,
            onChange: options.onChange || (() => {}),
            ...options
        };

        this.value = this.options.value;
        this.isDragging = false;
        this.startY = 0;
        this.startValue = 0;

        this.init();
    }

    /**
     * Initialize knob
     */
    init() {
        this.updateDisplay();
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.element.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.endDrag());

        // Touch events
        this.element.addEventListener('touchstart', (e) => this.startDrag(e));
        document.addEventListener('touchmove', (e) => this.drag(e));
        document.addEventListener('touchend', () => this.endDrag());

        // Double click to reset
        this.element.addEventListener('dblclick', () => this.reset());

        // Scroll wheel
        this.element.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -this.options.step : this.options.step;
            this.setValue(this.value + delta);
        });
    }

    /**
     * Start dragging
     */
    startDrag(e) {
        e.preventDefault();
        this.isDragging = true;
        this.element.classList.add('active');

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        this.startY = clientY;
        this.startValue = this.value;
    }

    /**
     * Handle dragging
     */
    drag(e) {
        if (!this.isDragging) return;

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = this.startY - clientY;
        const range = this.options.max - this.options.min;
        const deltaValue = (deltaY * this.options.sensitivity * range) / 100;

        this.setValue(this.startValue + deltaValue);
    }

    /**
     * End dragging
     */
    endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.element.classList.remove('active');
    }

    /**
     * Set value
     */
    setValue(value) {
        // Clamp to range
        value = Utils.clamp(value, this.options.min, this.options.max);

        // Round to step
        value = Math.round(value / this.options.step) * this.options.step;

        if (value !== this.value) {
            this.value = value;
            this.updateDisplay();
            this.options.onChange(this.value);
        }
    }

    /**
     * Reset to center (0)
     */
    reset() {
        this.setValue(0);
    }

    /**
     * Update visual display
     */
    updateDisplay() {
        // Calculate rotation angle (-135 to +135 degrees)
        const range = this.options.max - this.options.min;
        const normalized = (this.value - this.options.min) / range;
        const angle = -135 + (normalized * 270);

        // Apply rotation to indicator
        this.element.style.setProperty('--rotation', `${angle}deg`);

        // Update value display if exists
        const valueDisplay = this.element.parentElement?.querySelector('.knob-value');
        if (valueDisplay) {
            valueDisplay.textContent = this.value > 0 ? `+${this.value}` : this.value;
        }
    }

    /**
     * Get current value
     */
    getValue() {
        return this.value;
    }
}

/**
 * Factory function to create knobs from elements
 */
function createKnobs(selector, options = {}) {
    const elements = document.querySelectorAll(selector);
    const knobs = [];

    elements.forEach(element => {
        const knob = new Knob(element, {
            ...options,
            onChange: (value) => {
                if (options.onChange) {
                    options.onChange(element.id, value);
                }
            }
        });
        knobs.push(knob);
    });

    return knobs;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Knob, createKnobs };
}
