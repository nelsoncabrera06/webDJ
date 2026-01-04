/**
 * DJ Mix Web - Utility Functions
 */

const Utils = {
    /**
     * Format time in seconds to MM:SS format
     */
    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Clamp a value between min and max
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * Linear interpolation
     */
    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    /**
     * Map a value from one range to another
     */
    mapRange(value, inMin, inMax, outMin, outMax) {
        return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Convert decibels to linear gain
     */
    dbToGain(db) {
        return Math.pow(10, db / 20);
    },

    /**
     * Convert linear gain to decibels
     */
    gainToDb(gain) {
        return 20 * Math.log10(gain);
    },

    /**
     * Calculate crossfade gains (equal power)
     */
    crossfadeGains(position) {
        // position: 0 = full A, 0.5 = center, 1 = full B
        const angleA = (1 - position) * Math.PI / 2;
        const angleB = position * Math.PI / 2;
        return {
            gainA: Math.cos(angleB),
            gainB: Math.cos(angleA)
        };
    },

    /**
     * Generate a unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Deep clone an object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Check if file is audio
     */
    isAudioFile(file) {
        const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/mp4'];
        return audioTypes.includes(file.type) ||
               file.name.match(/\.(mp3|wav|ogg|aac|flac|m4a)$/i);
    },

    /**
     * Get file name without extension
     */
    getFileNameWithoutExt(filename) {
        return filename.replace(/\.[^/.]+$/, '');
    },

    /**
     * Event emitter mixin
     */
    createEventEmitter() {
        const events = {};
        return {
            on(event, callback) {
                if (!events[event]) events[event] = [];
                events[event].push(callback);
                return () => this.off(event, callback);
            },
            off(event, callback) {
                if (!events[event]) return;
                events[event] = events[event].filter(cb => cb !== callback);
            },
            emit(event, ...args) {
                if (!events[event]) return;
                events[event].forEach(callback => callback(...args));
            },
            once(event, callback) {
                const unsubscribe = this.on(event, (...args) => {
                    unsubscribe();
                    callback(...args);
                });
            }
        };
    },

    /**
     * Request animation frame with throttle
     */
    createAnimationLoop(callback, fps = 60) {
        let lastTime = 0;
        const interval = 1000 / fps;
        let animationId = null;
        let running = false;

        function loop(currentTime) {
            if (!running) return;
            animationId = requestAnimationFrame(loop);

            const deltaTime = currentTime - lastTime;
            if (deltaTime >= interval) {
                lastTime = currentTime - (deltaTime % interval);
                callback(currentTime, deltaTime);
            }
        }

        return {
            start() {
                if (running) return;
                running = true;
                lastTime = performance.now();
                animationId = requestAnimationFrame(loop);
            },
            stop() {
                running = false;
                if (animationId) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
            },
            isRunning() {
                return running;
            }
        };
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
