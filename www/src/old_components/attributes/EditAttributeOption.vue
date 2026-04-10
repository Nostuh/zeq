<script>
import axios from 'axios';

export default {
    name: "EditAttributeOption",
    data() {
        return {
            option: {
            },
        }
    },
    components: {
        
    },
    methods: {
        load: async function() {
            let id = this.$route.params.id;
            let attribute_options = (await axios.get('/api/attributes/get-attribute-options')).data;
            this.option = attribute_options.find(v => v.id == id);
            console.log(this.option);
            
        },
        save: async function() {
            await axios.post('/api/attributes/save-option',this.option);
            this.load();
            this.$root.send_global_alert('Saved!');
            this.back();
        },
        enabled_toggle: function() {
            let that = this;
            let title = "";
            if ( this.option.enabled == 0 ) {
                title = "ENABLE";
            } else {
                title = "DISABLE";
            }
            this.alert.alert(
                'Would you like to '+title+' this Attribute\'s Option?',
                'This will '+title+' the option '+that.option.display_name+' for all products.',function() {
                    that.toggle_option();
            },"Cancel","Update");
        },
        toggle_option: async function() {
            await axios.post('/api/attributes/option-toggle-enabled',{id:this.option.id});
            this.load();
            this.$root.send_global_alert('Saved!');
        },
        back: function() {
            this.$router.go(-1);
        }
    },
    mounted: async function() {
        this.load();
        this.alert = this.$root.$refs.Alert;
    },
}
</script>

<template>
    <div>
        <div class="floating-menu">
            <button type="button" class="btn btn-danger" @click=back()>Back</button>
        </div>
        <h2>Edit Option</h2>
        <div class="container p-0 m-0">
            <div class="row">
                <div class="col-5 card p-1 m-1">
                    <div class="card p-1">
                        <form>
                            <div class="mb-3">
                                <label class="form-label">ID</label>
                                <input type="text" class="form-control p-1" v-model="option.id" disabled/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Display Name</label>
                                <input type="text" class="form-control p-1" v-model="option.display_name" placeholder="Enter visible name to customers..."/>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Short Name</label>
                                <input type="text" class="form-control p-1" v-model="option.name" placeholder="Enter short name for backend purposes ex brushed_copper"/>
                            </div>
                            
                            <br><br>
                            <div class="row justify-content-evenly">
                                <button type="button" class="btn btn-success col-2" @click=save()>Save</button>
                                <button type="button" class="btn btn-danger col-2" @click=enabled_toggle() v-show="option.enabled==1">Disable</button>
                                <button type="button" class="btn btn-success col-2" @click=enabled_toggle() v-show="option.enabled==0">Enable</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>