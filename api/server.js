import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import crypto from 'crypto';

const {Pool}=pg;
const app=express();
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||crypto.randomBytes(32).toString('hex');
const allowedOrigins=new Set([
  'https://getnetdirect.com','https://www.getnetdirect.com',
  'https://mycoreretail.github.io'
]);
app.use(cors({origin:(origin,cb)=>{
  if(!origin||allowedOrigins.has(origin)||origin.startsWith('https://mycoreretail.github.io')) return cb(null,true);
  cb(new Error('Origin not allowed'));
}}));
app.use(express.json({limit:'1mb'}));

const LEAD_STATUSES=['New','Assigned','Contacted','Follow-Up','Pending Customer','Qualified','Signed Up','Install Scheduled','Complete','Not Interested','Unable to Reach','Not Serviceable','Cancelled','Void'];
const PAYOUT_STATUSES=['Not Eligible','Pending','Approved','Paid','Void'];
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
  const adminUser=process.env.ADMIN_USERNAME||'admin';
  const adminPass=process.env.ADMIN_PASSWORD;
  if(adminPass){
    const existing=await pool.query('SELECT 1 FROM users WHERE username=$1',[adminUser]);
    if(!existing.rowCount){
      const hash=await bcrypt.hash(adminPass,12);
      await pool.query('INSERT INTO users(id,username,password_hash,role,display_name) VALUES($1,$2,$3,$4,$5)',[makeId('USR'),adminUser,hash,'admin','GetNetDirect Admin']);
    }
  }
}

function tokenFor(u){return jwt.sign({sub:u.id,role:u.role,employeeId:u.employee_id||null,partnerId:u.partner_id||null,name:u.display_name,username:u.username},JWT_SECRET,{expiresIn:'12h'});}
function auth(req,res,next){
  const raw=req.headers.authorization||''; const t=raw.startsWith('Bearer ')?raw.slice(7):'';
  try{req.user=jwt.verify(t,JWT_SECRET);next();}catch{res.status(401).json({error:'Login required'});}
}
function role(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Not allowed'});}

app.get('/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.post('/auth/login',async(req,res)=>{
  const {username,password}=req.body||{};
  const q=await pool.query('SELECT * FROM users WHERE lower(username)=lower($1) AND status=$2',[String(username||''),'Active']);
  const u=q.rows[0]; if(!u||!(await bcrypt.compare(String(password||''),u.password_hash))) return res.status(401).json({error:'Invalid username or password'});
  res.json({token:tokenFor(u),user:{id:u.id,username:u.username,role:u.role,name:u.display_name,employeeId:u.employee_id,partnerId:u.partner_id}});
});
app.get('/auth/me',auth,(req,res)=>res.json({user:req.user}));

app.post('/api/public/leads',async(req,res)=>{
  const b=req.body||{}; if(!b.firstName||!b.phone) return res.status(400).json({error:'First name and phone are required'});
  const code=cleanCode(b.referralCode||b.source||'');
  let employeeId=null,partnerId=null,sourceType='Direct',payout='Not Eligible';
  if(code){
    const [e,p]=await Promise.all([pool.query('SELECT id FROM employees WHERE code=$1 AND status<>$2',[code,'Inactive']),pool.query('SELECT id FROM partners WHERE code=$1 AND status<>$2',[code,'Inactive'])]);
    if(e.rowCount){employeeId=e.rows[0].id;sourceType='Employee';}
    else if(p.rowCount){partnerId=p.rows[0].id;sourceType='Partner';payout='Pending';}
  }
  const id=makeId('GND');
  const services=Array.isArray(b.services)?b.services:(b.service?[b.service]:[]);
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
  res.json({leads:rows});
});

app.patch('/api/leads/:id',auth,async(req,res)=>{
  const id=req.params.id,b=req.body||{};
  const cur=(await pool.query('SELECT * FROM leads WHERE id=$1',[id])).rows[0]; if(!cur)return res.status(404).json({error:'Lead not found'});
  if(req.user.role==='employee'&&cur.employee_id!==req.user.employeeId)return res.status(403).json({error:'Not allowed'});
  if(req.user.role==='partner')return res.status(403).json({error:'Partners cannot edit lead records'});
  const allowed=req.user.role==='admin'?['employee_id','status','priority','next_follow_up','provider','order_number','install_date','internal_notes','payout_amount','payout_status','payout_paid_date','payout_reference']:['status','next_follow_up','provider','order_number','install_date','internal_notes'];
  const map={employeeId:'employee_id',status:'status',priority:'priority',nextFollowUp:'next_follow_up',provider:'provider',orderNumber:'order_number',installDate:'install_date',internalNotes:'internal_notes',payoutAmount:'payout_amount',payoutStatus:'payout_status',payoutPaidDate:'payout_paid_date',payoutReference:'payout_reference'};
  const sets=[],vals=[]; for(const [k,v] of Object.entries(b)){const col=map[k]||k;if(allowed.includes(col)){vals.push(v===''?null:v);sets.push(`${col}=$${vals.length}`)}}
  if(!sets.length)return res.status(400).json({error:'No valid updates'});
  vals.push(id); const q=await pool.query(`UPDATE leads SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length} RETURNING *`,vals);res.json({lead:q.rows[0]});
});

app.get('/api/employees',auth,role('admin'),async(req,res)=>res.json({employees:(await pool.query('SELECT * FROM employees ORDER BY created_at DESC')).rows}));
app.get('/api/partners',auth,role('admin'),async(req,res)=>res.json({partners:(await pool.query('SELECT * FROM partners ORDER BY created_at DESC')).rows}));

app.post('/api/admin/employees',auth,role('admin'),async(req,res)=>{
  const b=req.body||{};if(!b.name||!b.email||!b.username||!b.password)return res.status(400).json({error:'Name, email, username and password required'});
  const code=cleanCode(b.code)||`SR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;const eid=makeId('EMP');
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO employees(id,name,email,phone,role,code,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[eid,b.name,b.email,b.phone||'',b.role||'Employee Sales Rep',code,b.status||'Active']);const hash=await bcrypt.hash(b.password,12);await client.query('INSERT INTO users(id,username,password_hash,role,display_name,employee_id,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[makeId('USR'),b.username,hash,'employee',b.name,eid,b.status==='Inactive'?'Inactive':'Active']);await client.query('COMMIT');res.status(201).json({employee:{id:eid,name:b.name,code}});}catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.code==='23505'?'Username or code already exists':e.message});}finally{client.release();}
});
app.post('/api/admin/partners',auth,role('admin'),async(req,res)=>{
  const b=req.body||{};if(!b.name||!b.email||!b.username||!b.password)return res.status(400).json({error:'Business name, email, username and password required'});
  const code=cleanCode(b.code)||`PR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;const pid=makeId('PAR');
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO partners(id,name,contact_name,email,phone,partner_type,code,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pid,b.name,b.contactName||'',b.email,b.phone||'',b.partnerType||'Referral Partner',code,b.status||'Active']);const hash=await bcrypt.hash(b.password,12);await client.query('INSERT INTO users(id,username,password_hash,role,display_name,partner_id,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[makeId('USR'),b.username,hash,'partner',b.name,pid,b.status==='Inactive'?'Inactive':'Active']);await client.query('COMMIT');res.status(201).json({partner:{id:pid,name:b.name,code}});}catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.code==='23505'?'Username or code already exists':e.message});}finally{client.release();}
});

app.listen(PORT,()=>{console.log(`GetNetDirect API listening on ${PORT}`)});
init().then(()=>console.log('Database initialized')).catch(e=>{console.error(e);process.exit(1)});
