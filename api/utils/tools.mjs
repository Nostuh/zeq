import fs from 'fs';
import * as crc from 'crc';

const dollar_formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

let x = {
    hash: function(hash_me) {
        if ( typeof hash_me == "object" || typeof hash_me == "array" ) {
            hash_me = JSON.stringify(hash_me);
        }
        return crc.crc32(hash_me).toString(16);
    },
    format_dollar:function(number){
        return dollar_formatter.format(number);
    },
    format_date(date) {
        const year = date.getFullYear();
        const month = uf.left_pad(date.getMonth()+1,2,"0");
        const day = uf.left_pad(date.getDate(),2,"0");
    
        return `${year}-${month}-${day}`;
    },
    format_date_string_from_mssql: function(the_date) {
        let split = String(the_date).split(".");
        the_date = split[0];
        split = the_date.split("T");
        if ( split.length > 1 ) {
            return split[0]+" "+split[1];
        } else {
            return split[0];
        }
    },
    //https://stackoverflow.com/questions/5129624/convert-js-date-time-to-mysql-datetime
    format_date_obj_to_mysql: function(date_ob,milli=false) {
        if ( !date_ob instanceof Date || isNaN(date_ob.getTime()) ) {
            throw "format_date_obj_to_mysql requires Date() object as argument 1";
        }
        // adjust 0 before single digit date
        let date = ("0" + date_ob.getDate()).slice(-2);
        // current month
        let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
        // current year
        let year = date_ob.getFullYear();
        // current hours
        let hours = date_ob.getHours();
        // current minutes
        let minutes = date_ob.getMinutes();
        // current seconds
        let seconds = date_ob.getSeconds();
    
        if ( milli ) {
            return year + "-" + month + "-" + date + " " + x.left_pad(hours,2,"0") + ":" + x.left_pad(minutes,2,"0") + ":" + x.left_pad(seconds,2,"0") + ":" + x.left_pad(mili,3,"0") + " ";
        } else {
            return year + "-" + month + "-" + date + " " + x.left_pad(hours,2,"0") + ":" + x.left_pad(minutes,2,"0") + ":" + x.left_pad(seconds,2,"0") + " ";    
        }    
    },
    //https://stackoverflow.com/questions/11832914/how-to-round-to-at-most-2-decimal-places-if-necessary
    round_to_two: function(num) {
        return +(Math.round(num + "e+2")  + "e-2");;
    },
    get_local_date: function() {
        return new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
    },
    test:function(){
        console.log('test');
    },
    trim: function (s, c) {
        if (c === "]") c = "\\]";
        if (c === "^") c = "\\^";
        if (c === "\\") c = "\\\\";
        return s.replace(new RegExp(
          "^[" + c + "]+|[" + c + "]+$", "g"
        ), "");
      },
    csv_to_array: function(path,col_delim=",",row_delim="\r\n") {
        return new Promise(function(resolve,reject) {
            let ret = [];
            let headers = [];
            fs.readFile(path, 'utf8', async (err, data) => {
                if (err) {
                    console.error(err);
                    return;
                }
    
                let rows = data.split(row_delim);
                let headers = rows[0].trim().split(col_delim);

                x.dloop(rows,function(i,v) {
                    try {
                        //skip headers
                        if ( i == 0 ) {throw "continue"}

                        let row = v.split(col_delim);
                        // last row being blank~~
                        if ( row.length < 2 ) {throw "continue";}
                        let tmp = {};
                        x.dloop(headers,function(ii,vv) {
                            tmp[vv] = row[ii];                            
                        });
                        
                        ret.push(tmp);
                    } catch (e) {
                        if ( e=="continue" ) {} else {console.log(e);}
                    }
                    
                });

                resolve(ret)
            });
        })
    },
    dloop: function (data,call) {
        try {
            //Try object array thing!
            if ( typeof data == "object" ) {
                for( let [i,v] of Object.entries(data) ) {
                    call(i,v);
                }
                return true;
            }
    
            //Try normal array!
             else if ( Array.isArray(data) ) {
                for(let [i,v] of data) {
                    call(i,v);
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

    await_dloop: async function(data,call) {
        try {
            //Try object array thing!
            if ( typeof data == "object" ) {
                for( let [i,v] of Object.entries(data) ) {
                    await call(i,v);
                }
                return true;
            }    
    
            //Try normal array!
            else if ( Array.isArray(data) ) {
                for(let [i,v] of data) {
                    await call(i,v);
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

    set_custom_keys: function( $arr, $key, $value ) {
        if ( $arr == undefined ) {
            throw Error();
        }

        if (  !Array.isArray($arr) ) {
            $arr = x.object_to_array($arr);
        }

        let temp = {};
        this.dloop($arr,function(i,v) {
            try {
                if ( $value === true ) {
                    temp[ v[$key] ] = v;
                } else if ( $value ) { 
                    temp[ v[$key] ] = v[$value];
                } else {
                    if ( typeof temp[ v[$key] ] == "undefined" ) {
                        temp[ v[$key] ] = [];
                    }
                    temp[ v[$key] ].push( v )
                }
            } catch (e) {
                console.log(e);
                throw e;
            }
        });
        return temp;
    },
    //https://stackoverflow.com/questions/8495687/split-array-into-chunks
    array_chunk: function(array,chunk_size) {
        if ( chunk_size < 1 ) { throw "Chunk size must be > 0";}
        if ( !Array.isArray(array) ) { throw "Array was not passed in!";}
        let chunks = [];
        for (let i = 0; i < array.length; i += chunk_size) {
            chunks.push(array.slice(i, i + chunk_size));
        }
        return chunks;
    },
    object_to_array: function(obj) {
        if ( typeof obj != "object" ) {
            console.log(obj);
            throw "Object to array fail, this is not an object!";
        }

        let new_array = [];
        x.dloop(obj,function(i,v) {
            new_array.push(v);
        });

        return new_array;
    },

    remove_quotes: function (value) {
        return value.replace(/^"(.*)"$/, '$1');
    },

    delay: async function(ms) { 
        return new Promise(res => setTimeout(res, ms)) 
    },
    sleep: async function(ms) { 
        return new Promise(res => setTimeout(res, ms)) 
    },
    array_unique: function(array) {
        return array.filter(x._array_unique);
    },
    _array_unique: function (value, index, array) {
        return array.indexOf(value) === index;
    },
    // Clone to de-reference and copy
    clone: function(item) {
     return JSON.parse(JSON.stringify(item));
    },
    basename: function(str) {
        let base = new String(str).substring(str.lastIndexOf('/') + 1); 
        if(base.lastIndexOf(".") != -1)       
            base = base.substring(0, base.lastIndexOf("."));
       return base;
    },
    create_folder: function(path) {
        return new Promise(async function(resolve) {
            await fs.mkdirSync(path, { recursive: true });
            resolve('done');
        });
    },
    left_pad: function(str, len, ch) {
        str = String(str);
      
        let i = -1;
        if (!ch && ch !== 0) ch = ' '; 
        len = len - str.length;
      
        while (++i < len) {
          str = ch + str;
        }
      
        return str;
    },
    get_cat_id: function(product) {
        let v = product;
        let map = this.cat_mapping();
        

        try {
            if ( v.product_type == "Miscellaneous" ) {
                return "1217256";
            }

            if ( v.product_type == "Kitchen Sink" || v.product_type == "Bathroom Sink" || v.product_type == "Kitchen Sink Combo" || v.product_type == "Bathroom Sink Combo") {
                let mount_type = v.attributes.find(av=>av.name == "material");
                let mt = mount_type.product_options[0].name;
                let color = v.attributes.find(av=>av.name == "mount_type");
                let c = color.product_options[0].name;
        
                if ( v.product_type == "Kitchen Sink" ||  v.product_type == "Kitchen Sink Combo" ) {
                    return map["Kitchen"]["Sink"][mt][c];
                }
                if ( v.product_type == "Bathroom Sink" || v.product_type == "Bathroom Sink Combo"  ) {
                    return map["Bathroom"]["Sink"][mt][c];
                }
                console.log(v.product_type+", "+mt+", "+c);
            }
        
            if ( v.product_type == "Kitchen Faucet" || v.product_type == "Bathroom Faucet" ) {
                let finish = v.attributes.find(av=>av.name == "finish");
                let f = finish.product_options[0].name;
        
                if ( v.product_type == "Kitchen Faucet"  ) {
                    return map["Kitchen"]["Faucet"][f];
                }
                if ( v.product_type == "Bathroom Faucet" ) {
                    return map["Bathroom"]["Faucet"][f];
                }
                console.log(v.product_type);
            }
        
            if ( v.product_type == "Kitchen Accessory" || v.product_type == "Bathroom Accessory" || v.product_type == "Soap Dispenser" ) {
                if ( v.product_type == "Kitchen Accessory" || v.product_type == "Soap Dispenser" ) {  
                    return "1207529";
                };
                if ( v.product_type == "Bathroom Accessory" ) { 
                    return "1207531";
                };
            }
        } catch (e) {
            console.log(e);
            console.log(product);
            return "TOFIX";
        }
        
    },
    build_html: function(data) {
        let headers = Object.keys(data[Object.keys(data)[0]]);
        
        let html = `
        <style>
            table {
                border-collapse: collapse;
                thead tr:nth-child(1) th {
                    background: white;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
            }
    
            th, td {
            text-align: left;
            padding: 8px;
            }
    
            tr:nth-child(even) {background-color: #f2f2f2;}
        </style>
        `
        
        html += "<table><tr><thead>";
    
        uf.dloop(headers,function(key,v) {
            html += "<th>"+v+"</th>"
        });
    
        html += "</tr></thead>";
    
        uf.dloop(data,function(i,item) {
            html += "<tr>";
            uf.dloop(item,function(ii,v) {
                html += "<td>"+v+"</td>";
            });
            html += "</tr>";
        })
    
        html += "</table>"
    
        return html;
    },
    cat_mapping: function() {
        return {
            "Miscellaneous": {
                "Miscellaneous":"1217256"
            },
            "Kitchen": {
              "Kitchen":"1207525",
              "Sink": {
                "Sink":"1207527",
                "Quartz Composite": {
                  "Quartz Composite": "1210967",
                  "Undermount" : "1210990",
                  "Farmhouse/apron Front Sink" : "1210992",
                  "Top Mount" : "1210991",
                  "Seamless Undermount" : "1228073",
                },
                "Stainless Steel": {
                  "Stainless Steel":"1210984",
                  "Undermount" : "1210996",
                  "Farmhouse/apron Front Sink" : "1210995",
                  "Top Mount" : "1210994",
                  "Seamless Undermount" : "1210996",
                },
                "Acrylic": {
                  "Acrylic":"1210985",
                  "Seamless Undermount" : "1210997",
                },
              },
              "Accessory": {
                "Accessory":"1207529",
              },
              "Faucet": {
                "Faucet":"1207530",
                "Stainless Steel":"1207677",
                "Brushed Gold":"1207678",
                "Polished Chrome":"1207679",
                "Gunmetal Grey":"1207680",
                "Matte Black":"1207681",
                "Brushed Copper":"1207682",
                "Gold":"1207683",
                "Oil Rubbed Bronze":"1207684",
                "Matte Black/Brushed Gold":"1218048",
                "Matte Black/Stainless Steel":"1218049",
                }
            },
            "Bathroom": {
                "Bathroom":"1207526",
                "Sink": {
                "Sink":"1207528",
                "Quartz Composite": {
                    "Quartz Composite":"1210998",
                    "Vessel":"1211002",
                    "Seamless Undermount":"1218028",
                    },
                "Stainless Steel": {
                    "Stainless Steel": "1211000",
                    "Drop-in":"1211007",
                    "Pedestal":"1211006",
                    "Seamless Undermount":"1211004",                    
                    "Undermount":"1211003",
                    "Vessel":"1211005",
                    },
                "Acrylic": {
                    "Acrylic":"1210999",
                    "Seamless Undermount":"1211011",
                    "Vessel":"1218050",
                },
                "Vitreous China": {
                    "Vitreous China": "1211001",
                    "Top Mount":"1211009",
                    "Undermount":"1211008",
                    "Vessel":"1211010",
                    },
              },
              "Accessory": {
                "Accessory":"1207531",
              },
              "Faucet": {
                "Faucet":"1207532",
                "Polished Chrome":"1207685",
                "Matte Black":"1207686",
                "Oil Rubbed Bronze":"1207687",
                "Brushed Copper":"1207688",
                "Brushed Gold":"1207689",
                "Gold":"1207690",
                "Gunmetal Grey":"1207691",
                "Stainless Steel":"1207692",
                }
            }
          };
    }
}

export const uf = x;


export class debug_timer {
    start_time = 0;

    constructor() {

    }

    start() {
        this.start_time = Date.now();
    }

    echo(str) {
        if ( str ) {
            console.log(str+' Time: '+((Date.now()-this.start_time))/1000);
        } else {
            console.log('Time: '+((Date.now()-this.start_time))/1000);
        }
    }
}