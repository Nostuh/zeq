<script>
import axios from 'axios';
import {puf} from 'karran-utility-functions';
import { uf } from '../../../utils/tools.mjs';


export default {    
    name: "Product",
    data() {
        return {
            product: [],
            product_type_attributes: [],
            images: [],
            wtb: [],
            bullets: [],
            attributes: [],
            attribute_options: 'false',
            tab: "product",
            cat_id:0,
            admin_view:false
        }
    },
    components: {
        
    },
    methods: {
        load: async function() {
            let id = this.$route.params.id;
            let new_product = (await axios.get('/api/products/product/'+id)).data;
            
            this.attributes = new_product.attributes;
            this.product_type_attributes = new_product.product_type_attributes;
            this.wtb = new_product.wtb_online_urls;
            this.product = new_product;
            this.product.magento_image = "/ki_images/"+this.product.img_path+this.product.img_name;
            
            let tab = await puf.cache.get('product_tab');
            if ( tab ) {
                this.set_tab(tab);
            } else {
                let path = this.$route.path.split("/");
                console.log(path[3]);
                this.set_tab(path[3]);
            }
            console.log('Done Main Product Load');

            if ( this.$root.user.role_ids.find(v=>v==1) ) {
                this.cat_id = uf.get_cat_id(this.product);
                this.admin_view = true;
            }
        },
        set_tab: function(value) {
            this.tab = value;
            this.$router.push({name:'product-'+value});
            puf.cache.set('product_tab',value);
        },
        back: function() {
            this.$router.push({name:'all-products'});
        }
    },
    computed: {
        jackson_audit_display: function() {
            return this.product.jackson_audit?"Yes":"No";
        }
    },
    watch: {
        "$route.params.id": function(to,from) {
            if (to!=from) {
                this.load();
            }
        }
    },
    mounted: function() {
        this.load();
    }
}
</script>

<style scoped>
    .btn {
        width: 100px;
        height: 2em;
        margin: 0 1em;
        padding: 0;
        border-color:black;
    }
    .header-card {
        margin: 1em;
    }
    .product-sticky {
        position: sticky;
        top: 65px;
        background-color: white;
        z-index: 99;
    }

    .product-img-div-sticky {
        position: sticky;
        top: 0px;
    }
    .product-img-div-fixed {
        position: fixed;
        bottom:2em;
        left:1.5em;
    }
    .product-img-div-fixed img {
        width:300px;
        height:300px;
    }
</style>

<template>
    <div>
        <div class="product-img-div-fixed">
            <div class="row">
                <img :src=product.magento_image />
            </div>
            <div class="row">
                <h3 style="text-align:center;">{{product.sku}}</h3>
            </div>
        </div>
        <div class="row product-sticky">
            <div class="header-card col-3 card">
                <div class="card-body">
                    <!-- <div class="row p-0"><div class="col-6 p-0">Stock:</div><div class="col-6 p-0">OPAL/Spruce</div></div> -->
                    <div class="row p-0"><div class="col-6 p-0">SKU:</div><div class="col-6 p-0">{{product.sku}}</div></div>
                    <div class="row p-0"><div class="col-6 p-0">Spruce SKU:</div><div class="col-6 p-0">{{product.spruce_sku}}</div></div>
                    <div class="row p-0"><div class="col-6 p-0">Jackson Audited:</div><div class="col-6 p-0">{{jackson_audit_display}}</div></div>
                </div>
            </div>
        
            <div class="header-card col-3 card">
                <div class="card-body">
                    <!-- <div class="row p-0"><div class="col-6 p-0">Stock:</div><div class="col-6 p-0">OPAL/Spruce</div></div> -->
                    <div class="row p-0"><div class="col-6 p-0">Dealer Price:</div><div class="col-6 p-0">{{product.dealer_price}} $</div></div>
                    <div class="row p-0"><div class="col-6 p-0">Product Type:</div><div class="col-6 p-0">{{product.product_type}}</div></div>
                    <!-- <div class="row p-0"><div class="col-6 p-0">Prepaid Price:</div><div class="col-6 p-0">{{product.prepaid_price}}</div></div>
                    <div class="row p-0"><div class="col-6 p-0">Collect Price:</div><div class="col-6 p-0">{{product.collect_price}}</div></div>
                    <div class="row p-0"><div class="col-6 p-0">Map Price:</div><div class="col-6 p-0">{{product.map_price}}</div></div> -->
                </div>
            </div>
            <div class="header-card col-3 card">
                <div class="card-body">
                    <p>Got an idea of more/better data to show?<br>E-mail Doug! <a href="mailto:dhutson@karran.com">dhutson@karran.com</a> !</p>
                    <p v-show=admin_view>Cat Id: {{cat_id}}</p>
                </div>
            </div>
        </div>
    
        <br>
        <div class="d-flex justify-content-evenly">
            <button class="btn btn-default flex-fill" :class="tab=='product' ? 'active btn-primary' :''" @click="set_tab('product')" >Product</button>
            <button class="btn btn-default flex-fill" :class="tab=='attributes' ? 'active btn-primary' :''" @click="set_tab('attributes')" >Attributes</button>
            <button class="btn btn-default flex-fill" :class="tab=='relationships' ? 'active btn-primary' :''" @click="set_tab('relationships')">Relationships</button>
            <button class="btn btn-default flex-fill" :class="tab=='images' ? 'active btn-primary' :''" @click="set_tab('images')">Images</button>
            <button class="btn btn-default flex-fill" :class="tab=='ecom' ? 'active btn-primary' :''" @click="set_tab('ecom')">Ecom</button>
            <button class="btn btn-default flex-fill" :class="tab=='categories' ? 'active btn-primary' :''" @click="set_tab('categories')">Categories</button>
            <!-- <button class="btn btn-default flex-fill" :class="tab=='bullets' ? 'active btn-primary' :''" @click="set_tab('bullets')">Desc Bullets</button> -->
            <!-- <button class="btn btn-default flex-fill" :class="tab=='videos' ? 'active btn-primary' :''" @click="set_tab('videos')">Videos</button> -->
        </div>

        <br>

        <router-view/>
        <button class="btn btn-danger save-to-left" @click="back()">Back</button>
    </div>
</template>