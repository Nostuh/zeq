<script>
import axios from "axios";
import { uf } from "../../../../utils/tools.mjs";

export default {
  name: "ECOM",
  data() {
    return {
      wtb: [],
      product: {},
      can_edit: false,
      dealerDocs: [],
      can_edit_dealer_portal: false,
    };
  },
  components: {},
  methods: {
    save: async function () {
      /// how to save
      if (JSON.stringify(this.product) !== JSON.stringify(this.product_raw)) {
        await axios.post("/api/products/save_product", {
          user: this.$root.user,
          product: this.product,
        });
        this.$root.send_global_alert("Saved!");
        this.wtb = [];
        this.product = {};
        this.load();
      }
    },
    load: async function () {
      if (this.$root.user.role_ids.find((v) => v == 1 || v == 3)) {
        this.can_edit = true;
      }
      while (this.wtb.length == 0) {
        this.wtb = this.$parent.$parent.wtb;
        await uf.sleep(100);
      }

      while (this.product.id == undefined) {
        this.product = this.$parent.$parent.product;
        this.product_raw = uf.clone(this.product);
        await uf.sleep(100);
      }

      if (this.$root.user.role_ids.find((v) => v == 1)) {
        this.can_edit_dealer_portal = true;
      }
    },

    // need to update alert; if there aren't documents in place or SEO
    // just comment and keep going
    update_dealer_documents: async function () {
      let product_id = this.product.id;
      let response = await axios.post("/api/evolution/update-documents", {
        product_id: product_id,
      })

      if (response && response.data && response.data.status == "success") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.$root.send_global_alert("Updated Dealer Portal!");
      } else {
        alert("Am I the problem", response.data.status);
      }
    },

    update_seo_and_description: async function () {
      let product_id = this.product.id;
      let response = await axios.post("/api/evolution/update-seo", {
        product_id: product_id,
      });

      if (response && response.data && response.data.status == "success") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.$root.send_global_alert("Updated Dealer Portal!");
      } else {
        alert("Am I the problem", response.data.status);
      }
    },
  },

  watch: {
    "product.description": function () {
      this.$refs.textarea1.style.height = "auto";

      this.$nextTick(() => {
        console.log(this.$refs.textarea1.scrollHeight);
        this.$refs.textarea1.style.height =
          this.$refs.textarea1.scrollHeight + "px";
      });
    },
    "product.short_description": function () {
      this.$refs.textarea2.style.height = "auto";

      this.$nextTick(() => {
        this.$refs.textarea2.style.height =
          this.$refs.textarea2.scrollHeight + "px";
      });
    },
    "product.feed_description": function () {
      this.$refs.textarea3.style.height = "auto";

      this.$nextTick(() => {
        this.$refs.textarea3.style.height =
          this.$refs.textarea3.scrollHeight + "px";
      });
    },
  },
  computed: {
    need_to_save: function () {
      return JSON.stringify(this.product) !== JSON.stringify(this.product_raw);
    },
    is_ecom_display: function () {
      return this.product.is_ecom ? "Yes" : "No";
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
.update-dealer-portal {
  position: fixed;
  top: 80px;
  right: 100px;
  z-index: 9999;
  height: 6em;
  width: 10em;
}
</style>

<template>
  <div class="need-to-save" v-show="need_to_save">
    CHANGES MADE, NEED TO SAVE!
  </div>
  <button
    v-show="can_edit_dealer_portal"
    style="padding: 20px"
    class="btn btn-success update-dealer-portal"
    @click="update_seo_and_description(); update_dealer_documents()"
  >
    Update Dealer Portal
  </button>
  <div class="row">
    <div class="container">
      <div class="row p-1 col-12">
        <div class="col-1">Prepaid Price</div>
        <div class="col-1">
          <input
            class="form-control"
            type="number"
            v-model="product.prepaid_price"
            :disabled="!can_edit"
          />
        </div>
        <div class="col-1">Collect Price</div>
        <div class="col-1">
          <input
            class="form-control"
            type="number"
            v-model="product.collect_price"
            :disabled="!can_edit"
          />
        </div>
        <div class="row col-3">
          <div class="col-6">Is Ecom:</div>
          <div class="col-6 form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="flexSwitchCheckChecked"
              v-model="product.is_ecom"
              :checked="product.is_ecom"
              :disabled="!can_edit"
            />
            <label class="form-check-label" for="flexSwitchCheckChecked">{{
              is_ecom_display
            }}</label>
          </div>
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">SEO Title</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.meta_title"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
   
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">SEO Keywords</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.meta_keywords"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">SEO Description</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.meta_description"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">DXF Location</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.magento_file_dxf_documentation"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">Spec Sheet Location</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.magento_file_pdf_documentation"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">Care Guide Location</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.magento_pdf_for_care_guide"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">Install Guide 1 Location</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.magento_pdf_for_installation_guide"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2">
          <img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">Install Guide 2 Location</div>
        <div class="col-10">
          <input
            class="form-control"
            type="text"
            v-model="product.magento_pdf_for_installation_guide_2"
            :disabled="!can_edit"
          />
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2">Short Description</div>
        <div class="col-10">
          <textarea
            ref="textarea1"
            class="form-control"
            type="text"
            v-model="product.short_description"
            :disabled="!can_edit"
          ></textarea>
        </div>
      </div>
      <div class="row p-1">
        <div class="col-2">Description</div>
        <div class="col-10">
          <textarea
            ref="textarea2"
            class="form-control"
            type="text"
            v-model="product.description"
            :disabled="!can_edit"
          ></textarea>
        </div>
      </div>
      <div class="row p-1">
      
        <div class="col-2"><img v-if="can_edit_dealer_portal" class="col-2" style="width: 30px" src="../../../assets/images/evo-32x32.png">Feed Description</div>
        <div class="col-8">
          <textarea
            ref="textarea3"
            class="form-control"
            type="text"
            v-model="product.feed_description"
            :disabled="!can_edit"
          ></textarea>
        </div>
      </div>
    </div>
    <div class="row">
      <table class="table table-bordered table-striped table-condensed">
        <tbody>
          <tr v-for="v in wtb" :key="v.id">
            <th>{{ v.name }}</th>
            <td><a :href="v.url" target="_blank">View</a></td>
            <td>{{ v.url }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      class="btn btn-success save-to-right"
      @click="save()"
      v-if="can_edit"
    >
      Save
    </button>
  </div>
</template>
