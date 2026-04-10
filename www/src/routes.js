import Dashboard from './components/Dashboard.vue';
import Equipment from './components/Equipment.vue';
import EquipmentAll from './components/EquipmentAll.vue';
import EquipmentAdd from './components/EquipmentAdd.vue';


//login at dashboard
let _routes = [
    { path: '/', name: "dashboard", component: Dashboard },
    { path: '/equipment', name: "equipment", component: Equipment },
    { path: '/equipment-all', name: "equipment-all", component: EquipmentAll },
    { path: '/equipment-add', name: "equipment-add", component: EquipmentAdd },
];

//_routes = _routes.concat(products_routes);

export const routes = _routes;