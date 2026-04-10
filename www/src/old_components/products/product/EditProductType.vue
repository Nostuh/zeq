<script>
import axios from 'axios';
import { uf } from '../../../../utils/tools.mjs';
import Multiselect from '@vueform/multiselect';

export default {    
    name: "Product-Product-Edit",
    data() {
        return {
            product: [],
            product_raw: [],
            product_types: [],
            selected_product_type: {},
        }
    },
    components: {
        Multiselect
    },
    methods: {
        load: async function() {
            while ( this.product.id == undefined ) {
                this.product = this.$parent.$parent.product;
                this.product.jackson_audit = this.product.jackson_audit?true:false;
                this.product_raw = uf.clone(this.product);
                await uf.sleep(100);
            }

            if ( this.$root.user.role_ids.find(v=>v==1||v==6) ) {
                // good
            } else { this.$router.go(-1); }

            this.product_types = (await axios.get('/api/products/get-product-types')).data;
            this.product_types.sort(function(a,b) {
                return a['display_name'].localeCompare(b['display_name']);
            });

            this.selected_product_type = this.product_types.find(v=>v.id==this.product.product_type_id);
        },
        save: async function() {
            let payload = {
                product: this.product,
                product_type: this.selected_product_type
            };
            await axios.post('/api/products/change-product-type',payload);
            this.$parent.$parent.load();
            this.$router.go(-1);
        },
        edit_product_type: function() {
            //
        }
    },
    watch: {

    },
    computed: {

    },
    mounted: function() {
        this.load();
    }
}
</script>

<style scoped>
    input {
        padding: 3px;
    }
.edit-product-type {
    position: fixed;
    top:80px;
    right:150px;
    z-index: 9999;
    height:6.6em;
    width:10em;
}
</style>

<template>
    <div class="row">
        <div>
            <button class="btn btn-success edit-product-type" @click=edit_product_type()>Edit Product Type</button>
        </div>
        <button class="btn btn-success save-to-right" @click="save()">Save</button>
        <h1>Edit Product Type</h1>
        
        
        <div class="filters">
            <Multiselect 
                v-model="selected_product_type"
                :options="product_types"
                :object="true"
                value="display_name"
                label="display_name"
                valueProp="id"
                track-by="display_name"
                :searchable="true"
                placeholder="Product Types.."
                ref="product_type_selector"/>
        </div>

    </div>    
</template>