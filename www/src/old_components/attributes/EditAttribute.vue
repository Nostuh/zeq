<script>
import axios from 'axios';
import { uf } from '../../../utils/tools.mjs';
import zSimpleTableVue from '../tools/zSimpleTable.vue';

export default {
    name: "EditAttribute",
    data() {
        return {
            attr: {
                product_types: []
            },
            all_product_types: [],
            product_type_to_edit: "Choose Product Type to edit it's avaliable options",
            show_add: false,
            selected_product_type_id: "",
            options: [],
            adding_new: false,
        }
    },
    components: {
        zSimpleTableVue
    },
    methods: {
        load: async function() {
            let id = this.$route.params.id;
            if ( id == "new" ) {
                this.adding_new = true;
                this.attr.id = "new";
            } else {
                let product_type_id_check = this.$route.params.product_type_id;
                let attrs = await axios.get('/api/attributes/get-list');
                this.attr = attrs.data.data[id];
                console.log(this.attr);
                console.log('above attr');
                //for checkbox
                this.attr.is_multiple = this.attr.is_multiple>0?true:false;
                this.attr.enabled = this.attr.enabled>0?true:false;

                this.all_product_types = (await axios.get('/api/attributes/get-product-types')).data;

                if ( product_type_id_check != undefined ) {
                    this.select_product_type(product_type_id_check);
                }
            }

        },
        add_option: async function() {
            let added = await axios.post('/api/attributes/add-attribute-option',{attribute_id:this.attr.id,product_type_id:this.selected_product_type_id});
            let new_id = added.data.insertId;
            this.$router.push({name:"edit-attribute-option",params:{id:new_id}});
        },
        edit_attribute_product_type: async function(id) {
            let payload = {
                product_type_id: id,
                attribute_id: this.attr.id
            }
            await axios.post('/api/attributes/edit-attribute-product-type',payload);
            this.load();
            this.$root.send_global_alert('Saved!');
        },
        edit_option: async function(id) {
            this.$router.push({name:"edit-attribute-option",params:{id:id}});
        },
        save_attribute: async function() {
            if ( this.attr.name == undefined || this.attr.name == "" || this.attr.display_name == undefined || this.attr.display_name == "" ){
                this.$root.$refs.Alert.alert_simple("Error","Please fill out all fields!");
            } else {
                this.attr.is_multiple = this.attr.is_multiple==true?1:0;
                this.attr.enabled = this.attr.enabled==true?1:0;
                await axios.post('/api/attributes/save-attribute',this.attr);
                this.load();
                this.$root.send_global_alert('Saved!');
                if ( this.attr.id == "new" ) {
                    this.back();
                }
            }
        },
        select_product_type: function(id) {
            let product_type = this.all_product_types.filter(apt => apt.id == id);
            this.product_type_to_edit = product_type[0].display_name;
            this.options = this.attr.attribute_options.filter(v=>v.product_type_id==id) || [];
            this.selected_product_type_id = id;

            uf.dloop(this.options,function(i,v){
                v.enabled_display = v.enabled==0?"No":"Yes"
            });

            this.$refs.zSimpleTableVue.set_table(this.options,this.get_config());
            this.show_add = true;
        },
        btn_select_product_type: async function(id) {
            this.$router.push({name:"edit-attribute-option-1",params:{id:this.$route.params.id,product_type_id:id}})
        },
        get_config: function() {
            let that = this;
            return {
                id: {header:"Option ID"},
                edit_button: {header:"Edit?",display_type:"edit_button", callback: function(d) {
                    that.edit_option(d.id);
                }},
                attribute_id: {header:"Attribute ID"},
                display_name: {header:"Display Name"},
                name: {header:"Name"},
                enabled: {header:"Enabled", display_type:"enabled"}
            }
        },
        back: function() {
            this.$router.push({name:"attributes"});
        }
    },
    watch: {
        "$route" :{
            handler(to,from)
            {
                this.load();
            }
        ,deep:true} 

    },
    mounted: async function() {
        this.load();
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
        <h2>Edit Attribute</h2>
        <div class="container p-0 m-0">
            <div class="row">
                <div class="col-3 card p-1 m-1">
                    <div class="card p-1">
                        <form>
                            <div class="mb-3">
                                <label class="form-label">ID</label>
                                <input type="text" class="form-control p-1" v-model="attr.id" disabled/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Display Name</label>
                                <input type="text" class="form-control p-1" v-model="attr.display_name" />
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Short Name</label>
                                <input type="text" class="form-control p-1" v-model="attr.name" />
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" v-model="attr.is_multiple">
                                <label class="form-check-label">Multi Selectable?</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" v-model="attr.enabled">
                                <label class="form-check-label">Enabled?</label>
                            </div>
                            <br><br>
                            <button type="button" class="btn btn-success" v-show="!adding_new" @click=save_attribute()>Save</button>
                            <button type="button" class="btn btn-success" v-show="adding_new" @click=save_attribute()>Add</button>
                        </form>
                    </div>
                    <div class="card p-1 mt-2" v-show="!adding_new">
                        <span class="h4 mb-1">Edit Product Types</span>
                        <div class="card dropdown align-items-end p-1">
                            <label class="form-label">{{attr.product_types_display}}</label>
                            <button class="btn btn-success dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                Edit
                            </button>
                            <ul class="dropdown-menu dropdown-menu-dark">
                                <li><h6 class="dropdown-header">Product Types</h6></li>
                                <li v-for="(option) in all_product_types" :key="option.id">
                                    <span class="dropdown-item" @click=edit_attribute_product_type(option.id)>{{option.display_name}}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="col-8 card p-1 m-1" v-show="!adding_new">
                    <div class="card dropdown p-1">
                        <div class="container">
                            <label class="form-label h4">{{product_type_to_edit}}</label>
                            <div class="float-end">
                                <button class="btn btn-success dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    Select
                                </button>
                                <ul class="dropdown-menu dropdown-menu-dark">
                                    <li><h6 class="dropdown-header">Product Types</h6></li>
                                    <li v-for="(option) in attr.product_types" :key="option.id">
                                        <span class="dropdown-item" @click=btn_select_product_type(option.product_type_id)>{{option.display_name}}</span>
                                    </li>
                                </ul>
                            </div>
                            <div class="float-end me-1">
                                <button type="button" class="btn btn-success" @click=add_option() v-show="show_add">Add New Option</button>
                            </div>
                        </div>
                    </div>
                    
                        <zSimpleTableVue ref="zSimpleTableVue"></zSimpleTableVue>
                    
                </div>
                
            </div>
        </div>
    </div>
</template>