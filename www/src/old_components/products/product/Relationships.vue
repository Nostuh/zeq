<script>
import axios from 'axios';
import { uf } from '../../../../utils/tools.mjs';
import zSimpleTableVue from '../../tools/zSimpleTable.vue';
import Multiselect from '@vueform/multiselect';

export default {    
    name: "Relationships",
    data() {
        return {
            accs: [],
            has: [],
            part_of: [],
            acc_reload: true,
            selected_product:{},
            products: {},
            rel_types: {},
            selected_rel_type: {},
            selected_has_or_part_of: "",
            can_edit:false,
            qty_input:"",
            has_or_part_of:["Has","Part Of"]
        }
    },
    components: {
        zSimpleTableVue,Multiselect
    },
    methods: {
        get_config: function() {
            let that = this;
            let config = {
                    //id:{header:"Product Id"},
                    product_url:{header:"View Url",display_type:"view_button",callback: function(d) {
                        that.$router.push(d.product_url);
                    }},
                    sku:{header:"Sku"},
                    magento_image:{header:"Image",display_type:"image"},
                    rel_qty:{header:"Qty"},
                    rel_display_name:{header:"Type"},
            };
            if ( this.can_edit ) {
                config.delete_button = {header:"Delete",display_type:"delete_button",callback: function(d) {
                    that.delete_relationship(d);
                }};
            }
            return config;
        },
        select_product: function() {
            console.log(this.selected_product);
        },
        select_rel_type: function() {
            console.log(this.selected_rel_type);
        },
        add_relationship: async function() {
            if ( this.selected_product.id != undefined 
                  && this.selected_rel_type.id != undefined 
                  && this.selected_has_or_part_of != "" ) {
                    let payload = {
                        product_id:this.$parent.$parent.product.id,
                        relationship_product_id: this.selected_product.id,
                        type_id:this.selected_rel_type.id,
                        qty:this.qty_input,
                        user_id:this.$root.user.id,
                    }

                    if ( this.selected_has_or_part_of == "Part Of" ) {
                        payload.product_id = this.selected_product.id;
                        payload.relationship_product_id = this.$parent.$parent.product.id;
                    } 


                    await axios.post("/api/products/add-relationship",payload);

                    this.reload();
            } else {
                this.$root.send_global_alert("Error, did not save, make sure all fields are filled out!",true);
            }


        },
        delete_relationship: async function(d) {
            console.log(d);
            let payload = {
                product_id:this.$parent.$parent.product.id,
                relationship_product_id: d.id,
                type_id:d.rel_type_id,
                user_id:this.$root.user.id,
            }

            await axios.post("/api/products/delete-relationship",payload);

            this.reload();
        },
        reload: async function() {
            await this.$parent.$parent.load();
            this.has = [];
            this.part_of = [];
            this.acc_reload = true;
            this.load();
        },
        load: async function() {
            console.log(this.$parent.$parent.product.relationships);
            let that = this;
            let products = uf.object_to_array((await axios.get('/api/products/all-products-simple')).data);
            this.products = products.map(function(p) {
                return {
                    id:p.id,
                    sku:p.sku
                }
            });
            this.rel_types = (await axios.get("/api/products/relationship-types")).data;
            while ( this.acc_reload == true ) {
                if ( this.$parent.$parent.product.relationships.has != undefined ) {
                    uf.dloop(this.$parent.$parent.product.relationships.has,function (i,v) {
                        that.has.push(v);
                    })
                    uf.dloop(this.$parent.$parent.product.relationships.part_of,function (i,v) {
                        that.part_of.push(v);
                    })
                    this.acc_reload = false;
                }
                await uf.sleep(100);
            }

            uf.dloop(this.has,function(i,v){
                v.magento_image = "/ki_images/"+v.img_path+v.img_name;
                v.product_url = "/products/"+v.id+"/relationships";
            });

            uf.dloop(this.part_of,function(i,v){
                v.magento_image = "/ki_images/"+v.img_path+v.img_name;
                v.product_url = "/products/"+v.id+"/relationships";
            });

            await this.$refs.zSimpleTableVue.set_table(this.has,this.get_config(),{display_limit:100,user:this.$root.user});
            await this.$refs.zSimpleTableVue2.set_table(this.part_of,this.get_config(),{display_limit:100,user:this.$root.user});
            
            console.log(this.has);
            console.log(this.part_of);
        }
    },
    watch: {
        "$route.params.id": function(to,from) {
            if (to!=from) {
                this.reload();
            }
        }
    },
    mounted: async function() {
        this.load();

            if ( this.$root.user.role_ids.find(v=>v==1||v==5) ) {
                this.can_edit = true;
            }
    }
}
</script>


<template>
    <div class="row">
        <div class="container-fluid product-table" style="margin-bottom:-60px;" v-if="can_edit">
            <div class="row">
                <div class="col-2 filters">
                    <Multiselect 
                        v-model="selected_has_or_part_of"
                        :options="has_or_part_of"
                        placeholder="Has or Part Of.."
                        ref="has_or_part_of_selector"/>
                </div>
                <div class="col-2 filters">
                    <Multiselect 
                        v-model="selected_product"
                        @select="select_product()"
                        :options="products"
                        :object="true"
                        value="sku"
                        label="sku"
                        valueProp="id"
                        track-by="sku"
                        :searchable="true"
                        placeholder="Product.."
                        ref="product_selector"/>
                </div>
                <div class="col-2 filters">
                    <Multiselect 
                        v-model="selected_rel_type"
                        @select="select_rel_type()"
                        :options="rel_types"
                        :object="true"
                        value="display_name"
                        label="display_name"
                        valueProp="id"
                        track-by="display_name"
                        placeholder="Relationship Type.."
                        ref="rel_selector"/>
                </div>
                <div class="col-2 filters">
                    <input style="height: 100%" type="number" v-model="qty_input" placeholder="Qty.."/>
                </div>
                <button class="col-2 btn btn-success" style="z-index:999;" @click="add_relationship()">Add Relationship</button>
            </div>
        </div>
        <div class="container-fluid product-table" style="margin-bottom:-60px;" v-if="!can_edit">
            <p>Contact Doug for additional accessory relationships! E-mail: <a href="mailto:dhutson@karran.com">dhutson@karran.com</a></p>
        </div>
    </div>
    <h1>.</h1>
    <h1>Has</h1>
    <div class="row" >
        <div class="container-fluid product-table" >
            <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
        </div>
    </div>
    <h1>Part Of</h1>
    <div class="row" >
        <div class="container-fluid product-table" >
            <zSimpleTableVue ref="zSimpleTableVue2"></zSimpleTableVue>
        </div>
    </div>    
</template>