/**
 * ui-effects.js
 * Visual enhancements and interactive components.
 */

class LogoAnimator {
    constructor(id, frameCount, frameRate = 24) {
        this.element = document.getElementById(id);
        if (!this.element) return;

        this.frameCount = frameCount;
        this.frameRate = frameRate;
        this.currentFrame = 1;
        this.interval = 1000 / this.frameRate;
        this.lastTime = 0;
        this.isRunning = false;

        // Optional: Preload first frame to avoid initial flicker
        this.element.src = `/assets/logo-frames/1.jpg`;

        this.init();
    }

    init() {
        this.isRunning = true;
        requestAnimationFrame(this.animate.bind(this));
    }

    animate(timestamp) {
        if (!this.isRunning) return;

        if (!this.lastTime) this.lastTime = timestamp;
        const delta = timestamp - this.lastTime;

        if (delta >= this.interval) {
            this.currentFrame = (this.currentFrame % this.frameCount) + 1;
            this.element.src = `/assets/logo-frames/${this.currentFrame}.jpg`;
            this.lastTime = timestamp;
        }

        requestAnimationFrame(this.animate.bind(this));
    }

    stop() {
        this.isRunning = false;
    }
}

class DropdownManager {
    constructor(id) {
        this.dropdown = document.getElementById(id);
        if (!this.dropdown) return;

        this.trigger = this.dropdown.querySelector('.dropdown-trigger');
        this.content = this.dropdown.querySelector('.dropdown-content');
        this.hiddenInput = this.dropdown.querySelector('input[type="hidden"]');
        this.items = this.dropdown.querySelectorAll('.dropdown-item');
        this.label = this.dropdown.querySelector('#selected-lang-text');

        this.init();
    }

    init() {
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        this.items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(item);
                this.close();
            });
        });

        document.addEventListener('click', () => this.close());
    }

    toggle() {
        const isHidden = this.content.classList.contains('hidden');
        if (isHidden) {
            this.open();
        } else {
            this.close();
        }
    }

    open() {
        this.content.classList.remove('hidden');
        this.trigger.setAttribute('aria-expanded', 'true');
    }

    close() {
        this.content.classList.add('hidden');
        this.trigger.setAttribute('aria-expanded', 'false');
    }

    select(item) {
        const val = item.getAttribute('data-value');
        this.hiddenInput.value = val;

        // Update label text based on data-i18n or text
        const itemLabel = item.querySelector('[data-i18n]');
        if (itemLabel) {
            this.label.setAttribute('data-i18n', itemLabel.getAttribute('data-i18n'));
            this.label.innerText = itemLabel.innerText;
        }

        this.items.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        // Trigger change event on hidden input for compatibility with job-queue.js
        this.hiddenInput.dispatchEvent(new Event('change'));
    }

    setValue(val) {
        const item = Array.from(this.items).find(i => i.getAttribute('data-value') === val);
        if (item) this.select(item);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Reveal animation for cards on mouse move (existing pattern in aura design)
    document.querySelectorAll('.card.interactive, .radio-card.interactive').forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            card.style.setProperty('--cursor-x', `${x}%`);
            card.style.setProperty('--cursor-y', `${y}%`);
        });
    });

    // Initialize custom dropdowns
    window.audioLangDropdown = new DropdownManager('audio-lang-dropdown');

    // Initialize Logo Animation (480 frames)
    window.logoAnimator = new LogoAnimator('app-logo', 480, 24);
});
