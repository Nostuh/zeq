import config from './classes/config.json' with { type: "json" };
import express from 'express';
import { globSync } from 'glob';
import bodyParser from 'body-parser';
import { bootstrapFirstAdmin } from './rest/api/auth.mjs';
const router = express.Router();

const app = express();
const port = config['api']['listen_port'];


try {
    //logger.set_logging();
    app.use(bodyParser.urlencoded({limit:'200mb',extended: false}));
    app.use(express.json({limit: '200mb'}));

    // Request logging: one line per request to stdout so admins can
    // watch traffic live with `pm2 logs` / `pm2 monit`. Fires on the
    // response's `finish` event so we get the final status and full
    // latency. Intentionally NOT persisted to the DB — the request
    // stream is high-volume and we already have pm2 log rotation.
    app.use(function requestLogger(req, res, next) {
        const start = Date.now();
        res.on('finish', function () {
            const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim() || '-';
            const path = req.originalUrl || req.url || '';
            const ms = Date.now() - start;
            console.log(`[req] ${req.method} ${path} ${res.statusCode} ${ms}ms ${ip}`);
        });
        next();
    });

    // Dynamically get all endpoints
    console.log(process.cwd());
    let rest = globSync(process.cwd()+'/rest/*/*.mjs');
    load_found_paths(rest);

    // local code if exists so that I don't push my testing stuff to git
    if ( typeof config['api']['env'] != "undefined" && config['api']['env'] == "doug" ) {
        rest = globSync(process.cwd()+'/doug/rest/*.mjs');
        load_found_paths(rest);
    }

} catch (e) {
    console.log('api.js had error!');
}

app.listen(port, async () => {
    console.log('listening at http://localhost:'+port);
    await bootstrapFirstAdmin();
});

export const handler = app;

function load_found_paths(rest) {
    for( let i of rest ) {
        let base = basename(i,"/");
        let name = strip_extension(base);
         console.log(base);
         console.log(name);
        console.log(i);
        load_file(i,name,app);
    }
}

async function load_file(path,name,app) {
    path = path;
    console.log(path);
    let load_me = await import(path /* @vite-ignore */);
    app.use('/api/'+name,load_me[name]);
}


//https://stackoverflow.com/questions/3820381/need-a-basename-function-in-javascript
function basename(str, sep) {
    return str.substr(str.lastIndexOf(sep) + 1);
}

function strip_extension(str) {
    return str.substr(0,str.lastIndexOf('.'));
}
