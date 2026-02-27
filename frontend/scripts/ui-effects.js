// ui-effects.js
document.addEventListener('DOMContentLoaded', () => {
    // Radial gradient follows cursor
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // Calculate cursor position relative to the card as percentage
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            card.style.setProperty('--cursor-x', `${x}%`);
            card.style.setProperty('--cursor-y', `${y}%`);
        });
    });
});
