import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import crypto from 'crypto';
import {initV11,installV11,addActivity,rateLimit,isDate} from './v11-support.js';

const {Pool}=pg;
// Preserve PostgreSQL DATE values as calendar dates for HTML date controls.
pg.types.setTypeParser(1082,value=>value);
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
// Express 4 needs explicit forwarding of rejected async handlers.
for(const method of ['get','post','patch']){
  const register=app[method].bind(app);
  app[method]=(path,...handlers)=>handlers.length?register(path,...handlers.map(fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next))):register(path);
}
app.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET;
if(!process.env.DATABASE_URL||!JWT_SECRET)throw new Error('DATABASE_URL and JWT_SECRET must be configured in Railway variables');
const allowedOrigins=new Set([
  'https://getnetdirect.com','https://www.getnetdirect.com',
  'https://mycoreretail.github.io','https://getnetdirect-production.up.railway.app'
]);
app.use(cors({origin:(origin,cb)=>{
  if(!origin||allowedOrigins.has(origin)) return cb(null,true);
  const error=new Error('Origin not allowed');error.status=403;cb(error);
}}));
app.use(express.json({limit:'1mb'}));

const LEAD_STATUSES=['New','Assigned','Contacted','Follow-Up','Pending Customer','Qualified','Signed Up','Install Scheduled','Complete','Not Interested','Unable to Reach','Not Serviceable','Cancelled','Void'];
const PAYOUT_STATUSES=['Not Eligible','Pending','Approved','Paid','Void'];
const EMPLOYEE_EDIT_STATUSES=['Contacted','Follow-Up','Pending Customer','Qualified','Signed Up','Install Scheduled','Not Interested','Unable to Reach'];
const makeId=(p)=>`${p}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const cleanCode=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');

async function init(){
  await pool.query(`
  CREATE TABLE IF NOT EXISTS employees(
    id text PRIMARY KEY,name text NOT NULL,email text,phone text,role text NOT NULL DEFAULT 'Employee Sales Rep',code text UNIQUE NOT NULL,status text NOT NULL DEFAULT 'Active',created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS partners(
    id text PRIMARY KEY,name text NOT NULL,contact_name text,email text,phone text,partner_type text NOT NULL DEFAULT 'Referral Partner',code text UNIQUE NOT NULL,status text NOT NULL DEFAULT 'Active',created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS users(
    id text PRIMARY KEY,username text UNIQUE NOT NULL,password_hash text NOT NULL,role text NOT NULL,display_name text NOT NULL,employee_id text REFERENCES employees(id) ON DELETE SET NULL,partner_id text REFERENCES partners(id) ON DELETE SET NULL,status text NOT NULL DEFAULT 'Active',created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS leads(
    id text PRIMARY KEY,first_name text,last_name text,phone text NOT NULL,email text,address text,unit text,city text,state text,zip text,services jsonb NOT NULL DEFAULT '[]'::jsonb,current_provider text,move_in date,contact_time text,notes text,
    source_code text,source_type text NOT NULL DEFAULT 'Direct',employee_id text REFERENCES employees(id) ON DELETE SET NULL,partner_id text REFERENCES partners(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'New',priority text NOT NULL DEFAULT 'Normal',next_follow_up date,provider text,order_number text,install_date date,internal_notes text,
    payout_amount numeric(12,2) NOT NULL DEFAULT 0,payout_status text NOT NULL DEFAULT 'Not Eligible',payout_paid_date date,payout_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS leads_employee_idx ON leads(employee_id);
  CREATE INDEX IF NOT EXISTS leads_partner_idx ON leads(partner_id);
  CREATE INDEX IF NOT EXISTS leads_source_idx ON leads(source_code);
  `);
  await initV11(pool);
  const adminUser=String(process.env.ADMIN_USERNAME||'admin').trim().toLowerCase();
  const adminPass=process.env.ADMIN_PASSWORD;
  if(adminPass){
    const existing=await pool.query('SELECT id FROM users WHERE username=$1',[adminUser]);
    const hash=await bcrypt.hash(adminPass,12);
    if(!existing.rowCount){
      await pool.query('INSERT INTO users(id,username,password_hash,role,display_name) VALUES($1,$2,$3,$4,$5)',[makeId('USR'),adminUser,hash,'admin','GetNetDirect Admin']);
    } // Seed only once: a redeploy must not overwrite an existing account/password.
  }
}

function tokenFor(u){return jwt.sign({sub:u.id,role:u.role,employeeId:u.employee_id||null,partnerId:u.partner_id||null,name:u.display_name,username:u.username,ver:u.token_version||1},JWT_SECRET,{expiresIn:'12h'});}
async function auth(req,res,next){
  const raw=req.headers.authorization||'',t=raw.startsWith('Bearer ')?raw.slice(7):'';
  let claims;try{claims=jwt.verify(t,JWT_SECRET,{algorithms:['HS256']});}catch{return res.status(401).json({error:'Login required'});}
  const q=await pool.query(`SELECT u.*,e.status employee_status,p.status partner_status,e.code employee_code,p.code partner_code FROM users u LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN partners p ON p.id=u.partner_id WHERE u.id=$1`,[claims.sub]);
  const u=q.rows[0];
  if(!u||u.status!=='Active'||!['admin','employee','partner'].includes(u.role)||(claims.ver||1)!==(u.token_version||1)||(u.role==='employee'&&(!u.employee_id||u.employee_status!=='Active'))||(u.role==='partner'&&(!u.partner_id||u.partner_status!=='Active')))return res.status(401).json({error:'Your account is not active or your session changed. Please sign in again.'});
  req.user={sub:u.id,id:u.id,role:u.role,employeeId:u.employee_id,partnerId:u.partner_id,name:u.display_name,username:u.username,employeeCode:u.employee_code||'',partnerCode:u.partner_code||''};next();
}
function role(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Not allowed'});}

app.get('/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,version:11,serverTime:new Date().toISOString()});}catch(e){res.status(503).json({ok:false,error:'Database unavailable'});}});
app.post('/auth/login',rateLimit({maximum:15,windowMs:15*60000}),async(req,res)=>{
  const {username,password}=req.body||{};
  if(typeof username!=='string'||typeof password!=='string'||username.length>120||password.length>200)return res.status(400).json({error:'Invalid credentials'});
  const q=await pool.query(`SELECT u.*,e.code employee_code,p.code partner_code,e.status employee_status,p.status partner_status FROM users u LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN partners p ON p.id=u.partner_id WHERE lower(u.username)=lower($1) AND u.status=$2`,[String(username||''),'Active']);
  const u=q.rows[0]; if(!u||(u.role==='employee'&&u.employee_status!=='Active')||(u.role==='partner'&&u.partner_status!=='Active')||!(await bcrypt.compare(String(password||''),u.password_hash))) return res.status(401).json({error:'Invalid username or password'});
  res.json({token:tokenFor(u),user:{id:u.id,username:u.username,role:u.role,name:u.display_name,employeeId:u.employee_id,partnerId:u.partner_id,employeeCode:u.employee_code||'',partnerCode:u.partner_code||''}});
});
app.get('/auth/me',auth,(req,res)=>res.json({user:req.user}));

app.post('/api/public/leads',rateLimit({maximum:60,windowMs:3600000}),async(req,res)=>{
  const b=req.body||{}; if(!b.firstName||!b.phone) return res.status(400).json({error:'First name and phone are required'});
  if(typeof b.firstName!=='string'||typeof b.phone!=='string'||b.firstName.length>120||b.phone.replace(/\D/g,'').length<7||b.phone.length>40)return res.status(400).json({error:'Enter a valid customer name and phone number'});
  if(!isDate(b.moveIn))return res.status(400).json({error:'Enter a valid move-in date'});
  if(Object.values(b).some(v=>typeof v==='string'&&v.length>8000))return res.status(400).json({error:'A form field is too long'});
  const code=cleanCode(b.referralCode||b.source||'');
  let employeeId=null,partnerId=null,sourceType='Direct',payout='Not Eligible';
  if(code){
    const [e,p]=await Promise.all([pool.query('SELECT id FROM employees WHERE code=$1 AND status=$2',[code,'Active']),pool.query('SELECT id FROM partners WHERE code=$1 AND status=$2',[code,'Active'])]);
    if(e.rowCount){employeeId=e.rows[0].id;sourceType='Employee';}
    else if(p.rowCount){partnerId=p.rows[0].id;sourceType='Partner';payout='Pending';}
  }
  const id=makeId('GND');
  const services=Array.isArray(b.services)?b.services:(b.services?[b.services]:(b.service?[b.service]:[]));
  if(services.length>10||services.some(x=>typeof x!=='string'||x.length>80))return res.status(400).json({error:'Invalid services selection'});
  const q=await pool.query(`INSERT INTO leads(id,first_name,last_name,phone,email,address,unit,city,state,zip,services,current_provider,move_in,contact_time,notes,source_code,source_type,employee_id,partner_id,status,payout_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,'New',$20) RETURNING id,status,created_at`,
    [id,b.firstName,b.lastName||'',b.phone,b.email||'',b.address||'',b.unit||'',b.city||'',b.state||'',b.zip||'',JSON.stringify(services),b.currentProvider||'',b.moveIn||null,b.contactTime||'',b.notes||'',code||null,sourceType,employeeId,partnerId,payout]);
  res.status(201).json({ok:true,lead:q.rows[0]});
});

app.get('/api/leads',auth,async(req,res)=>{
  let where='',args=[];
  if(req.user.role==='employee'){where='WHERE l.employee_id=$1';args=[req.user.employeeId];}
  if(req.user.role==='partner'){where='WHERE l.partner_id=$1';args=[req.user.partnerId];}
  const q=await pool.query(`SELECT l.*,e.name employee_name,e.code employee_code,p.name partner_name,p.code partner_code FROM leads l LEFT JOIN employees e ON e.id=l.employee_id LEFT JOIN partners p ON p.id=l.partner_id ${where} ORDER BY l.created_at DESC`,args);
  const rows=q.rows.map(r=>req.user.role==='partner'?{id:r.id,first_name:r.first_name,last_name:r.last_name,phone:r.phone,email:r.email,address:r.address,city:r.city,state:r.state,zip:r.zip,services:r.services,status:r.status,move_in:r.move_in,payout_amount:r.payout_amount,payout_status:r.payout_status,payout_paid_date:r.payout_paid_date,payout_reference:r.payout_reference,created_at:r.created_at}:r);
  res.json({leads:rows,version:11,serverTime:new Date().toISOString()});
});

const FINAL_STATUSES=new Set(['Complete','Not Serviceable','Cancelled','Void']);
app.patch('/api/leads/:id',auth,role('admin','employee'),async(req,res)=>{
  const id=req.params.id,b=req.body||{},admin=req.user.role==='admin';
  const map={employeeId:'employee_id',status:'status',priority:'priority',nextFollowUp:'next_follow_up',provider:'provider',orderNumber:'order_number',installDate:'install_date',internalNotes:'internal_notes',payoutAmount:'payout_amount',payoutStatus:'payout_status',payoutPaidDate:'payout_paid_date',payoutReference:'payout_reference'};
  const allowed=admin?new Set(Object.values(map)):new Set(['status','next_follow_up','provider','order_number','install_date','internal_notes']);
  const changes={};
  for(const [k,v]of Object.entries(b)){if(k==='expectedVersion')continue;const col=map[k]||k;if(!allowed.has(col))return res.status(403).json({error:'You cannot edit '+k});if(col in changes)return res.status(400).json({error:'Duplicate field'});changes[col]=v;}
  if(!Object.keys(changes).length)return res.status(400).json({error:'No changes provided'});
  if(changes.status!==undefined&&(!LEAD_STATUSES.includes(changes.status)||(!admin&&!EMPLOYEE_EDIT_STATUSES.includes(changes.status))))return res.status(admin?400:403).json({error:'Only Admin can set that outcome'});
  if(changes.payout_status!==undefined&&!PAYOUT_STATUSES.includes(changes.payout_status))return res.status(400).json({error:'Invalid payout status'});
  if(changes.priority!==undefined&&!['Normal','High','Urgent'].includes(changes.priority))return res.status(400).json({error:'Invalid priority'});
  for(const key of ['next_follow_up','install_date','payout_paid_date'])if(!isDate(changes[key]))return res.status(400).json({error:'Invalid date for '+key});
  if('payout_amount'in changes&&(!Number.isFinite(Number(changes.payout_amount))||Number(changes.payout_amount)<0||Number(changes.payout_amount)>9999999999))return res.status(400).json({error:'Enter a valid non-negative payout amount'});
  if(Object.values(changes).some(v=>typeof v==='string'&&v.length>16000))return res.status(400).json({error:'A field is too long'});
  const c=await pool.connect();try{
    await c.query('BEGIN');const cur=(await c.query('SELECT * FROM leads WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!cur||(!admin&&cur.employee_id!==req.user.employeeId)){await c.query('ROLLBACK');return res.status(404).json({error:'Lead not found'});}
    if(!admin&&FINAL_STATUSES.has(cur.status)){await c.query('ROLLBACK');return res.status(403).json({error:'This final outcome is locked. Ask Admin to reopen the lead.'});}
    if(b.expectedVersion!==undefined&&Number(b.expectedVersion)!==cur.version){await c.query('ROLLBACK');return res.status(409).json({error:'Someone updated this lead while you were editing. Reload it before saving.'});}
    if(changes.employee_id){const rep=(await c.query("SELECT id FROM employees WHERE id=$1 AND status='Active'",[changes.employee_id])).rows[0];if(!rep){await c.query('ROLLBACK');return res.status(400).json({error:'Choose an active sales rep'});}}
    const requestedStatus=changes.status||cur.status,payState=changes.payout_status||cur.payout_status;
    if(['Approved','Paid'].includes(payState)&&payState!==cur.payout_status){
      if(!cur.partner_id||requestedStatus!=='Complete'){await c.query('ROLLBACK');return res.status(400).json({error:'Verify the partner referral as Complete before approving or paying its commission.'});}
      if(Number(changes.payout_amount??cur.payout_amount)<=0){await c.query('ROLLBACK');return res.status(400).json({error:'Enter a payout amount before approving or paying'});}
      if(payState==='Paid'&&(!(changes.payout_paid_date||cur.payout_paid_date)||!(changes.payout_reference||cur.payout_reference))){await c.query('ROLLBACK');return res.status(400).json({error:'Record both paid date and payment reference'});}
    }
    const sets=[],values=[],changed=[];
    for(const [col,input]of Object.entries(changes)){
      let v=input;if(['next_follow_up','install_date','payout_paid_date','employee_id'].includes(col)&&v==='')v=null;
      if(col==='payout_amount')v=Number(v);
      if(String(cur[col]??'')===String(v??''))continue;
      values.push(v);sets.push(`${col}=$${values.length}`);changed.push(col);
    }
    if(!changed.length){await c.query('COMMIT');return res.json({lead:cur});}
    const statusChanged=changed.includes('status');
    if(statusChanged){sets.push('status_changed_at=now()');if(['Contacted','Qualified','Signed Up','Install Scheduled'].includes(requestedStatus))sets.push('first_contact_at=coalesce(first_contact_at,now())');
      if(['Signed Up','Install Scheduled'].includes(requestedStatus))sets.push('signed_up_at=coalesce(signed_up_at,now())');
      if(requestedStatus==='Complete')sets.push('completed_at=coalesce(completed_at,now())');
    }
    const salesWork=changed.some(k=>['status','provider','order_number','install_date','internal_notes'].includes(k));
    if(salesWork&&(!admin||statusChanged&&EMPLOYEE_EDIT_STATUSES.includes(requestedStatus)))sets.push('last_sales_activity_at=now()');
    if(['Signed Up','Install Scheduled'].includes(requestedStatus)&&(statusChanged||changed.some(k=>['provider','order_number','install_date'].includes(k))))sets.push('review_requested_at=now()');
    values.push(id);const q=await c.query(`UPDATE leads SET ${sets.join(',')},updated_at=now(),version=version+1 WHERE id=$${values.length} RETURNING *`,values);
    await addActivity(c,{leadId:id,actorId:req.user.sub,type:admin?'Admin Update':'Sales Update',from:cur.status,to:requestedStatus,details:{fields:changed}});
    await c.query('COMMIT');res.json({lead:q.rows[0]});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
});

app.get('/api/employees',auth,role('admin'),async(req,res)=>res.json({employees:(await pool.query('SELECT * FROM employees ORDER BY created_at DESC')).rows}));
app.get('/api/partners',auth,role('admin'),async(req,res)=>res.json({partners:(await pool.query('SELECT * FROM partners ORDER BY created_at DESC')).rows}));

app.post('/api/admin/employees',auth,role('admin'),async(req,res)=>{
  const b=req.body||{};if(!b.name||!b.email||!b.username||!b.password)return res.status(400).json({error:'Name, email, username and password required'});
  if(typeof b.password!=='string'||b.password.length<8||Buffer.byteLength(b.password)>72||!/^\S{3,80}$/.test(String(b.username||'')))return res.status(400).json({error:'Use a 3–80 character username and an 8–72 byte password'});
  if(!['Active','Pending','Pending Approval','Paused','Inactive'].includes(b.status||'Active'))return res.status(400).json({error:'Invalid account status'});
  b.username=b.username.trim().toLowerCase();
  const code=cleanCode(b.code)||`SR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;const eid=makeId('EMP');
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(164743011)');const exists=await client.query('SELECT id FROM employees WHERE code=$1 UNION ALL SELECT id FROM partners WHERE code=$1 UNION ALL SELECT id FROM users WHERE lower(username)=lower($2)',[code,b.username]);if(exists.rowCount)throw Object.assign(new Error('Duplicate code or username'),{code:'23505'});await client.query('INSERT INTO employees(id,name,email,phone,role,code,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[eid,b.name,b.email,b.phone||'',b.role||'Employee Sales Rep',code,b.status||'Active']);const hash=await bcrypt.hash(b.password,12);await client.query('INSERT INTO users(id,username,password_hash,role,display_name,employee_id,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[makeId('USR'),b.username,hash,'employee',b.name,eid,b.status||'Active']);await client.query('COMMIT');res.status(201).json({employee:{id:eid,name:b.name,code}});}catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.code==='23505'?'Username or code already exists':'Could not create the account. Please try again.'});}finally{client.release();}
});
app.post('/api/admin/partners',auth,role('admin'),async(req,res)=>{
  const b=req.body||{};if(!b.name||!b.email||!b.username||!b.password)return res.status(400).json({error:'Business name, email, username and password required'});
  if(typeof b.password!=='string'||b.password.length<8||Buffer.byteLength(b.password)>72||!/^\S{3,80}$/.test(String(b.username||'')))return res.status(400).json({error:'Use a 3–80 character username and an 8–72 byte password'});
  if(!['Active','Pending','Pending Approval','Paused','Inactive'].includes(b.status||'Active'))return res.status(400).json({error:'Invalid account status'});
  b.username=b.username.trim().toLowerCase();
  const code=cleanCode(b.code)||`PR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;const pid=makeId('PAR');
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(164743011)');const exists=await client.query('SELECT id FROM employees WHERE code=$1 UNION ALL SELECT id FROM partners WHERE code=$1 UNION ALL SELECT id FROM users WHERE lower(username)=lower($2)',[code,b.username]);if(exists.rowCount)throw Object.assign(new Error('Duplicate code or username'),{code:'23505'});await client.query('INSERT INTO partners(id,name,contact_name,email,phone,partner_type,code,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pid,b.name,b.contactName||'',b.email,b.phone||'',b.partnerType||'Referral Partner',code,b.status||'Active']);const hash=await bcrypt.hash(b.password,12);await client.query('INSERT INTO users(id,username,password_hash,role,display_name,partner_id,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[makeId('USR'),b.username,hash,'partner',b.name,pid,b.status||'Active']);await client.query('COMMIT');res.status(201).json({partner:{id:pid,name:b.name,code}});}catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.code==='23505'?'Username or code already exists':'Could not create the account. Please try again.'});}finally{client.release();}
});


installV11({app,pool,auth,role,bcrypt,makeId,closed:new Set(['Complete','Cancelled','Void','Not Serviceable','Not Interested'])});
app.use((err,req,res,next)=>{
  console.error('API request failed',{code:err.code||'REQUEST_ERROR',route:req.path});
  if(res.headersSent)return next(err);
  const status=err.status||(['22007','22008','23503','22P02'].includes(err.code)?400:500);
  res.status(status).json({error:status===400?'Invalid value. Check your dates and selections.':status===403?'Origin not allowed':'The server could not save this request. Please retry.'});
});
init().then(()=>{app.listen(PORT,()=>console.log(`GetNetDirect API v11 listening on ${PORT}; database initialized`));}).catch(e=>{console.error('Database startup failed',e.code||e.message);process.exit(1);});
