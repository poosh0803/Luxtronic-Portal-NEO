(function () {
    // Dark mode toggle (class-based, persisted under "theme").
    const toggle = document.getElementById('darkModeToggle');
    const icon = document.getElementById('themeIcon');
    function syncIcon() {
        const dark = document.documentElement.classList.contains('dark-mode');
        icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
    }
    toggle.addEventListener('click', () => {
        const dark = document.documentElement.classList.toggle('dark-mode');
        try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
        syncIcon();
    });
    syncIcon();
})();
