# Luxtronic Portal NEO

Internal landing page for Luxtronic: a box-style grid of links to the shop's tools, a notifications feed at the bottom, and fuel / hardware price pages. A small dependency-free Node server, run with pm2 on the LAN server (port 80).

## Pages

- `index.html` - home: link boxes + notifications
- `fuel.html` - cheapest fuel per type and region
- `hw.html` - GPU / RAM / SSD prices from PGrid, with search, filters and sorting

Shared styles: `base.css` (theme, header, boxes), `index.css` (home), `pricepages.css` (fuel + HW). `theme.js` is the dark-mode toggle.

## Running

```
cp .env.example .env     # fill in MASTEX_PRICE_LIST_URL
npm start                # or: pm2 start ecosystem.config.js
```

`PORT` defaults to 80 (see `.env`/`ecosystem.config.js`). Requires Node 18+.

## Notifications

Other LAN services push notifications with `POST /api/notifications` (`source`, `title`, `message`, optional `level` info|warning|error and `url`). The portal stores up to 200 in `data/notifications.json` and the page polls every 20 seconds. `GET /api/notifications` lists them; `DELETE /api/notifications/:id` removes one. Same contract as the original Luxtronic Portal - see the old repo's `API.md`.

## Price feeds

`datafeeds.js` fetches the upstream sources on the server (not in each browser) and caches them:

| Endpoint | Source | Cache |
|---|---|---|
| `GET /api/fuel` | projectzerothree.info | 15 min |
| `GET /api/hw/gpu`, `/ram`, `/ssd` | pgrid.app (HTML table parsed server-side) | 60 min |

Add `?refresh=1` to force a refetch (limited to once a minute). If the source is down the last good copy is served with `"stale": true`.

## Static file safety

Only front-end files are served. `.env`, dotfiles, `data/`, server code and package files return 404.
