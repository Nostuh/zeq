import { createApp } from 'vue/dist/vue.esm-bundler';
import { createRouter, createWebHashHistory } from 'vue-router';
// Import our custom CSS
import './scss/styles.scss';

// Import all of Bootstrap's JSS
import * as bootstrap from 'bootstrap';
//import icon css
import 'bootstrap-icons/font/bootstrap-icons.css';

import { routes } from './routes.js';

    
const router = createRouter({
    history: createWebHashHistory(),
    routes, // short for `routes: routes`
});
    
import App from './App.vue';

const app = createApp(App);

// Make sure to _use_ the router instance to make the
// whole app router-aware.
app.use(router);

app.mount('#app');
