<script>
import axios from 'axios';
import Multiselect from "@vueform/multiselect";

export default {    
    name: "Equipment Add",
    data() {
        return {
            slot: ['head','neck','cloak','amulet','torso','arms','hands','shield','finger','held',
                'belt','legs','feet','wield','multi','axe','sword','dagger','bow','ancient','polearm','bludgeon','staff'],
            the_slot: "",
            item_info: "",
            note:"",
            eqmobs:['zork','is','mon'],
            selected_eqmob:"",
            new_eq_mob: "",
            example: `
A jeweled dagger known as 'Annihilator' (1h) <Bound> seems to vibrate rapidly.
It increases user's strength pitifully. (3/20)
It increases user's dexterity a bit. (6/20)
It gives tiny bonus to user's triple thrust.
It gives tiny bonus to user's anatomy.
It gives tiny bonus to user's triple backstab.
It has awesome weapon class for its type (low in general).
It increases damage somewhat. (8/20)
It increases hit chance pathetically. (2/20)
This item loses its magical powers with average speed.

`,
        }
    },
    components: {
        Multiselect
    },
    methods: {
        add: async function() {
            if ( this.item_info != "" && this.the_slot != "" && this.selected_eqmob != "" && this.$root.user.first_name !== false) {
                await axios.post(`/api/eq/add`,
                    {
                        item_info:this.item_info.trim(),
                        note:this.note.trim(),
                        slot:this.the_slot,
                        eqmob:this.selected_eqmob.id,
                        user_id:this.$root.user.id
                    }
                );
                this.item_info = "";
                this.the_slot = "";
                this.selected_eqmob = "";
                this.note = "";
                this.$root.send_global_alert("Added Successfully!");
            } else {
                this.$root.send_global_alert("Fill all fields! // RE-LOGIN",true);
            }
        },
        add_eqmob: async function() {
            if ( this.new_eq_mob != "" ) {
                await axios.post(`/api/eq/add-mob`,
                    {
                        name:this.new_eq_mob
                    }
                )
                await this.load_eqmobs();
                this.new_eq_mob = "";
                this.$root.send_global_alert("Added Successfully!");
            } else {
                this.$root.send_global_alert("New EQ Mob NEEDS NAME!",true);
            }
            
        },
        load_eqmobs: async function() {
            this.eqmobs = (await axios.get(`/api/eq/eq-mobs`)).data;
        }
    },
    mounted: async function() {
        this.load_eqmobs();
    }
}
</script>

<style scoped>
div.product-table img {
  width: 50px;
}
.filters .filter {
  height: 3em;
  margin: 0.25em 0 0.5em 0.25em;
}
div.product-table > img.is_downloading {
  width: 300px;
  margin: auto;
  display: block;
}

button.filter {
    width: 100px;
    height: 2em;
    margin: 0 1em;
    padding: 0;
    border-color:black;
}
</style>


<template>
    <div>
        <h2>Equipment Add</h2>
        <div class="mb-3">
            <label for="exampleFormControlTextarea1" class="form-label">Paste Input!</label>
            <textarea class="form-control" id="exampleFormControlTextarea1" v-model=item_info rows="10"></textarea>
        </div>
        <br><br>
        <div class="form-check form-check-inline" v-for="v in slot" :key="v">
            <input class="form-check-input" type="radio" name="inlineRadioOptions" :id=v :value=v v-model=the_slot>
            <label class="form-check-label" for="radio control">{{v}}</label>
        </div>
        <br><br>
        <div class="mb-3">
            <label for="exampleFormControlTextarea2" class="form-label">Note</label>
            <textarea class="form-control" id="exampleFormControlTextarea2" v-model=note rows="2"></textarea>
        </div>
        <br><br>
        <div class="row">
            <div class="col-2">
                            <Multiselect
                            v-model="selected_eqmob"
                            class="filter"
                            :options="eqmobs"
                            :object="true"
                            value="name"
                            label="name"
                            valueProp="id"
                            track-by="name"
                            :searchable="true"
                            placeholder="EQ Mobs.."
                            ref="eqmob_selector"
                            />
            </div>
            <div class="col-2">
                <button class="btn btn-primary" style="float:right" type="button" @click="add_eqmob">Add New Eq Mob</button>
            </div>
            <div class="col-2">
                <input type="text" class="form-control" v-model="new_eq_mob" placeholder="New Eq Mob Name..." />
            </div>
        </div>
        <br><br>
        <button class="btn btn-primary" type="button" @click="add">Add Item</button>
        <br>
        <br>
        <br>
        <h3>Example:</h3>
        <pre>{{example}}</pre>

    </div>
</template>