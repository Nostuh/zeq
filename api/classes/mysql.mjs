import _mysql from 'mysql';
import connection_config from './config.json' with { type: "json" };
import { uf } from '../utils/tools.mjs';

export default class mysql {
    static dbs = {};

    static load(connection_name) {
        try {
            let config = connection_config[connection_name];
            config.port = 3306;
            // CRITICAL: force utf8mb4 on the driver connection. The `mysql`
            // package defaults to 3-byte `utf8` which cannot round-trip
            // 4-byte codepoints (emoji, astral-plane characters). Any
            // INSERT with a 4-byte char into a utf8mb4 column fails with
            // ER_TRUNCATED_WRONG_VALUE_FOR_FIELD. See docs/gotchas.md.
            config.charset = 'utf8mb4';
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
                        // Always use replaceAll. Using `.replace()` only
                        // substitutes the first occurrence, which silently
                        // breaks any query that references the same @name
                        // placeholder twice AND allows a pathological case
                        // where a value containing `@otherparam` gets
                        // substituted-through by the next iteration. See
                        // docs/bug-workflow.md punch list item #3.
                        uf.dloop(vars,function(i,v) {
                            sql = sql.replaceAll('@' + i, that.escape(v));
                        });
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
