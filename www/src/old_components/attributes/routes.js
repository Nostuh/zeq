import Attributes from './Attributes.vue';
import EditAttribute from './EditAttribute.vue';
import EditAttributeOption from './EditAttributeOption.vue';




const _attributes_routes = [
    { path: '/attributes', name:"attributes", component: Attributes },
    { path: '/attributes/edit/:id', name: 'edit-attribute', component: EditAttribute },
    { path: '/attributes/edit/:id/:product_type_id', name: 'edit-attribute-option-1', component: EditAttribute },
    { path: '/attributes/edit/option/:id', name: 'edit-attribute-option', component: EditAttributeOption }

]

export const attributes_routes = _attributes_routes;