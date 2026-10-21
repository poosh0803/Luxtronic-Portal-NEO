(function () {
    const POLL_INTERVAL_MS = 20000;
    const LAST_SEEN_KEY = 'luxtronic-portal-neo:notifications-last-seen';

    const badge = document.getElementById('notif-badge');
    const box = document.getElementById('notif-box');
    const list = document.getElementById('notif-list');
    const empty = document.getElementById('notif-empty');
    const markRead = document.getElementById('notif-mark-read');

    let notifications = [];

    function getLastSeen() {
        try { return Number(localStorage.getItem(LAST_SEEN_KEY) || 0); } catch { return 0; }
    }

    function setLastSeen(timestamp) {
        try { localStorage.setItem(LAST_SEEN_KEY, String(timestamp)); } catch {}
    }

    function formatTime(iso) {
        return new Date(iso).toLocaleString();
    }

    function render() {
        const lastSeen = getLastSeen();
        const isUnread = (n) => new Date(n.createdAt).getTime() > lastSeen;
        const unread = notifications.filter(isUnread).length;

        if (unread > 0) {
            badge.textContent = unread > 99 ? '99+' : String(unread);
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }

        list.innerHTML = '';
        empty.hidden = notifications.length > 0;
        markRead.hidden = unread === 0;

        for (const n of notifications) {
            const li = document.createElement('li');
            li.className = `notif-item notif-${n.level}${isUnread(n) ? ' unread' : ''}`;

            const title = document.createElement('div');
            title.className = 'notif-title';
            title.textContent = n.title;
            li.appendChild(title);

            const message = document.createElement('div');
            message.className = 'notif-message';
            message.textContent = n.message;
            li.appendChild(message);

            const meta = document.createElement('div');
            meta.className = 'notif-meta';
            meta.textContent = `${n.source} • ${formatTime(n.createdAt)}`;
            li.appendChild(meta);

            if (n.url) {
                const link = document.createElement('a');
                link.href = n.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Open';
                link.className = 'notif-link';
                li.appendChild(link);
            }

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'notif-delete';
            del.textContent = '×';
            del.title = 'Delete notification';
            del.setAttribute('aria-label', 'Delete notification');
            del.addEventListener('click', () => deleteNotification(n.id));
            li.appendChild(del);

            list.appendChild(li);
        }
    }

    async function deleteNotification(id) {
        notifications = notifications.filter((n) => n.id !== id);
        render();
        try {
            await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
        } catch {
            // next poll will restore the list if the delete didn't reach the server
        }
    }

    async function fetchNotifications() {
        try {
            const res = await fetch('/api/notifications');
            if (!res.ok) return;
            notifications = await res.json();
            render();
        } catch {
            // LAN hiccup - the next poll will retry
        }
    }

    markRead.addEventListener('click', () => {
        setLastSeen(Date.now());
        render();
    });

    // Opening the portal's notification box (via the header bell) counts as reading.
    document.querySelector('.header-link').addEventListener('click', () => {
        setTimeout(() => { setLastSeen(Date.now()); render(); }, 1500);
    });

    fetchNotifications();
    setInterval(fetchNotifications, POLL_INTERVAL_MS);
})();
