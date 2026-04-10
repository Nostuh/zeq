<script>
import axios from "axios";
import { uf } from "../../../../utils/tools.mjs";

export default {
  name: "Product-Product",
  data() {
    return {
      product: [],
      product_raw: [],
      can_edit: false,
      can_change_product_type: false,
      lock_jackson_audit: false,
      can_edit_dealer_portal: false,
    };
  },
  components: {},
  methods: {
    load: async function () {
      while (this.product.id == undefined) {
        this.product = this.$parent.$parent.product;
        this.product.jackson_audit = this.product.jackson_audit ? true : false;
        this.product_raw = uf.clone(this.product);
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

      if (this.$root.user.role_ids.find((v) => v == 1 || v == 6)) {
        this.can_change_product_type = true;
      }

      if (this.$root.user.role_ids.find((v) => v == 1)) {
        this.can_edit_dealer_portal = true;
      }
    },
    save: async function () {
      /// how to save
      if (JSON.stringify(this.product) !== JSON.stringify(this.product_raw)) {
        this.product.jackson_audit = this.product.jackson_audit ? 1 : 0;
        await axios.post("/api/products/save_product", {
          user: this.$root.user,
          product: this.product,
        });
        this.$root.send_global_alert("Saved!");
        this.product = [];
        this.product_raw = [];
        this.load();
      }
    },
    update_dealer_portal: async function () {
      if (this.need_to_save) {
        this.$root.send_global_alert(
          "Please save changes before updating the Dealer Portal."
        );
        return;
      }

      let product_id = this.product.id;

      let response = await axios.post("/api/evolution/update-product", {
        product_id: product_id,
      });

      if (response && response.data && response.data.status == "success") {
        this.$root.send_global_alert("Updated Dealer Portal!");
      } else {
        alert(response.data.status);
      }
    },

    edit_product_type: function () {
      this.$router.push({ name: "product-edit-product-type" });
    },

    create_product_dp: async function () {
      let product_id = this.product.id
      try {
        let response = await axios.post(`/api/evolution/create-product/${product_id}`)
        if (response.data.status === "success") {
          this.$root.$refs.Alert.alert_simple("Success!","Product added to Dealer Portal!")
        } 
      } catch (error) {
        if (error.response && error.response.status === 400) {
          if (error.response.data.data.missingFields) {
            let missing_fields = error.response.data.data.missingFields
            this.$root.$refs.Alert.alert_simple("Error", `Please fill in the following required fields: ${missing_fields.join(", ")}`);
          } else {
              const errorMessage = error.response.data.message || "An error occurred.";
              this.$root.$refs.Alert.alert_simple("Error", errorMessage);
          }
        } else {
          console.error("An unexpected error occurred:", error);
          this.$root.$refs.Alert.alert_simple("Error", error.response.data.message);
        }
      }
    },
  },
  
  computed: {
    need_to_save: function () {
      return JSON.stringify(this.product) !== JSON.stringify(this.product_raw);
    },
    is_discontinued_display: function () {
      return this.product.discontinued ? "Yes" : "No";
    },
    is_dealer_display: function () {
      return this.product.is_dealer ? "Yes" : "No";
    },
    is_enabled_display: function () {
      return this.product.enabled ? "Yes" : "No";
    },
    is_kit_display: function () {
      return this.product.is_kit ? "Yes" : "No";
    },
    is_lowes_exclusive: function () {
      return this.product.is_lowes_exclusive ? "Yes" : "No";
    },
    is_website: function () {
      return this.product.is_website ? "Yes" : "No";
    },
  },
  mounted: function () {
    this.load();
  },
};
</script>

<style scoped>
input {
  padding: 3px;
}
.edit-product-type {
  position: fixed;
  top: 80px;
  right: 150px;
  z-index: 9999;
  height: 6.6em;
  width: 5em;
}
.update-dealer-portal {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 9999;
  height: 6.6em;
  width: 5em;
}
.create-product {
  position: fixed;
  top: 80px;
  right: 280px;
  z-index: 9999;
  height: 6.6em;
  width: 4.6em;
}
</style>

<template>
  <div class="row">
    <div>
      <button
        class="btn btn-success update-dealer-portal"
        v-show="can_edit_dealer_portal"
        @click="update_dealer_portal()"
      >
        Update Dealer Portal
      </button>
      <button
        class="btn btn-success edit-product-type"
        v-show="can_change_product_type"
        @click="edit_product_type()"
      >
        Edit Product Type
      </button>
      <button
        class="btn btn-success create-product"
        v-show="can_change_product_type"
        @click="create_product_dp()"
      >
        Create Product in EvoX
      </button>
    </div>
    <button
      class="btn btn-success save-to-right"
      @click="save()"
      v-show="can_edit"
    >
      Save
    </button>
    <div class="need-to-save" v-show="need_to_save">
      CHANGES MADE, NEED TO SAVE!
    </div>
    <div class="container">
      <!-- ROW 1 --> 
      <!-- ROW 1 -->
      <!-- ROW 1 -->
      <div class="row p-1">
        <div class="row col-3">
          <div class="col-4">Sku</div>
          <div class="col-8">
            <input
              class="form-control"
              type="text"
              v-model="product.sku"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-3">
          <div class="col-6">Spruce Sku</div>
          <div class="col-6">
            <input
              class="form-control"
              type="text"
              v-model="product.spruce_sku"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-6">
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2">Name</div>
          <div class="col-8">
            <input
              class="form-control"
              type="text"
              v-model="product.name"
              :disabled="!can_edit"
            />
          </div>
        </div>
      </div>
      <!-- ROW 2 -->
      <!-- ROW 2 -->
      <!-- ROW 2 -->
      <div class="row p-1">
        <div class="row col-3">
            <div class="col-2">Weight</div>
            <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
            <div class="col-2" v-else>&nbsp;</div>
            <div class="col-8 flex-grow-1">
              <input
                class="form-control"
                type="number"
                v-model="product.weight"
                :disabled="!can_edit"
              />
            </div>          
        </div>
        <div class="row col-3">
          <div class="col-6">Shipping Weight</div>
          <div class="col-6">
            <input
              class="form-control"
              type="number"
              v-model="product.shipping_weight"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-6">
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2">UPC</div>
          <div class="col-8">
            <input
              class="form-control"
              type="text"
              v-model="product.upc"
              :disabled="!can_edit"
            />
          </div>
        </div>
      </div>
      <!-- ROW 3 -->
      <!-- ROW 3 -->
      <!-- ROW 3 -->
      <div class="row p-1">
        <div class="row col-3">
          <div class="col-2">Width</div>
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2" v-else>&nbsp;</div>
          <div class="col-8 flex-grow-1">
            <input
              class="form-control"
              type="number"
              v-model="product.width"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-3">
          <div class="col-6">Shipping Width</div>
          <div class="col-6">
            <input
              class="form-control"
              type="number"
              v-model="product.shipping_width"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-3">
          <div class="col-6">Is Lowes Exclusive:</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.is_lowes_exclusive"
              :checked="product.is_lowes_exclusive"
              :disabled="!can_edit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              is_lowes_exclusive
            }}</label>
          </div>
        </div>
        <div class="row col-3">
          <div class="col-6">Is Website:</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.is_website"
              :checked="product.is_website"
              :disabled="!can_edit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              is_website
            }}</label>
          </div>
        </div>
      </div>
      <!-- ROW 4 -->
      <!-- ROW 4 -->
      <!-- ROW 4 -->
      <div class="row p-1">
        <div class="row col-3">
          <div class="col-2">Length</div>
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2" v-else>&nbsp;</div>
          <div class="col-8 flex-grow-1">
            <input
              class="form-control"
              type="number"
              v-model="product.length"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-3">
          <div class="col-6">Shipping Length</div>
          <div class="col-6">
            <input
              class="form-control"
              type="number"
              v-model="product.shipping_length"
              :disabled="!can_edit"
            />
          </div>
        </div>
      </div>
      <!-- ROW 5 -->
      <!-- ROW 5 -->
      <!-- ROW 5 -->
      <div class="row p-1">
        <div class="row col-3">
          <div class="col-2">Height</div>
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2" v-else>&nbsp;</div>
          <div class="col-8 flex-grow-1">
            <input
              class="form-control"
              type="number"
              v-model="product.height"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-3">
          <div class="col-6">Shipping Height</div>
          <div class="col-6">
            <input
              class="form-control"
              type="number"
              v-model="product.shipping_height"
              :disabled="!can_edit"
            />
          </div>
        </div>
      </div>
      <!-- ROW 5 -->
      <!-- ROW 5 -->
      <!-- ROW 5 -->

      <div class="row p-1">
        <div class="row col-3">
          <div class="col-4">MSRP Price</div>
          <div class="col-8">
            <input
              class="form-control"
              type="number"
              v-model="product.msrp_price"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-3">
          <div class="col-3 flex-grow-1">Dealer Price</div>
          <img v-if="can_edit_dealer_portal" class="col-3" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-3" v-else>&nbsp;</div>
          <div class="col-6">
            <input
              class="form-control"
              type="number"
              v-model="product.dealer_price"
              :disabled="!can_edit"
            />
          </div>
        </div>
        <div class="row col-3">
          <div class="col-3 flex-grow-1">Map Price</div>
          <div class="col-6">
            <input
              class="form-control"
              type="number"
              v-model="product.map_price"
              :disabled="!can_edit"
            />
          </div>
        </div>
      </div>

      <!-- ROW 5 -->
      <!-- ROW 5 -->
      <!-- ROW 5 -->

      <div class="row p-1">
        <div class="row col-3">
          <div class="col-6">Jackson Audit:</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.jackson_audit"
              :checked="product.jackson_audit"
              :disabled="!can_edit || lock_jackson_audit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              $parent.$parent.jackson_audit_display
            }}</label>
          </div>
        </div>
        <div class="row col-3">
          <div class="col-6">Is Discontinued:</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.discontinued"
              :checked="product.discontinued"
              :disabled="!can_edit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              is_discontinued_display
            }}</label>
          </div>
        </div>
      </div>

      <div class="row p-1">
        <div class="row col-3">
          <div class="col-6">Is Kit:</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.is_kit"
              :checked="product.is_kit"
              :disabled="!can_edit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              is_kit_display
            }}</label>
          </div>
        </div>
        <div class="row col-3">
          <div class="col-4 flex-grow-1">Is Enabled:</div>
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2" v-else>&nbsp;</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.enabled"
              :checked="product.enabled"
              :disabled="!can_edit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              is_enabled_display
            }}</label>
          </div>
        </div>
      </div>

      <div class="row p-1">
        <div class="row col-3">
          <div class="col-4 flex-grow-1">Is Dealer:</div>
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2" v-else>&nbsp;</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.is_dealer"
              :checked="product.is_dealer"
              :disabled="!can_edit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              is_dealer_display
            }}</label>
          </div>
        </div>
        <div class="row col-3" v-show="can_change_product_type">
          <div class="col-4 flex-grow-1">Evolution Id</div>
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 50px" src="../../../assets/images/evo-32x32.png">
          <div class="col-2" v-else>&nbsp;</div>
          <div class="col-6">
            <input
              class="form-control"
              type="number"
              v-model="product.evolution_id"
              :disabled="!can_edit"
            />
          </div>
        </div>
      </div>

      <!-- ROW 5 -->
      <!-- ROW 5 -->
      <!-- ROW 5 -->

      <div class="row p-1">
        <div class="row col-12">
          <div class="col-1">Notes</div>
          <div class="col-11">
            <textarea
              class="form-control"
              v-model="product.notes"
              :disabled="!can_edit"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
    <div class="col-4" v-if="!can_edit">
      <p>
        Contact Jackson for updated values! E-mail:
        <a href="mailto:jniehaus@karran.com">jniehaus@karran.com</a>
      </p>
    </div>
  </div>
</template>
