import express from 'express';
import crypto from 'crypto';
const router = express.Router();
import dbs from '../../db.mjs';

const zeq = dbs.get('zeq');

router.post('/login', async function(req,res,next) {
    let payload = req.body;
    payload.password = crypto.createHash('md5').update(payload.password).copy().digest('hex');
    let resp = await zeq.query(`select * from users as u where name = @email and password = @password`,payload);
    if ( resp.length < 1 || resp.length > 1 ) { res.send(false); } else {
        await zeq.query(`update users set last_login = now() where name = @email and password = @password`,payload);
        res.send(resp[0]);
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
