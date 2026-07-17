<script>
import axios from 'axios';
import Multiselect from "@vueform/multiselect";
// The @vueform/multiselect component ships its own theme; without it the
// dropdown has no styles and never hides (the eqmob picker rendered as an
// unstyled, always-open stack of options). Theme colors are mapped to the
// dark palette via --ms-* overrides in scss/styles.scss.
import "@vueform/multiselect/themes/default.css";

export default {
    name: "Equipment Add",
    data() {
        return {
            slot: ['head','neck','cloak','amulet','torso','arms','hands','shield','finger','held',
                'belt','legs','feet','wield','multi','axe','sword','dagger','bow','ancient','polearm','bludgeon','staff'],
            the_slot: "",
            item_info: "",
            note:"",
            // Source mob comes from the Mob KB (mob_monsters), replacing the
            // legacy eqmobs label list. Optional — items with an unknown
            // source are legal; picking one binds the item into that mob's
            // loot list (mob_loot.equipment_id).
            mobs: [],
            selected_mob: null,
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
        // Paste-to-parse is the ONLY add path: the pasted identify text is
        // parsed server-side (/api/equipment/add) and the resulting item is
        // tagged as owned by the caller. See docs/equipment-redesign.md.
        add: async function() {
            if ( this.item_info != "" && this.the_slot != "" && this.$root.user ) {
                const res = await axios.post(`/api/equipment/add`,
                    {
                        info:this.item_info.trim(),
                        note:this.note.trim(),
                        slot:this.the_slot,
                        mob_id:this.selected_mob ? this.selected_mob.id : null
                    }
                );
                if ( !res.data || !res.data.ok ) {
                    this.$root.send_global_alert((res.data && res.data.error) || "Add failed — check the pasted text", true);
                    return;
                }
                this.item_info = "";
                this.the_slot = "";
                this.selected_mob = null;
                this.note = "";
                this.$root.send_global_alert("Added Successfully!");
            } else {
                this.$root.send_global_alert("Fill all fields! // RE-LOGIN",true);
            }
        },
        load_mobs: async function() {
            // ~150 mobs — load once, let Multiselect's search filter locally.
            this.mobs = (await axios.get(`/api/equipment/mobs`)).data.data;
        }
    },
    mounted: async function() {
        this.load_mobs();
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
        <div class="row align-items-center">
            <div class="col-md-3">
                            <Multiselect
                            v-model="selected_mob"
                            class="filter"
                            :options="mobs"
                            :object="true"
                            value="name"
                            label="name"
                            valueProp="id"
                            track-by="name"
                            :searchable="true"
                            placeholder="Source mob (optional).."
                            ref="mob_selector"
                            />
            </div>
            <div class="col-md-5 small text-muted">
                Picking a mob links the item into that mob's loot list.
                <template v-if="$root.canEqmobsEdit">
                    Mob missing?
                    <router-link :to="{ name: 'mob-detail', params: { id: 'new' } }">Create it in the Mob KB</router-link>.
                </template>
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
