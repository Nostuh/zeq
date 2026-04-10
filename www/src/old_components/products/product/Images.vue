<script>
import axios from "axios";
import { uf } from "../../../../utils/tools.mjs";
import * as bootstrap from "bootstrap";
import Multiselect from "@vueform/multiselect";
import { useDropzone } from "vue3-dropzone";
import { reactive } from "vue";

export default {
  name: "Images",
  setup() {
    const drop_files = reactive({ urls: false, files: false });

    function onDrop(acceptFiles, rejectReasons) {
      try {
        drop_files.urls = [];
        drop_files.files = [];
        uf.dloop(acceptFiles, function (i, v) {
          drop_files.urls.push(URL.createObjectURL(v));
          drop_files.files.push(v);
        });
      } catch (e) {
        console.log(e);
      }

      console.log(acceptFiles);
      console.log(rejectReasons);
    }

    const { getRootProps, getInputProps, ...rest } = useDropzone({
      onDrop,
      noClick: true,
    });

    return {
      drop_files,
      getRootProps,
      getInputProps,
      ...rest,
    };
  },
  data() {
    return {
      image_types: [],
      image_types_filtered: [],
      selected_image_type: {},
      images: [],
      modal: false,
      add_modal: false,
      modal_image: {},
      image_rename: false,
      image_rename_2: false,
      single_image_error: "",
      upload_image: false,
      loader: false,
      can_edit: false,
      is_downloading: false,
    };
  },
  components: {
    Multiselect,
  },
  methods: {
    close_single_image: function () {
      this.image_rename = false;
      this.image_rename_2 = false;
      this.drop_files.urls = false;
      this.drop_files.files = false;
    },
    delete_single_image: async function () {
      let payload = {
        product_id: this.$route.params.id,
        image: this.modal_image,
      };

      await axios.post("/api/images/delete-image", payload);
      this.image_rename = false;
      this.image_rename_2 = false;
      this.drop_files.urls = false;
      this.drop_files.files = false;
      this.modal.hide();
      this.load();
    },
    load: async function () {
      if (this.$root.user.role_ids.find((v) => v == 1 || v == 4)) {
        this.can_edit = true;
      }

      let id = this.$route.params.id;
      this.modal = new bootstrap.Modal("#edit_image_modal", {});
      this.add_modal = new bootstrap.Modal("#add_image_modal", {});
      this.image_types = (await axios.get("/api/images/get-image-types")).data;
      this.image_types_filtered = this.image_types.filter(
        (itv) => itv.id < 998
      );

      this.images = (
        await axios.post("/api/images/get-images", { product_id: id })
      ).data;
    },
    set_source: function (v) {
      return "/ki_images/" + v.path + "" + v.name + "?" + Math.random(9999999);
    },
    set_image_type: async function (it) {
      this.selected_image_type = it;
      this.image_rename = false;
      this.image_rename_2 = false;
      this.drop_files.urls = false;
      this.drop_files.files = false;

      let payload = {
        product_id: this.$route.params.id,
        image_type: this.selected_image_type,
        image: this.modal_image,
        for_front_end: true,
      };
      let rename_name = (
        await axios.post("/api/images/get-rename-name", payload)
      ).data;
      if (this.modal_image.name != rename_name) {
        this.image_rename = rename_name;
      }

      let only_one_image_check = this.image_types.find(
        (sv) => sv.id == this.selected_image_type.id && sv.is_many == 0
      );
      let has_image = false;

      // attempted set is a single image
      if (only_one_image_check) {
        //check if image already exists!
        has_image = this.images.find(
          (iv) => iv.image_type_id == only_one_image_check.id
        );
      }

      if (has_image) {
        let misc_type = this.image_types.find((sv) => sv.id == 7);
        let payload = {
          product_id: this.$route.params.id,
          image_type: misc_type,
          image: has_image,
          for_front_end: true,
        };
        this.image_rename_2 = (
          await axios.post("/api/images/get-rename-name", payload)
        ).data;
      }
    },

    edit_image: function (v) {
      if (this.can_edit) {
        this.modal_image = v;
        this.selected_image_type = this.image_types.find(
          (iv) => iv.id == v.image_type_id
        );
        this.modal.show();
      }
    },
    add_image: function () {
      this.drop_files.urls = false;
      this.drop_files.files = false;
      this.add_modal.show();
    },
    save_single_image: async function () {
      if (
        this.selected_image_type.id != this.modal_image.image_type_id ||
        this.drop_files.files[0]
      ) {
        let payload = {
          product_id: this.$route.params.id,
          image_type: this.selected_image_type,
          image: this.modal_image,
          new_image: false,
          for_front_end: true,
        };

        if (this.drop_files.files[0]) {
          let base64 = await this.read_upload_file(this.drop_files.files[0]);
          payload.new_image = base64;
        }

        await axios.post("/api/images/save-single-image", payload);
      }

      this.image_rename = false;
      this.image_rename_2 = false;
      this.drop_files.urls = false;
      this.drop_files.files = false;
      this.modal.hide();
      await axios.get("/api/products/reload-data");
      this.load();
    },
    add_images: async function () {
      let that = this;
      this.loader = true;
      if (this.drop_files.files[0]) {
        let base64 = [];
        await uf.await_dloop(this.drop_files.files, async function (i, v) {
          let _base64 = await that.read_upload_file(v);
          base64.push(_base64);
        });

        let payload = {
          product_id: this.$route.params.id,
          images: base64,
        };

        await axios.post("/api/images/add-images", payload);
      }

      this.image_rename = false;
      this.image_rename_2 = false;
      this.drop_files.urls = false;
      this.drop_files.files = false;
      this.loader = false;
      this.add_modal.hide();
      this.load();
    },
    download_images: async function () {
      this.is_downloading = true;
      let payload = {
        product_id: this.$parent.$parent.product.id,
      };
      let photos = (await axios.post("/api/images/download-photos", payload))
        .data.the_buffer.data;
      const photosuint8Array = new Uint8Array(photos);
      const zipblob = new Blob([photosuint8Array], { type: "application/zip" });
      const urlobj = URL.createObjectURL(zipblob);

      const anchor = document.createElement("a");
      //anchor.href = 'data:application/zip;charset=utf-8,' + encodeURIComponent(photos);
      anchor.href = urlobj;
      //anchor.href = photos;
      anchor.target = "_blank";
      let date = new Date().toJSON();

      anchor.download = "product_photos_download_" + date + ".zip";
      anchor.click();
      this.is_downloading = false;
    },
    read_upload_file: async function (file) {
      return new Promise(function (resolve) {
        let reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function () {
          resolve(reader.result);
        };
      });
    },

    sync_dealer_portal_images: async function () {
      let product_id = this.$parent.$parent.product.id
      console.log(product_id)

      let response  = await axios.post(`/api/evolution/sync-images/`, {
        product_id: product_id,
      })
      console.log("Response:", response)
    },

    update_primary_image: async function () {
      let product_id = this.$parent.$parent.product.id

      let KIresponse = await axios.get(`api/evolution/get-product/${product_id}`);
      console.log("KI data:", KIresponse.data)
      console.log("KI images:", this.images)
      let evoResponse = await axios.get(`/api/evolution/product-data/${product_id}`)
      console.log("Evo data:", evoResponse.data.product.media)
      // let response = await axios.post("/api/evolution/update-primary-image", {
      //   product_id: product_id,
      // });

      // if (response && response.data && response.data.status == "success") {
      //   await new Promise((resolve) => setTimeout(resolve, 1000));
      //   this.$root.send_global_alert("Updated Dealer Portal!");
      // } else {
      //   console.error("Error:", response.data);
      //   alert("Am I the problem", response.data.status);
      // }
    },
 
    // do not test in development, it will not work because of 
    // photo path (needs to be the production path)
    update_additional_images: async function () {
      let product_id = this.$parent.$parent.product.id
      console.log("Test1:", product_id)
      let response = await axios.post(`api/evolution/update-additional-images`, {
        product_id: product_id,
      });

      console.log(response)
    },
  },

  mounted: async function () {
    this.load();
  },
};
</script>

<style>
#edit_image_modal .multiselect-clear {
  display: none;
}

.add-photo {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 9999;
  height: 6.6em;
  width: 7em;
}
.download-photo {
  position: fixed;
  top: 80px;
  right: 150px;
  z-index: 9999;
  height: 6.6em;
  width: 7em;
}
.update-dp {
  position: fixed;
  top: 80px;
  right: 280px;
  z-index: 9999;
  height: 6.6em;
  width: 8em;
}
</style>

<template>
  <div>
    <button class="btn btn-success download-photo" @click="download_images()">
      Download Photos
    </button>
  </div>
  <div v-show="can_edit">
    <button class="btn btn-success add-photo" @click="add_image()">
      Add Photos
    </button>
  </div>
  <div v-show="can_edit">
    <button class="btn btn-success update-dp" @click="sync_dealer_portal_images(), update_primary_image() ">
      Sync Images to Dealer Portal
    </button>
  </div>
  <div class="row" v-if="!is_downloading">
    <div class="d-flex flex-wrap align-items-stretch p-5">
      <div
        class="p-2 m-3 images-click-box"
        v-for="v in images"
        :key="v.id"
        @click="edit_image(v)"
      >
        <p>
          Filename: {{ v.ki_name }}<br />
          Dimms: {{ v.width }} x {{ v.height }}<br />
          Type: {{ v.image_type }}
        </p>
        <img style="width: 300px" :src="set_source(v)" />
      </div>
    </div>
  </div>
  <div class="container-fluid product-table" v-show="is_downloading">
    <h5>Preparing download...</h5>
    <img class="is_downloading" src="../../../assets/images/loader.webp" />
  </div>

  <!-- v-show="isDragActive" -->
  <div
    class="modal"
    id="add_image_modal"
    tabindex="-1"
    v-bind="getRootProps()"
    v-show="!is_downloading"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title container" style="width: 100%">
            <div class="row">
              <div class="col-12" v-if="!drop_files.files">
                <span v-if="!isDragActive"
                  >Find photo and move to this window!</span
                >
                <span v-else>Drop the picture!</span>
              </div>
              <div class="col-12" v-else>
                <button
                  style="width: 100%"
                  class="btn btn-success"
                  @click="add_images"
                >
                  Add Images
                </button>
              </div>
            </div>
          </h5>
        </div>
        <div class="modal-body">
          <h5 class="modal-title container" style="width: 100%">
            <div class="row">
              <div class="col-12" v-if="!drop_files.files">
                <span v-if="!isDragActive"
                  >Find photo and move to this window!</span
                >
                <span v-else>Drop the picture!</span>
              </div>
              <div class="col-12" v-else-if="drop_files.files && !loader">
                <div class="d-flex flex-wrap flex-row">
                  <div class="p-2" v-for="v in drop_files.urls" :key="v.id">
                    <img style="width: 200px" :src="v" />
                  </div>
                </div>
              </div>
              <div class="col-12" v-else>
                <img src="../../../assets/images/loader.webp" />
              </div>
            </div>
          </h5>
        </div>
        <div class="modal-footer">
          <h5 class="modal-title container" style="width: 100%">
            <div class="row">
              <div class="col-12" v-if="!drop_files.files">
                <span v-if="!isDragActive"
                  >Find photo and move to this window!</span
                >
                <span v-else>Drop the picture!</span>
                <div class="d-grid">
                  <button
                    class="btn btn-success align-self-center"
                    @click="open"
                  >
                    Upload New
                  </button>
                  <input v-bind="getInputProps()" />
                </div>
              </div>
              <div class="col-12" v-else>
                <button
                  style="width: 100%"
                  class="btn btn-success"
                  @click="add_images"
                >
                  Add Images
                </button>
              </div>
            </div>
          </h5>
        </div>
      </div>
    </div>
  </div>

  <div
    class="modal"
    id="edit_image_modal"
    tabindex="-1"
    v-bind="getRootProps()"
    v-show="!is_downloading"
  >
    <div
      class="modal-dialog modal-lg modal-dialog-centered"
      v-show="!isDragActive"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title container" style="width: 100%">
            <div class="row">
              <div class="col-12">
                {{ modal_image.ki_name }}
              </div>
              <div class="col-12">
                Dimms: {{ modal_image.width }} x {{ modal_image.height }}<br />
              </div>
              <!-- <div class="row col-12">
                                <div class="col-1">
                                    Type:
                                </div>
                                <div class="col-6">
                                    <Multiselect 
                                        v-model="selected_image_type" 
                                        :options=image_types
                                        @select="set_image_type"
                                        :object="true"
                                        value="name"
                                        label="name"
                                        valueProp="id"
                                        track-by="name"
                                        :searchable="true"
                                        placeholder="Image Type"
                                    />
                                </div>
                            </div> -->
              <div class="row col-12">
                <div class="col-1">Type:</div>
                <div class="d-flex flex-wrap">
                  <div
                    class="flex-fill"
                    v-for="it in image_types_filtered"
                    :key="it.id"
                  >
                    <button
                      @click="set_image_type(it)"
                      class="btn display-btn"
                      :class="
                        it.name == selected_image_type.name
                          ? 'btn-primary'
                          : 'btn-default'
                      "
                    >
                      {{ it.name }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </h5>
          <!-- <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button> -->
        </div>
        <div class="modal-body">
          <div class="d-flex flex-wrap align-items-stretch">
            <div class="row col-12">
              <h4 class="col-6 text-center" v-if="drop_files.urls[0]">
                Current
              </h4>
              <h4 class="col-12 text-center" v-else>Current</h4>
              <h4 class="col-6 text-center" v-if="drop_files.urls[0]">New</h4>
            </div>
            <div class="row col-12">
              <img
                class="col-6"
                style="width: 300px; margin: auto; display: block"
                :src="set_source(modal_image)"
              />
              <img
                class="col-6"
                style="width: 300px; margin: auto; display: block"
                v-if="drop_files.urls[0]"
                :src="drop_files.urls[0]"
              />
            </div>
          </div>

          <h3 v-if="image_rename">
            Set type and rename to: {{ image_rename }}
          </h3>
          <h3 v-else>&nbsp;</h3>
          <h3 v-if="image_rename_2">
            Existing image renamed to: {{ image_rename_2 }}
          </h3>
          <h3 v-else>&nbsp;</h3>
          <h3 style="color: red; font-size: 32px">{{ single_image_error }}</h3>

          <div class="d-grid">
            <button class="btn btn-success align-self-center" @click="open">
              Upload New
            </button>
            <input v-bind="getInputProps()" />
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            style="position: absolute; left: 10px"
            class="btn btn-danger"
            @click="delete_single_image()"
          >
            Delete Image
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            data-bs-dismiss="modal"
            @click="close_single_image()"
          >
            Close
          </button>
          <button
            type="button"
            class="btn btn-success"
            @click="save_single_image()"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>

    <div
      class="modal-dialog modal-lg modal-dialog-centered"
      v-show="isDragActive"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title container" style="width: 100%">
            <div class="row">
              <div class="col-12">Drop the picture!</div>
            </div>
          </h5>
        </div>
        <div class="modal-body">
          <h5 class="modal-title container" style="width: 100%">
            <div class="row">
              <div class="col-12">Drop the picture!</div>
            </div>
          </h5>
        </div>
        <div class="modal-footer">
          <h5 class="modal-title container" style="width: 100%">
            <div class="row">
              <div class="col-12">Drop the picture!</div>
            </div>
          </h5>
        </div>
      </div>
    </div>
  </div>
</template>
