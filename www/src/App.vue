<script>
import axios from 'axios';
import BugReportModal from './components/BugReportModal.vue';

const PUBLIC_ROUTES = ['home', 'reinc', 'login', 'dashboard', 'updates', 'builds', 'chest-sorter'];

// Per-route <title> strings. Keep the ZombieMUD + reinc keyword prefix
// in each one so Google's result snippets anchor on the same brand.
const ROUTE_TITLES = {
    home:           "Zorky's — ZombieMUD Reinc Planner & Character Calculator",
    reinc:          "Zorky's — ZombieMUD Reinc Planner & Character Calculator",
    dashboard:      "Zorky's — ZombieMUD Reinc Planner & Character Calculator",
    login:          "Sign in — Zorky's ZombieMUD Reinc Planner",
    races:          "ZombieMUD Races — Zorky's Reinc Planner",
    guilds:         "ZombieMUD Guilds & Subguilds — Zorky's Reinc Planner",
    'guild-detail': "ZombieMUD Guild Detail — Zorky's Reinc Planner",
    skills:         "ZombieMUD Skills — Zorky's Reinc Planner",
    spells:         "ZombieMUD Spells — Zorky's Reinc Planner",
    costs:          "ZombieMUD Cost Tables — Zorky's Reinc Planner",
    users:          "User administration — Zorky's",
    bugs:           "Bug reports — Zorky's",
    updates:        "Recent updates — Zorky's ZombieMUD Reinc Planner",
    builds:         "Shared reinc builds — Zorky's ZombieMUD Reinc Planner",
    equipment:      "My Equipment — Zorky's",
    'equipment-all':"All Equipment — Zorky's",
    'equipment-add':"Add Equipment — Zorky's",
    'equipment-import':"Import Equipment — Zorky's",
    'equipment-build':"EQ Builder — Zorky's",
    mobs:           "EQ Mob Database — Zorky's",
    'mob-detail':   "Mob Detail — Zorky's",
    kya:            "KYA Lookup — Zorky's",
    'chest-sorter': "Chest Sorter — Zorky's ZombieMUD Tools",
};
const DEFAULT_TITLE = ROUTE_TITLES.home;

export default {
    name: 'App',
    components: { BugReportModal },
    data() {
        return {
            user: null,
            ready: false,
            flash: { msg: '', type: '' },
            showBugModal: false,
            theme: 'light',
            // Mobile-only: the sidebar carries Bootstrap's `collapse` class and
            // is only shown at >=md via `d-md-block`. Below md it is hidden and
            // the hamburger toggles this flag (adds `.show`) to reveal it. Reset
            // on every route change so tapping a link closes the menu.
            sidebarOpen: false,
            // Public "Misc" dropdown in the header (Chest Sorter, etc.).
            // Vue-controlled so it works without Bootstrap's dropdown JS and
            // resets on every route change like the mobile sidebar.
            miscOpen: false,
            // Desktop sidebar collapsed to the icon-only rail. Per-browser
            // preference in localStorage (like the theme); only affects >=md.
            sideCollapsed: false,
        };
    },
    computed: {
        isAuthed() { return !!this.user; },
        isAdmin() { return !!(this.user && this.user.role === 'admin'); },
        // Raw capability flags from the server (user_roles rows). Admins
        // hold every flag implicitly via the isAdmin short-circuits below.
        // Mirrors effectiveFlags() in api/rest/api/auth.mjs.
        userFlags() { return new Set((this.user && this.user.flags) || []); },
        canPlannerAdmin()  { return this.isAdmin || this.userFlags.has('planner_admin'); },
        canEquipment()     { return this.isAdmin || this.userFlags.has('equipment') || this.userFlags.has('equipment_edit'); },
        canEquipmentEdit() { return this.isAdmin || this.userFlags.has('equipment_edit'); },
        canLookups()       { return this.isAdmin || this.userFlags.has('lookups'); },
        canEqmobs()        { return this.isAdmin || this.userFlags.has('eqmobs') || this.userFlags.has('eqmobs_edit'); },
        canEqmobsEdit()    { return this.isAdmin || this.userFlags.has('eqmobs_edit'); },
        // Back-compat aliases consumed by existing page components so their
        // `$root.canEdit` / `$root.canEditEq` references keep working.
        canEdit()     { return this.canPlannerAdmin; },  // Races/Guilds/Skills/Spells/Costs edit controls
        canEditEq()   { return this.canEqmobsEdit; },    // Mob KB edit controls
        hasEqAccess() { return this.canEqmobs; },        // EQ Mobs nav/route gate
        hasAnySection() {
            return this.canEquipment || this.canLookups || this.canEqmobs
                || this.canPlannerAdmin || this.isAdmin;
        },
        onReinc() { return this.$route && ['home','reinc','dashboard'].includes(this.$route.name); },
        // Sidebar contents, filtered by capability flag. One entry per link
        // so the label, icon and access rule live together — the collapsed
        // rail shows only the icon (label becomes the tooltip / aria-label).
        // Keep in sync with routeAllowed() above.
        sideSections() {
            const L = (name, label, icon, show = true) => (show ? { name, label, icon } : null);
            const secs = [
                { key: 'misc', title: 'Misc', show: true, links: [
                    L('chest-sorter', 'Chest Sorter', 'bi-box-seam'),
                ] },
                { key: 'equipment', title: 'Equipment', show: this.canEquipment, links: [
                    L('equipment', 'My Equipment', 'bi-bag-check'),
                    L('equipment-all', 'All Equipment', 'bi-grid-3x3-gap'),
                    L('equipment-add', 'Add Equipment', 'bi-plus-square', this.canEquipmentEdit),
                    L('equipment-import', 'Import Equipment', 'bi-box-arrow-in-down'),
                    L('equipment-build', 'EQ Builder', 'bi-hammer'),
                ] },
                { key: 'lookups', title: 'Lookups', show: this.canLookups, links: [
                    L('kya', 'KYA Lookup', 'bi-search'),
                ] },
                { key: 'eqmobs', title: 'EQ Mobs', show: this.canEqmobs, links: [
                    L('mobs', 'Mob Database', 'bi-crosshair'),
                ] },
                { key: 'planner', title: 'Planner Admin', show: this.canPlannerAdmin, links: [
                    L('races', 'Races', 'bi-people'),
                    L('guilds', 'Guilds', 'bi-shield'),
                    L('skills', 'Skills', 'bi-award'),
                    L('spells', 'Spells', 'bi-magic'),
                    L('costs', 'Costs', 'bi-coin'),
                ] },
                { key: 'admin', title: 'Admin', show: this.isAdmin, links: [
                    L('users', 'Users', 'bi-person-gear'),
                    L('bugs', 'Bug Reports', 'bi-bug'),
                ] },
            ];
            return secs
                .filter((sec) => sec.show)
                .map((sec) => ({ ...sec, links: sec.links.filter(Boolean) }));
        },
    },
    methods: {
        async loadMe() {
            try {
                const r = await axios.get('/api/auth/me');
                this.user = r.data && r.data.data ? r.data.data : null;
            } catch (e) { this.user = null; }
        },
        async logout() {
            try { await axios.post('/api/auth/logout'); } catch (e) {}
            this.user = null;
            this.$router.push({ name: 'home' });
        },
        // Capability required to VIEW a given route. Public/unlisted routes
        // return true. The server enforces the same rules regardless — this
        // is ergonomic routing only. Keep in sync with the sidebar v-ifs.
        routeAllowed(name) {
            switch (name) {
                case 'equipment': case 'equipment-all': case 'equipment-build':
                case 'equipment-import':
                    return this.canEquipment;
                case 'equipment-add':
                    return this.canEquipmentEdit;
                case 'kya':
                    return this.canLookups;
                case 'mobs': case 'mob-detail':
                    return this.canEqmobs;
                case 'races': case 'guilds': case 'guild-detail':
                case 'skills': case 'spells': case 'costs':
                    return this.canPlannerAdmin;
                case 'users': case 'bugs':
                    return this.isAdmin;
                default:
                    return true; // public or unguarded
            }
        },
        // Where to send a user after login / from the header "enter app"
        // link — the first area they can actually reach.
        landingRoute() {
            if (this.canPlannerAdmin) return 'races';
            if (this.canEquipment) return 'equipment';
            if (this.canEqmobs) return 'mobs';
            if (this.canLookups) return 'kya';
            if (this.isAdmin) return 'users';
            return 'home';
        },
        enforceRouteAccess(to) {
            const name = to && to.name;
            const isPublic = PUBLIC_ROUTES.includes(name);
            if (!this.user) {
                if (!isPublic) this.$router.push({ name: 'login' });
                return;
            }
            if (!this.routeAllowed(name)) this.$router.push({ name: 'home' });
        },
        flashMsg(msg, type = 'success') {
            this.flash = { msg, type };
            setTimeout(() => { this.flash = { msg: '', type: '' }; }, 3500);
        },
        flashError(e) {
            const m = (e && e.response && e.response.data && e.response.data.error) || (e && e.message) || 'Error';
            this.flashMsg(m, 'danger');
        },
        send_global_alert(msg, error = false) { this.flashMsg(msg, error ? 'danger' : 'success'); },
        // Child page components can call `this.$root.registerBugStateProvider(fn)`
        // on mount to expose page-specific state that should be captured on
        // bug submission. Unregister (pass null) on unmount.
        registerBugStateProvider(fn) { this._bugStateProvider = fn || null; },
        collectBugContext() {
            const ctx = {
                route: this.$route && this.$route.fullPath,
                route_name: this.$route && this.$route.name,
                user: this.user ? { id: this.user.id, name: this.user.name, role: this.user.role } : null,
                timestamp: new Date().toISOString(),
                viewport: { w: window.innerWidth, h: window.innerHeight,
                            dpr: window.devicePixelRatio || 1 },
            };
            if (typeof this._bugStateProvider === 'function') {
                try { ctx.page = this._bugStateProvider(); }
                catch (e) { ctx.page_error = String(e); }
            }
            return ctx;
        },
        collectDomSnapshot() {
            // Prefer <main>, fall back to <body>. Strip inline scripts to
            // keep noise down and cap at ~40KB before sending. The closing
            // script tag in the regex and replacement is split on purpose:
            // Vue's SFC parser does a naive text scan for "<" + "/script>"
            // to find the end of this block, so a literal sequence in a
            // string here would prematurely close the <script>.
            const endTag = '<' + '/script>';
            const el = document.querySelector('main') || document.body;
            if (!el) return null;
            let html = el.outerHTML || '';
            const scriptRe = new RegExp('<script[\\s\\S]*?' + endTag, 'gi');
            html = html.replace(scriptRe, '<script>/*stripped*/' + endTag);
            const LIMIT = 40 * 1024;
            if (html.length > LIMIT) html = html.slice(0, LIMIT) + '\n<!-- [truncated] -->';
            return html;
        },
        collectConsoleLog() {
            const buf = window.__zeqConsoleBuffer || [];
            // NDJSON — easy to read later with `jq -R 'fromjson'`.
            return buf.map((e) => JSON.stringify(e)).join('\n');
        },
        // Close the Vue-controlled Misc dropdown on any click outside it. The
        // toggle itself lives inside `.misc-menu`, so clicking it (which sets
        // miscOpen=true during bubbling) is treated as "inside" and stays open;
        // clicking a menu link navigates and the $route watcher closes it.
        onDocClick(e) {
            if (this.miscOpen && !e.target.closest('.misc-menu')) this.miscOpen = false;
        },
        // Publish the sticky navbar's real height as `--zeq-navh` so page-level
        // sticky headers (e.g. the equipment table) can pin FLUSH beneath it.
        // A hardcoded offset left a gap the navbar didn't cover, through which
        // scrolling rows peeked as a ghost line — and it broke when the navbar
        // wrapped taller on mobile. Re-measured on mount, resize, and route
        // change (authed vs anon nav differ in height).
        syncNavHeight() {
            const nav = document.querySelector('header.zeq-navbar');
            const h = nav ? Math.ceil(nav.getBoundingClientRect().height) : 56;
            document.documentElement.style.setProperty('--zeq-navh', h + 'px');
        },
        openBug() { this.showBugModal = true; },
        closeBug() { this.showBugModal = false; },
        syncReincBodyClass() {
            // Toggled to let `body.reinc-active` disable page-level scrolling
            // so the planner fits a single viewport height. Internal lists
            // still scroll via their own overflow regions.
            document.body.classList.toggle('reinc-active', this.onReinc);
        },
        syncDocumentTitle() {
            const name = this.$route && this.$route.name;
            document.title = ROUTE_TITLES[name] || DEFAULT_TITLE;
        },
        loadTheme() {
            let t = null;
            try { t = localStorage.getItem('zeq_theme'); } catch (e) {}
            if (t !== 'light' && t !== 'dark') {
                t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            this.theme = t;
            this.applyTheme();
        },
        applyTheme() {
            document.documentElement.setAttribute('data-bs-theme', this.theme);
        },
        toggleTheme() {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            this.applyTheme();
            try { localStorage.setItem('zeq_theme', this.theme); } catch (e) {}
        },
        loadSideCollapsed() {
            try { this.sideCollapsed = localStorage.getItem('zeq_side_collapsed') === '1'; } catch (e) {}
        },
        toggleSide() {
            this.sideCollapsed = !this.sideCollapsed;
            try { localStorage.setItem('zeq_side_collapsed', this.sideCollapsed ? '1' : '0'); } catch (e) {}
        },
    },
    async mounted() {
        this.loadTheme();
        this.loadSideCollapsed();
        await this.loadMe();
        this.ready = true;
        this.syncReincBodyClass();
        this.syncDocumentTitle();
        this.enforceRouteAccess(this.$route);
        document.addEventListener('click', this.onDocClick);
        this.$nextTick(this.syncNavHeight);
        window.addEventListener('resize', this.syncNavHeight);
    },
    beforeUnmount() {
        document.removeEventListener('click', this.onDocClick);
        window.removeEventListener('resize', this.syncNavHeight);
    },
    watch: {
        onReinc() { this.syncReincBodyClass(); },
        async $route(to) {
            this.syncDocumentTitle();
            this.sidebarOpen = false; // tapping a sidebar link closes the mobile menu
            this.miscOpen = false;    // and closes the Misc dropdown
            this.$nextTick(this.syncNavHeight); // nav height can differ per layout
            if (!this.user) await this.loadMe();
            this.enforceRouteAccess(to);
        },
    },
};
</script>

<template>
<div v-if="ready" :class="{ 'reinc-layout': onReinc }">
    <!--
      SEO semantic block. Visually hidden (position:absolute + clip) so it
      never appears on screen, but crawlers, screen readers, and Google's
      fetch-as-Googlebot see a proper H1, a descriptive paragraph, and a
      link to the game this tool is built for. Do not replace with
      display:none — search engines penalise that. See docs/seo.md.
    -->
    <div class="visually-hidden" aria-hidden="false">
        <h1>Zorky's — ZombieMUD Reinc Planner, Skill Cost Calculator and Character Builder</h1>
        <p>
            Zorky's is a free online reincarnation planner and character calculator for
            <a href="http://zombiemud.org/">ZombieMUD</a>, the long-running text-based
            multiplayer online role-playing game (MUD). Choose a race, stack one or more
            guilds and subguilds, assign stat training points, pick wishes and boons,
            and see the resulting hit points, spell points, stats, resistances, skill
            and spell caps, total experience, and gold requirement — all computed live
            using the same data and formulas as the in-game Zcreator.
        </p>
        <p>
            ZombieMUD character planning, ZombieMUD reinc calculator, ZombieMUD race
            guide, ZombieMUD guild comparison, ZombieMUD skill costs, ZombieMUD spell
            costs, ZombieMUD wishes, ZombieMUD boons, ZombieMUD reincarnation,
            zombiemud.org character builder, MUD character optimizer, text MMORPG tools.
        </p>
        <h2>Supported data</h2>
        <ul>
            <li>Races (including subraces): Aeuri, Catfolk, Cinedi, Cromagnon, Cyclops, Devil, Djinni, Drow, Dwarf, Elf, Ent, Ghast, Ghoul, Goblin, Halfling, Huecuva, Human, Kobold, Korred, Lizardman, Mind Flayer, Minotaur, Ogre, Orc, Revenant, Satyr, Seraph, Skeleton, Sprite, Thrikhren, Titan, Toadman, Troll, Valkyrie, Vampire, Wight, Wolfman, Wraith, Zombie, and more.</li>
            <li>Guilds and subguilds: Abjurer, Bard, Barbarian, Cleric, Death Knight, Druid, Fighter, Healer, Mage, Monk, Necromancer, Paladin, Psionicist, Ranger, Samurai, Sorcerer, Spellblade, Thief, Warlock, Warrior, and every subguild available in the Zcreator data set.</li>
            <li>Every skill and spell in the ZombieMUD skill list with their base training cost.</li>
            <li>Cost tables: level XP, stat training, quest points, wish tiers, and the skill/spell percent multiplier table.</li>
            <li>Wishes: generic stat wishes, resistance wishes, lesser and greater wish tiers.</li>
            <li>Boons: racial, minor, preference, knowledge, weapon, lesser, and greater boon categories.</li>
        </ul>
        <p>
            See the <a href="https://nostuh.com/#/reinc">live planner</a> to build
            a character, or visit <a href="http://zombiemud.org/">zombiemud.org</a>
            to play the game itself.
        </p>
    </div>

    <header class="navbar navbar-dark sticky-top bg-dark flex-md-nowrap p-0 shadow zeq-navbar">
        <!-- Bug #29 — mobile layout: the full brand string + every nav
             link + the Report button overflowed a 352px viewport. The
             brand shrinks to "Zorky's", the Report button hides under
             the FAB on the right, and gaps shrink to `me-1` so the
             remaining Planner/Builds/Updates + theme toggle + Sign in
             fit on one row. All scoped to `<560px` via `.zeq-navbar`. -->
        <!-- Mobile nav toggle: the flag-gated sidebar sections (Equipment,
             Lookups, EQ Mobs, Planner Admin, Admin) live in #sidebarMenu,
             which is hidden below md. Without this button a phone user could
             reach only the single section link in the header row. Shown only
             on authed, non-reinc pages (reinc has no sidebar). -->
        <button v-if="user && !onReinc"
                class="navbar-toggler d-md-none border-0 px-3"
                type="button"
                @click="sidebarOpen = !sidebarOpen"
                :aria-expanded="sidebarOpen ? 'true' : 'false'"
                aria-controls="sidebarMenu"
                aria-label="Toggle navigation menu">
            <span class="navbar-toggler-icon"></span>
        </button>
        <router-link :to="{name:'home'}" class="navbar-brand col-md-3 col-lg-2 me-0 px-3 fs-6 text-decoration-none">
            <span class="brand-full">Zorky's — Reinc Planner</span>
            <span class="brand-short">Zorky's</span>
        </router-link>
        <div class="navbar-nav flex-row ms-auto pe-3 align-items-center">
            <router-link class="nav-link text-light me-3" :to="{name:'home'}">Planner</router-link>
            <router-link class="nav-link text-light me-3" :to="{name:'builds'}">Builds</router-link>
            <router-link class="nav-link text-light me-3" :to="{name:'updates'}">Updates</router-link>
            <div class="nav-item dropdown misc-menu me-3">
                <a class="nav-link text-light dropdown-toggle" href="#"
                   @click.prevent="miscOpen = !miscOpen"
                   :aria-expanded="miscOpen ? 'true' : 'false'">Misc</a>
                <!-- data-bs-popper=static so Bootstrap's CSS anchors the menu
                     below the toggle (we drive open state in Vue, not its JS). -->
                <ul class="dropdown-menu dropdown-menu-end" data-bs-popper="static" :class="{ show: miscOpen }">
                    <li><router-link class="dropdown-item" :to="{name:'chest-sorter'}">Chest Sorter</router-link></li>
                </ul>
            </div>
            <router-link v-if="canPlannerAdmin" class="nav-link text-light me-3" :to="{name:'races'}">Planner Admin</router-link>
            <router-link v-else-if="canEquipment" class="nav-link text-light me-3" :to="{name:'equipment'}">My Equipment</router-link>
            <router-link v-else-if="canEqmobs" class="nav-link text-light me-3" :to="{name:'mobs'}">EQ Mobs</router-link>
            <router-link v-else-if="canLookups" class="nav-link text-light me-3" :to="{name:'kya'}">Lookups</router-link>
            <button class="btn btn-sm btn-outline-warning me-3 report-btn" @click="openBug">Report Bug / Idea</button>
            <button class="btn btn-sm btn-outline-light me-3 theme-toggle"
                    @click="toggleTheme"
                    :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
                    :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'">
                <i class="bi" :class="theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'"></i>
            </button>
            <span class="navbar-text text-light me-3" v-if="user">
                {{ user.name }} <span class="badge bg-secondary">{{ user.role }}</span>
            </span>
            <a v-if="user" class="nav-link text-light" href="#" @click.prevent="logout">Log out</a>
            <router-link v-else class="nav-link text-light" :to="{name:'login'}">Sign in</router-link>
        </div>
    </header>

    <div v-if="flash.msg" class="alert m-2" :class="'alert-' + flash.type" style="position:fixed;top:50px;right:10px;z-index:1050;min-width:300px;">
        {{ flash.msg }}
    </div>

    <BugReportModal v-if="showBugModal" @close="closeBug" />

    <!-- Persistent call-to-action: always visible, bottom-right of every
         page. This is the primary way users tell us about bugs, feature
         requests, wrong data, or anything missing. Styled loud on purpose. -->
    <button class="fab-report" @click="openBug" :aria-label="'Report a bug or suggest an idea'">
        <span class="fab-icon">!</span>
        <span class="fab-text">Report Bug<br>or Idea</span>
    </button>

    <!-- Reinc page uses the full viewport without a sidebar. -->
    <div v-if="onReinc" class="reinc-wrap">
        <router-view />
    </div>
    <!-- Signed-in shell: sidebar rail + main, as a CSS grid at >=md. The
         rail is sticky and exactly one viewport tall; it collapses to an
         icon-only strip via the toggle (state kept in localStorage). Below md
         it is the hamburger-driven stacked menu, always full labels. See
         docs/ui.md "Sidebar". `.app-content main h2` is what
         scripts/test/responsive.mjs keys on — keep main inside .app-content. -->
    <div v-else-if="user" class="app-content app-shell" :class="{ 'side-collapsed': sideCollapsed }">
        <nav id="sidebarMenu" class="sidebar bg-light collapse d-md-block" :class="{ show: sidebarOpen }"
             aria-label="Sections">
            <button type="button" class="btn btn-primary btn-sm side-toggle d-none d-md-flex"
                    @click="toggleSide"
                    :aria-expanded="sideCollapsed ? 'false' : 'true'"
                    :title="sideCollapsed ? 'Expand menu' : 'Collapse menu to icons'">
                <i class="bi" :class="sideCollapsed ? 'bi-chevron-double-right' : 'bi-chevron-double-left'" aria-hidden="true"></i>
                <span class="side-label">Collapse menu</span>
                <span v-if="sideCollapsed" class="visually-hidden">Expand menu</span>
            </button>
            <!-- Sections are gated by capability flag (sideSections); the
                 server enforces the same access regardless. -->
            <template v-for="sec in sideSections" :key="sec.key">
                <div class="side-heading" role="presentation"><span class="side-label">{{ sec.title }}</span></div>
                <router-link v-for="l in sec.links" :key="l.name" class="side-link" :to="{ name: l.name }"
                             :title="sideCollapsed ? l.label : null"
                             :aria-label="sideCollapsed ? l.label : null">
                    <i class="bi" :class="l.icon" aria-hidden="true"></i>
                    <span class="side-label">{{ l.label }}</span>
                </router-link>
            </template>
            <div v-if="!hasAnySection" class="side-empty small text-muted">
                <span class="side-label">No sections enabled — ask an admin for access.</span>
            </div>
        </nav>
        <main class="app-main px-3 px-md-4 pt-3">
            <router-view />
        </main>
    </div>
    <!-- Signed-out, non-reinc pages (login, updates, builds, chest sorter):
         no sidebar, original offset column layout. -->
    <div v-else class="container-fluid app-content">
        <div class="row">
            <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4 py-3">
                <router-view />
            </main>
        </div>
    </div>
</div>
</template>

<style>
/* Reinc planner is locked to a single viewport — no page-level scroll.
   Internal lists (guild, skills, cost table, wishes/boons, misc) scroll
   inside their own overflow regions. See docs/reinc.md. */
html:has(body.reinc-active),
body.reinc-active {
    overflow: hidden;
    height: 100vh;
    margin: 0;
}
body.reinc-active #app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
/* App root is a flex column covering the viewport; header gets its
   natural height, .reinc-wrap takes the remainder. This avoids hard-coding
   the header height, which was wrong on some breakpoints. */
.reinc-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}
.reinc-layout > header { flex: 0 0 auto; }
/* Persistent floating action button — the primary way users submit
   bug reports and ideas. Sits above the planner's locked layout so it
   works even when page scroll is disabled. */
/* Extra scroll room at the bottom so the fixed Report-Bug FAB never
   covers the last rows of a page's table. Reinc layout is excluded (it
   is locked to 100vh and uses .reinc-wrap, not .app-content). */
.app-content { padding-bottom: 6rem; }

/* ===== Signed-in shell: sidebar rail + main =====
   All colours are Bootstrap CSS variables, so both themes are covered
   (the panel background itself is .bg-light, overridden for dark in
   styles.scss). Sizes are rem, no fixed px. See docs/ui.md "Sidebar". */
.app-main { min-width: 0; }
#sidebarMenu { padding: 0.5rem 0 1rem; }
/* Visibility is d-none / d-md-flex in the template (desktop only — below md
   the header hamburger owns the menu). */
.side-toggle {
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: calc(100% - 0.7rem);
    margin: 0 0.35rem 0.35rem;
    font-weight: 600;
    white-space: nowrap;
}
.side-heading {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--bs-secondary-color);
    padding: 0.55rem 0.75rem 0.1rem;
    white-space: nowrap;
}
.side-link {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0 0.35rem;
    padding: 0.2rem 0.45rem;
    border-radius: 0.3rem;
    font-size: 0.875rem;
    line-height: 1.3;
    color: var(--bs-link-color);
    text-decoration: none;
    white-space: nowrap;
}
.side-link:hover { background: var(--bs-tertiary-bg); color: var(--bs-link-hover-color); }
/* Current page — matters most in the collapsed rail, where the icon is the
   only cue to where you are. */
.side-link.router-link-active {
    background: var(--bs-primary-bg-subtle);
    color: var(--bs-primary-text-emphasis);
    font-weight: 600;
}
.side-link .bi { flex: 0 0 auto; width: 1.1rem; text-align: center; font-size: 1rem; }
.side-empty { padding: 0.5rem 0.75rem; }

@media (min-width: 768px) {
    .app-shell {
        --zeq-sidew: 12.5rem;
        display: grid;
        grid-template-columns: var(--zeq-sidew) minmax(0, 1fr);
        align-items: start;
    }
    .app-shell.side-collapsed { --zeq-sidew: 5rem; }
    /* Sticky rail exactly one viewport tall (below the measured navbar), so
       the panel background always reaches the bottom of the window. If the
       links ever outgrow a very short window the rail scrolls on its own;
       it never spills past its painted box again. */
    #sidebarMenu {
        position: sticky;
        top: var(--zeq-navh, 65px);
        height: calc(100vh - var(--zeq-navh, 65px));
        overflow-x: hidden;
        overflow-y: auto;
        scrollbar-width: thin;
    }
    /* Collapsed: icons only. Labels leave the layout (display:none), which
       is why each link switches to a title + aria-label in the template. */
    .side-collapsed .side-label { display: none; }
    .side-collapsed .side-link {
        justify-content: center;
        margin: 0.05rem 0.6rem;
        padding: 0.4rem 0;
    }
    .side-collapsed .side-link .bi { width: auto; font-size: 1.25rem; }
    /* Section titles become thin dividers between icon groups. */
    .side-collapsed .side-heading {
        padding: 0;
        margin: 0.45rem 1rem;
        border-top: 1px solid var(--bs-border-color);
    }
    .side-collapsed .side-toggle { font-size: 1.1rem; padding-block: 0.3rem; }
}

.fab-report {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 1500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.9rem;
    background: #dc3545;
    color: #fff;
    border: 2px solid #fff;
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.78rem;
    line-height: 1;
    box-shadow: 0 0.5rem 1.5rem rgba(220, 53, 69, 0.4), 0 0 0 3px rgba(220, 53, 69, 0.2);
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 150ms ease;
    animation: fab-pulse 2.6s ease-in-out infinite;
}
.fab-report:hover { transform: scale(1.05); }
.fab-report:active { transform: scale(0.97); }
.fab-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: #fff;
    color: #dc3545;
    border-radius: 50%;
    font-size: 1rem;
    font-weight: 900;
}
.fab-text { text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
@keyframes fab-pulse {
    0%, 100% { box-shadow: 0 0.5rem 1.5rem rgba(220, 53, 69, 0.4), 0 0 0 0    rgba(220, 53, 69, 0.45); }
    50%      { box-shadow: 0 0.5rem 1.5rem rgba(220, 53, 69, 0.4), 0 0 0 10px rgba(220, 53, 69, 0); }
}
@media (max-width: 520px) {
    .fab-report { right: 0.5rem; bottom: 0.5rem; padding: 0.5rem 0.7rem; font-size: 0.7rem; }
    .fab-icon { width: 1.3rem; height: 1.3rem; font-size: 0.85rem; }
}
@media (prefers-reduced-motion: reduce) {
    .fab-report { animation: none; }
}

/* Bug #29 — mobile header layout. Default (desktop) hides the short
   brand; narrow viewports flip the visibility and tighten gaps so the
   whole header fits 352px without overflow. The Report Bug / Idea
   button hides on mobile because the red FAB bottom-right is the
   primary entry point on a phone anyway. */
.zeq-navbar .brand-short { display: none; }
/* Never let the header force horizontal page scroll: allow the right-hand
   nav to wrap to a second line whenever the links + user controls don't fit
   (authed views on tablets especially, where the old fixed row overflowed).
   Wide desktop still renders everything on one line. */
/* `align-self: stretch` so the nav row spans the navbar's full height rather
   than sitting centred at its own 40px content height. The children stay
   centred (the row keeps `align-items: center`), but the Misc dropdown can
   now anchor `top: 100%` to the navbar's bottom edge instead of opening
   part-way up inside the bar. */
.zeq-navbar .navbar-nav { flex-wrap: wrap; row-gap: 0.15rem; justify-content: flex-end; align-self: stretch; }
@media (max-width: 560px) {
    .zeq-navbar .navbar-brand { padding-left: 0.6rem; padding-right: 0.6rem; }
    .zeq-navbar .brand-full { display: none; }
    .zeq-navbar .brand-short { display: inline; }
    /* Let the links wrap to a second row rather than force horizontal page
       scroll, and drop the logged-in username badge (informational only —
       the Log out link already signals the session). Without this the authed
       header (Planner Admin link + long usernames) overflowed narrow phones. */
    .zeq-navbar .navbar-nav { padding-right: 0.5rem !important; }
    .zeq-navbar .navbar-nav .nav-link,
    .zeq-navbar .navbar-nav .theme-toggle,
    .zeq-navbar .navbar-nav .navbar-text { margin-right: 0.4rem !important; }
    .zeq-navbar .navbar-nav .nav-link { padding: 0.3rem 0.25rem; font-size: 0.85rem; }
    .zeq-navbar .report-btn { display: none; }
    .zeq-navbar .navbar-text { display: none; }
    /* Share the brand's row instead of wrapping onto a mostly-empty row of
       its own: take the remaining width and wrap INSIDE it. At 360px that
       keeps a signed-in admin's header to three compact rows (~95px) and
       the anonymous one within the 65px minimum (two rows). */
    .zeq-navbar .navbar-nav { flex: 1 1 0; min-width: 0; }
}

/* Public "Misc" dropdown in the header. `position: relative` is what the
   absolute menu anchors to. It also stretches to the full height of the nav
   row so the menu's `top: 100%` lands on the navbar's bottom edge — left at
   its natural 40px the toggle sits centred in a 65px bar and the menu opened
   ~7px UP inside the navbar. The inner flex keeps the link centred, and the
   padding just matches the plain nav-links beside it. */
.misc-menu { position: relative; align-self: stretch; display: flex; align-items: center; }
.misc-menu .nav-link { padding-left: 0.25rem; padding-right: 0.25rem; cursor: pointer; }
/* Anchor the menu just below the toggle, right-aligned to it. Explicit so it
   doesn't depend on Bootstrap's Popper JS (we open/close it from Vue).
   `position: absolute` is REQUIRED, not decorative: this header is a bare
   `.navbar` with no `navbar-expand-*` class, so Bootstrap's unconditional
   `.navbar-nav .dropdown-menu { position: static }` applies and is never
   restored to absolute (that only happens under `.navbar-expand-*`). Left
   static, the opened menu joins the flex flow, grows the navbar's height and
   — with `.navbar-nav { flex-wrap: wrap }` above — reflows every nav item, so
   "Misc" visibly jumped to its own line whenever you opened it. */
.misc-menu .dropdown-menu { position: absolute; top: 100%; right: 0; left: auto; margin-top: 0.35rem; }
.misc-menu .dropdown-menu.show { z-index: 1001; }

.reinc-wrap {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0.25rem 0.5rem;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
@media (min-width: 1600px) {
    .reinc-wrap { padding: 0.25rem 1rem; }
}
</style>
