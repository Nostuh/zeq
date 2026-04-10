import mysql_class from './classes/mysql.mjs';
import { uf } from './utils/tools.mjs';

const mysql_dbs = ['zeq'];
const mssql_dbs = [];
const dbs = {};
export default class db {
    
    static get(db_name,replace_all_on=false) {
        let db_name_stor = uf.clone(db_name);
        if ( replace_all_on ) { db_name_stor += "replaceAll";}

        if ( !dbs[db_name_stor] ) {
            //load mysql
            if ( mysql_dbs.includes(db_name) ) {
                mysql_class.load(db_name);
                let funcs = {
                    query : function(sql,params=false) { return mysql_class.query(sql,params,db_name); },
                    escape : function(value) {return mysql_class.escape(value);}
                };
                
                //override
                if (replace_all_on) {
                    funcs.query = function(sql,params=false) { return mysql_class.query(sql,params,db_name,replace_all_on); }
                }

                dbs[db_name_stor] = funcs;
            
            //load mssql
            } else if ( mssql_dbs.includes(db_name) ) {
                let funcs = {
                    query: function(sql) { return mssql_class.query(sql,db_name); }
                }
                dbs[db_name_stor] = funcs;
            } else {
                console.log("Unknown database: "+db_name);
                throw "Unknown database: "+db_name;
            }
        } 

        return dbs[db_name_stor];
    }

}