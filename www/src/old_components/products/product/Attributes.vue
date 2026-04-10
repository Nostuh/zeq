<script>
import axios from "axios";
import { uf } from "../../../../utils/tools.mjs";
import Multiselect from "@vueform/multiselect";

export default {
  name: "Product-Attribute",
  data() {
    return {
      product: [],
      product_type_attributes: [],
      attributes: [],
      attributes_missing: [],
      attribute_options: "false",
      test: {},
      can_edit: false,
      dealerAttributes: [],
      evo_editable: [],
      can_edit_dealer_portal: false,
    };
  },
  components: {
    Multiselect,
  },

  methods: {
    load: async function (force = false) {
      let that = this;
      this.$parent.$parent.tab = "attributes";

      while ((this.attributes.length == 0 && this.attributes_missing.length ==0) || force == true ) {
        
        let _attributes = this.$parent.$parent.attributes;
        if (_attributes) {
          _attributes.sort(function (a, b) {
            return a.display_name.localeCompare(b.display_name);
          });
          let missing = [];
          let have = [];

          //only enabled
          //console.log(_attributes);
          //_attributes = _attributes.filter(v=>v.enabled==1);

          uf.dloop(_attributes, function (i, v) {
            try {
              // is attribute enabled
              if (!v.enabled) {
                throw "continue";
              }
              //does still have the correct product_type matchup
              if (
                !v.product_types.filter(
                  (vp) => vp.product_type_id == that.product.product_type_id
                )
              ) {
                throw "continue";
              }
              //console.log(v);

              //only allow enabled attribute options
              v.attribute_options = v.attribute_options.filter(
                (va) => va.enabled == 1
              );
              v.product_options = v.product_options.filter(
                (va) => va.enabled == 1
              );

              if (v.product_options.length > 0) {
                have.push(v);
              } else {
                missing.push(v);
              }

              //sort
              v.attribute_options = v.attribute_options.sort(function (a, b) {
                if (parseInt(a.name) && parseInt(b.name)) {
                  return a.name - b.name;
                } else {
                  return a.name.localeCompare(b.name);
                }
              });
            } catch (e) {
              if (e != "continue") {
                console.log("Error in while loop")
                throw e;
              }
            }
          });
          this.attributes = have;
          this.attributes_missing = missing;
          this.product_type_attributes =
            this.$parent.$parent.product_type_attributes;
          this.product = this.$parent.$parent.product;

          force = false;
          await uf.sleep(100);
        } else {
          await uf.sleep(100);
        }
      }
      
      await this.get_evo_attributes();
      console.log("haves");

      if (this.$root.user.role_ids.find((v) => v == 1)) {
        this.can_edit_dealer_portal = true;
      }

      // look for missing

      // uf.dloop(this.product_type_attributes, function(i,v) {
      //     let check = that.attributes.filter(afv => afv.id == v.id);
      //     if ( check.length < 1 ) {
      //         that.attributes_missing.push(v);
      //     }
      // });
    },

    display_options: function (options) {
      let tmp = [];
      uf.dloop(options, function (i, v) {
        tmp.push(v.display_name);
      });

      return tmp.join(", ");
    },
    save_attribute: async function (option) {
      let attr_id = option.attribute_id;
      let new_option = option;

      new_option.product_id = this.product.id;
      await axios.post("/api/products/save_attribute", {
        user: this.$root.user,
        option: new_option,
      });
      await this.$parent.$parent.load();
      this.load(true);
      this.$root.send_global_alert("Saved!");
    },
    save_attribute_after: async function (display_name) {
      let ref = this.$refs[display_name];
      ref = ref[0];
      await uf.sleep(10);
      ref.clear();
      ref.clearSearch();
    },
    add_option: async function (attr) {
      this.$router.push({
        name: "edit-attribute-option-1",
        params: { id: attr.id, product_type_id: this.product.product_type_id },
      });
    },
    add_attribute: function () {
      this.$router.push({ name: "edit-attribute", params: { id: "new" } });
    },

    // Update Evo site with currently save attributes
    update_dp_attributes: async function () {
      let product_id = this.product.id;
      let response = await axios.put("/api/evolution/update-attributes", {
        product_id: product_id,
      });
      if (response && response.data && response.data.status == "success") {
        this.$root.send_global_alert("Updated Dealer Portal!");
      } else {
        alert(response.data.status);
      }
    },

    // gets relevant dealer portal attributes
    get_evo_attributes: async function () {
      let response = await axios.get("/api/evolution/get-attribute-map")
      this.evo_editable = response.data[this.$parent.$parent.product.product_type_id]
    },

    // maps through attribute and attributes_missing and marks which
    // ones we can update in the dealer portal 
    isDealerAttribute: function (att_id) {
      return this.evo_editable.some(
        (dealerAttr) => dealerAttr === att_id
      );
    },
  },

  mounted: async function () {
    // admin / core-product
    if (
      this.$root.user.role_ids.find((v) => v == 1 || v == 2) ||
      (this.$root.user.role_ids.find((v) => v == 3) &&
        !this.$parent.$parent.product.jackson_audit)
    ) {
      this.can_edit = true;
    }

    this.load();
  },
};
</script>

<style>
div.multiselect-wrapper > div.multiselect-placeholder {
  color: black !important;
}

.update-dealer-portal {
  position: fixed;
  top: 80px;
  right: 100px;
  z-index: 9999;
  height: 6em;
  width: 10em;
}

.add-cats {
  position: fixed;
  top: 80px;
  right: 400px;
  z-index: 9999;
  height: 6em;
  width: 6em;
}
</style>

<template>
  <div>
    <div>
      <button
        style="padding: 20px"
        class="btn btn-success update-dealer-portal"
        v-show="can_edit_dealer_portal"
        @click="update_dp_attributes()"
      >
        Update Dealer Portal
      </button>
    </div>
    <div class="container">
      <div class="row">
        <div class="col-9"></div>
        <div class="col-3"></div>
      </div>
    </div>
    <div class="container">
      <div class="row">
        <div class="row col-6">
          <h2>
            Attributes<button
              v-if="can_edit"
              class="btn btn-success"
              style="margin-left: 1em; z-index: 1"
              @click="add_attribute()"
            >
              Add Attribute
            </button>
          </h2>
        </div>
        <div class="row col-6">
          <h2>Attribute needing value</h2>
        </div>
      </div>
    </div>
    <div class="container">
      <div class="row">
        <div class="col-6">
          <template v-for="v in attributes" :key="v.id"> 
            <div class="row m-1 align-items-center">
              <div v-if="can_edit_dealer_portal" class="col-auto" style="width: 30px;">
                <span v-if="isDealerAttribute(v.id)">
                  <img src="../../../assets/images/evo-32x32.png">
                </span>
              </div>
              <div class="col">
                <div class="card">
                  <div class="card-body p-2">
                    <div class="row">
                      <div v-if="can_edit" class="col-6">
                        <Multiselect
                          style="width: 90%"
                          :options="v.attribute_options"
                          @select="save_attribute"
                          @close="save_attribute_after(v.display_name)"
                          :object="true"
                          value="display_name"
                          label="display_name"
                          valueProp="id"
                          track-by="display_name"
                          :searchable="true"
                          :placeholder="v.display_name"
                          :ref="v.display_name"
                        />
                      </div>
                      <div class="col-3" v-else>
                        {{ v.display_name }}
                      </div>
                      <div class="col-3">
                        {{ display_options(v.product_options) }}
                      </div>
                      <div class="col-3" v-if="can_edit">
                        <button class="btn btn-success" @click="add_option(v)">
                          Add Option
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="col-6" v-if="can_edit">
          <template v-for="v in attributes_missing" :key="v.id">
        
            <div class="row m-1 align-items-center">
              <div v-if="can_edit_dealer_portal" class="col-auto" style="width: 30px;">
                <span v-if="isDealerAttribute(v.id)">
                  <img src="../../../assets/images/evo-32x32.png">
                </span>
              </div>
            <div class="col">
              <div class="card">
              <div class="card-body p-2">
                <div class="row">
                  <div class="col-9" v-if="can_edit">
                    <Multiselect
                      style="width: 90%"
                      :searchable="true"
                      @closse="save_attribute_after(v.display_name)"
                      :options="v.attribute_options"
                      @select="save_attribute"
                      :object="true"
                      value="display_name"
                      label="display_name"
                      valueProp="id"
                      track-by="display_name"
                      :placeholder="v.display_name"
                    />
                  </div>
                  <div class="col-3" v-if="can_edit">
                    <button class="btn btn-success" @click="add_option(v)">
                      Add Option
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
            </div>
          </template>
        </div>

        <div class="col-4" v-else>
          <p>
            Contact Jackson for additional attributes to be added or updated
            values! E-mail:
            <a href="mailto:jniehaus@karran.com">jniehaus@karran.com</a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<!-- <span v-if="isDealerAttribute(v.display_name)">** </span> -->
<!-- get_dealer_portal_data: async function () {
//   try {
//     let response = await axios.get("api/evolution/product-data", {
//       params: {
//         evolution_id: this.$parent.$parent.product.evolution_id,
//       },
//     });
//     console.log("Data received:", response.data.product.attributes);
//   } catch (error) {
//     console.error("Error getting data:", error);
//   }
// },
// update_dp_attributes: async function () {
//   try {
//     let response = await axios.get(
//       `api/dealerportal/get-product-dp-attributes/${this.$parent.$parent.product.id}`
//     );
//     let dealerAttributes = response.data;

//     let payload = {
//       data: dealerAttributes.reduce((acc, dealerAttr) => {
//         acc[dealerAttr.attr_name] = {
//           name: dealerAttr.attr_name,
//           value: dealerAttr.attr_value,
//           filterable: true,
//         };
//         return acc;
//       }, {}),
//     };

//     await axios.put(`api/evolution/update-attributes`, {
//       evolution_id: this.$parent.$parent.product.evolution_id,
//       payload: payload,
//     });

//     this.$root.send_global_alert("Attributes updated successfully!");
//   } catch (error) {
//     console.error("Error updating attributes:", error);
//   }
// }, -->
