<script>
import zSimpleTableVue from "../tools/zSimpleTable.vue";
import axios from "axios";
import { uf } from "../../../utils/tools.mjs";
import { puf } from "karran-utility-functions";
import Multiselect from "@vueform/multiselect";

export default {
  name: "ProductsList",
  data() {
    return {
      products: {},
      products_raw: {},
      product_type_filter: ["product"],
      selected_type: null,
      selected_material: null,
      //gets overriden
      types: ["Sink", "Faucet", "Accessory", "Doug"],
      materials: ["A", "B"],
      disco: ["No", "Yes", "All"],
      selected_disco: "No",
      display_limit: 50,
      product_list_count: 0,
      can_edit: false,
      is_downloading: false,
    };
  },
  components: {
    zSimpleTableVue,
    Multiselect,
  },
  methods: {
    get_config: function () {
      let that = this;
      return {
        id: { header: "Id" },
        view_button: {
          header: "View?",
          display_type: "view_button",
          callback: function (d) {
            that.$router.push("/products/" + d.id + "/product");
          },
        },
        magento_image: { header: "Image", display_type: "image" },
        sku: { header: "SKU" },
        jackson_audit: { header: "Jackson Audit", display_type: "int_to_yn" },
        simple_type: { header: "Simple Type" },
        name: { header: "Name" },
        material: { header: "Material" },
        discontinued: { header: "Discontinued", display_type: "enabled_flip" },
        enabled: { header: "Enabled", display_type: "enabled" },
        //weight: {header:"Weight"},
        //attributes: {header:"Simple Attributes"},
        //country_created: {header:"Country Made In"}
      };
    },
    set_product_type_filter: function(value) {
        let that = this;
        
        if ( this.product_type_filter.includes(value) && this.product_type_filter.length > 1 ) {
            uf.dloop(that.product_type_filter,function(i,v){
                if ( v == value ) {
                    that.product_type_filter.splice(i, 1);
                }
            });
        } else if ( !this.product_type_filter.includes(value) ) {
            this.product_type_filter.push(value);
        }
        
        this.filter_products();
    },
    get_product_type_filter: function(value) {
        if ( this.product_type_filter.includes(value) ) {
            return "active btn-primary";
        } else {
            return "";
        }
    },
    add_product: function () {
      this.$router.push({ name: "add-product" });
    },
    async filter_products() {
      console.log("filter products");

      let that = this;
      let products = uf.clone(this.products_raw);

      let slice_count = 0;
      uf.dloop(products, function (i, v) {
        try {
          let remove = false;

          if ( v.simple_type.toLowerCase().includes("parent") && that.product_type_filter == "product" ||
               !v.simple_type.toLowerCase().includes("parent") && that.product_type_filter == "parent"
          ) {
            remove = true;
          }

        //   //Discontinued
        //   if (
        //     (that.selected_disco == "Yes" && v.discontinued == 0) ||
        //     (that.selected_disco == "No" && v.discontinued == 1)
        //   ) {
        //     remove = true;
        //   }

        //   //simple_type
        //   if (
        //     v.simple_type != that.selected_type &&
        //     that.selected_type != null
        //   ) {
        //     remove = true;
        //   }

          //material
          if (
            v.material != that.selected_material &&
            that.selected_material != null
          ) {
            remove = true;
          }

          if (remove) {
            products.splice(i - slice_count++, 1);
          }
        } catch (e) {
          console.log(e);
        }
      });

      this.products = products;
      let table_data = await this.$refs.zSimpleTableVue.set_table(
        this.products,
        this.get_config(),
        { display_limit: this.display_limit, user: this.$root.user }
      );
      this.product_list_count = table_data.length;
    },
    downloadCSVData: async function () {
      this.is_downloading = true;
      let payload = {
        ids: this.$refs.zSimpleTableVue.get_data().map(function (v) {
          return v.id;
        }),
      };

      let data = await axios.post("/api/products/download_products", payload);
      data = data.data;

      let headers = Object.keys(data[0]);
      let csv;

      csv = headers.join(",");
      csv += "\n";

      data.forEach((row, i) => {
        let values = Object.values(row);

        uf.dloop(values, function (ii, vv) {
          values[ii] = String(vv).replaceAll('"', '""');
        });

        csv += '"' + values.join('","') + '"';
        csv += "\n";
      });

      const anchor = document.createElement("a");
      anchor.href =
        "data:text/csv;charset=utf-8," + encodeURIComponent("\ufeff" + csv);
      anchor.target = "_blank";
      let date = new Date().toJSON();

      anchor.download = "product_download_" + date + ".csv";
      anchor.click();

      this.is_downloading = false;
    },
  },
  mounted: async function () {
    let that = this;

    if (this.$root.wipe_product_search_cache) {
      this.$root.wipe_product_search_cache = false;
      this.$router.go(0);
    }

    // admin / core-product
    if (this.$root.user.role_ids.find((v) => v == 1 || v == 2)) {
      this.can_edit = true;
    }

    let data = await axios.get("/api/products/");
    this.products = data.data;
    this.products = uf.object_to_array(this.products);
    this.products_raw = uf.clone(this.products);
    console.log(this.products);
    console.log("start table display");
    let table_data = await this.$refs.zSimpleTableVue.set_table(
      this.products,
      this.get_config(),
      { display_limit: this.display_limit, user: this.$root.user }
    );
    console.log("end table display");
    this.product_list_count = table_data.length;
    let filters = await axios.get("/api/products/filters");
    this.types = filters.data.simple_type;
    this.materials = filters.data.material;
    this.filter_products();
  },
  computed: {

  },
  watch: {
    selected_type: {
      handler(to, from) {
        this.filter_products();
      },
    },
    selected_material: {
      handler(to, from) {
        this.filter_products();
      },
    },
    display_limit: {
      async handler(to, from) {
        await this.$refs.zSimpleTableVue.set_table(
          this.products,
          this.get_config(),
          { display_limit: this.display_limit, user: this.$root.user }
        );
      },
    },
  },
};
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
    <router-view />
    <div>
      <div
        class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom"
      >
        <h1>Products</h1>
        <button class="btn btn-success" @click="downloadCSVData()">
          Download CSV
        </button>
      </div>

      <div class="container-fluid product-table" v-show="is_downloading">
        <h5>Preparing download...</h5>
        <img class="is_downloading" src="../../assets/images/loader.webp" />
      </div>

      <div class="container-fluid" v-show="!is_downloading">
        <!-- <h3>Filters - {{product_list_count}} shown</h3> -->
        <h3 class="text-center">Filters</h3>
        <div class="row">
            <div class="col-5">
                <div class="d-flex justify-content-evenly align-content-center">
                    <button class="btn btn-default flex-fill filter" :class="get_product_type_filter('product')" 
                        @click="set_product_type_filter('product')">
                    Products
                    </button>
                    <button class="btn btn-default flex-fill filter" :class="get_product_type_filter('parent')"
                        @click="set_product_type_filter('parent')" >
                        Configurable Parent
                    </button>
                    <div class="flex-fill col-2">
                        <Multiselect
                        v-model="selected_material"
                        :options="materials"
                        class="filter"
                        placeholder="Material.."
                        ref="material_selector"
                        />
                    </div>
                </div>
            </div>
          <!-- <div class="col-1">
            <h5 style="line-height: 3em">Discontinued?</h5>
          </div>
          <div class="col-1 filters">
            <Multiselect
              v-model="selected_disco"
              :options="disco"
              class="filter"
              @select="filter_products()"
              @remove="filter_products()"
              placeholder="Discontinued.."
              ref="disoc_selector"
            />
          </div>
          <div class="col-2 filters">
            <Multiselect
              v-model="selected_type"
              :options="types"
              class="filter"
              placeholder="Type.."
              ref="type_selector"
            />
          </div> -->
        </div>
      </div>
        <br>
      <div class="container-fluid product-table" v-show="!is_downloading">
        <div
          class="container-fluid product-table"
          style="padding-top: 10px; margin-bottom: -45px"
        >
          <div class="row">
            <button
              class="col-2 btn btn-success"
              style="z-index: 1"
              @click="add_product()"
              v-show="can_edit"
            >
              Add Product
            </button>
            <span class="col-1">Display Limit:</span>
            <input
              class="col-2"
              type="text"
              style="z-index: 1"
              v-model="display_limit"
            />
          </div>
        </div>
        <zSimpleTableVue
          ref="zSimpleTableVue"
          v-show="!is_downloading"
        ></zSimpleTableVue>
      </div>
    </div>
  </div>
</template>
