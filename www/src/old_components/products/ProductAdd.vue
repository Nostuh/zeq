<script>
import axios from 'axios';
import Multiselect from '@vueform/multiselect';

export default {
    name: "ProductAdd",
    data() {
        return {
            product:{
                sku: "",
                spruce_sku: "",
                name: ""
            },
            product_types: [],
            selected_product_type: {},
        }
    },
    components: {
        Multiselect
    },
    methods: {
        add: async function() {
            if ( this.product.sku != "" && this.product.spruce_sku != "" && this.product.name != "" && this.selected_product_type.id != undefined ) {
                this.product.product_type_id = this.selected_product_type.id;
                let id = (await axios.post('/api/products/add-product',this.product)).data;
                this.$router.push({name:"product-product",params:{id:id.insertId}});
            } else {
                this.$root.$refs.Alert.alert_simple("Error","Please fill out all fields!");
            }
        },
        back: function() {
            this.$router.go(-1);
        },
    },
    mounted: async function() {
        this.product_types = (await axios.get('/api/products/get-product-types')).data;
        this.product_types.sort(function(a,b) {
            return a['display_name'].localeCompare(b['display_name']);
        });
        console.log(this.product_types);
    },
}
</script>

<style>

</style>

<template>
    <div>
        <h1>Add Product</h1>
        <div class="container p-0 m-0">
            <div class="row">
                <div class="col-5 card p-1 m-1">
                    <div class="card p-1">
                        <form>
                            <div class="mb-3">
                                <label class="form-label">Sku</label>
                                <input type="text" class="form-control p-1" v-model="product.sku" placeholder="Sku Name..."/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Spruce Sku</label>
                                <input type="text" class="form-control p-1" v-model="product.spruce_sku" placeholder="Spruce Sku..."/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Short Name</label>
                                <input type="text" class="form-control p-1" v-model="product.name" placeholder="Short Name..."/>
                            </div>
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


                            <br><br>
                            <div class="row justify-content-evenly">
                                <button type="button" class="btn btn-danger col-2" @click=back()>Back</button>
                                <button type="button" class="btn btn-success col-2" @click=add()>Add</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>