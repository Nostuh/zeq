import _mysql from 'mysql';
import connection_config from './config.json' with { type: "json" };
import { uf } from '../utils/tools.mjs';

export default class mysql {
    static dbs = {};

    static load(connection_name) {
        try {
            let config = connection_config[connection_name];
            config.port = 3306;
            if ( mysql.dbs[connection_name] == undefined ) {
                mysql.dbs[connection_name] = {};
                mysql.dbs[connection_name].pool = _mysql.createPool(config);

                console.log(`Pools were made for ${connection_name}!`);
            }
        } catch (e) {
            console.log(e);
            throw e;
        }
        
    }

    static query(sql,vars,config,replace_all_on=false) {
        let that = this;
        //console.log(sql);
        return new Promise(
            (resolve,reject) => {
                try {
                    if ( vars != false ) {
                        //console.log(vars);
                        uf.dloop(vars,function(i,v) {
                            //console.log(v);
                            if ( replace_all_on ) {

                                // 9/11/2024 Why am I testing if v is an array then doing exactly the same thing on the if....
                                if ( Array.isArray(v) ) {
                                    sql = sql.replaceAll('@'+i,that.escape(v));
                                } else {
                                    sql = sql.replaceAll('@'+i,that.escape(v));
                                }
                            } else {
                                if ( Array.isArray(v) ) {
                                    sql = sql.replace('@'+i,that.escape(v));
                                } else {
                                    sql = sql.replace('@'+i,that.escape(v));
                                }
                            }

                            
                        });
                        //console.log(sql);
                    }
                    //console.log(sql);
                    mysql.dbs[config].pool.query(sql,function(err,data) {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(data);
                        }
                    });
                } catch (e) {
                    console.log(e);
                    reject(e);
                }
                
                              

                    
            }
        )

    }

    static escape(value) {
        return _mysql.escape(value);
    }

}
