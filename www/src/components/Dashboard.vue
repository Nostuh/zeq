<script>
import axios from 'axios';

export default {
    name: "Dashboard",
    data() {
        return {
            data: [],
            email: "",
            password: "",
            bad_password: false,
        }
    },
    components: {
        
    },
    methods: {
        login: async function() {
            let payload = {
                email:this.email,
                password:this.password
            }
            let result = await axios.post('/api/eq/login/',payload);

            if ( result.data === false ) {
                this.bad_password = true;
            } else {
                result.data.first_name = result.data.name;
                this.$root.user = result.data;
                this.$root.cookies.set("user",JSON.stringify(result.data));
                this.$router.push({name:"equipment"});
            }
        },
    },
    mounted: async function() {

    }
}
</script>

<style scoped>
.bad_password {
    color: red;
    font-weight: bold;
}
</style>

<template>
    <div>
        <h1>Dashboard</h1>
        <div v-if="$root.user.first_name">
            <div class="container p-0 m-0">
                <h1 class="h2">Dashboard</h1>
            </div>
        </div>
        <div v-else id="login-div" >
            <div class="container p-0 m-0">
                <h1 class="h2">Login</h1>
                <hr>
            </div>
            <form>
                <div class="mb-3">
                    <label for="email" class="form-label">User</label>
                    <input type="text" class="form-control" v-model="email">
                </div>
                <div class="mb-3">
                    <label for="password" class="form-label">Password</label>
                    <input type="password" class="form-control" v-model="password">
                </div>
                <button type="submit" class="btn btn-primary" @click="login()">Submit</button>
            </form>
            <div v-if="bad_password">
                <br>
                <br>
                <h4 class="bad_password">Bad E-mail/Password!</h4>
            </div>
        </div>
    </div>

</template>