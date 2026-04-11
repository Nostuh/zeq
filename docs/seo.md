# SEO

Zorky's is positioned as the canonical online reinc planner for
[ZombieMUD](http://zombiemud.org/). SEO is layered so crawlers and
screen readers see rich semantic content without cluttering the actual
UI.

## Targeted keywords

Primary: `ZombieMUD`, `zombiemud.org`, `zombie mud`, `reinc planner`,
`reinc calculator`, `Zcreator`, `MUD character builder`, `text mud
character planner`.

Long tail: `ZombieMUD races`, `ZombieMUD guilds`, `ZombieMUD subguilds`,
`ZombieMUD skills`, `ZombieMUD spells`, `ZombieMUD wishes`,
`ZombieMUD boons`, `ZombieMUD reincarnation`.

Avoid generic zombie keywords — those bring the wrong traffic.

## Layer 1: meta tags ([www/src/index.html](../www/src/index.html))

- Page `<title>` — 60-char ZombieMUD + Reinc Planner phrase.
- `<meta name="description">` — 155-char sentence describing the tool
  and what it plans (races, guilds, subguilds, skills, spells, wishes,
  boons, XP).
- `<meta name="keywords">` — historical; Google ignores but Bing and
  DuckDuckGo weight it slightly.
- `<meta name="robots" content="index, follow, max-snippet:-1, ...">`
  plus explicit `googlebot` tag.
- `<link rel="canonical" href="https://nostuh.com/">` — avoids any
  `www`/trailing-slash duplication.
- Open Graph (`og:*`) tags for Facebook / Discord / LinkedIn previews.
- Twitter Card tags for X previews.

## Layer 2: JSON-LD structured data ([www/src/index.html](../www/src/index.html))

A `<script type="application/ld+json">` block in `<head>` declares:

- **`WebApplication`** — this planner, `applicationCategory: GameApplication`,
  `applicationSubCategory: Character Planner`, `isAccessibleForFree: true`,
  `offers: { price: 0 }`, and `about` → the VideoGame node below.
- **`VideoGame`** — ZombieMUD, `@id: https://zombiemud.org/#game`,
  `genre: [MUD, Text-based MMORPG, Role-playing]`, `playMode: MultiPlayer`,
  `gamePlatform: Telnet/SSH`. This is the explicit link Google uses to
  associate Zorky's with the game.
- **`WebSite`** — the site entity with publisher info.

Validate with Google's [Rich Results Test](https://search.google.com/test/rich-results)
after any change.

## Layer 3: visually-hidden semantic content ([www/src/App.vue](../www/src/App.vue))

The first child of the ready-rendered root is a `<div class="visually-hidden">`
containing:

- A proper `<h1>` naming the tool + ZombieMUD.
- A paragraph describing what the tool does, linking to
  `http://zombiemud.org/`.
- A second paragraph packed with keyword variants.
- An `<h2>Supported data` with a bulleted list of races, guilds, and
  data categories — this surfaces the long-tail terms.
- A final paragraph linking to the live planner and to zombiemud.org.

**Use Bootstrap's `.visually-hidden`** (clip-path + absolute-positioned
1px element). Do NOT use `display: none` or `visibility: hidden` —
search engines penalise those because they're associated with cloaking.
`.visually-hidden` is the standards-compliant accessibility pattern and
is treated the same as visible content.

`aria-hidden="false"` is set explicitly so screen readers still announce
the block.

## Layer 4: per-route document titles ([www/src/App.vue](../www/src/App.vue))

`ROUTE_TITLES` in `App.vue` maps every route name to a distinct title,
all anchored on `ZombieMUD` + `Zorky's`. Vue router's `$route` watcher
calls `syncDocumentTitle()` on every navigation so the Google crawler's
JS rendering phase sees per-page titles even though the app is a SPA
with hash routing.

## Layer 5: robots.txt + sitemap.xml

Files in [www/src/public/](../www/src/public/) — Vite copies
`public/*` verbatim to the dist root on build.

- [robots.txt](../www/src/public/robots.txt) — allows everything
  except `/api/`, `/#/users`, `/#/bugs`, `/#/login`. Declares the
  sitemap URL.
- [sitemap.xml](../www/src/public/sitemap.xml) — lists the home plus
  the major hash routes with `changefreq` and `priority`. Hash URLs
  (`/#/reinc`) are technically the same page as `/` from a crawler's
  POV, so the critical entry is just `/`; the rest are informational.

## Known limitations

- **Hash routing blocks per-page indexing.** Because the app uses
  `createWebHashHistory`, every URL is the same `/` as far as the
  server is concerned. Google will only have one URL (`/`) in its
  index. To get per-route indexing you would either (a) switch to
  HTML5 History mode and add a nginx `try_files $uri /index.html`
  fallback, or (b) pre-render the key routes with `vite-ssg` or
  similar. Not a priority today — one page with strong content ranks
  well enough for the targeted keywords.
- **No images in social previews.** `og:image` / `twitter:image` are
  not set. Would help CTR on Discord/X link shares. Add a 1200×630 PNG
  to `public/` and reference it here if you want that.
- **No backlinks yet.** The strongest thing you can do for ranking is
  get a link from `zombiemud.org` or its community pages (forum, wiki,
  Discord). Nothing in this repo affects that.

## Verifying

After any change, run:

```
cd www/src && npx vite build
cd ../../scripts/test && node responsive.mjs   # layout sanity
curl -s https://nostuh.com/ | grep -Ei 'title|description|og:|application/ld'
curl -s https://nostuh.com/robots.txt
curl -s https://nostuh.com/sitemap.xml
```

And submit the deployed URL to:
- [Google Search Console](https://search.google.com/search-console) →
  add `https://nostuh.com/` as a URL-prefix property, verify via DNS
  TXT record on DigitalOcean DNS.
- [Bing Webmaster Tools](https://www.bing.com/webmasters).

Both will crawl the sitemap and start indexing within a few days.
