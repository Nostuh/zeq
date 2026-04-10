<script>
import zSimpleTableVue from '../tools/zSimpleTable.vue';
import axios from 'axios';
import { uf } from '../../../utils/tools.mjs';

export default {
    name: "Admin",
    data() {
        return {

        }
    },
    components: {
        zSimpleTableVue
    },
    methods: {
        get_config: function() {
            let that = this;

            return {
                id: {header:"User Id"},
                edit_button: {header:"Edit?", display_type:"edit_button", callback: function(d) {
                    that.edit_user(d.id);
                }},
                email: {header:"E-mail"},
                first_name: {header:"First Name"},
                last_name: {header:"Last Name"},
                password: {header: "MD5 password"},
                role_button: {header:"Edit Roles?",display_type:"edit_button", callback: function(d) {
                    that.edit_roles(d.id);
                }},
                role_ids:{header: "Roles"},
                role_names:{header:"Roles"},
                enabled: {header:"Enabled",display_type:"enabled"}
            }
        },
        edit_user: function(id) {
            this.$router.push({name:"admin-add-edit",params:{id:id}});
        },
        add_user: function() {
            this.$router.push({name:"admin-add-edit",params:{id:"new"}});
        },
        edit_roles: function(id) {
            this.$router.push({name:"admin-edit-roles",params:{id:id}});
        }
    },
    mounted: async function() {
        let users = await axios.get('/api/admin/all-users');
        this.$refs.zSimpleTableVue.set_table(users.data,this.get_config());
    },
}
</script>

<style>

</style>

<template>
    <div>
        <h2>Admin</h2>

        <div class="container-fluid product-table" >
            <button class="btn btn-success" @click=add_user()>Add User</button>
            <br><br>
            <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
        </div>
    </div>
</template>