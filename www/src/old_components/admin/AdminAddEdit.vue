<script>
import zSimpleTableVue from '../tools/zSimpleTable.vue';
import axios from 'axios';

export default {
    name: "AdminAddEdit",
    data() {
        return {
            user: {}
        }
    },
    components: {
        zSimpleTableVue
    },
    methods: {
        load: async function() {
            let id = this.$route.params.id;
            if ( id != "new" ) {
                let users = (await axios.get('/api/admin/all-users')).data;
                this.user = users.find(v => v.id == id);
            } else {
                this.user.id = "new";
            }
            
            this.user.password = "";
        },
        back: function() {
            this.$router.go(-1);
        },
        save: async function() {
            await axios.post('/api/admin/save-user',this.user);
            this.load();
            this.$root.send_global_alert('Saved!');
            this.back();
        }
    },
    mounted: async function() {
        this.load();
        this.alert = this.$root.$refs.Alert;
    },
}
</script>

<style>

</style>

<template>
    <div>
        <div class="floating-menu">
            <button type="button" class="btn btn-danger" @click=back()>Back</button>
        </div>
        <h2>Edit User</h2>
        <div class="container p-0 m-0">
            <div class="row">
                <div class="col-5 card p-1 m-1">
                    <div class="card p-1">
                        <form>
                            <div class="mb-3">
                                <label class="form-label">ID</label>
                                <input type="text" class="form-control p-1" v-model="user.id" disabled/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Enabled</label>
                                <input type="text" class="form-control p-1" v-model="user.enabled" placeholder="Enabled 0/1..."/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">E-mail</label>
                                <input type="text" class="form-control p-1" v-model="user.email" placeholder="E-mail..."/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">First Name</label>
                                <input type="text" class="form-control p-1" v-model="user.first_name" placeholder="First Name..."/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Last Name</label>
                                <input type="text" class="form-control p-1" v-model="user.last_name" placeholder="Last Name..."/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Password</label>
                                <input type="text" class="form-control p-1" v-model="user.password" placeholder="Password..."/>
                            </div>
                            
                            <br><br>
                            <div class="row justify-content-evenly">
                                <button type="button" class="btn btn-success col-2" @click=save()>Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>