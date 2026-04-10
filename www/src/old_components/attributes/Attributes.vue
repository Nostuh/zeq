<script>
import zSimpleTableVue from '../tools/zSimpleTable.vue';
import axios from 'axios';
import { uf } from '../../../utils/tools.mjs';

export default {
    name: "Attributes",
    data() {
        return {

        }
    },
    components: {
        zSimpleTableVue
    },
    methods: {
        edit_attribute: function(id) {
            this.$router.push({name:'edit-attribute',params:{id:id}});
        },
        add_attribute: function() {
            this.$router.push({name:'edit-attribute',params:{id:"new"}});
        },
        get_config: function() {
            let that = this;

            return {
                id: {header:"Attribute Id"},
                edit_button: {header:"Edit?", display_type:"edit_button", callback: function(d) {
                    that.edit_attribute(d.id);
                }},
                name: {header:"Short Name"},
                display_name: {header:"Display Name"},
                is_multiple: {header:"Select Muiltiple"},
                product_types_display: {header: "Product Types Using"},
                enabled: {header:"Enabled",display_type:"enabled"}
            }
        }
    },
    mounted: async function() {
        if ( this.$root.user.role_ids.find(v=>v==1||v==2) ) {
            let attrs = await axios.get('/api/attributes/get-list');
            attrs = attrs.data.data;
            attrs = uf.object_to_array(attrs);
            this.$refs.zSimpleTableVue.set_table(attrs,this.get_config());
        } else {
            this.$router.push({name:"dashboard"});
        }
        
    },
}
</script>

<style>

</style>

<template>
    <div>
        <h2>Attributes</h2>

        <div class="container-fluid product-table" >
            <div class="container-fluid product-table" style="padding-top: 10px;margin-bottom:-45px;">
                <div class="row">
                    <button class="col-2 btn btn-success" style="z-index:1;" @click="add_attribute()">Add Attribute</button>
                </div>
            </div>    
            <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
        </div>
    </div>
</template>