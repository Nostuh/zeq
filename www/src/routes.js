import Login from './components/Login.vue';
import Races from './components/Races.vue';
import Guilds from './components/Guilds.vue';
import GuildDetail from './components/GuildDetail.vue';
import Skills from './components/Skills.vue';
import Spells from './components/Spells.vue';
import Costs from './components/Costs.vue';
import Users from './components/Users.vue';
import Equipment from './components/Equipment.vue';
import EquipmentAdd from './components/EquipmentAdd.vue';
import EquipmentBuild from './components/EquipmentBuild.vue';
import ImportEquipment from './components/ImportEquipment.vue';
import Reinc from './components/Reinc.vue';
import Bugs from './components/Bugs.vue';
import Updates from './components/Updates.vue';
import Builds from './components/Builds.vue';
import MobList from './components/MobList.vue';
import MobDetail from './components/MobDetail.vue';
import Kya from './components/Kya.vue';
import ChestSorter from './components/ChestSorter.vue';

export const routes = [
    // Public landing: the reinc planner is the homepage.
    { path: '/', name: 'home', component: Reinc },
    { path: '/reinc', name: 'reinc', component: Reinc },
    { path: '/login', name: 'login', component: Login },
    // 'dashboard' is kept as an alias of 'home' so legacy links keep working.
    { path: '/dashboard', name: 'dashboard', component: Reinc },

    { path: '/races', name: 'races', component: Races },
    { path: '/guilds', name: 'guilds', component: Guilds },
    { path: '/guilds/:id', name: 'guild-detail', component: GuildDetail, props: true },
    { path: '/skills', name: 'skills', component: Skills },
    { path: '/spells', name: 'spells', component: Spells },
    { path: '/costs', name: 'costs', component: Costs },
    { path: '/users', name: 'users', component: Users },
    { path: '/bugs', name: 'bugs', component: Bugs },
    { path: '/updates', name: 'updates', component: Updates },
    { path: '/builds', name: 'builds', component: Builds },
    { path: '/mobs', name: 'mobs', component: MobList },
    { path: '/mobs/:id', name: 'mob-detail', component: MobDetail, props: true },
    { path: '/equipment', name: 'equipment', component: Equipment },
    { path: '/equipment-all', name: 'equipment-all', component: Equipment },
    { path: '/equipment-add', name: 'equipment-add', component: EquipmentAdd },
    { path: '/equipment-import', name: 'equipment-import', component: ImportEquipment },
    { path: '/equipment-build', name: 'equipment-build', component: EquipmentBuild },
    { path: '/kya', name: 'kya', component: Kya },
    // Public Misc tools — client-side only, no auth.
    { path: '/chest-sorter', name: 'chest-sorter', component: ChestSorter },
];
