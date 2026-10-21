(function () {
    const CATEGORY_KEY = 'luxtronic-portal-neo:hw-category';
    const ROW_LIMIT = 200;

    // Quick filter groups per category. Each group builds its chips from the
    // distinct values `get(row)` returns.
    const capacityGb = (text) => {
        const m = /^(\d+(?:\.\d+)?)\s*(TB|GB)/i.exec(text || '');
        return m ? parseFloat(m[1]) * (m[2].toUpperCase() === 'TB' ? 1000 : 1) : null;
    };
    const CATEGORIES = {
        gpu: {
            label: 'GPU',
            filters: [{ name: 'Brand', get: (r) => r.cells[0].split(' ')[0] }],
        },
        ram: {
            label: 'RAM',
            filters: [
                { name: 'Type', get: (r) => r.cells[4] },
                { name: 'Size', get: (r) => { const g = capacityGb(r.cells[1]); return g ? g + 'GB' : null; }, numeric: true },
            ],
        },
        ssd: {
            label: 'SSD',
            filters: [
                { name: 'Size', get: (r) => r.cells[1], numeric: true },
                { name: 'Type', get: (r) => (/SATA/i.test(r.cells[5]) ? 'SATA' : /PCIe|NVMe/i.test(r.cells[5]) ? 'NVMe' : null) },
            ],
        },
    };

    const state = {
        category: 'gpu',
        search: '',
        selected: {},        // filter name -> chosen value
        sortCol: null,
        sortDir: 1,
        data: {},            // category -> feed
    };
    try {
        const saved = localStorage.getItem(CATEGORY_KEY);
        if (CATEGORIES[saved]) state.category = saved;
    } catch {}

    const tabsDiv = document.getElementById('tabs');
    const filtersDiv = document.getElementById('filters');
    const tableDiv = document.getElementById('hw-table');
    const statusEl = document.getElementById('status');
    const countLabel = document.getElementById('count-label');
    const updatedLabel = document.getElementById('updated-label');
    const refreshBtn = document.getElementById('refresh-btn');
    const searchInput = document.getElementById('search-input');

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function setStatus(message, isError) {
        statusEl.textContent = message || '';
        statusEl.hidden = !message;
        statusEl.classList.toggle('error', !!isError);
    }

    function numeric(text) {
        const t = String(text || '').replace(/,/g, '');
        const m = /(-?\d+(?:\.\d+)?)\s*(TB|GB)?/i.exec(t);
        if (!m) return null;
        let v = parseFloat(m[1]);
        if (m[2] && m[2].toUpperCase() === 'TB') v *= 1000;
        return v;
    }

    function renderTabs() {
        tabsDiv.innerHTML = '';
        for (const key of Object.keys(CATEGORIES)) {
            const btn = el('button', 'chip' + (key === state.category ? ' active' : ''), CATEGORIES[key].label);
            btn.type = 'button';
            btn.addEventListener('click', () => selectCategory(key));
            tabsDiv.appendChild(btn);
        }
    }

    function renderFilters(feed) {
        filtersDiv.innerHTML = '';
        for (const f of CATEGORIES[state.category].filters) {
            const values = [...new Set(feed.rows.map(f.get).filter(Boolean))];
            if (values.length < 2) continue;
            values.sort(f.numeric ? (a, b) => numeric(a) - numeric(b) : undefined);

            const row = el('div', 'filter-row');
            row.appendChild(el('span', 'filter-name', f.name));
            const chips = el('div', 'chips small');
            for (const value of [null, ...values]) {
                const active = (state.selected[f.name] || null) === value;
                const btn = el('button', 'chip' + (active ? ' active' : ''), value || 'All');
                btn.type = 'button';
                btn.addEventListener('click', () => {
                    state.selected[f.name] = value;
                    render();
                });
                chips.appendChild(btn);
            }
            row.appendChild(chips);
            filtersDiv.appendChild(row);
        }
    }

    function visibleRows(feed) {
        const query = state.search.trim().toLowerCase();
        const filters = CATEGORIES[state.category].filters;
        let rows = feed.rows.filter((r) => {
            if (query && !(r.cells.join(' ') + ' ' + (r.group || '')).toLowerCase().includes(query)) return false;
            return filters.every((f) => !state.selected[f.name] || f.get(r) === state.selected[f.name]);
        });

        const col = state.sortCol === null ? feed.priceIdx : state.sortCol;
        const dir = state.sortCol === null ? 1 : state.sortDir;
        rows = [...rows].sort((a, b) => {
            const na = numeric(a.cells[col]);
            const nb = numeric(b.cells[col]);
            if (na !== null && nb !== null) return (na - nb) * dir;
            if (na !== null) return -1;
            if (nb !== null) return 1;
            return a.cells[col].localeCompare(b.cells[col]) * dir;
        });
        return rows;
    }

    function renderTable(feed) {
        const rows = visibleRows(feed);
        tableDiv.innerHTML = '';
        if (!rows.length) {
            setStatus('No results.', false);
            countLabel.textContent = '';
            return;
        }
        setStatus('');
        countLabel.textContent = rows.length > ROW_LIMIT
            ? `Showing the first ${ROW_LIMIT} of ${rows.length} — search or use the filters to narrow down`
            : `${rows.length} item${rows.length === 1 ? '' : 's'}`;

        const table = el('table');
        const headRow = el('tr');
        const activeCol = state.sortCol === null ? feed.priceIdx : state.sortCol;
        const activeDir = state.sortCol === null ? 1 : state.sortDir;
        feed.headers.forEach((h, i) => {
            const th = el('th', i === feed.priceIdx ? 'price-col' : '');
            const btn = el('button', 'sort-btn', h + (i === activeCol ? (activeDir === 1 ? ' ▲' : ' ▼') : ''));
            btn.type = 'button';
            btn.addEventListener('click', () => {
                if (activeCol === i) {
                    state.sortCol = i;
                    state.sortDir = -activeDir;
                } else {
                    state.sortCol = i;
                    state.sortDir = 1;
                }
                render();
            });
            th.appendChild(btn);
            headRow.appendChild(th);
        });
        const thead = el('thead');
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = el('tbody');
        for (const row of rows.slice(0, ROW_LIMIT)) {
            const tr = el('tr');
            row.cells.forEach((value, i) => {
                const td = el('td', i === feed.priceIdx ? 'price-col' : '');
                if (i === 0 && row.href) {
                    const a = el('a', '', value);
                    a.href = row.href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    td.appendChild(a);
                } else {
                    td.textContent = value;
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        tableDiv.appendChild(table);
    }

    function render() {
        renderTabs();
        const feed = state.data[state.category];
        if (!feed) return;
        renderFilters(feed);
        renderTable(feed);
        updatedLabel.textContent = (feed.stale ? 'Source unavailable, showing older data · ' : '') +
            'Updated ' + new Date(feed.updatedAt).toLocaleTimeString([], { timeStyle: 'short' });
    }

    async function load(category, force) {
        refreshBtn.disabled = true;
        if (!state.data[category]) {
            tableDiv.innerHTML = '';
            countLabel.textContent = '';
            setStatus('Loading ' + CATEGORIES[category].label + ' prices…', false);
        }
        try {
            const res = await fetch('/api/hw/' + category + (force ? '?refresh=1' : ''));
            if (!res.ok) throw new Error('bad status');
            state.data[category] = await res.json();
            if (state.category === category) render();
        } catch {
            if (state.category === category && !state.data[category]) {
                setStatus('Could not load ' + CATEGORIES[category].label + ' prices right now. Try again in a moment.', true);
            }
        } finally {
            refreshBtn.disabled = false;
        }
    }

    function selectCategory(key) {
        state.category = key;
        state.selected = {};
        state.sortCol = null;
        state.sortDir = 1;
        try { localStorage.setItem(CATEGORY_KEY, key); } catch {}
        renderTabs();
        filtersDiv.innerHTML = '';
        if (state.data[key]) render();
        load(key, false);
    }

    refreshBtn.addEventListener('click', () => load(state.category, true));
    searchInput.addEventListener('input', () => {
        state.search = searchInput.value;
        if (state.data[state.category]) renderTable(state.data[state.category]);
    });

    renderTabs();
    load(state.category, false);
})();
