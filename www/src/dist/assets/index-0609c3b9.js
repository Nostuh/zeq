import { a as axios, o as openBlock, c as createElementBlock, b as createBaseVNode, w as withDirectives, v as vModelText, d as createCommentVNode, p as puf, F as Fragment, r as renderList, n as normalizeClass, e as createTextVNode, t as toDisplayString, f as vModelCheckbox, g as normalizeStyle, h as resolveComponent, i as createVNode, s as script, j as vModelRadio, M as Modal, k as vShow, l as globalCookiesConfig, u as useCookies, A as Alert$1, m as createRouter, q as createWebHashHistory, x as createApp } from "./vendor-2d71ed67.js";
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity)
      fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy)
      fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous")
      fetchOpts.credentials = "omit";
    else
      fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const styles = "";
const bootstrapIcons = "";
const Dashboard_vue_vue_type_style_index_0_scoped_4e6b0c15_lang = "";
const _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};
const _sfc_main$6 = {
  name: "Dashboard",
  data() {
    return {
      data: [],
      email: "",
      password: "",
      bad_password: false
    };
  },
  components: {},
  methods: {
    login: async function() {
      let payload = {
        email: this.email,
        password: this.password
      };
      let result = await axios.post("/api/eq/login/", payload);
      if (result.data === false) {
        this.bad_password = true;
      } else {
        result.data.first_name = result.data.name;
        this.$root.user = result.data;
        this.$root.cookies.set("user", JSON.stringify(result.data));
        this.$router.push({ name: "equipment" });
      }
    }
  },
  mounted: async function() {
  }
};
const _hoisted_1$4 = { key: 0 };
const _hoisted_2$4 = {
  key: 1,
  id: "login-div"
};
const _hoisted_3$4 = { class: "mb-3" };
const _hoisted_4$4 = { class: "mb-3" };
const _hoisted_5$4 = { key: 0 };
function _sfc_render$6(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("div", null, [
    _cache[8] || (_cache[8] = createBaseVNode("h1", null, "Dashboard", -1)),
    _ctx.$root.user.first_name ? (openBlock(), createElementBlock("div", _hoisted_1$4, _cache[3] || (_cache[3] = [
      createBaseVNode("div", { class: "container p-0 m-0" }, [
        createBaseVNode("h1", { class: "h2" }, "Dashboard")
      ], -1)
    ]))) : (openBlock(), createElementBlock("div", _hoisted_2$4, [
      _cache[7] || (_cache[7] = createBaseVNode("div", { class: "container p-0 m-0" }, [
        createBaseVNode("h1", { class: "h2" }, "Login"),
        createBaseVNode("hr")
      ], -1)),
      createBaseVNode("form", null, [
        createBaseVNode("div", _hoisted_3$4, [
          _cache[4] || (_cache[4] = createBaseVNode("label", {
            for: "email",
            class: "form-label"
          }, "User", -1)),
          withDirectives(createBaseVNode("input", {
            type: "text",
            class: "form-control",
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.email = $event)
          }, null, 512), [
            [vModelText, $data.email]
          ])
        ]),
        createBaseVNode("div", _hoisted_4$4, [
          _cache[5] || (_cache[5] = createBaseVNode("label", {
            for: "password",
            class: "form-label"
          }, "Password", -1)),
          withDirectives(createBaseVNode("input", {
            type: "password",
            class: "form-control",
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.password = $event)
          }, null, 512), [
            [vModelText, $data.password]
          ])
        ]),
        createBaseVNode("button", {
          type: "submit",
          class: "btn btn-primary",
          onClick: _cache[2] || (_cache[2] = ($event) => $options.login())
        }, "Submit")
      ]),
      $data.bad_password ? (openBlock(), createElementBlock("div", _hoisted_5$4, _cache[6] || (_cache[6] = [
        createBaseVNode("br", null, null, -1),
        createBaseVNode("br", null, null, -1),
        createBaseVNode("h4", { class: "bad_password" }, "Bad E-mail/Password!", -1)
      ]))) : createCommentVNode("", true)
    ]))
  ]);
}
const Dashboard = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["render", _sfc_render$6], ["__scopeId", "data-v-4e6b0c15"]]);
const zSimpleTable_vue_vue_type_style_index_0_lang = "";
const _sfc_main$5 = {
  name: "zSimpleTable",
  template: ``,
  data() {
    return {
      data: [],
      data_filter: [],
      data_filter_raw: [],
      config: {},
      config_raw: {},
      headers: [],
      rows: [],
      sort_toggles: {},
      last_toggle: "id",
      search_value: "",
      //for cacheing
      user: ""
    };
  },
  methods: {
    async set_table(data, config, options = false) {
      try {
        data = puf.clone(data);
        let that = this;
        this.headers = {};
        this.rows = [];
        this.data = data;
        this.data_filter = data;
        this.data_filter_raw = data;
        this.sort_toggles = {};
        this.last_toggle = "id";
        let previous_search = await puf.cache.get(this.$route.path + this.user);
        if (previous_search) {
          this.search_value = previous_search;
        }
        if (options != false) {
          if (options.display_limit != void 0) {
            this.display_limit = options.display_limit;
          }
          if (options.user != void 0) {
            this.user = options.user;
          }
        }
        puf.dloop(config, function(i, v) {
          that.config[i] = v.display_type;
          that.headers[i] = v.header;
          that.rows.push(i);
        });
        this.config_raw = config;
        this.sort_by();
        return this.data_filter_raw;
      } catch (e) {
        console.log(e);
        throw e;
      }
    },
    get_data() {
      return this.data_filter_raw;
    },
    get_data_length() {
      if (this.data_filter_raw != void 0) {
        return this.data_filter_raw.length;
      } else {
        return 0;
      }
    },
    int_to_yn(val) {
      return val == 0 ? "No" : "Yes";
    },
    enabled_color(val, flip = false) {
      if (!flip) {
        return val == 0 ? "background-color: lightcoral" : "";
      } else {
        return val == 0 ? "" : "background-color: lightcoral";
      }
    },
    sort_by(val = "id", no_toggle = false) {
      let that = this;
      if (this.sort_toggles[val] == void 0) {
        this.sort_toggles[val] = true;
      } else if (no_toggle)
        ;
      else if (this.sort_toggles[val] == false || this.last_toggle != val) {
        this.sort_toggles[val] = true;
      } else if (this.sort_toggles[val] == true) {
        this.sort_toggles[val] = false;
      }
      if (val == "last_toggle") {
        val = this.last_toggle;
      } else {
        this.last_toggle = val;
      }
      let data_order = puf.clone(this.data);
      let enabled = this.data.filter((v) => v.enabled == 1);
      let disabled = this.data.filter((v) => v.enabled == 0);
      if (enabled.length == 0 && disabled.length == 0) {
        this.data_filter = this.data.sort(this.the_sort(val, that));
      } else {
        let enabled_sorted = enabled.sort(this.the_sort(val, that));
        let disabled_sorted = disabled.sort(this.the_sort(val, that));
        this.data_filter = enabled_sorted.concat(disabled_sorted);
      }
      this.data = data_order;
      if (this.search_value != "") {
        this.filter_by_search();
      }
      this.data_filter_raw = puf.clone(this.data_filter);
      if (this.display_limit) {
        this.data_filter = this.data_filter.splice(0, this.display_limit);
      }
    },
    the_sort(val, that) {
      return function(a, b) {
        if (typeof a[val] == "number" && typeof b[val] == "number" && that.sort_toggles[val]) {
          return a[val] - b[val];
        } else if (typeof a[val] == "number" && typeof b[val] == "number") {
          return b[val] - a[val];
        } else if (a[val] == "" || a[val] == null || a[val] == void 0) {
          return 1;
        } else if (b[val] == "" || b[val] == null || b[val] == void 0) {
          return -1;
        } else if (that.sort_toggles[val]) {
          return a[val].localeCompare(b[val]);
        } else {
          return b[val].localeCompare(a[val]);
        }
      };
    },
    get_icon(val) {
      if (this.sort_toggles[val]) {
        return "bi bi-arrow-up-break";
      } else {
        return "bi bi-arrow-down-break";
      }
    },
    filter_by_search() {
      let that = this;
      let searched = that.data_filter.filter((m) => {
        for (const check in m) {
          if (typeof m[check] == "string") {
            if (m[check].toLowerCase().includes(that.search_value.toLowerCase())) {
              return true;
            }
          }
        }
      });
      this.data_filter = searched;
      this.data_filter_raw = puf.clone(this.data_filter);
    },
    display_type(index) {
      if (this.config[index] != void 0) {
        return this.config[index];
      } else {
        return "normal";
      }
    },
    callback(index, d) {
      let callback = this.config_raw[index].callback;
      callback(d);
    },
    is_checked(d) {
      if (d == true || d == 1) {
        return true;
      } else {
        return false;
      }
    }
  },
  watch: {
    "search_value": function(to, from) {
      this.sort_by(this.last_toggle, true);
      puf.cache.set(this.$route.path + this.user, this.search_value);
    }
  }
};
const _hoisted_1$3 = { class: "zSimpleTable grid" };
const _hoisted_2$3 = { class: "container" };
const _hoisted_3$3 = { class: "d-flex flex-row flex-row-reverse" };
const _hoisted_4$3 = { class: "DougSearch row" };
const _hoisted_5$3 = { class: "col-10 p-0" };
const _hoisted_6$3 = { class: "table table-bordered table-striped table-condensed" };
const _hoisted_7$3 = { class: "table-header" };
const _hoisted_8$2 = ["onClick"];
const _hoisted_9$1 = { key: 0 };
const _hoisted_10$1 = { key: 1 };
const _hoisted_11$1 = ["onClick"];
const _hoisted_12$1 = { key: 2 };
const _hoisted_13$1 = ["onClick"];
const _hoisted_14 = { key: 3 };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = { key: 4 };
const _hoisted_17 = ["onClick"];
const _hoisted_18 = { key: 5 };
const _hoisted_19 = ["onUpdate:modelValue", "checked", "onClick"];
const _hoisted_20 = { key: 6 };
const _hoisted_21 = ["src"];
function _sfc_render$5(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("div", _hoisted_1$3, [
    createBaseVNode("div", _hoisted_2$3, [
      createBaseVNode("div", _hoisted_3$3, [
        createBaseVNode("div", _hoisted_4$3, [
          createBaseVNode("div", _hoisted_5$3, [
            withDirectives(createBaseVNode("input", {
              type: "text",
              class: "form-control",
              placeholder: "Search...",
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.search_value = $event)
            }, null, 512), [
              [vModelText, $data.search_value]
            ])
          ]),
          _cache[1] || (_cache[1] = createBaseVNode("div", { class: "col-2 p-0" }, [
            createBaseVNode("button", {
              class: "btn btn-default",
              type: "button"
            }, [
              createBaseVNode("i", { class: "bi bi-search" })
            ])
          ], -1))
        ])
      ])
    ]),
    createBaseVNode("table", _hoisted_6$3, [
      createBaseVNode("thead", null, [
        createBaseVNode("tr", _hoisted_7$3, [
          (openBlock(true), createElementBlock(Fragment, null, renderList($data.headers, (h, i) => {
            return openBlock(), createElementBlock("th", {
              key: i,
              onClick: ($event) => $options.sort_by(i)
            }, [
              i === $data.last_toggle ? (openBlock(), createElementBlock("span", {
                key: 0,
                class: normalizeClass($options.get_icon(i))
              }, null, 2)) : createCommentVNode("", true),
              createTextVNode(toDisplayString(h), 1)
            ], 8, _hoisted_8$2);
          }), 128))
        ])
      ]),
      createBaseVNode("tbody", null, [
        (openBlock(true), createElementBlock(Fragment, null, renderList($data.data_filter, (d, i) => {
          return openBlock(), createElementBlock("tr", { key: i }, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($data.rows, (r) => {
              return openBlock(), createElementBlock(Fragment, {
                key: r.id
              }, [
                $options.display_type(r) == "normal" ? (openBlock(), createElementBlock("td", _hoisted_9$1, toDisplayString(d[r]), 1)) : createCommentVNode("", true),
                $options.display_type(r) == "edit_button" ? (openBlock(), createElementBlock("td", _hoisted_10$1, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "btn btn-success",
                    onClick: ($event) => $options.callback(r, d)
                  }, "Edit", 8, _hoisted_11$1)
                ])) : createCommentVNode("", true),
                $options.display_type(r) == "copy_button" ? (openBlock(), createElementBlock("td", _hoisted_12$1, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "btn btn-success",
                    onClick: ($event) => $options.callback(r, d)
                  }, "Copy", 8, _hoisted_13$1)
                ])) : createCommentVNode("", true),
                $options.display_type(r) == "delete_button" ? (openBlock(), createElementBlock("td", _hoisted_14, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "btn btn-danger",
                    onClick: ($event) => $options.callback(r, d)
                  }, "Delete", 8, _hoisted_15)
                ])) : createCommentVNode("", true),
                $options.display_type(r) == "view_button" ? (openBlock(), createElementBlock("td", _hoisted_16, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "btn btn-primary",
                    onClick: ($event) => $options.callback(r, d)
                  }, "View", 8, _hoisted_17)
                ])) : createCommentVNode("", true),
                $options.display_type(r) == "checkbox" ? (openBlock(), createElementBlock("td", _hoisted_18, [
                  withDirectives(createBaseVNode("input", {
                    type: "checkbox",
                    "onUpdate:modelValue": ($event) => d[r] = $event,
                    checked: d[r],
                    onClick: ($event) => $options.callback(r, d)
                  }, null, 8, _hoisted_19), [
                    [vModelCheckbox, d[r]]
                  ])
                ])) : createCommentVNode("", true),
                $options.display_type(r) == "image" ? (openBlock(), createElementBlock("td", _hoisted_20, [
                  createBaseVNode("img", {
                    style: { "width": "50px", "height": "50px" },
                    src: d[r]
                  }, null, 8, _hoisted_21)
                ])) : createCommentVNode("", true),
                $options.display_type(r) == "int_to_yn" ? (openBlock(), createElementBlock("td", {
                  key: 7,
                  style: normalizeStyle($options.enabled_color(d[r]))
                }, toDisplayString($options.int_to_yn(d[r])), 5)) : createCommentVNode("", true),
                $options.display_type(r) == "enabled" ? (openBlock(), createElementBlock("td", {
                  key: 8,
                  style: normalizeStyle($options.enabled_color(d[r]))
                }, toDisplayString($options.int_to_yn(d[r])), 5)) : createCommentVNode("", true),
                $options.display_type(r) == "enabled_flip" ? (openBlock(), createElementBlock("td", {
                  key: 9,
                  style: normalizeStyle($options.enabled_color(d[r], true))
                }, toDisplayString($options.int_to_yn(d[r])), 5)) : createCommentVNode("", true)
              ], 64);
            }), 128))
          ]);
        }), 128))
      ])
    ])
  ]);
}
const zSimpleTableVue = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["render", _sfc_render$5]]);
let x = {
  test: function() {
    console.log("test");
  },
  trim(s, c) {
    if (c === "]")
      c = "\\]";
    if (c === "^")
      c = "\\^";
    if (c === "\\")
      c = "\\\\";
    return s.replace(new RegExp(
      "^[" + c + "]+|[" + c + "]+$",
      "g"
    ), "");
  },
  dloop: function(data, call) {
    try {
      if (typeof data == "object") {
        for (let [i, v] of Object.entries(data)) {
          call(i, v);
        }
        return true;
      } else if (Array.isArray(data)) {
        for (let [i, v] of data) {
          call(i, v);
        }
        return true;
      }
    } catch (e) {
      console.log(e);
      console.log(data);
      throw e;
    }
    return false;
  },
  await_dloop: async function(data, call) {
    try {
      if (typeof data == "object") {
        for (let [i, v] of Object.entries(data)) {
          await call(i, v);
        }
        return true;
      } else if (Array.isArray(data)) {
        for (let [i, v] of data) {
          await call(i, v);
        }
        return true;
      }
    } catch (e) {
      console.log(e);
      console.log(data);
      throw e;
    }
    return false;
  },
  /*
  * $value == false       -> appends mutiple entries with the same key to a subarray, $array[$key][]:$array
  * $value === true       -> indexs by the key and appends the array to the key, $array[$key]:$array
  * $value = true(string) -> indexs by the key and grabs a single value out of the array, $array[$key]:$array[$string]
  * 
  * 
  */
  set_custom_keys: function($arr, $key, $value) {
    if ($arr == void 0) {
      throw Error();
    }
    if (!Array.isArray($arr)) {
      $arr = x.object_to_array($arr);
    }
    let temp = {};
    this.dloop($arr, function(i, v) {
      try {
        if ($value === true) {
          temp[v[$key]] = v;
        } else if ($value) {
          temp[v[$key]] = v[$value];
        } else {
          if (typeof temp[v[$key]] == "undefined") {
            temp[v[$key]] = [];
          }
          temp[v[$key]].push(v);
        }
      } catch (e) {
        console.log(e);
        throw e;
      }
    });
    return temp;
  },
  object_to_array: function(obj) {
    if (typeof obj != "object") {
      console.log(obj);
      throw "Object to array fail, this is not an object!";
    }
    let new_array = [];
    x.dloop(obj, function(i, v) {
      new_array.push(v);
    });
    return new_array;
  },
  remove_quotes: function(value) {
    return value.replace(/^"(.*)"$/, "$1");
  },
  delay: async function(ms) {
    return new Promise((res) => setTimeout(res, ms));
  },
  sleep: async function(ms) {
    return new Promise((res) => setTimeout(res, ms));
  },
  array_unique: function(array) {
    return array.filter(x._array_unique);
  },
  _array_unique: function(value, index, array) {
    return array.indexOf(value) === index;
  },
  // Clone to de-reference and copy
  clone: function(item) {
    return JSON.parse(JSON.stringify(item));
  },
  basename: function(str) {
    let base = new String(str).substring(str.lastIndexOf("/") + 1);
    if (base.lastIndexOf(".") != -1)
      base = base.substring(0, base.lastIndexOf("."));
    return base;
  },
  get_cat_id: function(product) {
    let v = product;
    let map = this.cat_mapping();
    try {
      if (v.product_type == "Miscellaneous") {
        return "1217256";
      }
      if (v.product_type == "Kitchen Sink" || v.product_type == "Bathroom Sink" || v.product_type == "Kitchen Sink Combo" || v.product_type == "Bathroom Sink Combo") {
        let mount_type = v.attributes.find((av) => av.name == "material");
        let mt = mount_type.product_options[0].name;
        let color = v.attributes.find((av) => av.name == "mount_type");
        let c = color.product_options[0].name;
        if (v.product_type == "Kitchen Sink" || v.product_type == "Kitchen Sink Combo") {
          return map["Kitchen"]["Sink"][mt][c];
        }
        if (v.product_type == "Bathroom Sink" || v.product_type == "Bathroom Sink Combo") {
          return map["Bathroom"]["Sink"][mt][c];
        }
        console.log(v.product_type + ", " + mt + ", " + c);
      }
      if (v.product_type == "Kitchen Faucet" || v.product_type == "Bathroom Faucet") {
        let finish = v.attributes.find((av) => av.name == "finish");
        let f = finish.product_options[0].name;
        if (v.product_type == "Kitchen Faucet") {
          return map["Kitchen"]["Faucet"][f];
        }
        if (v.product_type == "Bathroom Faucet") {
          return map["Bathroom"]["Faucet"][f];
        }
        console.log(v.product_type);
      }
      if (v.product_type == "Kitchen Accessory" || v.product_type == "Bathroom Accessory" || v.product_type == "Soap Dispenser") {
        if (v.product_type == "Kitchen Accessory" || v.product_type == "Soap Dispenser") {
          return "1207529";
        }
        ;
        if (v.product_type == "Bathroom Accessory") {
          return "1207531";
        }
        ;
      }
    } catch (e) {
      console.log(e);
      console.log(product);
      return "TOFIX";
    }
  },
  cat_mapping: function() {
    return {
      "Miscellaneous": {
        "Miscellaneous": "1217256"
      },
      "Kitchen": {
        "Kitchen": "1207525",
        "Sink": {
          "Sink": "1207527",
          "Quartz Composite": {
            "Quartz Composite": "1210967",
            "Undermount": "1210990",
            "Farmhouse/apron Front Sink": "1210992",
            "Top Mount": "1210991",
            "Seamless Undermount": "1228073"
          },
          "Stainless Steel": {
            "Stainless Steel": "1210984",
            "Undermount": "1210996",
            "Farmhouse/apron Front Sink": "1210995",
            "Top Mount": "1210994",
            "Seamless Undermount": "1210996"
          },
          "Acrylic": {
            "Acrylic": "1210985",
            "Seamless Undermount": "1210997"
          }
        },
        "Accessory": {
          "Accessory": "1207529"
        },
        "Faucet": {
          "Faucet": "1207530",
          "Stainless Steel": "1207677",
          "Brushed Gold": "1207678",
          "Polished Chrome": "1207679",
          "Gunmetal Grey": "1207680",
          "Matte Black": "1207681",
          "Brushed Copper": "1207682",
          "Gold": "1207683",
          "Oil Rubbed Bronze": "1207684",
          "Matte Black/Brushed Gold": "1218048",
          "Matte Black/Stainless Steel": "1218049"
        }
      },
      "Bathroom": {
        "Bathroom": "1207526",
        "Sink": {
          "Sink": "1207528",
          "Quartz Composite": {
            "Quartz Composite": "1210998",
            "Vessel": "1211002",
            "Seamless Undermount": "1218028"
          },
          "Stainless Steel": {
            "Stainless Steel": "1211000",
            "Drop-in": "1211007",
            "Pedestal": "1211006",
            "Seamless Undermount": "1211004",
            "Undermount": "1211003",
            "Vessel": "1211005"
          },
          "Acrylic": {
            "Acrylic": "1210999",
            "Seamless Undermount": "1211011",
            "Vessel": "1218050"
          },
          "Vitreous China": {
            "Vitreous China": "1211001",
            "Top Mount": "1211009",
            "Undermount": "1211008",
            "Vessel": "1211010"
          }
        },
        "Accessory": {
          "Accessory": "1207531"
        },
        "Faucet": {
          "Faucet": "1207532",
          "Polished Chrome": "1207685",
          "Matte Black": "1207686",
          "Oil Rubbed Bronze": "1207687",
          "Brushed Copper": "1207688",
          "Brushed Gold": "1207689",
          "Gold": "1207690",
          "Gunmetal Grey": "1207691",
          "Stainless Steel": "1207692"
        }
      }
    };
  }
};
const uf = x;
const Equipment_vue_vue_type_style_index_0_lang = "";
const _sfc_main$4 = {
  name: "Equipment",
  data() {
    return {
      data: [],
      eq: []
    };
  },
  components: {
    zSimpleTableVue
  },
  methods: {
    add_eq: function() {
      this.$router.push({ name: "equipment-add" });
    },
    get_config: function() {
      return {
        name: { header: "Name" },
        slot: { header: "Slot" },
        dmg: { header: "Dmg" },
        ac: { header: "Ac" },
        str: { header: "Str" },
        con: { header: "Con" },
        dex: { header: "Dex" },
        int: { header: "Int" },
        wis: { header: "Wis" },
        cha: { header: "Cha" },
        hpr: { header: "Hpr" },
        spr: { header: "Spr" },
        hp: { header: "Hp" },
        rphys: { header: "Phys Res" },
        rpsi: { header: "Psi Res" },
        relec: { header: "Elec Res" },
        rmag: { header: "Mag Res" },
        rpoi: { header: "Poi Res" },
        rfire: { header: "Fire Res" },
        rcold: { header: "Cold Res" },
        racid: { header: "Acid Res" },
        rasphx: { header: "Asph Res" },
        eqmob_name: { header: "Eq Mob" },
        note: { header: "Note" }
      };
    },
    get_stat: function(str) {
      if (str.includes("user's strength")) {
        return "str";
      }
      if (str.includes("user's constitution")) {
        return "con";
      }
      if (str.includes("user's dexterity")) {
        return "dex";
      }
      if (str.includes("user's intelligence")) {
        return "int";
      }
      if (str.includes("user's wisdom")) {
        return "wis";
      }
      if (str.includes("user's charisma")) {
        return "cha";
      }
      if (str.includes("user's hitpoint")) {
        return "hpr";
      }
      if (str.includes("user's spellpoint")) {
        return "spr";
      }
      if (str.includes("user's hitpoints")) {
        return "hp";
      }
      if (str.includes("user's physical resistance")) {
        return "rphys";
      }
      if (str.includes("user's electric resistance")) {
        return "relec";
      }
      if (str.includes("user's psionic resistance")) {
        return "rpsi";
      }
      if (str.includes("user's magical resistance")) {
        return "rmag";
      }
      if (str.includes("user's acid resistance")) {
        return "racid";
      }
      if (str.includes("user's poison resistance")) {
        return "rpoi";
      }
      if (str.includes("user's fire resistance")) {
        return "rfire";
      }
      if (str.includes("user's cold resistance")) {
        return "rcold";
      }
      if (str.includes("user's asphyxiation resistance")) {
        return "rasphx";
      }
      if (str.includes("It does psionic damage")) {
        return "dmg-psi";
      }
      if (str.includes("It does electric damage")) {
        return "dmg-elec";
      }
      if (str.includes("It does acid damage")) {
        return "dmg-acid";
      }
      if (str.includes("It does cold damage")) {
        return "dmg-cold";
      }
      if (str.includes("It does fire damage")) {
        return "dmg-fire";
      }
      if (str.includes("It does poison damage")) {
        return "dmg-poi";
      }
      if (str.includes("It does asphyxiation damage")) {
        return "dmg-asph";
      }
      if (str.includes("It does magical damage")) {
        return "dmg-mag";
      }
      if (str.includes("weapon class")) {
        return "dmg-phys";
      }
      if (str.includes("armour class for")) {
        return "ac";
      }
      if (str.includes("bonus to user's")) {
        return "bonus";
      }
      return false;
    },
    get_amt: function(str) {
      if (str.includes("non-existently")) {
        return 0;
      }
      if (str.includes("unnoticably")) {
        return 1;
      }
      if (str.includes("pathetically")) {
        return 2;
      }
      if (str.includes("pitifully")) {
        return 3;
      }
      if (str.includes("a tiny bit")) {
        return 4;
      }
      if (str.includes("poorly")) {
        return 5;
      }
      if (str.includes("a bit")) {
        return 6;
      }
      if (str.includes("slightly")) {
        return 7;
      }
      if (str.includes("somewhat")) {
        return 8;
      }
      if (str.includes("noticably")) {
        return 9;
      }
      if (str.includes("adequately")) {
        return 10;
      }
      if (str.includes("an average amount")) {
        return 11;
      }
      if (str.includes("a good amount")) {
        return 12;
      }
      if (str.includes("nicely")) {
        return 13;
      }
      if (str.includes("strongly")) {
        return 14;
      }
      if (str.includes("impressively")) {
        return 15;
      }
      if (str.includes("superbly")) {
        return 16;
      }
      if (str.includes("tremendously")) {
        return 17;
      }
      if (str.includes("magnificantly") || str.includes("magnificently")) {
        return 18;
      }
      if (str.includes("astoundingly")) {
        return 19;
      }
      if (str.includes("unbelievably much")) {
        return 20;
      }
      if (str.includes("impossibly much")) {
        return 30;
      }
      if (str.includes("immensely")) {
        return 31;
      }
      if (str.includes("phenomenally")) {
        return 33;
      }
      if (str.includes("ILLEGALLY")) {
        return 50;
      }
      return false;
    },
    get_ac: function(str) {
      if (str.includes(`negative in general`)) {
        return -1;
      }
      if (str.includes(`almost non-existent in general`)) {
        return 1;
      }
      if (str.includes(`non-existent in general`)) {
        return 0;
      }
      if (str.includes(`pathetic in general`)) {
        return 2;
      }
      if (str.includes(`tiny in general`)) {
        return 3;
      }
      if (str.includes(`feeble in general`)) {
        return 4;
      }
      if (str.includes(`little in general`)) {
        return 5;
      }
      if (str.includes(`poor in general`)) {
        return 6;
      }
      if (str.includes(`low in general`)) {
        return 7;
      }
      if (str.includes(`mediocre in general`)) {
        return 8;
      }
      if (str.includes(`decent in general`)) {
        return 9;
      }
      if (str.includes(`adequate in general`)) {
        return 10;
      }
      if (str.includes(`average in general`)) {
        return 11;
      }
      if (str.includes(`good in general`)) {
        return 12;
      }
      if (str.includes(`nice in general`)) {
        return 13;
      }
      if (str.includes(`excellent in general`)) {
        return 14;
      }
      if (str.includes(`superb in general`)) {
        return 15;
      }
      if (str.includes(`unbelievable in general`)) {
        return 16;
      }
      return false;
    }
  },
  mounted: async function() {
    let that = this;
    if (this.$root.user.first_name === false) {
      this.$router.push({ name: "dashboard" });
    }
    let data = await axios.post("/api/eq/eq", { user_id: this.$root.user.id });
    let eq = data.data;
    uf.dloop(eq, function(i, v) {
      let info = v.info.split("\n");
      let tmp = {};
      let bonuses = [];
      tmp.name = info[0].replaceAll(" seems to vibrate rapidly.", "");
      uf.dloop(info, function(ii, line) {
        let line_split = line.split(" ");
        let is_positive = false;
        if (line_split[1] == "increases") {
          is_positive = true;
        }
        let stat = that.get_stat(line);
        let amt = that.get_amt(line);
        if (stat == "hp" && amt !== false) {
          amt = amt * 10;
        }
        if (stat == "dmg-phys") {
          amt = 40;
        }
        if (stat !== false && stat.includes("dmg-") && amt !== false) {
          let fix = stat.split("-");
          amt = amt * 2.5 + "% " + fix[1];
          stat = "dmg";
          is_positive = true;
        }
        if (stat == "bonus") {
          bonuses.push(line);
          stat = false;
        }
        if (stat == "ac") {
          is_positive = true;
          amt = that.get_ac(line);
        }
        if (stat === false || amt === false)
          ;
        else if (is_positive) {
          tmp[stat] = amt;
        } else {
          tmp[stat] = -amt;
        }
      });
      tmp.note = v.note;
      if (bonuses.length > 0) {
        if (v.note == "") {
          tmp.note += bonuses.join("\n");
        } else {
          tmp.note += " --- " + bonuses.join("\n");
        }
        tmp.note.trim();
      }
      tmp.slot = v.slot;
      tmp.eqmob_name = v.eqmob_name;
      that.eq.push(tmp);
    });
    this.$refs.zSimpleTableVue.set_table(
      this.eq,
      this.get_config(),
      {
        display_limit: 100
      }
    );
  }
};
function _sfc_render$4(_ctx, _cache, $props, $setup, $data, $options) {
  const _component_zSimpleTableVue = resolveComponent("zSimpleTableVue");
  return openBlock(), createElementBlock("div", null, [
    _cache[1] || (_cache[1] = createBaseVNode("h2", null, "Equipment", -1)),
    createBaseVNode("button", {
      class: "btn btn-primary",
      type: "button",
      onClick: _cache[0] || (_cache[0] = (...args) => $options.add_eq && $options.add_eq(...args))
    }, "Add Item"),
    _cache[2] || (_cache[2] = createBaseVNode("br", null, null, -1)),
    _cache[3] || (_cache[3] = createBaseVNode("br", null, null, -1)),
    _cache[4] || (_cache[4] = createBaseVNode("br", null, null, -1)),
    createVNode(_component_zSimpleTableVue, { ref: "zSimpleTableVue" }, null, 512)
  ]);
}
const Equipment = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["render", _sfc_render$4]]);
const EquipmentAll_vue_vue_type_style_index_0_lang = "";
const _sfc_main$3 = {
  name: "Equipment",
  data() {
    return {
      data: [],
      eq: []
    };
  },
  components: {
    zSimpleTableVue
  },
  methods: {
    add_eq: function() {
      this.$router.push({ name: "equipment-add" });
    },
    copy_to_user: async function(d) {
      await axios.post("api/eq/copy_to_user", { user_id: this.$root.user.id, id: d.id });
      this.$root.send_global_alert("Added Successfully!");
    },
    get_config: function() {
      let that = this;
      return {
        id: { header: "id" },
        copy_button: { header: "copy?", display_type: "copy_button", callback: that.copy_to_user },
        name: { header: "Name" },
        slot: { header: "Slot" },
        dmg: { header: "Dmg" },
        ac: { header: "Ac" },
        str: { header: "Str" },
        con: { header: "Con" },
        dex: { header: "Dex" },
        int: { header: "Int" },
        wis: { header: "Wis" },
        cha: { header: "Cha" },
        hpr: { header: "Hpr" },
        spr: { header: "Spr" },
        hp: { header: "Hp" },
        rphys: { header: "Phys Res" },
        rpsi: { header: "Psi Res" },
        relec: { header: "Elec Res" },
        rmag: { header: "Mag Res" },
        rpoi: { header: "Poi Res" },
        rfire: { header: "Fire Res" },
        rcold: { header: "Cold Res" },
        racid: { header: "Acid Res" },
        rasphx: { header: "Asph Res" },
        eqmob_name: { header: "Eq Mob" },
        note: { header: "Note" }
      };
    },
    get_stat: function(str) {
      if (str.includes("user's strength")) {
        return "str";
      }
      if (str.includes("user's constitution")) {
        return "con";
      }
      if (str.includes("user's dexterity")) {
        return "dex";
      }
      if (str.includes("user's intelligence")) {
        return "int";
      }
      if (str.includes("user's wisdom")) {
        return "wis";
      }
      if (str.includes("user's charisma")) {
        return "cha";
      }
      if (str.includes("user's hitpoint")) {
        return "hpr";
      }
      if (str.includes("user's spellpoint")) {
        return "spr";
      }
      if (str.includes("user's hitpoints")) {
        return "hp";
      }
      if (str.includes("user's physical resistance")) {
        return "rphys";
      }
      if (str.includes("user's electric resistance")) {
        return "relec";
      }
      if (str.includes("user's psionic resistance")) {
        return "rpsi";
      }
      if (str.includes("user's magical resistance")) {
        return "rmag";
      }
      if (str.includes("user's acid resistance")) {
        return "racid";
      }
      if (str.includes("user's poison resistance")) {
        return "rpoi";
      }
      if (str.includes("user's fire resistance")) {
        return "rfire";
      }
      if (str.includes("user's cold resistance")) {
        return "rcold";
      }
      if (str.includes("user's asphyxiation resistance")) {
        return "rasphx";
      }
      if (str.includes("It does psionic damage")) {
        return "dmg-psi";
      }
      if (str.includes("It does electric damage")) {
        return "dmg-elec";
      }
      if (str.includes("It does acid damage")) {
        return "dmg-acid";
      }
      if (str.includes("It does cold damage")) {
        return "dmg-cold";
      }
      if (str.includes("It does fire damage")) {
        return "dmg-fire";
      }
      if (str.includes("It does poison damage")) {
        return "dmg-poi";
      }
      if (str.includes("It does asphyxiation damage")) {
        return "dmg-asph";
      }
      if (str.includes("It does magical damage")) {
        return "dmg-mag";
      }
      if (str.includes("weapon class")) {
        return "dmg-phys";
      }
      if (str.includes("armour class for")) {
        return "ac";
      }
      if (str.includes("bonus to user's")) {
        return "bonus";
      }
      return false;
    },
    get_amt: function(str) {
      if (str.includes("non-existently")) {
        return 0;
      }
      if (str.includes("unnoticably")) {
        return 1;
      }
      if (str.includes("pathetically")) {
        return 2;
      }
      if (str.includes("pitifully")) {
        return 3;
      }
      if (str.includes("a tiny bit")) {
        return 4;
      }
      if (str.includes("poorly")) {
        return 5;
      }
      if (str.includes("a bit")) {
        return 6;
      }
      if (str.includes("slightly")) {
        return 7;
      }
      if (str.includes("somewhat")) {
        return 8;
      }
      if (str.includes("noticably")) {
        return 9;
      }
      if (str.includes("adequately")) {
        return 10;
      }
      if (str.includes("an average amount")) {
        return 11;
      }
      if (str.includes("a good amount")) {
        return 12;
      }
      if (str.includes("nicely")) {
        return 13;
      }
      if (str.includes("strongly")) {
        return 14;
      }
      if (str.includes("impressively")) {
        return 15;
      }
      if (str.includes("superbly")) {
        return 16;
      }
      if (str.includes("tremendously")) {
        return 17;
      }
      if (str.includes("magnificantly") || str.includes("magnificently")) {
        return 18;
      }
      if (str.includes("astoundingly")) {
        return 19;
      }
      if (str.includes("unbelievably much")) {
        return 20;
      }
      if (str.includes("impossibly much")) {
        return 30;
      }
      if (str.includes("immensely")) {
        return 31;
      }
      if (str.includes("phenomenally")) {
        return 33;
      }
      if (str.includes("ILLEGALLY")) {
        return 50;
      }
      return false;
    },
    get_ac: function(str) {
      if (str.includes(`negative in general`)) {
        return -1;
      }
      if (str.includes(`almost non-existent in general`)) {
        return 1;
      }
      if (str.includes(`non-existent in general`)) {
        return 0;
      }
      if (str.includes(`pathetic in general`)) {
        return 2;
      }
      if (str.includes(`tiny in general`)) {
        return 3;
      }
      if (str.includes(`feeble in general`)) {
        return 4;
      }
      if (str.includes(`little in general`)) {
        return 5;
      }
      if (str.includes(`poor in general`)) {
        return 6;
      }
      if (str.includes(`low in general`)) {
        return 7;
      }
      if (str.includes(`mediocre in general`)) {
        return 8;
      }
      if (str.includes(`decent in general`)) {
        return 9;
      }
      if (str.includes(`adequate in general`)) {
        return 10;
      }
      if (str.includes(`average in general`)) {
        return 11;
      }
      if (str.includes(`good in general`)) {
        return 12;
      }
      if (str.includes(`nice in general`)) {
        return 13;
      }
      if (str.includes(`excellent in general`)) {
        return 14;
      }
      if (str.includes(`superb in general`)) {
        return 15;
      }
      if (str.includes(`unbelievable in general`)) {
        return 16;
      }
      return false;
    }
  },
  mounted: async function() {
    let that = this;
    if (this.$root.user.first_name === false) {
      this.$router.push({ name: "dashboard" });
    }
    let data = await axios.post("/api/eq/eq", { user_id: "all" });
    let eq = data.data;
    uf.dloop(eq, function(i, v) {
      let info = v.info.split("\n");
      let tmp = {};
      let bonuses = [];
      tmp.name = info[0].replaceAll(" seems to vibrate rapidly.", "");
      uf.dloop(info, function(ii, line) {
        let line_split = line.split(" ");
        let is_positive = false;
        if (line_split[1] == "increases") {
          is_positive = true;
        }
        let stat = that.get_stat(line);
        let amt = that.get_amt(line);
        if (stat == "hp" && amt !== false) {
          amt = amt * 10;
        }
        if (stat == "dmg-phys") {
          amt = 40;
        }
        if (stat !== false && stat.includes("dmg-") && amt !== false) {
          let fix = stat.split("-");
          amt = amt * 2.5 + "% " + fix[1];
          stat = "dmg";
          is_positive = true;
        }
        if (stat == "bonus") {
          bonuses.push(line);
          stat = false;
        }
        if (stat == "ac") {
          is_positive = true;
          amt = that.get_ac(line);
        }
        if (stat === false || amt === false)
          ;
        else if (is_positive) {
          tmp[stat] = amt;
        } else {
          tmp[stat] = -amt;
        }
      });
      tmp.note = v.note;
      if (bonuses.length > 0) {
        if (v.note == "") {
          tmp.note += bonuses.join("\n");
        } else {
          tmp.note += " --- " + bonuses.join("\n");
        }
        tmp.note.trim();
      }
      tmp.slot = v.slot;
      tmp.eqmob_name = v.eqmob_name;
      tmp.id = v.id;
      that.eq.push(tmp);
    });
    this.$refs.zSimpleTableVue.set_table(
      this.eq,
      this.get_config(),
      {
        display_limit: 100
      }
    );
  }
};
function _sfc_render$3(_ctx, _cache, $props, $setup, $data, $options) {
  const _component_zSimpleTableVue = resolveComponent("zSimpleTableVue");
  return openBlock(), createElementBlock("div", null, [
    _cache[1] || (_cache[1] = createBaseVNode("h2", null, "Equipment", -1)),
    createBaseVNode("button", {
      class: "btn btn-primary",
      type: "button",
      onClick: _cache[0] || (_cache[0] = (...args) => $options.add_eq && $options.add_eq(...args))
    }, "Add Item"),
    _cache[2] || (_cache[2] = createBaseVNode("br", null, null, -1)),
    _cache[3] || (_cache[3] = createBaseVNode("br", null, null, -1)),
    _cache[4] || (_cache[4] = createBaseVNode("br", null, null, -1)),
    createVNode(_component_zSimpleTableVue, { ref: "zSimpleTableVue" }, null, 512)
  ]);
}
const EquipmentAll = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["render", _sfc_render$3]]);
const EquipmentAdd_vue_vue_type_style_index_0_scoped_df6fb1aa_lang = "";
const _sfc_main$2 = {
  name: "Equipment Add",
  data() {
    return {
      slot: [
        "head",
        "neck",
        "cloak",
        "amulet",
        "torso",
        "arms",
        "hands",
        "shield",
        "finger",
        "held",
        "belt",
        "legs",
        "feet",
        "wield",
        "multi",
        "axe",
        "sword",
        "dagger",
        "bow",
        "ancient",
        "polearm",
        "bludgeon",
        "staff"
      ],
      the_slot: "",
      item_info: "",
      note: "",
      eqmobs: ["zork", "is", "mon"],
      selected_eqmob: "",
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

`
    };
  },
  components: {
    Multiselect: script
  },
  methods: {
    add: async function() {
      if (this.item_info != "" && this.the_slot != "" && this.selected_eqmob != "" && this.$root.user.first_name !== false) {
        await axios.post(
          `/api/eq/add`,
          {
            item_info: this.item_info.trim(),
            note: this.note.trim(),
            slot: this.the_slot,
            eqmob: this.selected_eqmob.id,
            user_id: this.$root.user.id
          }
        );
        this.item_info = "";
        this.the_slot = "";
        this.selected_eqmob = "";
        this.note = "";
        this.$root.send_global_alert("Added Successfully!");
      } else {
        this.$root.send_global_alert("Fill all fields! // RE-LOGIN", true);
      }
    },
    add_eqmob: async function() {
      if (this.new_eq_mob != "") {
        await axios.post(
          `/api/eq/add-mob`,
          {
            name: this.new_eq_mob
          }
        );
        await this.load_eqmobs();
        this.new_eq_mob = "";
        this.$root.send_global_alert("Added Successfully!");
      } else {
        this.$root.send_global_alert("New EQ Mob NEEDS NAME!", true);
      }
    },
    load_eqmobs: async function() {
      this.eqmobs = (await axios.get(`/api/eq/eq-mobs`)).data;
    }
  },
  mounted: async function() {
    this.load_eqmobs();
  }
};
const _hoisted_1$2 = { class: "mb-3" };
const _hoisted_2$2 = ["id", "value"];
const _hoisted_3$2 = {
  class: "form-check-label",
  for: "radio control"
};
const _hoisted_4$2 = { class: "mb-3" };
const _hoisted_5$2 = { class: "row" };
const _hoisted_6$2 = { class: "col-2" };
const _hoisted_7$2 = { class: "col-2" };
const _hoisted_8$1 = { class: "col-2" };
function _sfc_render$2(_ctx, _cache, $props, $setup, $data, $options) {
  const _component_Multiselect = resolveComponent("Multiselect");
  return openBlock(), createElementBlock("div", null, [
    _cache[9] || (_cache[9] = createBaseVNode("h2", null, "Equipment Add", -1)),
    createBaseVNode("div", _hoisted_1$2, [
      _cache[7] || (_cache[7] = createBaseVNode("label", {
        for: "exampleFormControlTextarea1",
        class: "form-label"
      }, "Paste Input!", -1)),
      withDirectives(createBaseVNode("textarea", {
        class: "form-control",
        id: "exampleFormControlTextarea1",
        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.item_info = $event),
        rows: "10"
      }, null, 512), [
        [vModelText, $data.item_info]
      ])
    ]),
    _cache[10] || (_cache[10] = createBaseVNode("br", null, null, -1)),
    _cache[11] || (_cache[11] = createBaseVNode("br", null, null, -1)),
    (openBlock(true), createElementBlock(Fragment, null, renderList($data.slot, (v) => {
      return openBlock(), createElementBlock("div", {
        class: "form-check form-check-inline",
        key: v
      }, [
        withDirectives(createBaseVNode("input", {
          class: "form-check-input",
          type: "radio",
          name: "inlineRadioOptions",
          id: v,
          value: v,
          "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.the_slot = $event)
        }, null, 8, _hoisted_2$2), [
          [vModelRadio, $data.the_slot]
        ]),
        createBaseVNode("label", _hoisted_3$2, toDisplayString(v), 1)
      ]);
    }), 128)),
    _cache[12] || (_cache[12] = createBaseVNode("br", null, null, -1)),
    _cache[13] || (_cache[13] = createBaseVNode("br", null, null, -1)),
    createBaseVNode("div", _hoisted_4$2, [
      _cache[8] || (_cache[8] = createBaseVNode("label", {
        for: "exampleFormControlTextarea2",
        class: "form-label"
      }, "Note", -1)),
      withDirectives(createBaseVNode("textarea", {
        class: "form-control",
        id: "exampleFormControlTextarea2",
        "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $data.note = $event),
        rows: "2"
      }, null, 512), [
        [vModelText, $data.note]
      ])
    ]),
    _cache[14] || (_cache[14] = createBaseVNode("br", null, null, -1)),
    _cache[15] || (_cache[15] = createBaseVNode("br", null, null, -1)),
    createBaseVNode("div", _hoisted_5$2, [
      createBaseVNode("div", _hoisted_6$2, [
        createVNode(_component_Multiselect, {
          modelValue: $data.selected_eqmob,
          "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.selected_eqmob = $event),
          class: "filter",
          options: $data.eqmobs,
          object: true,
          value: "name",
          label: "name",
          valueProp: "id",
          "track-by": "name",
          searchable: true,
          placeholder: "EQ Mobs..",
          ref: "eqmob_selector"
        }, null, 8, ["modelValue", "options"])
      ]),
      createBaseVNode("div", _hoisted_7$2, [
        createBaseVNode("button", {
          class: "btn btn-primary",
          style: { "float": "right" },
          type: "button",
          onClick: _cache[4] || (_cache[4] = (...args) => $options.add_eqmob && $options.add_eqmob(...args))
        }, "Add New Eq Mob")
      ]),
      createBaseVNode("div", _hoisted_8$1, [
        withDirectives(createBaseVNode("input", {
          type: "text",
          class: "form-control",
          "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $data.new_eq_mob = $event),
          placeholder: "New Eq Mob Name..."
        }, null, 512), [
          [vModelText, $data.new_eq_mob]
        ])
      ])
    ]),
    _cache[16] || (_cache[16] = createBaseVNode("br", null, null, -1)),
    _cache[17] || (_cache[17] = createBaseVNode("br", null, null, -1)),
    createBaseVNode("button", {
      class: "btn btn-primary",
      type: "button",
      onClick: _cache[6] || (_cache[6] = (...args) => $options.add && $options.add(...args))
    }, "Add Item"),
    _cache[18] || (_cache[18] = createBaseVNode("br", null, null, -1)),
    _cache[19] || (_cache[19] = createBaseVNode("br", null, null, -1)),
    _cache[20] || (_cache[20] = createBaseVNode("br", null, null, -1)),
    _cache[21] || (_cache[21] = createBaseVNode("h3", null, "Example:", -1)),
    createBaseVNode("pre", null, toDisplayString($data.example), 1)
  ]);
}
const EquipmentAdd = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["render", _sfc_render$2], ["__scopeId", "data-v-df6fb1aa"]]);
let _routes = [
  { path: "/", name: "dashboard", component: Dashboard },
  { path: "/equipment", name: "equipment", component: Equipment },
  { path: "/equipment-all", name: "equipment-all", component: EquipmentAll },
  { path: "/equipment-add", name: "equipment-add", component: EquipmentAdd }
];
const routes = _routes;
const Alert0_0_1_vue_vue_type_style_index_0_scoped_c2158033_lang = "";
const _sfc_main$1 = {
  name: "Alert",
  template: ``,
  data() {
    return {
      data: {
        no: false,
        yes: false,
        message: "",
        no_class: "btn-danger",
        yes_class: "btn-success"
      },
      callback: false
    };
  },
  methods: {
    alert(title, message, callback = false, no = "Close", yes = "Save Changes", no_class = false, yes_class = false) {
      let that = this;
      that.data.title = title;
      that.callback = callback;
      that.data.no = no;
      that.data.yes = yes;
      that.data.message = message;
      if (no_class) {
        that.data.no_class = no_class;
      }
      if (yes_class) {
        that.data.yes_class = yes_class;
      }
      this.modal.show();
    },
    alert_simple(title, message, no = "Ok") {
      let that = this;
      that.data.title = title;
      that.data.message = message;
      that.data.no = no;
      that.data.yes = false;
      this.modal.show();
    },
    callbackfunction() {
      this.modal.hide();
      if (this.callback === false) {
        return "done";
      } else {
        return this.callback();
      }
    },
    hide() {
      this.modal.hide();
    }
  },
  mounted: async function() {
    this.modal = new Modal("#my_alert_modal", {});
  }
};
const _hoisted_1$1 = {
  class: "modal fade",
  id: "my_alert_modal",
  tabindex: "-1",
  role: "dialog",
  "aria-labelledby": "myModalLabel"
};
const _hoisted_2$1 = {
  class: "modal-dialog modal-lg",
  role: "document"
};
const _hoisted_3$1 = { class: "modal-content" };
const _hoisted_4$1 = { class: "modal-header" };
const _hoisted_5$1 = {
  class: "modal-title",
  id: "myModalLabel"
};
const _hoisted_6$1 = { class: "modal-body" };
const _hoisted_7$1 = { class: "modal-footer" };
function _sfc_render$1(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("div", _hoisted_1$1, [
    createBaseVNode("div", _hoisted_2$1, [
      createBaseVNode("div", _hoisted_3$1, [
        createBaseVNode("div", _hoisted_4$1, [
          createBaseVNode("h4", _hoisted_5$1, toDisplayString($data.data.title), 1)
        ]),
        createBaseVNode("div", _hoisted_6$1, [
          createBaseVNode("p", null, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($data.data.message.split("\n"), (line, line_number) => {
              return openBlock(), createElementBlock("div", null, toDisplayString(line), 1);
            }), 256))
          ])
        ]),
        createBaseVNode("div", _hoisted_7$1, [
          withDirectives(createBaseVNode("button", {
            type: "button",
            class: normalizeClass(["btn", $data.data.no_class]),
            "data-dismiss": "modal",
            onClick: _cache[0] || (_cache[0] = ($event) => $options.hide())
          }, toDisplayString($data.data.no), 3), [
            [vShow, $data.data.no]
          ]),
          withDirectives(createBaseVNode("button", {
            type: "button",
            class: normalizeClass(["btn", $data.data.yes_class]),
            onClick: _cache[1] || (_cache[1] = ($event) => $options.callbackfunction())
          }, toDisplayString($data.data.yes), 3), [
            [vShow, $data.data.yes]
          ])
        ])
      ])
    ])
  ]);
}
const Alert = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render$1], ["__scopeId", "data-v-c2158033"]]);
const _imports_0 = "/assets/zork-4c49db50.jpg";
const default_css_vue_type_style_index_0_src_true_lang = "";
const App_vue_vue_type_style_index_1_scoped_192d04c0_lang = "";
const _sfc_main = {
  name: "App",
  setup() {
    globalCookiesConfig({
      expireTimes: "7d"
    });
    const { cookies } = useCookies();
    return { cookies };
  },
  data() {
    return {
      data: [],
      global_alert_message: "",
      gc: "hide",
      user: {
        first_name: false,
        role_ids: []
      },
      version: "7",
      wipe_product_search_cache: false
    };
  },
  components: {
    Alert
  },
  methods: {
    send_global_alert: async function(msg, error = false) {
      this.global_alert_message = msg;
      this.global_alert._element.classList.remove("hide");
      this.global_alert._element.classList.add("show");
      this.global_alert._element.classList.remove("alert-success");
      this.global_alert._element.classList.remove("alert-danger");
      if (error) {
        this.global_alert._element.classList.add("alert-danger");
      } else {
        this.global_alert._element.classList.add("alert-success");
      }
      await uf.sleep(3e3);
      this.close_global_alert();
    },
    close_global_alert: async function() {
      this.global_alert._element.classList.remove("show");
      this.global_alert._element.classList.add("hide");
    },
    logout: function() {
      this.$root.user = {
        first_name: false,
        role_ids: []
      }, this.$root.cookies.remove("user");
      this.$router.push({ name: "dashboard" });
    },
    navigate_to_product_page: function() {
      this.wipe_product_search_cache = true;
      this.$router.push({ name: "all-products" });
    }
  },
  computed: {
    display_name: function() {
      if (this.user.first_name !== false) {
        return this.user["first_name"] + " - ";
      } else {
        return "";
      }
    }
  },
  mounted: async function() {
    let user_cookie = this.$root.cookies.get("user");
    if (user_cookie) {
      this.user = user_cookie;
    }
    this.global_alert = new Alert$1("#global_alert");
  },
  watch: {
    "$route": {
      async handler(to, from) {
        let user_cookie = this.$root.cookies.get("user");
        if (user_cookie) {
          this.user = user_cookie;
        } else {
          this.user = {
            first_name: false,
            role_ids: []
          };
        }
        if (this.user.first_name == false) {
          this.$router.push({ name: "dashboard" });
        }
      }
    }
  }
};
const _hoisted_1 = { class: "navbar navbar-dark sticky-top bg-dark flex-md-nowrap p-0 shadow" };
const _hoisted_2 = { class: "navbar-nav navbar-brand" };
const _hoisted_3 = { class: "container-fluid" };
const _hoisted_4 = { class: "row" };
const _hoisted_5 = {
  id: "sidebarMenu",
  class: "col-md-3 col-lg-2 d-md-block bg-light sidebar collapse"
};
const _hoisted_6 = { class: "position-sticky pt-3 sidebar-sticky" };
const _hoisted_7 = { class: "nav flex-column" };
const _hoisted_8 = { class: "nav-item" };
const _hoisted_9 = {
  class: "nav-link",
  href: "#/equipment"
};
const _hoisted_10 = { class: "nav-item" };
const _hoisted_11 = {
  class: "nav-link",
  href: "#/equipment-all"
};
const _hoisted_12 = { class: "nav-item" };
const _hoisted_13 = { class: "col-md-9 ms-sm-auto col-lg-10 px-md-4" };
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  const _component_Alert = resolveComponent("Alert");
  const _component_router_view = resolveComponent("router-view");
  return openBlock(), createElementBlock("body", null, [
    createBaseVNode("header", _hoisted_1, [
      _cache[1] || (_cache[1] = createBaseVNode("a", {
        class: "navbar-brand col-md-3 col-lg-2 me-0 px-3 fs-6",
        href: "#"
      }, [
        createBaseVNode("img", {
          style: { "width": "1%" },
          src: _imports_0
        })
      ], -1)),
      _cache[2] || (_cache[2] = createBaseVNode("button", {
        class: "navbar-toggler position-absolute d-md-none collapsed",
        type: "button",
        "data-bs-toggle": "collapse",
        "data-bs-target": "#sidebarMenu",
        "aria-controls": "sidebarMenu",
        "aria-expanded": "false",
        "aria-label": "Toggle navigation"
      }, [
        createBaseVNode("span", { class: "navbar-toggler-icon" })
      ], -1)),
      createBaseVNode("div", _hoisted_2, [
        createBaseVNode("h4", null, toDisplayString($options.display_name) + "Zorky EQ", 1)
      ]),
      createBaseVNode("div", {
        id: "global_alert",
        class: normalizeClass(["alert hide fade", $data.gc])
      }, [
        createBaseVNode("strong", null, toDisplayString($data.global_alert_message), 1)
      ], 2)
    ]),
    createVNode(_component_Alert, { ref: "Alert" }, null, 512),
    createBaseVNode("div", _hoisted_3, [
      createBaseVNode("div", _hoisted_4, [
        createBaseVNode("nav", _hoisted_5, [
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("ul", _hoisted_7, [
              _cache[6] || (_cache[6] = createBaseVNode("li", { class: "nav-item" }, [
                createBaseVNode("a", {
                  class: "nav-link active",
                  "aria-current": "page",
                  href: "#"
                }, [
                  createBaseVNode("span", { class: "align-text-bottom" }),
                  createTextVNode(" Dashboard ")
                ])
              ], -1)),
              createBaseVNode("li", _hoisted_8, [
                withDirectives(createBaseVNode("a", _hoisted_9, _cache[3] || (_cache[3] = [
                  createBaseVNode("span", {
                    "data-feather": "file",
                    class: "align-text-bottom"
                  }, null, -1),
                  createTextVNode(" My Equipment ")
                ]), 512), [
                  [vShow, $data.user.first_name]
                ])
              ]),
              createBaseVNode("li", _hoisted_10, [
                withDirectives(createBaseVNode("a", _hoisted_11, _cache[4] || (_cache[4] = [
                  createBaseVNode("span", {
                    "data-feather": "file",
                    class: "align-text-bottom"
                  }, null, -1),
                  createTextVNode(" All Equipment ")
                ]), 512), [
                  [vShow, $data.user.first_name]
                ])
              ]),
              createBaseVNode("li", _hoisted_12, [
                createBaseVNode("a", {
                  class: "nav-link",
                  href: "#",
                  onClick: _cache[0] || (_cache[0] = ($event) => $options.logout())
                }, _cache[5] || (_cache[5] = [
                  createBaseVNode("span", {
                    "data-feather": "file",
                    class: "align-text-bottom"
                  }, null, -1),
                  createTextVNode(" Log Out ")
                ]))
              ])
            ])
          ])
        ]),
        createBaseVNode("div", _hoisted_13, [
          createVNode(_component_router_view)
        ])
      ])
    ])
  ]);
}
const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-192d04c0"]]);
const router = createRouter({
  history: createWebHashHistory(),
  routes
  // short for `routes: routes`
});
const app = createApp(App);
app.use(router);
app.mount("#app");
