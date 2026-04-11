import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
const router = express.Router();
import dbs from '../../db.mjs';

const zeq = dbs.get('zeq');

// Legacy equipment-page login. Reads bcrypt from password_hash if
// present; otherwise falls back to the old md5 column and, on a
// successful match, rewrites to bcrypt (same transparent upgrade as
// auth.mjs). Response shape is unchanged so the old Equipment.vue
// flow keeps working. New Equipment logins should migrate to
// /api/auth/login over time.
router.post('/login', async function(req, res) {
    try {
        const email = (req.body && req.body.email) || '';
        const password = (req.body && req.body.password) || '';
        if (!email || !password) return res.send(false);
        const rows = await zeq.query(
            `select id, name, password, password_hash, active from users where name = @email`,
            { email });
        if (rows.length !== 1) return res.send(false);
        const u = rows[0];
        if (!u.active) return res.send(false);

        let ok = false;
        if (u.password_hash) {
            ok = await bcrypt.compare(password, u.password_hash);
        } else if (u.password) {
            const md5 = crypto.createHash('md5').update(password).digest('hex');
            if (md5 === u.password) {
                ok = true;
                // Transparent upgrade to bcrypt on first successful login.
                const newHash = await bcrypt.hash(password, 10);
                await zeq.query(
                    `update users set password_hash = @h where id = @id`,
                    { h: newHash, id: u.id });
            }
        }
        if (!ok) return res.send(false);

        await zeq.query(`update users set last_login = now() where id = @id`, { id: u.id });
        // Preserve the legacy response shape (entire row, minus the
        // password columns so they never leak to the client).
        delete u.password;
        delete u.password_hash;
        res.send(u);
    } catch (e) {
        console.error('[eq/login]', e);
        res.send(false);
    }
});

router.post('/kya', async function(req,res,next) {
    let payload = req.body;
	console.log(payload);
    if ( payload.info != "" && payload.pw == "zork" ) {
	let sql = `insert into kya_info (info) values (@info)`;
	await zeq.query(sql,payload);
	res.send('done');
    } else {
	   
    res.send('fail');
    }
});

router.get('/version', async function(req,res,next) {
    res.send('7');
});

router.post('/copy_to_user', async function(req,res,next) {
    let payload = req.body;
    let sql = `select * from eq where id = @id`;
    let eq = await zeq.query(sql,payload);
    eq = eq[0];
    eq.user_id = payload.user_id;
    eq.item_info = eq.info;
    await do_add(eq);
    res.send('done');
});

router.post('/add', async function(req,res,next) {
    let item_info = req.body;
    await do_add(item_info);
    
    res.send('done');
});

async function do_add(item_info) {
    let sql = `insert into eq (info,note,slot,eqmob,user_id) values (@item_info,@note,@slot,@eqmob,@user_id)`;
    await zeq.query(sql,item_info);
}

router.post('/add-mob', async function(req,res,next) {
    let payload = req.body;
    let sql = `insert into eqmobs (name) values (@name)`;
    await zeq.query(sql,payload);
    res.send('done');
});

router.post('/eq', async function(req,res,next) {
    let sql;
    if ( req.body.user_id == "all" ) {
        sql = `
        select e.*,ee.name as eqmob_name
        from eq as e 
        left join eqmobs as ee on e.eqmob = ee.id
    `;
    } else {
        sql = `
        select e.*,ee.name as eqmob_name
        from eq as e 
        left join eqmobs as ee on e.eqmob = ee.id
        where e.user_id = @user_id
    `;
    }
    
    let data = await zeq.query(sql,req.body);
    res.send(data);
});

router.get('/eq-mobs', async function(req,res,next) {
    let sql = `select * from eqmobs`;
    let data = await zeq.query(sql);
    res.send(data);
});


export const eq = router;
