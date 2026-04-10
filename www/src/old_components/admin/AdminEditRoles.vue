<script>
import zSimpleTableVue from '../tools/zSimpleTable.vue';
import axios from 'axios';
import { uf } from '../../../utils/tools.mjs';

export default {
    name: "AdminEditRoles",
    data() {
        return {
            user:{},
            roles:[],
        }
    },
    components: {
        zSimpleTableVue
    },
    methods: {
        load: async function() {
            let id = this.$route.params.id;
            this.roles = (await axios.post('/api/admin/user-roles',{user_id:id})).data;
            let users = (await axios.get('/api/admin/all-users')).data;
            this.user = users.find(v => v.id == id);
            
            uf.dloop(this.roles,function(i,v) {
                if ( v.role_id != null ) {
                    v.toggle_value = true;
                } else {
                    v.toggle_value = false;
                }
            });
            
            this.$refs.zSimpleTableVue.set_table(this.roles,this.get_config());
        },
        back: function() {
            this.$router.go(-1);
        },
        toggle_role: async function(d) {
            let payload = {
                user_id: this.user.id,
                role_id: d.id
            }
            await axios.post('/api/admin/toggle-role',payload);
            this.load();
            this.$root.send_global_alert('Saved!');
        },
        get_config: function() {
            let that = this;

            return {
                id: {header:"Role Id"},
                toggle_value: {header:"Enabled",display_type:"checkbox",callback: function(d) {
                    that.toggle_role(d);
                }},
                name: {header:"Role Name"},
                description: {header:"Role Desc"},
            }
        },
    },
    mounted: async function() {
        this.load();
        this.alert = this.$root.$refs.Alert;

        
    },
}
</script>

<template>
    <div>
        <div class="save-to-left">
            <button type="button" class="btn btn-danger" @click=back()>Back</button>
        </div>
        
        <h2>Edit User Roles - {{user.first_name}} {{user.last_name}}</h2>
        <div class="container-fluid product-table" >
            <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
        </div>
        
    </div>
</template>