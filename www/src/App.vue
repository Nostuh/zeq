<script>
import Alert from './components/tools/Alert-0.0.1.vue';
import * as bootstrap from 'bootstrap';
import { uf } from '../utils/tools.mjs';
import { useCookies,globalCookiesConfig  } from "vue3-cookies";
import axios from "axios";

// comments
export default {    
    name: "App",
    setup() {
        globalCookiesConfig({
            expireTimes: "7d",
        });
        const { cookies } = useCookies();
        return { cookies };
    },
    data() {
        return {
            data: [],
            global_alert_message: "",
            gc:"hide",
            user: {
                first_name:false,
                role_ids:[]
            },
            version: '7',
            wipe_product_search_cache:false
        }
    },
    components: {
        Alert
    },
    methods: {
        send_global_alert: async function(msg,error=false) {
            this.global_alert_message = msg;
            this.global_alert._element.classList.remove("hide");
            this.global_alert._element.classList.add("show");
            this.global_alert._element.classList.remove("alert-success");
            this.global_alert._element.classList.remove("alert-danger");

            if ( error ) {
                this.global_alert._element.classList.add("alert-danger");
            } else {
                this.global_alert._element.classList.add("alert-success");
            }

            await uf.sleep(3000);
            this.close_global_alert();
        },
        close_global_alert: async function() {
            this.global_alert._element.classList.remove("show");
            this.global_alert._element.classList.add("hide");
        },
        logout: function() {
            this.$root.user = {
                first_name:false,
                role_ids:[]
            },
            this.$root.cookies.remove("user");
            this.$router.push({name:"dashboard"});
        },
        navigate_to_product_page: function() {
            this.wipe_product_search_cache = true;
            this.$router.push({name:"all-products"});
        }
    },
    computed: {
        display_name: function() {
            if ( this.user.first_name !== false ) {
                return this.user["first_name"] + " - ";
            } else {
                return "";
            }
        }
    },
    mounted: async function() {
        let user_cookie = this.$root.cookies.get("user");

        if ( user_cookie ) {
            this.user = user_cookie;
        }
        this.global_alert = new bootstrap.Alert('#global_alert');
        // console.log(this.user);
    },
    watch: {
        "$route" :{
            async handler(to,from)
            {
                let user_cookie = this.$root.cookies.get("user");

                if ( user_cookie ) {
                    this.user = user_cookie;
                } else {
                    this.user = {
                        first_name:false,
                        role_ids:[]
                    };
                }
                
                if ( this.user.first_name == false ) {
                    this.$router.push({name:"dashboard"})
                }

                // RE THINK THIS, IT DID NOT WORK WELLLLLL
                // if ( this.version != (await axios.get('/api/login/version')).data ) {
                //     this.$router.go(0);
                // }
            }
        } 
    },
}
</script>

<style src="@vueform/multiselect/themes/default.css"></style>

<style scoped>
    #global_alert {
        position: fixed;
        z-index: 999;
        width:30em;
        height:auto;
        top:4px;
        left:44em;
        -webkit-transition-duration: 1s; /* Safari */
        transition-duration: 1s;
        text-align: center;
    }
    .alert-danger {
        background-color: red;
    }
</style>


<template>
    <body>

        <header class="navbar navbar-dark sticky-top bg-dark flex-md-nowrap p-0 shadow">
            <a class="navbar-brand col-md-3 col-lg-2 me-0 px-3 fs-6" href="#"><img style="width:1%;" src="./assets/images/zork.jpg" /></a>
            <button class="navbar-toggler position-absolute d-md-none collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#sidebarMenu" aria-controls="sidebarMenu" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="navbar-nav navbar-brand"><h4>{{display_name}}Zorky EQ</h4></div>
            <div id="global_alert" class="alert hide fade" :class="gc" >
                <strong>{{global_alert_message}}</strong>
            </div>
        </header>
        <Alert ref="Alert"></Alert>
        <div class="container-fluid">
        <div class="row">
            <nav id="sidebarMenu" class="col-md-3 col-lg-2 d-md-block bg-light sidebar collapse">
            <div class="position-sticky pt-3 sidebar-sticky">
                <ul class="nav flex-column">
                    <li class="nav-item">
                        <a class="nav-link active" aria-current="page" href="#">
                        <span class="align-text-bottom"></span>
                        Dashboard
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/equipment" v-show="user.first_name">
                        <span data-feather="file" class="align-text-bottom"></span>
                        My Equipment
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#/equipment-all" v-show="user.first_name">
                        <span data-feather="file" class="align-text-bottom"></span>
                        All Equipment
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click="logout()">
                        <span data-feather="file" class="align-text-bottom"></span>
                        Log Out
                        </a>
                    </li>
                </ul>

            </div>
            </nav>

            <div class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
                <router-view />
            </div>
        </div>
        </div>
    </body>
</template>