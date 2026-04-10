<script>
import axios from "axios";
import { uf } from "../../../../utils/tools.mjs";
import Multiselect from "@vueform/multiselect";
import { handleError } from "vue";

export default {
    name: "Product_Categories",
    data () {
        return {
            product: [],
            can_edit: false,
            ki_current_category: "",
            evolution_category_mapping: [],
            our_categories: [],
            categories_raw: [],
            category_mapping: {},
            loaded: false,
            trial_top_category: {},
            top_level_options:[],
            trial_full_categories: [],
            full_category_data: [],
            selected_categories: [],
            all_options: [] 
        }
    },

    components: {
        Multiselect
    },

    computed: {
      need_to_save: function () {
        return JSON.stringify(this.selected_categories) !== JSON.stringify(this.categories_raw);
      },
    },

    methods: {
        load: async function () {
            while (!this.product || !this.product.id) {
                this.product = this.$parent.$parent.product;
                await uf.sleep(100);
            }

            if (this.$root.user.role_ids.find((v) => v == 1 || v == 2)) {
              this.can_edit = true;
            } else if (
              this.$root.user.role_ids.find((v) => v == 3) &&
              !this.$parent.$parent.product.jackson_audit
            ) {
              this.can_edit = true;
              this.lock_jackson_audit = true;
            } else {
              this.can_edit = false;
            }

            await this.get_category_map_trial()
            await this.get_ki_categories()
            this.categories_raw = uf.clone(this.selected_categories)
            this.loaded = true
        },

        // dynamically builds map from evolutionX
        get_category_map_trial: async function () {
          try {
            let response =await axios.get("/api/evolution/get-evolution-categories")
            this.evolution_category_mapping = response.data
          } catch (error) {
            console.error("Error", error)
          }
        },

        get_ki_categories: async function () {
          let product_id = this.product.id;

          try {
            let current_ki_categories = await axios.get(`/api/evolution/get-ki-categories/${product_id}`)
            if (current_ki_categories && current_ki_categories.data) {
              this.our_categories = current_ki_categories.data
              this.selected_categories = this.our_categories.map(category => category.id);

              if (this.our_categories.length > 0) {
                this.trial_top_category = this.evolution_category_mapping.children.find(
                  (cat) => cat.id === this.our_categories[0].id
                );
                this.top_level_options = this.evolution_category_mapping.children;
                this.full_category_data = this.build_category_data(this.our_categories, this.evolution_category_mapping.children);
                this.ki_current_category = this.our_categories.map(category => category.name).join(' ');
              } else {
                  this.top_level_options = this.evolution_category_mapping.children; 
                  this.full_category_data = ["Select Category"];
                  this.ki_current_category = ''; 
                  console.log("No categories found for the product. Top-level options loaded.");
                } 
            } 
          } catch (error) {
              console.error("Error fetching KI categories:", error);
              this.our_categories = []; 
              this.selected_categories = [];
              this.top_level_options = this.evolution_category_mapping.children; 
              this.full_category_data = [this.top_level_options[0]]; 
              this.ki_current_category = '';
          }
        },
        
        find_category_by_id: function (categories, target_id) {
          for (let category of categories) {
            if (category.id === target_id) {
              return category
            }
            if (category.children && category.children.length > 0) {
              let found = this.find_category_by_id(category.children, target_id);
              if (found) {
                return found
              }
            }
          }
        },

        build_category_data: function (current_categories, category_map) {
          let full_category_data = [];

          for (let category of current_categories) {
            let category_data = this.find_category_by_id(category_map, category.id);
            if (category_data) {
              full_category_data.push(category_data)
            }
          }
          return full_category_data
        },

        update_on_select: function (category_id, index) {
          this.ki_current_category = '';
          let new_category = this.find_category_by_id(this.evolution_category_mapping.children, category_id)
          if (new_category) {
            this.full_category_data = this.full_category_data.slice(0, index + 1)
            this.full_category_data[index] = new_category
          }
          
          if (new_category.children && new_category.children.length > 0) {
            this.full_category_data[index + 1] = {}; 
          }
          this.selected_categories = this.full_category_data.map((cat) => cat.id);
          console.log(this.full_category_data)
        },

        save_categories_ki: async function () {
          await this.save_new_category_ids_list();
          await this.send_new_categories_to_ki();
          this.categories_raw = uf.clone(this.selected_categories) 
          this.$root.send_global_alert(
              "Saved!"
            );        
        },
        
        // first save save_new_value, then this compiles list of new categories and ids and sets
        // this.our_categories equal to the new list
        save_new_category_ids_list: async function () {
          let category_list_for_ki = []
          for (let i =0; i < this.full_category_data.length; i++) {
            let cat = this.full_category_data[i]
            category_list_for_ki.push({name: cat.name, id: cat.id})
          }
          this.our_categories = category_list_for_ki
        },

        // then we pass the new this.our_categories to ki db
        send_new_categories_to_ki: async function () {                
          let payload = {
            user: this.$root.user, 
            product_id: this.product.id,
            categories: this.our_categories
          }
          await axios.post("/api/products/save-category", payload);
          this.ki_current_category = this.our_categories
            .filter(category => category.name)
            .map(category => category.name)
            .join(' ');
        },

        // there's a lag and shows previous and current 4th level cats. hit twice for update
        save_new_categories_to_dp: async function () {
          if (this.need_to_save) {
            this.$root.send_global_alert(
              "Please save changes before updating the Dealer Portal."
            );
            return;
          }
          let product_id = this.product.id;
          let response = await axios.post("/api/evolution/update-categories", {
            product_id: product_id,
          })
          uf.sleep(100)
          this.dp_current_category = ''
          if (response && response.status == 200) {
              this.$root.send_global_alert("Updated Dealer Portal!");
            } else {
              alert(response.status);
            }
        },
    },

    mounted: async function () {
        this.load();
    },
}
</script>

<style>
    .add-cats {
        position: fixed;
        top: 80px;
        right: 200px;
        z-index: 9999;
        height: 6em;
        width: 10em;
    }
    .dp-button {
        position: fixed;
        top: 80px;
        right: 175px;
        z-index: 9999;
        height: 6em;
        width: 10em;
    }
</style>

<template>
    <div class="container">
        <button
            style="padding: 20px"
            class="btn btn-success dp-button"
            v-show="can_edit"
            @click="save_new_categories_to_dp()"
        >
            Update to Dealer Portal
      </button>
      <button
        class="btn btn-success save-to-right"
        @click="save_categories_ki()"
        v-show="can_edit"
      >
          Save
      </button>
      <div class="need-to-save" v-show="need_to_save">
          CHANGES MADE, NEED TO UPDATE DP!
      </div>
      <div class="row mb-5">
        <div class="col-6">
          <h5>Current KI Category: {{ this.ki_current_category || "Need to set categories" }}</h5>
        </div>
      </div>
      <div v-for="(category, index) in full_category_data" :key="index" class="row mb-3">
        <div class="col-12">
          <h5>Level {{ index }} Category</h5>
          <div class="card">
            <div class="card-body">
              <Multiselect
                v-model="full_category_data[index]"
                value="name"
                valueProp="id"
                :options="(index > 0 ? full_category_data[index - 1].children : top_level_options)"
                :placeholder="full_category_data[index].name || 'Select Category'"
                style="width: 100%"
                label="name"
                track-by="id"
                @select="update_on_select($event, index)"
                :disabled="!can_edit"
                />
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>