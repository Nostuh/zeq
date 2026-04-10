import { CacheFactory } from 'cachefactory';
const cacheFactory = new CacheFactory();


 class CacheService  {

    constructor(name=false,options=false) {
        this.debug = false;
        try {
            if ( name != false && options != false ) {
                this.cache = cacheFactory.createCache(name,options);
            } else {
                this.cache = cacheFactory.createCache('this_cache', {
                    // Delete items from the cache when they expire
                    deleteOnExpire: 'aggressive',
                 
                    // Check for expired items every 60 seconds
                    recycleFreq: 60 * 1000,
                    // max age -- 30 mins
                    maxAge: 30 * 60 * 1000
                });
            }
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    async get( name, callback ) {
        if (this.debug) {console.log("CACHE GET: "+name);};

        let return_data = this.cache.get( name );
        
        // no data mon!
        if ( typeof return_data == "undefined" && typeof callback != "undefined"  ) {
            if (this.debug) {console.log('CACHE EMPTY: '+name);};
            let callback_data = await callback()
            this.set( name, callback_data );
            return callback_data;
        }

        return return_data;
    }
    
    set( name, data ) {
        if (this.debug) {console.log("CACHE SET: "+name);};
        this.cache.put( name, data );
    }

    remove( name ) {
        if (this.debug) {console.log("CACHE REMOVE: "+name);};
        this.cache.remove( name );
    }
    
    show() {
        console.log( this.cache.info() );
        return this.cache.info();
    }

    debug() {
        this.debug = true;
    }

    /**
    * @type Class
    */
    new_cache (name,options) {
        return new CacheService(name,options);
    }
}

//module.exports = { CacheService };
export { CacheService };