import express from 'express';
import fs from 'fs';
import { uf } from '../utils/tools.mjs';
const router = express.Router();

import product_class from '../modelmanagers/products.mjs';
import mysql_class from '../classes/mysql.mjs';
mysql_class.load('ki');
const my = {}

const the_csv = 'export_catalog_product_20240421_171625.csv';
const the_feed_1 = 'master_feed_1_new.csv';
const the_feed_2 = 'master_feed_2.csv';
const extra_attributes_csv = 'extra_attributes.csv';

const capitalize = (str, lower = false) =>
  (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
;
my.query = function(sql,params=false) { return mysql_class.query(sql,params,'ki'); }
my.escape = function(value) {return mysql_class.escape(value);}
import gm from "gm";

async function get_master_feed_data() {
    let parsed = [];
    let to_insert = [];
    let get_data = new Promise((resolve) => {
        fs.readFile('../api/ki/rest/tmp_csvs/'+the_feed_1, 'utf8', async (err, data) => {
        if (err) {
          console.error(err);
          return;
        }

        let rows = data.split('^END');
        


        let headers = [];
        uf.dloop(rows,async function(i,v) {
            try {
                let v_parsed = v.split('^');
                let tmp = {};
                if ( i == 0 ) {
                    headers = v_parsed;
                    throw "continue";
                }
                
                uf.dloop(headers,function(ii,vh) {
                    tmp[vh.trim()] = v_parsed[ii];
                });

                parsed.push(tmp);
            } catch (e) {
                if ( e == "continue" ) {

                } else {
                    console.log(e);
                    throw e;
                }
            }

        });


        let skus = [];
    
        uf.dloop(parsed,function(i,v) {
            skus.push(v["SKU"]);
        });

        let db_skus = [];
        let db_products = await my.query(`
            select * from products
        `);

        uf.dloop(db_products,function(i,v) {
            db_skus.push(v.sku);
        });

        let difference = skus.filter(x => !db_skus.includes(x));
        console.log('response');

        uf.dloop(parsed,function(i,product) {
            //if ( db_skus.includes(product["SKU"]) ) {
                if ( product["SKU"] != undefined ) {
                    
                
                let tmp = {
                    discontinued:product["Status"].replace(/^\s+|\s+$/g, '').trim(),
                    sku:product["SKU"].trim(),
                    upc:product["UPC"].trim(),
                    length: product["Sink Length"].replaceAll("in","").trim(),
                    width: product["Sink Width"].replaceAll("in","").trim(),
                    height: product["Sink Depth (height)"].replaceAll("in","").trim(),
                    weight: product["Item Weight"].replaceAll("lb","").trim(),
                    shipping_length: product["Shipping Length"].replaceAll("in","").trim(),
                    shipping_width: product["Shipping Width"].replaceAll("in","").trim(),
                    shipping_height: product["Shipping Height"].replaceAll("in","").trim(),
                    shipping_weight: product["Shipping Weight"].replaceAll("lb","").trim(),
                    is_ecom:1,
                    type: product["Product Type"].trim(),
                    collection: product["Collection"].trim(),
                    name: product["Product Title"].trim(),
                    prepaid_price: product["New Prepaid cost 2022"].replaceAll("$","").trim(),
                    collect_price: product["New Collect Cost 2022"].replaceAll("$","").trim(),
                    map_price: product["MAP"].replaceAll("$","").trim(),
                    msrp_price: product["New MSRP 2022"].replaceAll("$","").trim(),
                    feed_description: uf.trim(product["Product Description"].trim(),"\""),
                    bullets: {
                        bullet_1:product["Bullet 1"].trim(),
                        bullet_2:product["Bullet 2"].trim(),
                        bullet_3:product["Bullet 3"].trim(),
                        bullet_4:product["Bullet 4"].trim(),
                        bullet_5:product["Bullet 5"].trim(),
                        bullet_6:product["Bullet 6"].trim(),
                        bullet_7:product["Bullet 7"].trim(),
                        bullet_8:product["Bullet 8"].trim(),
                        bullet_9:product["Bullet 9"].trim(),
                        bullet_10:product["Bullet 10"].trim(),
                        bullet_11:product["Bullet 11"].trim(),
                        bullet_12:product["Bullet 12"].trim()
                    },
                    material: product["Material"].trim(),
                    faucet_height: product["Faucet Height"].trim(),
                    spout_height: product["Spout Height"].trim(),
                    spout_reach: product["Spout Reach"].trim(),
                    attributes: {
                        number_of_holes_required: product["Number of holes required"].trim(),
                        bowl_length: product["Bowl Left to Right Length (in.)"].trim(),
                        bowl_width: product["Bowl Front to Back Width (in.)"].trim(),
                        left_bowl_length:product["Left Inner Bowl Left to Right Length (in.)"].trim(),
                        left_bowl_width:product["Left Inner Bowl Front to Back Width (in.)"].trim(),
                        left_bowl_below_counter_depth:product["Left Inner Bowl Below Counter Depth (in.)"].trim(),
                        right_bowl_length:product["Right Inner Bowl Left to Right Length (in.)"].trim(),
                        right_bowl_width:product["Right Inner Bowl Front to Back Width (in.)"].trim(),
                        right_bowl_below_counter_depth:product["Right Inner Bowl Below Counter Depth (in.)"].trim(),
                    },
                    accessories: [
                        product["Basket Strainer SKU"].trim(),
                        product["Basket Strainer SKU 2"].trim(),
                        product["Bottom Grid SKU"].trim(),
                        product["Bottom Grid SKU 2"].trim(),
                        product["Luster Pro Oil"].trim(),
                    ]


                };

                // bullet cleaner
                // let s_cnt = 0;
                // uf.dloop(tmp.bullets,function(i,v) {
                //     if ( v == "" ) {
                //         tmp.bullets.splice(i-s_cnt,1);
                //         s_cnt++;
                //     }
                // });
                

                to_insert.push(tmp);
            }
            
        });
        resolve(to_insert);
        //type new
        //collection new
        // let pc = await product_class.get_all();
        
        // await pc.load_attributes();
        // let db_data = uf.object_to_array(pc.data);
    
        // uf.dloop(to_insert,function(i,v) {
        //     let db_product = db_data.filter(vf => vf.sku == v.sku);
        //     if (db_product.length==1) {
        //         let db_attrs = db_product[0]["attributes"];
        //         let db_attr = db_attrs.filter(vf=>vf.id == 9);
        //         if ( db_attr.length > 0 && db_attr[0].product_options != undefined && db_attr[0].product_options.length>0) {
        //             console.log(v.sku+" -- "+db_attr[0].product_options[0].display_name+" -- "+v.checks.faucet_finish);
        //         } else if (db_attr.length > 0) {
        //             console.log(v.sku+" -- NOT SET"+ " -- " +v.checks.faucet_finish);
        //         }
        //     }
        // })
    
        //res.json(difference);
    })
    });

    await get_data;
    return to_insert;
};

router.get('/import/products/extra-attributes', async function(req,res,next) {
    let skus = await get_extra_attributes();
    res.json(skus);
});

async function get_extra_attributes() {
    let data =  new Promise((resolve) => {
        fs.readFile('../api/ki/rest/tmp_csvs/'+extra_attributes_csv, 'utf8', async (err, data) => {
            if (err) {
            console.error(err);
            return;
            }

            let rows = data.split('^END');

            let skus = rows[0];
            skus = skus.trim().split('Model^');
            skus = skus[1].split('^');
        
            let parsed_skus = [];
            uf.dloop(skus,function(i,v){
                let tmp = {};
                tmp.sku = v;
                parsed_skus.push(tmp);
            });
            rows.shift();

            uf.dloop(rows,function(i,v) {
                parsed_skus = handle_row(parsed_skus,v);
            });

            resolve(parsed_skus);
        });
    });
    return data;
}

async function get_extra_attributes_skus() {
    let data =  new Promise((resolve) => {
        fs.readFile('../api/ki/rest/tmp_csvs/'+extra_attributes_csv, 'utf8', async (err, data) => {
            if (err) {
            console.error(err);
            return;
            }

            let rows = data.split('^END');

            let skus = rows[0];
            skus = skus.trim().split('Model^');
            skus = skus[1].split('^');
            resolve(skus)
        });
    });
    return data;
}

function extra_rename_map() {
    return {
        "boxed_weight":"shipping_weight",
        "sink_weight":"weight",
        "outside_length_(side_to_side)":"length",
        "ouside_width_1_(front_to_back)":"width",
        "ouside_width_2_(front_to_back)":"width_minimum",
        "bowl_1_length_(side_to_side)": "left_bowl_length",
        "bowl_1_width_(front_to_back)": "left_bowl_width",
        "bowl_1_depth_(inside)": "left_bowl_below_counter_depth",
        "bowl_2_length_(side_to_side)": "right_bowl_length",
        "bowl_2_width_(front_to_back)": "right_bowl_width",
        "bowl_2_depth_(inside)": "right_bowl_below_counter_dept",
        "inside_length_side_to_side_": "bowl_length",
        "pre-drills_for_faucet_holes": "pre_drills_for_faucet_holes"
    };
}

function handle_row(skus,row) {
    let overrides = extra_rename_map();
    let row_split = row.replace(/(\r\n|\n|\r)/gm, "").split('^');
    let attribute = row_split[0].replaceAll(" ","_").toLowerCase();
    row_split.shift();

    uf.dloop(row_split,function(i,v) {
        if ( attribute == "box_dimensions" && v != "" ) {
            let v_split = v.split('x');
            skus[i]['shipping_length'] = v_split[0].trim();
            skus[i]['shipping_width'] = v_split[1].trim();
            skus[i]['shipping_height'] = v_split[2].trim();
        } else if ( overrides[attribute] != undefined ) {
            skus[i][overrides[attribute]] = v;
        } else {
            skus[i][attribute] = v;
        }
    });

    return skus;
}

router.get('/import/products/master-feed-1', async function (req, res, next) {
    let mf_data = await get_master_feed_data();
    res.json(mf_data);
});

function removeTags(str) {
    if ((str === null) || (str === ''))
        return false;
    else
        str = str.toString();
 
    // Regular expression to identify HTML tags in
    // the input string. Replacing the identified
    // HTML tag with a null string.
    return str.replace(/(<([^>]+)>)/ig, '');
}

router.get('/import/add_images_extra', async function (req, res, next) {
    process.exit();
    let data = await my.query("select p.*,pt.name as folder_name from products as p inner join product_types as pt on pt.id = p.product_type_id");

    await uf.await_dloop(data,async function(i,product) {

            let images = product.magento_extra_images;
            console.log(images);

            if ( images.trim() != "" && images.trim() != "no_selection") {
                images = images.split(",");
                

                    await uf.await_dloop(images,async function(ii,v) {
                        try {
                            let main_image = v;
                            if ( main_image.trim() == "" || main_image.trim() == "no_selection" ) {
                                throw "continue";
                            }
                            let prefix = "/srv/images/magento/media/catalog/product";
                            let main_image_path = prefix+main_image;
                            let main = await get_image_info(main_image_path);
                            let tmp = {};
                            tmp.hash = main.Signature;
                            tmp.img_type = main.format.toLowerCase();
                            tmp.width = main.size.width;
                            tmp.height = main.size.height;
                            tmp.folder_name = product.folder_name;
                            tmp.sku = product.sku;
                            tmp.img_name = "extra_"+ii+"_"+tmp.sku+"."+tmp.img_type;
                            tmp.folder_path = "/srv/images/ki/"+tmp.folder_name+"/"+tmp.sku+"/";
                            tmp.db_folder_path = tmp.folder_name+"/"+tmp.sku+"/";
                            tmp.product_id = product.id;
                    
                            await create_folder(tmp.folder_path);
                    
                            let sql_chk = `select * from images where hash = @hash`;
                    
                            let check = await my.query(sql_chk,tmp);
                            // exists
                            if (check.length > 0 ) {
                                tmp.image_id = check[0].id;
                                let sql = `
                                    select * from product_images where image_id = @image_id and product_id = @product_id
                                `;
                    
                                let main_check = await my.query(sql,tmp);
                    
                                if ( main_check.length < 1 ) {
                                    tmp.image_type_id = 999;

                                    sql = `insert into product_images (image_type_id,image_id,product_id,name) values (@image_type_id,@image_id,@product_id,@img_name)`;
                                    await my.query(sql,tmp);
                                }
                    
                            } else {
                                let sql = `
                                    insert into images (name,width,height,path,prefix,added,archived,hash) values
                                    (@img_name,@width,@height,@db_folder_path,'',now(),'0',@hash)
                                `;
                                await fs.copyFileSync(main_image_path,tmp.folder_path+tmp.img_name);
                    
                                tmp.image_type_id = 999;
                                tmp.image_id = (await my.query(sql,tmp)).insertId;
                                sql = `insert into product_images (image_type_id,product_id,image_id,name) values (@image_type_id,@product_id,@image_id,@img_name)`;
                                await my.query(sql,tmp);
                            }
                        } catch (e) {
                            if ( e != "continue" ) {
                                throw e;
                            }
                        } 
                    })
            }

        

    });

    res.send("DONE");
});

router.get('/import/add_images', async function (req, res, next) {
    process.exit();
    let data = await my.query("select p.*,pt.name as folder_name from products as p inner join product_types as pt on pt.id = p.product_type_id");

    await uf.await_dloop(data,async function(i,product) {
        try {
            let main_image = product.magento_image;
            if ( main_image.trim() == "" || main_image.trim() == "no_selection" ) {
                throw "continue";
            }
            let prefix = "/srv/images/magento/media/catalog/product";
            let main_image_path = prefix+main_image;
            let main = await get_image_info(main_image_path);
            let tmp = {};
            tmp.hash = main.Signature;
            tmp.img_type = main.format.toLowerCase();
            tmp.width = main.size.width;
            tmp.height = main.size.height;
            tmp.folder_name = product.folder_name;
            tmp.sku = product.sku;
            tmp.img_name = "main_"+tmp.sku+"."+tmp.img_type;
            tmp.folder_path = "/srv/images/ki/"+tmp.folder_name+"/"+tmp.sku+"/";
            tmp.db_folder_path = tmp.folder_name+"/"+tmp.sku+"/";
            tmp.product_id = product.id;
    
            await create_folder(tmp.folder_path);
    
            let sql_chk = `select * from images where hash = @hash`;
    
            let check = await my.query(sql_chk,tmp);
            // exists
            if (check.length > 0 ) {
                tmp.image_id = check[0].id;
                let sql = `
                    select * from product_images where image_id = @image_id and product_id = @product_id
                `;
    
                let main_check = await my.query(sql,tmp);
                tmp.image_type_id = 1;
                if ( main_check.length < 1 ) {
                    sql = `insert into product_images (image_type_id,image_id,product_id,name) values (@image_type_id,@image_id,@product_id,@img_name)`;
                    await my.query(sql,tmp);
                }
    
            } else {
                let sql = `
                    insert into images (name,width,height,path,prefix,added,archived,hash) values
                    (@img_name,@width,@height,@db_folder_path,'',now(),'0',@hash)
                `;
                await fs.copyFileSync(main_image_path,tmp.folder_path+tmp.img_name);
    
                tmp.image_id = (await my.query(sql,tmp)).insertId;
                tmp.image_type_id = 1;
                sql = `insert into product_images (image_type_id,product_id,image_id,name) values (@image_type_id,@product_id,@image_id,@img_name)`;
                await my.query(sql,tmp);
            }
        } catch (e) {
            if ( e != "continue" ) {
                throw e;
            }
        }

    });

    res.send("DONE");
});

function create_folder(path) {
    return new Promise(async function(resolve) {
        await fs.mkdirSync(path, { recursive: true });
        resolve('done');
    });
}

function get_image_info(img_path) {
    return new Promise(function(resolve,reject) {
        
        gm(img_path)
        .identify(function (err, size) {
        if (!err) {
            resolve(size);
            //console.log('width = ' + size.width);
            //console.log('height = ' + size.height);
        } else {
            console.log(err);
            process.exit();
            reject(size);
        }
        });
    });
}

router.get('/import/update_product_images', async function (req, res, next) {
    process.exit();
    let mf_data = await get_master_feed_data();
    let e_data = await get_extra_attributes();
    let spruce_map = get_spruce_map();
    let missing = [];
    
    fs.readFile('../api/ki/rest/tmp_csvs/'+the_csv, 'utf8', async (err, data) => {
        if (err) {
          console.error(err);
          return;
        }

        let rows = data.split('^END');
        let parsed = [];
//process.exit();
        uf.dloop(rows,function(i,v) {
            let v_parsed = v.split('^');
            let tmp = {};

            tmp.sku = v_parsed[0];

            tmp.sku = tmp.sku.trim();
            tmp.sku = tmp.sku.replace(/(\r\n|\n|\r)/gm, "");
            tmp.sku = tmp.sku.toUpperCase();


            tmp.attributes = v_parsed[2];
            tmp.config_type = v_parsed[3];
            tmp.name = v_parsed[6];
            tmp.description = v_parsed[7];
            tmp.short_description = v_parsed[8];
            tmp.weight = v_parsed[9];
            tmp.magento_url_key = v_parsed[17];
            tmp.meta_title = typeof v_parsed[18]=="string"?uf.trim(v_parsed[18],"\""):"";
            tmp.meta_keywords = typeof v_parsed[19]=="string"?uf.trim(v_parsed[19],"\""):"";
            tmp.meta_description = typeof v_parsed[20]=="string"?uf.trim(v_parsed[20],"\""):"";
            tmp.magento_image = v_parsed[21];
            tmp.country_created = v_parsed[45];
            tmp.attributes_all = v_parsed[46];
            tmp.related_skus = v_parsed[68];
            tmp.accessories = v_parsed[72];
            tmp.magento_extra_images = v_parsed[74];

            if ( spruce_map[tmp.sku] != undefined ) {
                tmp.spruce_sku = spruce_map[tmp.sku];
            } else {
                tmp.spruce_sku = "NA";
                missing.push(tmp.sku);
            }
            
            
            
            try {
                tmp.short_description = uf.trim(removeTags(tmp.short_description).trim(),"\"").trim().replaceAll("&nbsp;"," ");
                
            } catch (e) {
                tmp.short_description = v_parsed[8];
            }

            try {
                //tmp.description = uf.trim(removeTags(tmp.description).trim(),"\"").trim().replaceAll("&nbsp;"," ");
                tmp.description = uf.trim(tmp.description.trim(),"\"").trim();
                
            } catch (e) {
                tmp.description = v_parsed[7];
            }

            parsed.push(tmp);
        })

        let keys = [];
        parsed = parsed_attributes(parsed);

        await uf.await_dloop(parsed,async function(i,v) {
            try {
                let tmp = {};
                tmp.magento_extra_images = v.magento_extra_images;
                tmp.magento_image = v.magento_image;
                tmp.sku = v.sku;
                let sql = `
                    update products set magento_image = @magento_image, magento_extra_images = @magento_extra_images
                    where sku = @sku;
                `;
                
                await my.query(sql,tmp);
            } catch (e) {
                console.log(e);
            }

        });

        res.send(parsed);

        return;
        process.exit();
        let product_types = await my.query('select * from product_types');
        let att_types = await my.query('select * from attributes');
        let att_pivot = attr_pivot();
        let main_attrs = main_attr();

        let inserted_bullet = [];
        let product_type_attributes = [];
        let product_type_attribute_options = [];
        let product_attributes = [];
        
        await uf.await_dloop(parsed,async function(i,v) {

            let simple_type = "NA";
            let product_type = get_product_type(v.attributes);
            
            if ( product_type == null || product_type == "Default" ) {return 'done';}
            let product_type_id = product_types.find(ptv=>ptv.name==product_type.name);
            product_type_id = product_type_id.id;
            v.name = v.name.replaceAll("\"\"","\"");
            v.name = uf.remove_quotes(v.name);
            v.name = v.name.trim();






            let mf_product = mf_data.filter(mfv=>mfv.sku.toLowerCase() == v.sku.toLowerCase());
            if ( mf_product.length == 1 ) {
                mf_product = mf_product[0];
            } else {
                mf_product = undefined;
            }

            let e_product = e_data.filter(ev=> ev.sku.toLowerCase().trim() == v.sku.toLowerCase().trim() || v.sku.toLowerCase().trim().startsWith(ev.sku.toLowerCase().trim()));
            if ( e_product.length == 1 ) {
                e_product = e_product[0];
            } else {
                e_product = undefined;
            }
            

            if ( v.parsed_attributes["sink_finish_type"] != undefined && v.parsed_attributes["sink_finish_type"] != "" ) {
                delete v.parsed_attributes["accessory_finish"];
                delete v.parsed_attributes["faucet_finish"];
                simple_type = "Sink";
            } else if ( v.parsed_attributes["faucet_finish"] != undefined && v.parsed_attributes["faucet_finish"] != ""  ) {
                delete v.parsed_attributes["sink_finish_type"];
                delete v.parsed_attributes["accessory_finish"];
                simple_type = "Faucet";
            } else if ( v.parsed_attributes["accessory_finish"] != undefined && v.parsed_attributes["accessory_finish"] != "" ) {
                delete v.parsed_attributes["faucet_finish"];
                delete v.parsed_attributes["sink_finish_type"];
                simple_type = "Accessory";
            }

            if ( product_type.display_name.includes("Sink") ) {
                simple_type = "Sink";
            } else if ( product_type.display_name.includes("Faucet") ) {
                simple_type = "Faucet";
            } else if ( product_type.display_name.includes("Accessory") ) {
                simple_type = "Accessory";
            }

            if (  v.config_type == "configurable" ) {
                simple_type = "Parent "+simple_type;
            }
            delete v.config_type;







            let sql;
            if ( mf_product != undefined ) {

                sql = `insert into products (product_type_id,sku,spruce_sku,attributes,name,description,short_description,
                    weight,magento_url_key,meta_title,meta_keywords,meta_description,magento_image,country_created,
                    related_skus,accessories,magento_extra_images,simple_type,shipping_length,shipping_width,shipping_height,shipping_weight,
                    is_ecom,prepaid_price,collect_price,msrp_price,map_price,feed_description,discontinued
                    ) values 
                    (${my.escape(product_type_id)},
                    ${my.escape(v.sku)},
                    ${my.escape(v.spruce_sku)},
                    ${my.escape(v.attributes)},
                    ${my.escape(v.name)},
                    ${my.escape(v.description)},
                    ${my.escape(v.short_description)},
                    ${my.escape(e_product==undefined?mf_product.weight:e_override(e_product,mf_product.weight,e_product.weight))},
                    ${my.escape(v.magento_url_key)},
                    ${my.escape(v.meta_title)},
                    ${my.escape(v.meta_keywords)},
                    ${my.escape(v.meta_description)},
                    ${my.escape(v.magento_image)},
                    ${my.escape(v.country_created)},
                    ${my.escape(v.related_skus)},
                    ${my.escape(v.accessories)},
                    ${my.escape(v.magento_extra_images)},
                    '${simple_type}',
                    ${my.escape(e_product==undefined?mf_product.shipping_length:e_override(e_product,mf_product.shipping_length,e_product.shipping_length))},
                    ${my.escape(e_product==undefined?mf_product.shipping_width:e_override(e_product,mf_product.shipping_width,e_product.shipping_weight))},
                    ${my.escape(e_product==undefined?mf_product.shipping_height:e_override(e_product,mf_product.shipping_height,e_product.shipping_height))},
                    ${my.escape(e_product==undefined?mf_product.shipping_weight:e_override(e_product,mf_product.shipping_weight,e_product.shipping_weight))},
                    ${my.escape(mf_product.is_ecom)},
                    ${my.escape(mf_product.prepaid_price)},
                    ${my.escape(mf_product.collect_price)},
                    ${my.escape(mf_product.msrp_price)},
                    ${my.escape(mf_product.map_price)},
                    ${my.escape(mf_product.feed_description)},
                    ${mf_product.discontinued.toLowerCase() == "active"?1:0}
                );`
            } else if ( e_product != undefined ) {
                
                sql = `insert into products (product_type_id,sku,spruce_sku,attributes,name,description,short_description,
                    weight,magento_url_key,meta_title,meta_keywords,meta_description,magento_image,country_created,
                    related_skus,accessories,magento_extra_images,simple_type,shipping_length,shipping_width,shipping_height,shipping_weight
                    ) values 
                    (${my.escape(product_type_id)},
                    ${my.escape(v.sku)},
                    ${my.escape(v.spruce_sku)},
                    ${my.escape(v.attributes)},
                    ${my.escape(v.name)},
                    ${my.escape(v.description)},
                    ${my.escape(v.short_description)},
                    ${my.escape(e_product.weight==undefined?"":e_product.weight)},
                    ${my.escape(v.magento_url_key)},
                    ${my.escape(v.meta_title)},
                    ${my.escape(v.meta_keywords)},
                    ${my.escape(v.meta_description)},
                    ${my.escape(v.magento_image)},
                    ${my.escape(v.country_created)},
                    ${my.escape(v.related_skus)},
                    ${my.escape(v.accessories)},
                    ${my.escape(v.magento_extra_images)},
                    '${simple_type}',
                    ${my.escape(e_product.shipping_length==undefined?"":e_product.shipping_length)},
                    ${my.escape(e_product.shipping_width==undefined?"":e_product.shipping_width)},
                    ${my.escape(e_product.shipping_height==undefined?"":e_product.shipping_height)},
                    ${my.escape(e_product.shipping_weight==undefined?"":e_product.shipping_weight)}
                );`
            } else {
                sql = `insert into products (product_type_id,sku,spruce_sku,attributes,name,description,short_description,
                    weight,magento_url_key,meta_title,meta_keywords,meta_description,magento_image,country_created,
                    related_skus,accessories,magento_extra_images,simple_type) values 
                    (${my.escape(product_type_id)},
                    ${my.escape(v.sku)},
                    ${my.escape(v.spruce_sku)},
                    ${my.escape(v.attributes)},
                    ${my.escape(v.name)},
                    ${my.escape(v.description)},
                    ${my.escape(v.short_description)},
                    ${my.escape(v.weight)},
                    ${my.escape(v.magento_url_key)},
                    ${my.escape(v.meta_title)},
                    ${my.escape(v.meta_keywords)},
                    ${my.escape(v.meta_description)},
                    ${my.escape(v.magento_image)},
                    ${my.escape(v.country_created)},
                    ${my.escape(v.related_skus)},
                    ${my.escape(v.accessories)},
                    ${my.escape(v.magento_extra_images)},
                    '${simple_type}'
                );`
            }


            let product_id = await my.query(sql);
            product_id = product_id.insertId;
            

            let product_type_attr_option_in = [];
            let b_attr_in = [];


            if ( e_product != undefined ) {
                uf.dloop(e_product,function(mfi,mfv) {
                    if ( mfv != "" ) {
                        v.parsed_attributes[mfi] = mfv;
                    }
                    
                });
            }
            if ( mf_product != undefined ) {
                uf.dloop(mf_product.attributes,function(mfi,mfv) {
                    if ( mfv != "" ) {
                        v.parsed_attributes[mfi] = mfv;
                    }
                    
                });
                uf.dloop(mf_product.bullets,function(mfi,mfv) {
                    v.parsed_attributes[mfi] = mfv;
                });
            }
            // if ( v.sku == "KKF210SS" ){
            //     console.log(v.parsed_attributes);
            //     process.exit();
            // }
            


            await uf.await_dloop(v.parsed_attributes,async function(ii,vv) {
                

                let attr_name = ii;
                let attr_value = vv;
                product_id = product_id;
                product_type_id = product_type_id;
                


                attr_value = attr_value.replaceAll(",","");
                attr_value = attr_value.replaceAll("\"\"","\"");
                attr_value = attr_value.replaceAll("'","");
                attr_value = attr_value.trim();
                attr_value = capitalize(attr_value,true);


                let attr_map = att_pivot.find(atv=>atv.mage_att == attr_name);
                if ( attr_map && attr_map.name != "" ) {

                    //Special value fixing
                    let special_op = ["depth","drain_size","bowl_length","bowl_width","left_bowl_length","left_bowl_width",
                        "left_bowl_below_counter_depth","right_bowl_length","right_bowl_width","right_bowl_below_counter_depth",
                        "minimum_cabinate_size","spout_height","spout_reach",
                    ];
                    //"spout_height","spout_reach",

                    if ( special_op.includes(attr_map.name) ) {                        
                        attr_value = attr_value.replaceAll("\"","");
                        attr_value = attr_value.trim();
                        attr_value = attr_value.replaceAll("-"," ");
                        let attr_check = attr_value.split(" ");
                        let a_new_value;
                        if ( attr_check[1] != undefined && attr_check.length == 2 ) {
                            try {
                                let split_again = attr_check[1].split("/");
                                attr_value = parseInt(attr_check[0]) + ( parseInt(split_again[0])/parseInt(split_again[1]) );

                            } catch (e) {
                                console.log(e);
                            }
                        } else if ( attr_check[1] != undefined && attr_check.length > 2 ) {
                            // stuff for the split attribute i need to make
                        }
                        
                    }

                    
                    let _attribute_id = att_types.find(attv=>attv.name == attr_map.name);
                    let attribute_id = _attribute_id.id;
                                       

                    let pta_check = product_type_attributes.find(ptav => ptav.product_type_id == product_type_id && ptav.attribute_id == attribute_id);
                    if ( pta_check == undefined ) {
                        let sql = `insert into product_type_attributes (product_type_id,attribute_id) values ('${product_type_id}','${attribute_id}')`;
                        await my.query(sql);
                        product_type_attributes.push({product_type_id:product_type_id,attribute_id:attribute_id});
                    }

                    let ptao_check = product_type_attribute_options.find(ptao=> ptao.product_type_id == product_type_id && ptao.attribute_id == attribute_id && ptao.name == attr_value);
                    let option_id = false;
                    if ( ptao_check == undefined ) {
                        let sql = `insert into product_type_attribute_options (product_type_id,attribute_id,name,display_name) 
                                   values ('${product_type_id}','${attribute_id}','${attr_value}','${attr_value}')
                        `;
                        let _id = await my.query(sql);
                        //option_id
                        option_id = _id.insertId;
                        product_type_attribute_options.push({product_type_id:product_type_id,attribute_id:attribute_id,name:attr_value,option_id:option_id});
                    }

                    let option = product_type_attribute_options.find(ptao=> ptao.product_type_id == product_type_id && ptao.attribute_id == attribute_id && ptao.name == attr_value);
                    let pa_check = product_attributes.find(pav=>pav.product_id==product_id && pav.option_id == option.option_id);
                    if ( pa_check == undefined ) {
                        let sql = `insert into product_attributes (product_id,product_type_attribute_option_id) values ('${product_id}','${option.option_id}')`;
                        await my.query(sql);
                        product_attributes.push({product_id:product_id,option_id:option.option_id});
                    }
                }
                




                // let attr_lookup = att_pivot.filter(atv=>atv.mage_att == attr_name);
                // if ( attr_lookup.length > 0 ) {



                //     let attr_id = att_types.filter(attv=>attv.name == attr_lookup[0].name);
                //     if ( attr_id.length > 0 ) {
                //         attr_id = attr_id[0].id;

                //         // Check if it's a new option or existing for product_type / attribute
                //         let insert_check = inserted_att_option.filter(aiv=>aiv.name==attr_value && aiv.product_type_id == product_type_id && aiv.attr_id==attr_id);

                //         if ( insert_check.length > 0 ) {
                //             // insert value to product_id
                //             let sql = `insert into product_attributes (product_id,product_type_attribute_option_id) values ('${product_id}','${insert_check[0].attr_id}')`;
                //             let p_attr_check = product_type_attr_option_in.filter(paiv => paiv.product_id == product_id && paiv.attribute_option_id == insert_check[0].attr_id);
                //             if ( p_attr_check.length == 0 ) {
                //                 await my.query(sql);
                //                 product_type_attr_option_in.push({product_id:product_id,attribute_option_id:insert_check[0].attr_id});
                //             }
                //         } else {
                //             // add option
                //             let sql = `insert into product_type_attribute_options (product_type_id,attribute_id,name,display_name) values ('${product_type_id}','${attr_id}','${attr_value}','${attr_value}')`;
                //             let _id = await my.query(sql);
                //             //option_id
                //             let id = _id.insertId;
                //             product_type_attr_option_in.push({product_id:product_id,attribute_option_id:id});

                //             //insert value to product_id
                //             sql = `insert into product_attributes (product_id,product_type_attribute_option_id) values ('${product_id}','${id}')`
                //             await my.query(sql);
                //             inserted_att_option.push({attr_id:attr_id,name:attr_value,product_type_id:product_type_id});
                            

                //             //new product_Type_attributes
                //             let new_p_check = new_p_attr_in.filter(npav => npav.product_type_id == product_type_id && npav.attr_id == attr_id);
                //             if ( new_p_check.length < 1 ) {
                //                 sql = `insert into product_type_attributes (product_type_id,attribute_id) values ('${product_type_id}','${attr_id}')`;
                //                 await my.query(sql);
                //                 new_p_attr_in.push({product_type_id:product_type_id,attr_id:attr_id});
                //             }
                //         }

                //     }
                // }


                //check for product entries
                let attr_lookup = main_attrs.find(mav=> mav.mage_att == attr_name );
                if ( attr_lookup ) {
                    let sql = `update products set ${attr_lookup.name} = '${attr_value}' where id = ${product_id}`;
                    await my.query(sql);
                }
                
                try {

                    let wtb_online = await my.query('select * from wtb_online');
                    if ( attr_name.includes('_url') ) {
                        let wtb = attr_name.slice(4,-4);
                        let wtb_id = wtb_online.find(wtbv=>wtbv.name == wtb);
                        wtb_id = wtb_id.id;
                        let sql = `insert into product_wtb_online (wtb_online_id,product_id,url) values ('${wtb_id}','${product_id}','${attr_value}')`;
                        await my.query(sql);
                    }

                } catch (e) {
                    console.log(e);
                    process.exit();
                }

                if ( attr_name.includes('bullet_') ) {
                    let split_bullet = attr_name.split("_");
                    let display_order = split_bullet[1] * 10;

                    let insert_check = inserted_bullet.filter(aiv=>aiv.name==attr_value && aiv.product_type_id == product_type_id);
        
                    if ( insert_check.length > 0 ) {
                        // insert value to product_id
                        let sql = `insert into product_bullets (product_id,product_type_bullet_id,display_order) values ('${product_id}','${insert_check[0].id}','${display_order}')`;
                        let b_check = b_attr_in.filter(bcv=>bcv.product_id == product_id && bcv.id == insert_check[0].id);
                        if ( b_check == 0 ) {
                            await my.query(sql);
                            b_attr_in.push({product_id:product_id,id:insert_check[0].id});
                        }
                    } else {
                        // add option
                        let sql = `insert into product_type_bullets (product_type_id,name,display_name) values ('${product_type_id}','${attr_value}','${attr_value}')`;
                        let _id = await my.query(sql);
                        let id = _id.insertId;
                        //insert value to product_id
                        sql = `insert into product_bullets (product_id,product_type_bullet_id,display_order) values ('${product_id}','${id}','${display_order}')`;
                        await my.query(sql);
                        inserted_bullet.push({id:id,name:attr_value,product_type_id:product_type_id});
                        b_attr_in.push({product_id:product_id,id:id});
                    }

                }

            });

            // if ( v.sku == "KKF210SS" ) {
            //     console.log(v.parsed_attributes);
            //     process.exit();
            // }
        });
        
        res.json(missing);
        //keys = keys.filter(uf.array_unique);
        // let test = [];
        // uf.dloop(parsed,function(i,v){
        //     test.push(v.attributes);
        // });
        // test = test.filter(uf.array_unique);
        // //console.log(keys);
        // res.json(test);
      });


    
});



function e_override(ee,mf,e) {
    if (ee!=undefined && mf!=undefined && e != undefined && mf == "" && e != "" ) {
        return e;
    } else {
        return mf;
    }
}

router.get('/import/product_types', async function (req, res, next) {
    return;
    await my.query('SET GLOBAL FOREIGN_KEY_CHECKS=0;');
    await my.query('truncate attributes');
    await my.query('truncate product_type_attribute_options');
    await my.query('truncate product_attributes');
    await my.query('truncate product_types');
    await my.query('truncate product_type_attributes');
    await my.query('truncate products');
    await my.query('truncate product_type_bullets');
    await my.query('truncate product_bullets');
    await my.query('truncate product_wtb_online');

    await my.query('SET GLOBAL FOREIGN_KEY_CHECKS=1');
    console.log('before read');
    fs.readFile('../api/ki/rest/tmp_csvs/'+the_csv, 'utf8', async (err, data) => {
        if (err) {
            console.log('read error?');
            console.log(err);
            return;
        }

        let rows = data.split('^END');
        let parsed = [];
        console.log('before parse');
        uf.dloop(rows,function(i,v) {
            let v_parsed = v.split('^');
            let tmp = {};

            tmp.sku = v_parsed[0];
            tmp.attributes = v_parsed[2];
            tmp.name = v_parsed[6];
            tmp.description = v_parsed[7];
            tmp.short_description = v_parsed[8];
            tmp.weight = v_parsed[9];
            tmp.magento_url_key = v_parsed[17];
            tmp.meta_title = v_parsed[18];
            tmp.meta_keywords = v_parsed[19];
            tmp.meta_description = v_parsed[20];
            tmp.magento_image = v_parsed[21];
            tmp.country_created = v_parsed[45];
            tmp.attributes_all = v_parsed[46];
            tmp.related_skus = v_parsed[68];
            tmp.accessories = v_parsed[72];
            tmp.magento_extra_images = v_parsed[74];

            parsed.push(tmp);
        })
        console.log('after parse');
        let keys = [];
        parsed = parsed_attributes(parsed);
        console.log(parsed.length);
        let pivot = product_pivot();
        console.log('after pivot');
        uf.dloop(parsed,function(i,v){
            //item level
            console.log('looop');
            try {
                console.log('before prodct_type set');
                let product_type = get_product_type(v.attributes);
                console.log(product_type);
                if ( product_type != null && product_type != "Default" ) {
                    keys.push(product_type.name);
                }
            } catch (e) {
                console.log(e);
            }
            

        });
        console.log('after loop 1');
        keys = keys.filter(uf._array_unique);
        console.log(keys);
        await uf.await_dloop(keys,async function(i,v){
            try {
                let find_me = pivot.filter(fv=>fv.name == v);
                if ( find_me.length > 0 ) {
                    let found = find_me[0];
                    let sql = `insert into product_types (name,display_name) values ('${found.name}','${found.display_name}')`;
                    await my.query(sql);
                } else {
                    console.log(i,v,find_me);
                }
            } catch (e) {
                console.log(e);
            }

        })


        res.json('done');
    });
});



router.get('/import/product_attributes', async function (req, res, next) {
    return;
    try {
        fs.readFile('../api/ki/rest/tmp_csvs/'+the_csv, 'utf8', async (err, data) => {
            let mf_data = await get_master_feed_data();
            let e_data = await get_extra_attributes();
        if (err) {
            console.log('error?');
          console.log(err);
          return;
        }
        let rows = data.split('^END');
        let parsed = [];

        uf.dloop(rows,function(i,v) {
            let v_parsed = v.split('^');
            let tmp = {};

            tmp.sku = v_parsed[0];
            tmp.attributes = v_parsed[2];
            tmp.name = v_parsed[6];
            tmp.description = v_parsed[7];
            tmp.short_description = v_parsed[8];
            tmp.weight = v_parsed[9];
            tmp.magento_url_key = v_parsed[17];
            tmp.meta_title = v_parsed[18];
            tmp.meta_keywords = v_parsed[19];
            tmp.meta_description = v_parsed[20];
            tmp.magento_image = v_parsed[21];
            tmp.country_created = v_parsed[45];
            tmp.attributes_all = v_parsed[46];
            tmp.related_skus = v_parsed[68];
            tmp.accessories = v_parsed[72];
            tmp.magento_extra_images = v_parsed[74];

            parsed.push(tmp);
        })

        parsed = parsed_attributes(parsed);
        console.log("here?");
        let pivot = attr_pivot();
        let product_types = await my.query('select * from product_types');
        let keys = [];
        
        uf.dloop(parsed,function(i,v){
            //item level
            
            let mf_product = mf_data.filter(mfv=>mfv.sku.toLowerCase().trim() == v.sku.toLowerCase().trim());
            if ( mf_product.length == 1 ) {
                mf_product = mf_product[0];
            } else {
                mf_product = undefined;
            }
            
            let e_product = e_data.filter(ev=> ev.sku.toLowerCase().trim() == v.sku.toLowerCase().trim() || v.sku.toLowerCase().trim().startsWith(ev.sku.toLowerCase().trim()));
            
            if ( e_product.length == 1 ) {
                e_product = e_product[0];
            } else {
                e_product = undefined;
            }

            let product_type = get_product_type(v.attributes);

            if ( e_product != undefined ) {
                uf.dloop(e_product,function(mfi,mfv) {
                    if ( mfv != "" ) {
                        v.parsed_attributes[mfi] = mfv;
                    }
                    
                });
            }
            if ( mf_product != undefined ) {
                uf.dloop(mf_product.attributes,function(mfi,mfv) {
                    v.parsed_attributes[mfi] = mfv;
                });
                uf.dloop(mf_product.bullets,function(mfi,mfv) {
                    v.parsed_attributes[mfi] = mfv;
                });
            }

            uf.dloop(v.parsed_attributes, function(ii,vv) {
                // attribute level
                try {
                    let attribute = ii;
                    let value = vv;
                    let find_me = pivot.filter(vf => vf.mage_att == attribute );
                    
                    if ( find_me.length == 1 && find_me[0].name != "" && product_type != "Default" && product_type != null){
                        keys.push(find_me[0].name+"|"+product_type.name);
                    }
                } catch (e) {
                    console.log(e);
                }
            })

        });

        keys = keys.filter(uf._array_unique);
        let attributes_inserted = [];
        await uf.await_dloop(keys,async function(i,v){
            let v_split = v.split("|");
            let attr = v_split[0];
            let product_type = v_split[1];
            let product_type_id = product_types.filter(ptv=>ptv.name==product_type);
            product_type_id = product_type_id[0];
            let _attr = pivot.filter(pv=>pv.name==attr);
            attr = _attr[0];

            let insert_check = attributes_inserted.filter(aiv=>aiv.name==attr);

            let id;
            let sql;
            if ( insert_check.length > 0 ) {
                let find_id = attributes_inserted.find(aif=>aif.name == attr);
                id = find_id.id;
            } else {
                let sql = `insert into attributes (name,display_name) values ('${attr.name}','${attr.display_name}')`;
                let _id = await my.query(sql);
                id = _id.insertId;
                attributes_inserted.push({id:id,name:attr});
            }

            //sql = `insert into product_type_attributes (product_type_id,attribute_id) values ('${product_type_id.id}','${id}')`;
            //await my.query(sql);
        })


        res.json(attributes_inserted);

        });
    } catch (e) {
        throw e;
    }
});

export const importtool = router;


function get_product_type(value) {
    let pivot = product_pivot();
    let find_me = pivot.filter(v=>v.mage_att==value);
    if ( find_me.length == 1 ) {
        return find_me[0];
    } else {
        if ( value == null || value == "Default" ) {
            return value;
        } else {
            console.log(value);
            console.log("PROBABLY FORGOT TO DELETE HEADER DUDE");
            process.exit();
        }
        
    }
}

function parsed_attributes(parsed) {
    uf.dloop(parsed,function(i,v) {
        try {
            v.parsed_attributes = {};
            let test = v.attributes_all.replace(/^"(.*)"$/, '$1');
            let test_split = test.split('=');
            let last_key = "";
            let special_op = 0;
            let real_key = "";
            uf.dloop(test_split,function(ii,vv){
                
                if ( !vv.includes(",") && ii != 0 && ii != (test_split.length-1)) {
                    special_op++;
                } else if ( ii == 0 ) {
                    v.parsed_attributes[vv] = "";
                    last_key = vv;
                    real_key = vv;
                } else if ( ii > 0 && ii != (test_split.length-1) ) {
                    if ( special_op == 0 ) {
                        let a_key = vv.split(",");
                        let new_key = a_key[a_key.length-1];
                        delete a_key[a_key.length-1];
                        v.parsed_attributes[new_key] = "";
                        v.parsed_attributes[last_key] = a_key.join(",");
                        last_key = new_key;
                        real_key = new_key;
                    } else {
                        let a_key = vv.split(",");
                        let new_key = a_key[a_key.length-1];
                        delete a_key[a_key.length-1];
                        v.parsed_attributes[new_key] = "";

                        v.parsed_attributes[last_key] = a_key.join(",");

                        
                        let index_pointer = ii-special_op;
                        //console.log(index_pointer);
                        let add_up_text = test_split[index_pointer];
                        //console.log(add_up_text);
                        index_pointer++;
                        while (special_op!=0) {
                            add_up_text = add_up_text + "=" + test_split[index_pointer];
                            //console.log(index_pointer);
                            //console.log(add_up_text);
                            index_pointer++;
                            special_op--;
                        }
                        v.parsed_attributes[last_key] = add_up_text + "=" + v.parsed_attributes[last_key]

                        last_key = new_key;
                        real_key = new_key;
                        special_op = false;
                    }
                } else if ( ii == (test_split.length-1) && special_op > 0 ) {
                    let index_pointer = ii-special_op;
                    //console.log(index_pointer);
                    let add_up_text = test_split[index_pointer];
                    //console.log(add_up_text);
                    index_pointer++;
                    while (special_op!=0) {
                        add_up_text = add_up_text + "=" + test_split[index_pointer];
                        //console.log(index_pointer);
                        //console.log(add_up_text);
                        index_pointer++;
                        special_op--;
                    }
                    v.parsed_attributes[last_key] = add_up_text;
                } else if ( ii == (test_split.length-1) ) {
                    v.parsed_attributes[last_key] = vv;
                }



                
            });
        } catch (e) {
            //do nothing
        }
        // console.log(v.parsed_attributes);
        // if (i==1) {process.exit();}
        // console.log(v.parsed_attributes);
        // process.exit();
    });
    return parsed;
}






function product_pivot() {
    return [
        { mage_att: "Bathroom Sink Quartz Seamless Undermount", name: "bathroom_sink", display_name: "Bathroom Sink" },
        { mage_att: "Kitchen Sink Quartz Top mount Double Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Sink Quartz Farmhouse Single Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Sink Quartz Farmhouse Double Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Sink Quartz Top Mount Single Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Sink Quartz Undermount Double Bowl ", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Sink Quartz Undermount Single Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Bathroom Sink SS Seamless Undermount Single Bowl", name: "bathroom_sink", display_name: "Bathroom Sink" },
        { mage_att: "Kitchen Sink SS Undermount Single Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Sink SS Undermount Double Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Accessory Disposal Flange & Waste Strainers", name: "kitchen_accessory", display_name: "Kitchen Accessory" },
        { mage_att: "Kitchen Accessory Bottom Grids", name: "kitchen_accessory", display_name: "Kitchen Accessory" },
        { mage_att: "Bathroom Sink Acrylic Seamless Undermount Vanity Sink", name: "bathroom_sink", display_name: "Bathroom Sink" },
        { mage_att: "Kitchen Sink SS Top Mount Double Bowl", name: "kitchen_sink", display_name: "Kitchen Sink" },
        { mage_att: "Kitchen Sink SS Top Mount Single Bowl", name: "kitchen_sink", display_name: "Kitchen SInk" },
        { mage_att: "Bathroom Vitreous China Vanity Sink", name: "bathroom_sink", display_name: "Bathroom Sink" },
        { mage_att: "Cinox Bathroom sinks", name: "bathroom_sink", display_name: "Bathroom Sink" },
        { mage_att: "Kitchen Faucet", name: "kitchen_faucet", display_name: "Kitchen Faucet" },
        { mage_att: "Kitchen Sink Combo", name: "kitchen_sink_combo", display_name: "Kitchen Sink Combo" },
        { mage_att: "Kitchen Sink Acrylic Single Bowl", name: "kitchen_sink", display_name: "Kitchen SInk" },
        { mage_att: "Kitchen Sink Acrylic Double Bowl ", name: "kitchen_sink", display_name: "Kitchen SInk" },
        { mage_att: "Bathroom Accessories", name: "bathroom_accessory", display_name: "Bathroom Accessory" },
        { mage_att: "Bathroom Faucets", name: "bathroom_faucet", display_name: "Bathroom Faucet" },
        { mage_att: "Bathroom Quartz Vessel Sink", name: "bathroom_sink", display_name: "Bathroom Sink" },
        { mage_att: "Soap Dispensers", name: "soap_dispenser", display_name: "Soap Dispenser" },
        { mage_att: "Bathroom sink combo", name: "bathroom_sink_combo", display_name: "Bathroom Sink Combo" }
    ];
}

function attr_pivot() {
    return [
        { mage_att: "ada_complaint", name: "ada_complaint", display_name: "ADA Complaint" },
        { mage_att: "bathroom_sink_collection", name: "collection", display_name: "Collection" },
        { mage_att: "bowl_configuration", name: "number_of_bowls", display_name: "Bowl Configuration" },
        { mage_att: "bowl_depth_range", name: "", display_name: "" },
        { mage_att: "color", name: "color", display_name: "Color" },
        { mage_att: "drain_opening_size", name: "drain_size", display_name: "Drain Opening Size" },
        { mage_att: "featured", name: "", display_name: "" },
        { mage_att: "file_dxf_documentation", name: "", display_name: "" },
        { mage_att: "file_pdf_documentation", name: "", display_name: "" },
        { mage_att: "installation_type_method", name: "install_method", display_name: "Installation Type Method" },
        { mage_att: "kitchen_faucet_collection", name: "collection", display_name: "Collection" },
        { mage_att: "length", name: "", display_name: "" },
        { mage_att: "minimum_cabinate_size", name: "min_cabinet_width", display_name: "Minimum Cabinet Width" },
        { mage_att: "new_arrival", name: "", display_name: "" },
        { mage_att: "on_sale", name: "", display_name: "" },
        { mage_att: "panel_height", name: "", display_name: "" },
        { mage_att: "search_sku", name: "", display_name: "" },
        { mage_att: "series", name: "series", display_name: "Series" },
        { mage_att: "sink_collection", name: "collection", display_name: "Collection" },
        { mage_att: "sink_color", name: "color", display_name: "Color" },
        { mage_att: "sink_finish_type", name: "finish", display_name: "Finish" },
        
        { mage_att: "sink_height_range", name: "", display_name: "" },
        { mage_att: "sink_length", name: "", display_name: "" },
        { mage_att: "sink_material", name: "material", display_name: "Material" },
        { mage_att: "sink_shape", name: "shape", display_name: "Shape" },
        { mage_att: "sink_shape_search", name: "", display_name: "" },
        { mage_att: "sink_type", name: "mount_type", display_name: "Mount Style" },
        { mage_att: "sink_width", name: "", display_name: "" },
        { mage_att: "sync_product", name: "", display_name: "" },
        { mage_att: "timershow", name: "", display_name: "" },
        { mage_att: "upc", name: "", display_name: "" },
        { mage_att: "warranty", name: "warranty", display_name: "Warranty" },
        { mage_att: "wtb_houzz_url", name: "", display_name: "" },
        { mage_att: "wtb_showroom_locator_flag", name: "wtb_showroom_locator_flag", display_name: "wtb_showroom_locator_flag" },
        { mage_att: "accessory_finish", name: "finish", display_name: "Finish" },
        { mage_att: "attr_left_inner_bowl_below_counter_", name: "", display_name: "" },
        { mage_att: "attr_left_inner_bowl_front_to_back_", name: "", display_name: "" },
        { mage_att: "attr_left_inner_bowl_left_to_right_", name: "", display_name: "" },
        { mage_att: "botton_grid", name: "bottom_grid", display_name: "Bottom Grid" },
        { mage_att: "bowl_front_to_back_width", name: "", display_name: "" },
        { mage_att: "bowl_left_to_right_length", name: "", display_name: "" },
        { mage_att: "bowl_split", name: "bowl_split", display_name: "Bowl Split" },
        { mage_att: "bullet_1", name: "", display_name: "" },
        { mage_att: "bullet_10", name: "", display_name: "" },
        { mage_att: "bullet_11", name: "", display_name: "" },
        { mage_att: "bullet_12", name: "", display_name: "" },
        { mage_att: "bullet_13", name: "", display_name: "" },
        { mage_att: "bullet_14", name: "", display_name: "" },
        { mage_att: "bullet_2", name: "", display_name: "" },
        { mage_att: "bullet_3", name: "", display_name: "" },
        { mage_att: "bullet_4", name: "", display_name: "" },
        { mage_att: "bullet_5", name: "", display_name: "" },
        { mage_att: "bullet_6", name: "", display_name: "" },
        { mage_att: "bullet_7", name: "", display_name: "" },
        { mage_att: "bullet_8", name: "", display_name: "" },
        { mage_att: "bullet_9", name: "", display_name: "" },
        { mage_att: "configurable_parent_sku", name: "", display_name: "" },
        { mage_att: "faucet_holes_predrilled", name: "faucet_holes_predrilled", display_name: "Faucet Holes Predrilled" },
        { mage_att: "kitchen_sink_collections", name: "collection", display_name: "Collection" },
        { mage_att: "listing_and_certifications", name: "certifications", display_name: "Certifications" },
        { mage_att: "new_position", name: "", display_name: "" },
        { mage_att: "pdf_for_care_guide", name: "", display_name: "" },
        { mage_att: "pdf_for_installation_guide", name: "", display_name: "" },
        { mage_att: "product_brand", name: "product_brand", display_name: "Product Brand" },
        { mage_att: "right_inner_bowl_below_counter", name: "", display_name: "" },
        { mage_att: "right_inner_bowl_front_to_back", name: "", display_name: "" },
        { mage_att: "right_inner_bowl_left_to_right", name: "", display_name: "" },
        { mage_att: "search_sku_parent", name: "", display_name: "" },
        { mage_att: "sink_height_test", name: "", display_name: "" },
        { mage_att: "sink_length_test", name: "", display_name: "" },
        { mage_att: "sink_width_range", name: "", display_name: "" },
        { mage_att: "sink_width_test", name: "", display_name: "" },
        { mage_att: "wtb_amazon_url", name: "", display_name: "" },
        { mage_att: "wtb_buildferguson_url", name: "", display_name: "" },
        { mage_att: "wtb_homedepot_url", name: "", display_name: "" },
        { mage_att: "wtb_lowes_url", name: "", display_name: "" },
        { mage_att: "wtb_menards_url", name: "", display_name: "" },
        { mage_att: "wtb_overstock_url", name: "", display_name: "" },
        { mage_att: "wtb_walmart_url", name: "", display_name: "" },
        { mage_att: "wtb_wayfair_url", name: "", display_name: "" },
        { mage_att: "links_purchased_separately", name: "links_purchased_separately", display_name: "links_purchased_separately" },
        { mage_att: "links_title", name: "links_title", display_name: "links_title" },
        { mage_att: "samples_title", name: "samples_title", display_name: "samples_title" },
        { mage_att: "sink_gauge", name: "gauge", display_name: "Gauge" },
        { mage_att: "accessory_material", name: "material", display_name: "Material" },
        { mage_att: "length_acc", name: "", display_name: "" },
        { mage_att: "width", name: "", display_name: "" },
        { mage_att: "height", name: "", display_name: "" },
        { mage_att: "soap_dispenser", name: "soap_dispenser", display_name: "soap_dispenser" },
        { mage_att: "faucet_finish", name: "finish", display_name: "Finish" },
        { mage_att: "faucet_fit_search", name: "", display_name: "" },
        { mage_att: "faucet_material", name: "material", display_name: "Material" },
        { mage_att: "faucet_type", name: "type", display_name: "Type" },
        { mage_att: "faucet_type_search", name: "", display_name: "" },
        { mage_att: "flow_rate", name: "flow_rate", display_name: "Flow Rate" },
        { mage_att: "low_lead_compliant", name: "low_lead_compliant", display_name: "Low Lead Compliant" },
        { mage_att: "nsf_approved", name: "nsf_approved", display_name: "NSF Approved" },
        { mage_att: "number_of_handles", name: "number_of_handles", display_name: "Number of Handles" },
        { mage_att: "sensor_activation", name: "sensor_activation", display_name: "Sensor Activated" },
        { mage_att: "spout_height", name: "spout_height", display_name: "Spout Height" },
        { mage_att: "spout_height_search", name: "", display_name: "" },
        { mage_att: "spout_reach", name: "spout_reach", display_name: "Spout Reach" },
        { mage_att: "lower_spout_reach", name: "lower_spout_reach", display_name: "Lower Spout Reach" },
        { mage_att: "spout_reach_search", name: "", display_name: "" },
        { mage_att: "spout_swivel", name: "spout_swivel", display_name: "Spout Swivel" },
        { mage_att: "water_efficent", name: "water_efficient", display_name: "Water Efficiency" },
        { mage_att: "faucet_height_range", name: "", display_name: "" },
        { mage_att: "pdf_for_installation_guide_2", name: "", display_name: "" },
        { mage_att: "bottom_diameter", name: "bottom_diameter", display_name: "Bottom Diameter" },
        { mage_att: "corrosive_rust_resistance", name: "corrosive_rust_resistance", display_name: "Corrosive Rust Resistance" },
        { mage_att: "drain_height", name: "drain_height", display_name: "Drain Height" },
        { mage_att: "fits", name: "fits", display_name: "Fits What?" },
        { mage_att: "flange_diameter", name: "flange_diameter", display_name: "Flange Diameter" },
        { mage_att: "lead_free_brass", name: "is_lead_free", display_name: "Lead Free Brass" },
        { mage_att: "top_diameter", name: "top_diameter", display_name: "Top Diameter" },
        { mage_att: "bathroom_faucet", name: "series", display_name: "Series" },
        { mage_att: "finish_type_color", name: "color", display_name: "Color" },
        { mage_att: "faucet_height", name: "", display_name: "" },
        { mage_att: "number_of_holes_required", name: "", display_name: "" },
        { mage_att: "bowl_length", name: "bowl_length", display_name: "Bowl Left to Right Length (in.)"},
        { mage_att: "bowl_width", name: "bowl_width", display_name: "Bowl Front to Back Width (in.)"},
        { mage_att: "left_bowl_length", name: "left_bowl_length", display_name: "Left Inner Bowl Left to Right Length (in.)"},
        { mage_att: "left_bowl_width", name: "left_bowl_width", display_name: "Left Inner Bowl Front to Back Width (in.)"},
        { mage_att: "left_bowl_below_counter_depth", name: "left_bowl_below_counter_depth", display_name: "Left Inner Bowl Below Counter Depth (in.)"},
        { mage_att: "right_bowl_length", name: "right_bowl_length", display_name: "Right Inner Bowl Left to Right Length (in.)"},
        { mage_att: "right_bowl_width", name: "right_bowl_width", display_name: "Right Inner Bowl Front to Back Width (in.)"},
        { mage_att: "right_bowl_below_counter_depth", name: "right_bowl_below_counter_depth", display_name: "Right Inner Bowl Below Counter Depth (in.)"},
        { mage_att: "width_minimum", name: "width_minimum", display_name: "Width Minimum" },
        { mage_att: "divider_width", name: "divider_width", display_name: "Divider Width" },
        { mage_att: "divider_drop", name: "divider_drop", display_name: "Divider Drop" },
        { mage_att: "left_drain_center_to_back_wall", name: "left_drain_center_to_back_wall", display_name: "Left Drain Center To Back Wall" },
        { mage_att: "left_drain_center_to_left_side_wall", name: "left_drain_center_to_left_side_wall", display_name: "Left Drain Center to Left Side Wall" },
        { mage_att: "right_drain_center_to_back_wall", name: "right_drain_center_to_back_wall", display_name: "Right Drain Center to Back Wall" },
        { mage_att: "right_drain_center_to_right_side_wall", name: "right_drain_center_to_right_side_wall", display_name: "Right Drain Center to Right Side Wall" },
        { mage_att: "waste_to_waste", name: "waste_to_waste", display_name: "Waste To Waste" },
        { mage_att: "pre_drills_for_faucet_holes", name: "pre_drills_for_faucet_holes", display_name: "Pre Drilled Holes for Faucet Holes" },
    ];
}

function main_attr() {
    return [
        { mage_att: "faucet_height", name: "height", display_name: "height" },
        { mage_att: "file_dxf_documentation", name: "magento_file_dxf_documentation", display_name: "file_dxf_documentation" },
        { mage_att: "file_pdf_documentation", name: "magento_file_pdf_documentation", display_name: "file_pdf_documentation" },
        { mage_att: "height", name: "height", display_name: "height" },
        { mage_att: "length", name: "length", display_name: "length" },
        { mage_att: "pdf_for_care_guide", name: "magento_pdf_for_care_guide", display_name: "pdf_for_care_guide" },
        { mage_att: "pdf_for_installation_guide", name: "magento_pdf_for_installation_guide", display_name: "pdf_for_installation_guide" },
        { mage_att: "pdf_for_installation_guide_2", name: "magento_pdf_for_installation_guide_2", display_name: "pdf_for_installation_guide_2" },
        { mage_att: "sink_length", name: "length", display_name: "length" },
        { mage_att: "sink_width", name: "width", display_name: "width" },
        { mage_att: "upc", name: "upc", display_name: "Upc" },
        { mage_att: "width", name: "width", display_name: "width" },
        { mage_att: "spruce_sku", name: "spruce_sku", display_name: "spruce_sku" },
        { mage_att: "sink_height", name: "height", display_name: "Height" },
    ];
}

function get_spruce_map() {
    return {
        "QT-610-BI":"QT610BI",
        "QT-610-BL":"QT610BL",
        "QT-610-BR":"QT610BR",
        "QT-610-CN":"QT610CN",
        "QT-610-GR":"QT610GR",
        "QT-610-WH":"QT610WH",
        "QA-760-BR":"QA760BR",
        "QAR-740-BI":"QAR740BI",
        "QAR-740-BL":"QAR740BL",
        "QAR-740-BR":"QAR740BR",
        "QAR-740-CN":"QAR740CN",
        "QAR-740-GR":"QAR740GR",
        "QAR-740-WH":"QAR740WH",
        "QAR-750-BI":"QAR750BI",
        "QAR-750-BL":"QAR750BL",
        "QAR-750-BR":"QAR750BR",
        "QAR-750-CN":"QAR750CN",
        "QAR-750-GR":"QAR750GR",
        "QAR-750-WH":"QAR750WH",
        "QAR-760-BI":"QAR760BI",
        "QAR-760-BL":"QAR760BL",
        "QAR-760-BR":"QAR760BR",
        "QAR-760-CN":"QAR760CN",
        "QAR-760-GR":"QAR760GR",
        "QAR-760-WH":"QAR760WH",
        "QA-740-BL":"QA740BL",
        "QA-740-WH":"QA740WH",
        "QA-740-GR":"QA740GR",
        "QA-740-BI":"QA740BI",
        "QA-740-BR":"QA740BR",
        "QA-740-CN":"QA740CN",
        "QA-750-BL":"QA750BL",
        "QA-750-BR":"QA750BR",
        "QA-750-WH":"QA750WH",
        "QA-750-CN":"QA750CN",
        "QA-750-BI":"QA750BI",
        "QA-750-GR":"QA750GR",
        "QA-760-BL":"QA760BL",
        "QA-760-WH":"QA760WH",
        "QA-760-CN":"QA760CN",
        "QA-760-GR":"QA760GR",
        "QA-760-BI":"QA760BI",
        "QT-630-BL":"QT630BL",
        "QT-630-BR":"QT630BR",
        "QT-630-CN":"QT630CN",
        "QT-630-WH":"QT630WH",
        "QT-630-GR":"QT630GR",
        "QT-630-BI":"QT630BI",
        "QT-670-BL":"QT670BL",
        "QT-670-BR":"QT670BR",
        "QT-670-CN":"QT670CN",
        "QT-670-WH":"QT670WH",
        "QT-670-GR":"QT670GR",
        "QT-670-BI":"QT670BI",
        "QT-671-BL":"QT671BL",
        "QT-671-BR":"QT671BR",
        "QT-671-CN":"QT671CN",
        "QT-671-WH":"QT671WH",
        "QT-671-GR":"QT671GR",
        "QT-671-BI":"QT671BI",
        "QT-710-BL":"QT710BL",
        "QT-710-BR":"QT710BR",
        "QT-710-WH":"QT710WH",
        "QT-710-CN":"QT710CN",
        "QT-710-GR":"QT710GR",
        "QT-710-BI":"QT710BI",
        "QT-711-BL":"QT711BL",
        "QT-711-BR":"QT711BR",
        "QT-711-CN":"QT711CN",
        "QT-711-WH":"QT711WH",
        "QT-711-GR":"QT711GR",
        "QT-711-BI":"QT711BI",
        "QT-712-BR":"QT712BR",
        "QT-712-BL":"QT712BL",
        "QT-712-CN":"QT712CN",
        "QT-712-WH":"QT712WH",
        "QT-712-GR":"QT712GR",
        "QT-712-BI":"QT712BI",
        "QT-720-BL":"QT720BL",
        "QT-720-BR":"QT720BR",
        "QT-720-CN":"QT720CN",
        "QT-720-WH":"QT720WH",
        "QT-720-BI":"QT720BI",
        "QT-720-GR":"QT720GR",
        "QT-721-BL":"QT721BL",
        "QT-721-BR":"QT721BR",
        "QT-721-CN":"QT721CN",
        "QT-721-WH":"QT721WH",
        "QT-721-GR":"QT721GR",
        "QT-721-BI":"QT721BI",
        "QT-722-BL":"QT722BL",
        "QT-722-BR":"QT722BR",
        "QT-722-CN":"QT722CN",
        "QT-722-WH":"QT722WH",
        "QT-722-GR":"QT722GR",
        "QT-722-BI":"QT722BI",
        "QX-680-BL":"QX680BL",
        "QX-680-BR":"QX680BR",
        "QX-680-CN":"QX680CN",
        "QX-680-WH":"QX680WH",
        "QX-680-GR":"QX680GR",
        "QX-680-BI":"QX680BI",
        "QU-610-BL":"QU610BL",
        "QU-610-BR":"QU610BR",
        "QU-610-CN":"QU610CN",
        "QU-610-WH":"QU610WH",
        "QU-610-GR":"QU610GR",
        "QU-610-BI":"QU610BI",
        "QU-630-BL":"QU630BL",
        "QU-630-BR":"QU630BR",
        "QU-630-CN":"QU630CN",
        "QU-630-WH":"QU630WH",
        "QU-630-GR":"QU630GR",
        "QU-630-BI":"QU630BI",
        "QU-670-BL":"QU670BL",
        "QU-670-BR":"QU670BR",
        "QU-670-CN":"QU670CN",
        "QU-670-WH":"QU670WH",
        "QU-670-GR":"QU670GR",
        "QU-670-BI":"QU670BI",
        "QU-671-BL":"QU671BL",
        "QU-671-BR":"QU671BR",
        "QU-671-CN":"QU671CN",
        "QU-671-WH":"QU671WH",
        "QU-671-GR":"QU671GR",
        "QU-671-BI":"QU671BI",
        "QU-690-BL":"QU690BL",
        "QU-690-BR":"QU690BR",
        "QU-690-CN":"QU690CN",
        "QU-690-WH":"QU690WH",
        "QU-690-GR":"QU690GR",
        "QU-690-BI":"QU690BI",
        "QU-710-BR":"QU710BR",
        "QU-710-BL":"QU710BL",
        "QU-710-WH":"QU710WH",
        "QU-710-CN":"QU710CN",
        "QU-710-GR":"QU710GR",
        "QU-710-BI":"QU710BI",
        "QU-711-BL":"QU711BL",
        "QU-711-BR":"QU711BR",
        "QU-711-CN":"QU711CN",
        "QU-711-WH":"QU711WH",
        "QU-711-GR":"QU711GR",
        "QU-711-BI":"QU711BI",
        "QU-712-BL":"QU712BL",
        "QU-712-BR":"QU712BR",
        "QU-712-CN":"QU712CN",
        "QU-712-WH":"QU712WH",
        "QU-712-GR":"QU712GR",
        "QU-712-BI":"QU712BI",
        "QU-720-BL":"QU720BL",
        "QU-720-BR":"QU720BR",
        "QU-720-CN":"QU720CN",
        "QU-720-WH":"QU720WH",
        "QU-720-GR":"QU720GR",
        "QU-720-BI":"QU720BI",
        "QU-721-BR":"QU721BR",
        "QU-721-BL":"QU721BL",
        "QU-721-CN":"QU721CN",
        "QU-721-WH":"QU721WH",
        "QU-721-GR":"QU721GR",
        "QU-721-BI":"QU721BI",
        "QU-722-BL":"QU722BL",
        "QU-722-BR":"QU722BR",
        "QU-722-CN":"QU722CN",
        "QU-722-WH":"QU722WH",
        "QU-722-GR":"QU722GR",
        "QU-722-BI":"QU722BI",
        "QT-810-BL":"QT810BL",
        "QT-810-BR":"QT810BR",
        "QT-810-CN":"QT810CN",
        "QT-810-WH":"QT810WH",
        "QT-810-GR":"QT810GR",
        "QT-810-BI":"QT810BI",
        "QT-811-BL":"QT811BL",
        "QT-811-BR":"QT811BR",
        "QT-811-CN":"QT811CN",
        "QT-811-WH":"QT811WH",
        "QT-811-GR":"QT811GR",
        "QT-811-BI":"QT811BI",
        "Q-350-BL":"Q350BL",
        "Q-350-BR":"Q350BR",
        "Q-350-CN":"Q350CN",
        "Q-350-WH":"Q350WH",
        "Q-350-GR":"Q350GR",
        "Q-360R-BL":"Q360RBL",
        "Q-360R-BR":"Q360RBR",
        "Q-360R-CN":"Q360RCN",
        "Q-360R-WH":"Q360RWH",
        "Q-360R-GR":"Q360RGR",
        "E-303":"E303",
        "E-305":"E305",
        "E-310":"E310",
        "EL-30":"EL30",
        "EL-35":"EL35",
        "EL-71":"EL71",
        "EL-75":"EL75",
        "EL-76":"EL76",
        "EL-78L":"EL78L",
        "EL-78R":"EL78R",
        "EL-84":"EL84",
        "EL-86":"EL86",
        "EL-87":"EL87",
        "EL-88":"EL88",
        "E-505D":"E505D",
        "E-510":"E510",
        "E-520":"E520",
        "E-525":"E525",
        "E-528":"E528",
        "E-540":"E540",
        "E-550":"E550",
        "E-560L":"E560L",
        "E-560R":"E560R",
        "E-315":"E315",
        "E-320":"E320",
        "E-330":"E330",
        "E-340":"E340",
        "E-350":"E350",
        "E-360R":"E360R",
        "E-410":"E410",
        "E-415":"E415",
        "E-420":"E420",
        "E-440":"E440",
        "BC-2318":"BC2318",
        "BC-3018":"BC3018",
        "BC-5050":"BC5050",
        "BC-6040R":"BC6040R",
        "QBSBL":"QBSBL",
        "QBSBR":"QBSBR",
        "QBSCN":"QBSCN",
        "QBSWH":"QBSWH",
        "QBSGR":"QBSGR",
        "QBSBI":"QBSBI",
        "QDFBL":"QDFBL",
        "QDFBR":"QDFBR",
        "QDFCN":"QDFCN",
        "QDFWH":"QDFWH",
        "QDFGR":"QDFGR",
        "QDFBI":"QDFBI",
        "GR-6013":"GR-6013",
        "GR-6012":"GR-6012",
        "GR-6011":"GR-6011",
        "GR-6009":"GR-6009",
        "GR-6008":"GR-6008",
        "GR-6010":"GR-6010",
        "GR-6007":"GR-6007",
        "GR-6006":"GR-6006",
        "GR-6005":"GR-6005",
        "GR-6004":"GR-6004",
        "GR-6003":"GR-6003",
        "GR-6002":"GR-6002",
        "GR-6001":"GR-6001",
        "L-2DF":"L2DF",
        "L-2":"L2",
        "L-1":"L1",
        "U-1113":"U1113",
        "U-1414":"U1414",
        "U-1517":"U1517",
        "U-2321":"U2321",
        "U-2418":"U2418",
        "U-3018":"U3018",
        "U-5050":"U5050",
        "U-6040L":"U6040L",
        "U-6040R":"U6040R",
        "UV-1515":"UV1515",
        "E-312":"E312",
        "EL-73":"EL73",
        "EW-07":"EW-07",
        "EW-09":"EW-09",
        "GR-2001":"GR-2001",
        "GR-2002":"GR-2002",
        "GR-2003":"GR-2003",
        "GR-2004":"GR-2004",
        "GR-2005":"GR-2005",
        "GR-2006":"GR-2006",
        "GR-2007":"GR-2007",
        "GR-2008":"GR-2008",
        "GR-2009":"GR-2009",
        "GR-3001":"GR-3001",
        "GR-3002":"GR-3002",
        "GR-3003":"GR-3003",
        "GR-3004":"GR-3004",
        "GR-3005":"GR-3005",
        "GR-5001":"GR-5001",
        "GR-5002":"GR-5002",
        "GR-5003":"GR-5003",
        "QU-810-BL":"QU810BL",
        "QU-810-BR":"QU810BR",
        "QU-810-CN":"QU810CN",
        "QU-810-WH":"QU810WH",
        "QU-810-GR":"QU810GR",
        "QU-810-BI":"QU810BI",
        "QU-811-BL":"QU811BL",
        "QU-811-BR":"QU811BR",
        "QU-811-CN":"QU811CN",
        "QU-811-GR":"QU811GR",
        "QU-811-BI":"QU811BI",
        "QU-811-WH":"QU811WH",
        "GR-6014":"GR-6014",
        "GR-6016":"GR-6016",
        "Q-306-BL":"Q306BL",
        "Q-306-BR":"Q306BR",
        "Q-306-GR":"Q306GR",
        "Q-306-CN":"Q306CN",
        "Q-306-WH":"Q306WH",
        "Q-340-WH":"Q340WH",
        "Q-340-BR":"Q340BR",
        "Q-315-BL":"Q315BL",
        "Q-315-WH":"Q315WH",
        "Q-315-GR":"Q315GR",
        "Q-315-BR":"Q315BR",
        "Q-315-CN":"Q315CN",
        "Q-320-BL":"Q320BL",
        "Q-320-WH":"Q320WH",
        "Q-320-GR":"Q320GR",
        "Q-320-BR":"Q320BR",
        "Q-320-CN":"Q320CN",
        "Q-340-BL":"Q340BL",
        "Q-340-GR":"Q340GR",
        "Q-340-CN":"Q340CN",
        "GR-6015":"GR-6015",
        "VC-101-BL":"VC101BL",
        "VC-101-WH":"VC101WH",
        "VC-102-BL":"VC102BL",
        "VC-102-WH":"VC102WH",
        "VC-105-BL":"VC105BL",
        "VC-105-WH":"VC105WH",
        "VC-106-BL":"VC106BL",
        "VC-106-WH":"VC106WH",
        "VC-108-BL":"VC108BL",
        "VC-108-WH":"VC108WH",
        "VC-110-BL":"VC110BL",
        "VC-110-WH":"VC110WH",
        "VC-115-BL":"VC115BL",
        "VC-115-WH":"VC115WH",
        "KKF210SS":"KKF210SS",
        "KKF210BG":"KKF210BG",
        "KKF210C":"KKF210C",
        "KKF210GG":"KKF210GG",
        "KKF210MB":"KKF210MB",
        "KKF220C":"KKF220C",
        "KKF220MB":"KKF220MB",
        "KKF220SS":"KKF220SS",
        "KKF230C":"KKF230C",
        "KKF230MB":"KKF230MB",
        "KKF230SS":"KKF230SS",
        "KKF240SS":"KKF240SS",
        "KKF240C":"KKF240C",
        "KKF250SS":"KKF250SS",
        "KKF250C":"KKF250C",
        "KKF260SS":"KKF260SS",
        "KKF260C":"KKF260C",
        "WS-37-PK2":"WS-37-PK2",
        "WS-45-PK2":"WS-45-PK2",
        "GR-6017":"GR-6017",
        "GR-6018":"GR-6018",
        "GR-6019":"GR-6019",
        "GR-6020":"GR-6020",
        "VC-201-WH":"VC201WH",
        "VC-202-WH":"VC202WH",
        "VC-203-WH":"VC203WH",
        "VC-301-WH":"VC301WH",
        "VC-302-WH":"VC302WH",
        "VC-303-WH":"VC303WH",
        "VC-401-WH":"VC401WH",
        "VC-402-WH":"VC402WH",
        "VC-410-WH":"VC410WH",
        "VC-411-WH":"VC411WH",
        "VC-420-WH":"VC420WH",
        "VC-421-WH":"VC421WH",
        "VC-422-WH":"VC422WH",
        "VC-423-WH":"VC423WH",
        "VC-424-WH":"VC424WH",
        "VC-425-WH":"VC425WH",
        "VC-426-WH":"VC426WH",
        "VC-427-WH":"VC427WH",
        "VC-428-WH":"VC428WH",
        "VC-601-WH":"VC601WH",
        "VC-602-WH":"VC602WH",
        "VC-603-WH":"VC603WH",
        "VC-501-WH":"VC501WH",
        "VC-502-WH":"VC502WH",
        "VC-503-WH":"VC503WH",
        "VC-504-WH":"VC504WH",
        "VC-505-WH":"VC505WH",
        "VC-506-WH":"VC506WH",
        "VC-507-WH":"VC507WH",
        "VC-508-WH":"VC508WH",
        "VC-509-WH":"VC509WH",
        "VC-510-WH":"VC510WH",
        "VC-511-WH":"VC511WH",
        "VC-512-WH":"VC512WH",
        "UV-1715":"UV-1715",
        "UV-1816":"UV-1816",
        "PU25SS":"PU25SS",
        "PU25C":"PU25C",
        "PUOF25SS":"PUOF25SS",
        "PUOF25C":"PUOF25C",
        "PU25MB":"PU25MB",
        "PUOF25MB":"PUOF25MB",
        "KBF410C":"KBF410C",
        "KBF410MB":"KBF410MB",
        "KBF410SS":"KBF410SS",
        "KBF410ORB":"KBF410ORB",
        "KBF412ORB":"KBF412ORB",
        "KBF412MB":"KBF412MB",
        "KBF412C":"KBF412C",
        "KBF412SS":"KBF412SS",
        "KBF414MB":"KBF414MB",
        "KBF414ORB":"KBF414ORB",
        "KBF414C":"KBF414C",
        "KBF414SS":"KBF414SS",
        "KBF416MB":"KBF416MB",
        "KBF416ORB":"KBF416ORB",
        "KBF416SS":"KBF416SS",
        "KBF416C":"KBF416C",
        "KBF420SS":"KBF420SS",
        "KBF420MB":"KBF420MB",
        "KBF420C":"KBF420C",
        "KBF422SS":"KBF422SS",
        "KBF422MB":"KBF422MB",
        "KBF422C":"KBF422C",
        "KBF430SS":"KBF430SS",
        "KBF430MB":"KBF430MB",
        "KBF430C":"KBF430C",
        "KBF432SS":"KBF432SS",
        "KBF432MB":"KBF432MB",
        "KBF432C":"KBF432C",
        "KBF440SS":"KBF440SS",
        "KBF440MB":"KBF440MB",
        "KBF440C":"KBF440C",
        "KBF442SS":"KBF442SS",
        "KBF442MB":"KBF442MB",
        "KBF442C":"KBF442C",
        "KBF450SS":"KBF450SS",
        "KBF450MB":"KBF450MB",
        "KBF450C":"KBF450C",
        "QT-812-BL":"QT812BL",
        "QT-812-WH":"QT812WH",
        "QT-812-GR":"QT812GR",
        "QT-812-BR":"QT812BR",
        "QT-812-CN":"QT812CN",
        "QT-812-BI":"QT812BI",
        "QT-820-BL":"QT820BL",
        "QT-820-WH":"QT820WH",
        "QT-820-GR":"QT820GR",
        "QT-820-BR":"QT820BR",
        "QT-820-CN":"QT820CN",
        "QT-820-BI":"QT820BI",
        "QU-820-BL":"QU820BL",
        "QU-820-WH":"QU820WH",
        "QU-820-GR":"QU820GR",
        "QU-820-BR":"QU820BR",
        "QU-820-CN":"QU820CN",
        "QU-820-BI":"QU820BI",
        "QU-812-BL":"QU812BL",
        "QU-812-WH":"QU812WH",
        "QU-812-GR":"QU812GR",
        "QU-812-BR":"QU812BR",
        "QU-812-CN":"QU812CN",
        "QU-812-BI":"QU812BI",
        "QTWS-875-BL":"QTWS875BL",
        "QTWS-875-WH":"QTWS875WH",
        "QTWS-875-GR":"QTWS875GR",
        "QTWS-875-BR":"QTWS875BR",
        "QTWS-875-CN":"QTWS875CN",
        "QTWS-875-BI":"QTWS875BI",
        "SQS100BL":"SQS100BL",
        "SQS100WH":"SQS100WH",
        "SQS100GR":"SQS100GR",
        "SQS400BL":"SQS400BL",
        "SQS400WH":"SQS400WH",
        "SQS400GR":"SQS400GR",
        "SQS300BL":"SQS300BL",
        "SQS300WH":"SQS300WH",
        "SQS300GR":"SQS300GR",
        "SQS200BL":"SQS200BL",
        "SQS200WH":"SQS200WH",
        "SQS200GR":"SQS200GR",
        "QM160WH":"QM160WH",
        "QUWS-875-BL":"QUWS875BL",
        "QUWS-875-BR":"QUWS875BR",
        "QUWS-875-WH":"QUWS875WH",
        "QUWS-875-CN":"QUWS875CN",
        "QUWS-875-GR":"QUWS875GR",
        "QUWS-875-BI":"QUWS875BI",
        "QM162WH":"QM162WH",
        "QM164WH":"QM164WH",
        "QM170WH":"QM170WH",
        "QM172WH":"QM172WH",
        "QM174WH":"QM174WH",
        "QM176WH":"QM176WH",
        "QM178WH":"QM178WH",
        "WS-40-PK2":"WS-40-PK2",
        "KKF310GG":"KKF310GG",
        "KKF310SS":"KKF310SS",
        "KKF310MB":"KKF310MB",
        "KKF320SS":"KKF320SS",
        "KKF320GG":"KKF320GG",
        "KKF320MB":"KKF320MB",
        "KKF330SS":"KKF330SS",
        "KKF330GG":"KKF330GG",
        "KKF330MB":"KKF330MB",
        "KKF340SS":"KKF340SS",
        "KKF340GG":"KKF340GG",
        "KKF340MB":"KKF340MB",
        "KKF240MB":"KKF240MB",
        "KKF350SS":"KKF350SS",
        "KKF350GG":"KKF350GG",
        "KKF350MB":"KKF350MB",
        "KKF250MB":"KKF250MB",
        "KKF260MB":"KKF260MB",
        "SD25C":"SD25C",
        "SD25MB":"SD25MB",
        "SD25SS":"SD25SS",
        "SD35SS":"SD35SS",
        "SD35MB":"SD35MB",
        "SD35C":"SD35C",
        "GR-6021":"GR-6021",
        "GR-6022":"GR-6022",
        "QARWS-740-BL":"QARWS740BL",
        "QARWS-740-BR":"QARWS740BR",
        "QARWS-740-WH":"QARWS740WH",
        "QARWS-740-CN":"QARWS740CN",
        "QARWS-740-GR":"QARWS740GR",
        "QARWS-740-BI":"QARWS740BI",
        "QAWS-740-BL":"QAWS740BL",
        "QAWS-740-BR":"QAWS740BR",
        "QAWS-740-WH":"QAWS740WH",
        "QAWS-740-CN":"QAWS740CN",
        "QAWS-740-GR":"QAWS740GR",
        "QAWS-740-BI":"QAWS740BI",
        "KBF460C":"KBF460C",
        "KBF460MB":"KBF460MB",
        "KBF460SS":"KBF460SS",
        "KBF462C":"KBF462C",
        "KBF462MB":"KBF462MB",
        "KBF462SS":"KBF462SS",
        "KBF464C":"KBF464C",
        "KBF464MB":"KBF464MB",
        "KBF464SS":"KBF464SS",
        "KBF466C":"KBF466C",
        "KBF466MB":"KBF466MB",
        "KBF466SS":"KBF466SS",
        "KBF470C":"KBF470C",
        "KBF470MB":"KBF470MB",
        "KBF470SS":"KBF470SS",
        "KBF470ORB":"KBF470ORB",
        "KBF472C":"KBF472C",
        "KBF472ORB":"KBF472ORB",
        "KBF472MB":"KBF472MB",
        "KBF472SS":"KBF472SS",
        "KBF474C":"KBF474C",
        "KBF474MB":"KBF474MB",
        "KBF474ORB":"KBF474ORB",
        "KBF474SS":"KBF474SS",
        "KKF140C":"KKF140C",
        "KKF140MB":"KKF140MB",
        "KKF140SS":"KKF140SS",
        "WS-100-PK1":"WS-100-PK1",
        "KBF510C":"KBF510C",
        "KBF510MB":"KBF510MB",
        "KBF510SS":"KBF510SS",
        "KBF512C":"KBF512C",
        "KBF512MB":"KBF512MB",
        "KBF512SS":"KBF512SS",
        "KBF514C":"KBF514C",
        "KBF514MB":"KBF514MB",
        "KBF514SS":"KBF514SS",
        "KBF516C":"KBF516C",
        "KBF516MB":"KBF516MB",
        "KBF516SS":"KBF516SS",
        "KBF520C":"KBF520C",
        "KBF520MB":"KBF520MB",
        "KBF520ORB":"KBF520ORB",
        "KBF520SS":"KBF520SS",
        "KBF524C":"KBF524C",
        "KBF524MB":"KBF524MB",
        "KBF524ORB":"KBF524ORB",
        "KBF524SS":"KBF524SS",
        "KBF526C":"KBF526C",
        "KBF526MB":"KBF526MB",
        "KBF526ORB":"KBF526ORB",
        "KBF526SS":"KBF526SS",
        "GR-3008":"GR-3008",
        "GR-3009":"GR-3009",
        "GR-3010":"GR-3010",
        "GR-3011":"GR-3011",
        "GR-3012":"GR-3012",
        "GR-3013":"GR-3013",
        "GR-3015":"GR-3015",
        "GR-3016":"GR-3016",
        "GR-3017":"GR-3017",
        "GR-3018":"GR-3018",
        "GR-3019":"GR-3019",
        "GR-3020":"GR-3020",
        "Q-309-BL":"Q309BL",
        "Q-309-BR":"Q309BR",
        "Q-309-PR":"Q309PR",
        "Q-309-RD":"Q309RD",
        "Q-309-WH":"Q309WH",
        "Q-309-CN":"Q309CN",
        "Q-309-GN":"Q309GN",
        "Q-309-YE":"Q309YE",
        "Q-309-OR":"Q309OR",
        "Q-309-BU":"Q309BU",
        "Q-309-BS":"Q309BS",
        "Q-309-GR":"Q309GR",
        "Q-306-OR":"Q306OR",
        "Q-306-BU":"Q306BU",
        "Q-306-YE":"Q306YE",
        "Q-306-GN":"Q306GN",
        "Q-306-RD":"Q306RD",
        "Q-306-PR":"Q306PR",
        "KBF440BC":"KBF440BC",
        "KBF440BG":"KBF440BG",
        "KBF440G":"KBF440G",
        "KBF440GG":"KBF440GG",
        "KBF442BC":"KBF442BC",
        "KBF442BG":"KBF442BG",
        "KBF442G":"KBF442G",
        "KBF442GG":"KBF442GG",
        "KBF460BC":"KBF460BC",
        "KBF460BG":"KBF460BG",
        "KBF460G":"KBF460G",
        "KBF460GG":"KBF460GG",
        "KBF462BC":"KBF462BC",
        "KBF462BG":"KBF462BG",
        "KBF462G":"KBF462G",
        "KBF462GG":"KBF462GG",
        "KBF470BC":"KBF470BC",
        "KBF470BG":"KBF470BG",
        "KBF470G":"KBF470G",
        "KBF470GG":"KBF470GG",
        "KBF472BC":"KBF472BC",
        "KBF472BG":"KBF472BG",
        "KBF472G":"KBF472G",
        "KBF472GG":"KBF472GG",
        "KBF474BC":"KBF474BC",
        "KBF474BG":"KBF474BG",
        "KBF474G":"KBF474G",
        "KBF474GG":"KBF474GG",
        "KBF510BC":"KBF510BC",
        "KBF510BG":"KBF510BG",
        "KBF510G":"KBF510G",
        "KBF510GG":"KBF510GG",
        "KBF512BC":"KBF512BC",
        "KBF512BG":"KBF512BG",
        "KBF512G":"KBF512G",
        "KBF512GG":"KBF512GG",
        "KBF514BC":"KBF514BC",
        "KBF514BG":"KBF514BG",
        "KBF514G":"KBF514G",
        "KBF514GG":"KBF514GG",
        "KBF516BC":"KBF516BC",
        "KBF516BG":"KBF516BG",
        "KBF516G":"KBF516G",
        "KBF516GG":"KBF516GG",
        "KKF210BC":"KKF210BC",
        "KKF210G":"KKF210G",
        "KKF210ORB":"KKF210ORB",
        "KKF220BG":"KKF220BG",
        "KKF240BG":"KKF240BG",
        "KKF310BG":"KKF310BG",
        "KKF340BG":"KKF340BG",
        "SD25BC":"SD25BC",
        "SD25BG":"SD25BG",
        "SD25G":"SD25G",
        "SD25GG":"SD25GG",
        "SD25ORB":"SD25ORB",
        "SD35BC":"SD35BC",
        "SD35BG":"SD35BG",
        "SD35G":"SD35G",
        "SD35GG":"SD35GG",
        "SD35ORB":"SD35ORB",
        "PUOF25ORB":"PUOF25ORB",
        "PU25ORB":"PU25ORB",
        "CCP100BC":"CCP100BC",
        "CCP100G":"CCP100G",
        "CCP100GG":"CCP100GG",
        "CCP100SS":"CCP100SS",
        "CCP200BC":"CCP200BC",
        "CCP200G":"CCP200G",
        "CCP200SS":"CCP200SS",
        "CCP300BC":"CCP300BC",
        "CCP300G":"CCP300G",
        "CCP300SS":"CCP300SS",
        "CCP400BC":"CCP400BC",
        "CCP400G":"CCP400G",
        "CCP400GG":"CCP400GG",
        "CCP400SS":"CCP400SS",
        "CCP500BC":"CCP500BC",
        "CCP500G":"CCP500G",
        "CCP500GG":"CCP500GG",
        "CCP500SS":"CCP500SS",
        "CCT100BC":"CCT100BC",
        "CCT100G":"CCT100G",
        "CCT100GG":"CCT100GG",
        "CCT100SS":"CCT100SS",
        "CCT200BC":"CCT200BC",
        "CCT200G":"CCT200G",
        "CCT200GG":"CCT200GG",
        "CCT200SS":"CCT200SS",
        "CCU100BC":"CCU100BC",
        "CCU100G":"CCU100G",
        "CCU100GG":"CCU100GG",
        "CCU100SS":"CCU100SS",
        "CCU200BC":"CCU200BC",
        "CCU200G":"CCU200G",
        "CCU200GG":"CCU200GG",
        "CCU200SS":"CCU200SS",
        "CCU300BC":"CCU300BC",
        "CCU300G":"CCU300G",
        "CCU300GG":"CCU300GG",
        "CCU300SS":"CCU300SS",
        "CCU400BC":"CCU400BC",
        "CCU400G":"CCU400G",
        "CCU400GG":"CCU400GG",
        "CCU400SS":"CCU400SS",
        "CCU500BC":"CCU500BC",
        "CCU500G":"CCU500G",
        "CCU500GG":"CCU500GG",
        "CCU500SS":"CCU500SS",
        "CCV100BC":"CCV100BC",
        "CCV100G":"CCV100G",
        "CCV100GG":"CCV100GG",
        "CCV100SS":"CCV100SS",
        "CCV200BC":"CCV200BC",
        "CCV200G":"CCV200G",
        "CCV200GG":"CCV200GG",
        "CCV200SS":"CCV200SS",
        "CCV300BC":"CCV300BC",
        "CCV300G":"CCV300G",
        "CCV300SS":"CCV300SS",
        "CCV350BC":"CCV350BC",
        "CCV350G":"CCV350G",
        "CCV350SS":"CCV350SS",
        "CCV400BC":"CCV400BC",
        "CCV400G":"CCV400G",
        "CCV400GG":"CCV400GG",
        "CCV400SS":"CCV400SS",
        "CCV500BC":"CCV500BC",
        "CCV500G":"CCV500G",
        "CCV500GG":"CCV500GG",
        "CCV500SS":"CCV500SS",
        "CCV600BC":"CCV600BC",
        "CCV600G":"CCV600G",
        "CCV600GG":"CCV600GG",
        "CCV600SS":"CCV600SS",
    };
}