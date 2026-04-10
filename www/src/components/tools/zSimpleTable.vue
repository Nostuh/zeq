<script>
import {puf} from 'karran-utility-functions';

export default {
    name: "zSimpleTable",
    template: ``,
    data() {
        return {
            data: [],
            data_filter: [],
            data_filter_raw: [],
            config: {},
            config_raw : {},
            headers: [],
            rows:[],
            sort_toggles:{},
            last_toggle:"id",
            search_value: "",
            //for cacheing
            user: "",
        }
    },
    methods: {
        async set_table(data,config,options=false) {
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

                let previous_search = await puf.cache.get(this.$route.path+this.user)

                if ( previous_search ) {
                    this.search_value = previous_search;
                }
                
                if ( options != false ) {
                    if ( options.display_limit != undefined ) {
                        this.display_limit = options.display_limit
                    }
                    if ( options.user != undefined ) {
                        this.user = options.user
                    }
                }

                puf.dloop(config,function(i,v) {
                    that.config[i] = v.display_type;
                    that.headers[i] = v.header;
                    that.rows.push(i);
                })
                
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
            if ( this.data_filter_raw != undefined ) {
                return this.data_filter_raw.length;
            } else {
                return 0;
            }
        },
        int_to_yn(val) {
            return val==0?"No":"Yes";
        },
        enabled_color(val,flip=false) {
            if ( !flip ) {
                return val==0?"background-color: lightcoral":""
            } else {
                return val==0?"":"background-color: lightcoral"
            }
            
        },
        sort_by(val="id",no_toggle=false) {
            let that = this;
            // little thing that remembers last sort... for below sorting
            if ( this.sort_toggles[val] == undefined ) {
                this.sort_toggles[val] = true;
            // specifically for refresh + last known filter
            } else if ( no_toggle ) {
                // do nothing
            } else if (  this.sort_toggles[val] == false || this.last_toggle != val ) {
                this.sort_toggles[val] = true;
            } else if ( this.sort_toggles[val] == true ) {
                this.sort_toggles[val] = false;
            }

            if ( val == "last_toggle" ) {
                val = this.last_toggle;
            } else {
                this.last_toggle = val;
            }
            

            // So that when refresh happens stuff stays in the same 'order';
            let data_order = puf.clone(this.data);
            let enabled = this.data.filter(v=>v.enabled==1);
            let disabled = this.data.filter(v=>v.enabled==0);

            if (enabled.length == 0 && disabled.length == 0) {
                this.data_filter = this.data.sort(this.the_sort(val,that));
            } else {
                let enabled_sorted = enabled.sort(this.the_sort(val,that));
                let disabled_sorted = disabled.sort(this.the_sort(val,that));

                this.data_filter = enabled_sorted.concat(disabled_sorted);
            }

            
            // So that when refresh happens stuff stays in the same 'order';
            this.data = data_order;

            if ( this.search_value != "" ) {
                this.filter_by_search();
            }

            this.data_filter_raw = puf.clone(this.data_filter);

            if ( this.display_limit ) {
                this.data_filter = this.data_filter.splice(0,this.display_limit);
            }
        },
        the_sort(val,that) {
            return function(a,b) {
                // if ( b['enabled'] != undefined && b['enabled'] == 0 ) {
                //     return -1;
                // } else
                 if ( typeof a[val] == "number" && typeof b[val] == "number" && that.sort_toggles[val] ) {
                    return a[val]-b[val];
                } else if ( typeof a[val] == "number" && typeof b[val] == "number" ) {
                    return b[val]-a[val];
                } else if ( a[val] == "" || a[val] == null || a[val] == undefined ) {
                    return 1;
                } else if ( b[val] == "" || b[val] == null || b[val] == undefined ) {
                    return -1;
                } else if ( that.sort_toggles[val] ) {
                    return a[val].localeCompare(b[val]);
                } else {
                    return b[val].localeCompare(a[val]);
                }
            }
        },
        get_icon(val) {
            if ( this.sort_toggles[val] ) {
                return "bi bi-arrow-up-break";
            } else {
                return "bi bi-arrow-down-break"
            }
        },
        filter_by_search() {
            let that = this;
            let searched = that.data_filter.filter((m) => {
                for ( const check in m ) {
                    if ( typeof m[check] == "string" ){
                        if ( m[check].toLowerCase().includes(that.search_value.toLowerCase()) ) {
                            return true;
                        }
                    }
                }
            });
            this.data_filter = searched;
            this.data_filter_raw = puf.clone(this.data_filter);
        },
        display_type(index) {
            if ( this.config[index] != undefined ) {
                return this.config[index];
            } else {
                return "normal";
            }
        },
        callback(index,d) {
            let callback = this.config_raw[index].callback;
            callback(d);
        },
        is_checked(d) {
            if ( d == true || d == 1 ) {
                return true;
            } else {
                return false;
            }
        }
    },
    watch: {
        "search_value": function(to,from) {
            this.sort_by(this.last_toggle,true);
            puf.cache.set(this.$route.path+this.user,this.search_value);
        }
    },
};
</script>


<template>
    <div class="zSimpleTable grid">
        <div class="container">
            <div class="d-flex flex-row flex-row-reverse">
                <div class="DougSearch row">
                    <div class="col-10 p-0">
                    <input type="text" class="form-control" placeholder="Search..." v-model="search_value">
                    </div>

                    <div class="col-2 p-0">
                    <button class="btn btn-default" type="button">
                        <i class="bi bi-search"></i>
                    </button>
                    </div>
                </div>
            </div>
        </div>



        <table class="table table-bordered table-striped table-condensed">
            <thead>
                <tr class="table-header">
                    <th v-for="(h,i) in headers" :key="i" @click="sort_by(i)">
                        <span :class="get_icon(i)" v-if="i===last_toggle"></span>{{ h }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(d,i) in data_filter" :key="i">
                    <template v-for="r in rows" :key="r.id">
                        <td v-if="display_type(r)=='normal'">{{d[r]}}</td>
                        <td v-if="display_type(r)=='edit_button'"><button type="button" class="btn btn-success" @click="callback(r,d)">Edit</button></td>
                        <td v-if="display_type(r)=='copy_button'"><button type="button" class="btn btn-success" @click="callback(r,d)">Copy</button></td>
                        <td v-if="display_type(r)=='delete_button'"><button type="button" class="btn btn-danger" @click="callback(r,d)">Delete</button></td>
                        <td v-if="display_type(r)=='view_button'"><button type="button" class="btn btn-primary" @click="callback(r,d)">View</button></td>
                        <td v-if="display_type(r)=='checkbox'"><input type='checkbox' v-model=d[r] :checked="d[r]" @click="callback(r,d)"></td>
                        <td v-if="display_type(r)=='image'"><img style="width: 50px;height: 50px;" :src=d[r] /></td>
                        <td v-if="display_type(r)=='int_to_yn'" :style="enabled_color(d[r])">{{int_to_yn(d[r])}}</td>
                        <td v-if="display_type(r)=='enabled'" :style="enabled_color(d[r])">{{int_to_yn(d[r])}}</td>
                        <td v-if="display_type(r)=='enabled_flip'" :style="enabled_color(d[r],true)">{{int_to_yn(d[r])}}</td>
                    </template>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style>
div.zSimpleTable > div {
    padding-bottom: 8px;
}
div.zSimpleTable {
    border: 1px solid #ddd;
    border-radius: 5px;
    padding-top: 6px;
}
div.zSimpleTable > table {
    border: 0;
    border-top: 1px solid #DDD;
    margin-bottom: 0;
}

div.zSimpleTable > table > thead > tr > th:first-child,div.zSimpleTable > table > tbody > tr > td:first-child {
    border-left: 0;
}

div.zSimpleTable > table > thead > tr > th:last-child,div.zSimpleTable > table > tbody > tr > td:last-child {
    border-right: 0;
}

div.zSimpleTable > table > tbody > tr:last-child > td {
    border-bottom: 0;
    border-radius: 5px;
}
</style>