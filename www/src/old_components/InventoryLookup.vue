<script>
import zSimpleTableVue from "./tools/zSimpleTable.vue";
import * as bootstrap from 'bootstrap';
import axios from 'axios';
import { uf } from '../../utils/tools.mjs';


export default {    
    name: "Audits",
    data() {
        return {
            stock: [],
            stock_raw: [],
            rels: [],
            products: [],
            test:{},
            lookup_popup:{},
            clicked_product:{},
        }
    },
    components: {
        zSimpleTableVue
    },
    methods: {
        get_config : function() {
            let that = this;
            return {
                item: { header: "Spruce SKU"},
                is_kit: {header: "Is Kit?" },
                view_button: {header:"View?",display_type:"view_button",callback:async function(d) {
                        await that.display_if_kit(d);
                    }
                },
                magento_image: { header: "Image", display_type: "image" },
                avaliable4000:{header:"Vincennes Avaliable"},
                onhand4000: {header:"Vincennes OnHand"},
                onorder4000: {header:"Vincennes OnOrder"},
                committed4000: {header:"Vincennes Committed"},
                avaliable4100:{header:"Utah Avaliable"},
                onhand4100: {header:"Utah OnHand"},
                onorder4100: {header:"Utah OnOrder"},
                committed4100: {header:"Utah Committed"},
            };
        },
        format_stock: function() {
            let that = this;
            uf.dloop(this.stock,function(i,v){
                v.avaliable4000 = v.onhand4000 - v.committed4000;
                v.avaliable4100 = v.onhand4100 - v.committed4100;
                v.enabled=1;
                let product_check = that.products.find(pv=>pv.spruce_sku==v.item);
                if ( product_check ) {
                    v.magento_image = "/ki_images/"+product_check.img_path+product_check.img_name;
                } else {
                    v.magento_image = "";
                }


                if ( product_check && product_check.is_kit) {
                    v.is_kit = "YES";
                } else {
                    v.is_kit = "NO";
                }
            });
        },
        adjust_stock: function() {
            let that = this;
            uf.dloop(this.stock,function(i,v){
                let kit_info = that.get_kit_info(v);
                if ( kit_info.length > 0 ) {
                    let make = that.calc_how_many_can_be_made(kit_info);    
                    v.avaliable4000 = v.avaliable4000 + make["4000"];
                    v.avaliable4100 = v.avaliable4100 + make["4100"];
                }                    
            });
        },
        get_rels: function(v) {
            let rels = [];
            let product_check = this.products.find(pv=>pv.spruce_sku==v.item);
            if ( product_check ) {
                let product = product_check;
                rels = product.relationships.has.filter(rv=>rv.rel_type_id==2);
            }

            return rels;
        },
        get_kit_info: function(v) {
            let that = this;
            let rels = this.get_rels(v);
            let rtmp = [];

            if ( rels.length > 0 ) {
                // organize make modal

                uf.dloop(rels,function(i,v){
                    let stock = that.stock.find(sv=>sv.item==v.spruce_sku);
                    if ( stock ) {
                        let tmp = {};
                        tmp.sku = v.spruce_sku;
                        tmp.qty = v.rel_qty;
                        tmp.avaliable4000 = stock.avaliable4000;
                        tmp.avaliable4100 = stock.avaliable4100;
                        rtmp.push(tmp);
                    }
                });
            }
            return rtmp;
        },
        calc_how_many_can_be_made: function(products){
            let that = this;
            let can_make_4000 = 9999999;
            let can_make_4100 = 9999999;
            uf.dloop(products,function(i,v) {
                let f4000 = v.avaliable4000 <1 ? 0 : Math.floor(v.avaliable4000/v.qty);
                let f4100 = v.avaliable4100 <1 ? 0 : Math.floor(v.avaliable4100/v.qty);
                can_make_4000 = that.calc_can_make_helper(f4000,can_make_4000);
                can_make_4100 = that.calc_can_make_helper(f4100,can_make_4100);
            });
            return {"4000":can_make_4000,"4100":can_make_4100}
        },
        calc_can_make_helper: function(amt,limit) {
            if ( amt < 1 ) {
                return 0;
            } else if ( amt < limit ) {
                return amt;
            } else {
                return limit;
            }
        },
        display_if_kit: async function(v) {
            let that = this;//this.clicked_product = product;
            let kit_info = this.get_kit_info(v);
            let product_check = this.products.find(pv=>pv.spruce_sku==v.item);
            if ( product_check && kit_info.length > 0 ) {
                    let product = product_check;
                    this.clicked_product = product;
                    this.rels = kit_info;
                    this.lookup_popup.show();
            } else {
                this.$root.send_global_alert("Error, not a kit or kit not setup!",true);
            }
        }
    },
    mounted: async function() {
        let that = this;
        this.lookup_popup = new bootstrap.Modal('#lookup_popup',{});
        this.stock = uf.object_to_array((await axios.get('/api/spruce/get-current-stock')).data);
        this.stock_raw = uf.clone(this.stock);
        this.products = uf.object_to_array((await axios.get("/api/products/get-all-simple-with-relationships")).data);

        this.format_stock();
        this.adjust_stock();
        
        let table_data = this.$refs.zSimpleTableVue.set_table(
            this.stock,
            this.get_config(),
            {
                display_limit: 100
            }
        );
    }
}
</script>

<style>

div.inventory_lookup div.zSimpleTable td:nth-child(4n+5) { background-color: rgb(188, 233, 247);}
div.inventory_lookup div.zSimpleTable td { font-weight: bold;}
div.inventory_lookup div.zSimpleTable > div > div.d-flex {flex-direction:row !important;}
</style>

<template>
    <div class="inventory_lookup">
        <h2>Inventory Lookup</h2>
            <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
    </div>
    <div class="modal" id="lookup_popup" tabindex="-1" >
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{clicked_product.spruce_sku}} kit contents</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="d-grid">
                    <div class="row">
                        <div class="col-3 fw-bold">Spruce Sku</div>
                        <div class="col-3 fw-bold">Qty Needed</div>
                        <div class="col-3 fw-bold">Vincennes Avaliable</div>
                        <div class="col-3 fw-bold">Utah Avaliable</div>
                    </div>
                    <div class="row" v-for="(d,i) in rels" :key="d.id">
                        <div class="col-3">{{d.sku}}</div>
                        <div class="col-3">{{d.qty}}</div>
                        <div class="col-3">{{d.avaliable4000}}</div>
                        <div class="col-3">{{d.avaliable4100}}</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
            </div>
        </div>
    </div>
</template>