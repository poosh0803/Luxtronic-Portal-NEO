(function () {
    const REGION_KEY = 'luxtronic-portal-neo:fuel-region';
    const DEFAULT_REGION = 'NSW';

    const chipsDiv = document.getElementById('region-chips');
    const grid = document.getElementById('fuel-grid');
    const status = document.getElementById('status');
    const updatedLabel = document.getElementById('updated-label');
    const refreshBtn = document.getElementById('refresh-btn');

    let feed = null;
    let region = DEFAULT_REGION;
    try { region = localStorage.getItem(REGION_KEY) || DEFAULT_REGION; } catch {}

    const FUEL_NAMES = {
        U91: 'Unleaded 91',
        E10: 'E10',
        U95: 'Premium 95',
        U98: 'Premium 98',
        Diesel: 'Diesel',
        LPG: 'LPG',
    };

    function setStatus(message, isError) {
        status.textContent = message || '';
        status.hidden = !message;
        status.classList.toggle('error', !!isError);
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function renderChips() {
        chipsDiv.innerHTML = '';
        for (const name of Object.keys(feed.regions)) {
            const btn = el('button', 'chip' + (name === region ? ' active' : ''), name);
            btn.type = 'button';
            btn.addEventListener('click', () => {
                region = name;
                try { localStorage.setItem(REGION_KEY, region); } catch {}
                render();
            });
            chipsDiv.appendChild(btn);
        }
    }

    function stationLine(s) {
        return s.name.toLowerCase().includes(s.suburb.toLowerCase()) ? s.name : `${s.name} · ${s.suburb}`;
    }

    function renderGrid() {
        grid.innerHTML = '';
        const byFuel = feed.regions[region] || {};
        const types = feed.fuelOrder.filter((t) => byFuel[t] && byFuel[t].length);
        if (!types.length) {
            setStatus('No prices for this region.', false);
            return;
        }
        setStatus('');

        for (const type of types) {
            const [best, ...others] = byFuel[type];
            const card = el('article', 'fuel-card');
            card.appendChild(el('div', 'fuel-type', FUEL_NAMES[type] || type));

            const price = el('div', 'fuel-price', best.price.toFixed(1));
            price.appendChild(el('span', 'fuel-unit', '¢/L'));
            card.appendChild(price);
            card.appendChild(el('div', 'fuel-station', stationLine(best)));

            if (others.length) {
                const list = el('ul', 'fuel-others');
                for (const s of others.slice(0, 3)) {
                    const li = el('li');
                    li.appendChild(el('span', 'fuel-other-name', stationLine(s)));
                    li.appendChild(el('span', 'fuel-other-price', s.price.toFixed(1)));
                    list.appendChild(li);
                }
                card.appendChild(list);
            }
            grid.appendChild(card);
        }
    }

    function render() {
        if (!feed.regions[region]) region = feed.regions[DEFAULT_REGION] ? DEFAULT_REGION : Object.keys(feed.regions)[0];
        renderChips();
        renderGrid();
        const when = feed.updated ? new Date(feed.updated) : new Date(feed.updatedAt);
        updatedLabel.textContent = (feed.stale ? 'Source unavailable, showing older data · ' : '') +
            'Prices as of ' + when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }

    async function load(force) {
        refreshBtn.disabled = true;
        if (!feed) setStatus('Loading fuel prices…', false);
        try {
            const res = await fetch('/api/fuel' + (force ? '?refresh=1' : ''));
            if (!res.ok) throw new Error('bad status');
            feed = await res.json();
            render();
        } catch {
            if (!feed) setStatus('Could not load fuel prices right now. Try again in a moment.', true);
        } finally {
            refreshBtn.disabled = false;
        }
    }

    refreshBtn.addEventListener('click', () => load(true));
    load(false);
})();
