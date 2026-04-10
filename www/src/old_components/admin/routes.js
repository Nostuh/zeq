import Admin from './Admin.vue';
import AdminAddEdit from './AdminAddEdit.vue';
import AdminEditRoles from './AdminEditRoles.vue';



const _admin_routes = [
    { path: '/admin', name:"admin", component: Admin },
    { path: '/admin-add-edit/:id', name:"admin-add-edit", component: AdminAddEdit },
    { path: '/admin-edit-roles/:id', name:"admin-edit-roles", component: AdminEditRoles },
]

export const admin_routes = _admin_routes;