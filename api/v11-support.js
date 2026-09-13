/* Additive v11 migrations and routes. Never deletes customer/account records. */
import crypto from 'crypto';
export async function initV11(pool){
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(164743010)');
    await c.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_at timestamptz;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_sales_activity_at timestamptz;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS signed_up_at timestamptz;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS completed_at timestamptz;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS gnd_system_meta(key text PRIMARY KEY,value text NOT NULL);
      INSERT INTO gnd_system_meta(key,value) VALUES('v11_tracking_started_at',now()::text) ON CONFLICT(key) DO NOTHING;
      CREATE TABLE IF NOT EXISTS lead_activity(
        id bigserial PRIMARY KEY,lead_id text NOT NULL REFERENCES leads(id),actor_id text,
        event_type text NOT NULL,from_status text,to_status text,note text,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS lead_activity_lead_date ON lead_activity(lead_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS leads_created_date ON leads(created_at DESC);
      UPDATE leads SET status=CASE status WHEN 'Installed' THEN 'Complete' WHEN 'New Referral' THEN 'New' WHEN 'Not Signed Up' THEN 'Not Interested' ELSE status END WHERE status IN ('Installed','New Referral','Not Signed Up');
      UPDATE leads SET payout_status='Not Eligible' WHERE payout_status='Not Set';
      CREATE TABLE IF NOT EXISTS partner_applications(
        id text PRIMARY KEY,business_name text NOT NULL,contact_name text,email text NOT NULL,phone text,
        partner_type text,notes text,status text NOT NULL DEFAULT 'Pending Review',created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function addActivity(db,{leadId,actorId=null,type,from=null,to=null,note='',details={}}){
  await db.query('INSERT INTO lead_activity(lead_id,actor_id,event_type,from_status,to_status,note,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[leadId,actorId,type,from,to,note,JSON.stringify(details)]);
}
export function rateLimit({maximum,windowMs}){
  const seen=new Map();let lastClean=0;
  return (req,res,next)=>{const now=Date.now();if(now-lastClean>windowMs){for(const [k,v]of seen)if(v.until<=now)seen.delete(k);lastClean=now;}
    const k=req.ip||req.socket?.remoteAddress||'unknown';let e=seen.get(k);if(!e||e.until<=now){e={count:0,until:now+windowMs};seen.set(k,e);}e.count++;
    if(e.count>maximum){res.set('Retry-After',String(Math.ceil((e.until-now)/1000)));return res.status(429).json({error:'Too many requests. Please wait and try again.'});}next();};
}
export const isDate=v=>v==null||v===''||(/^\d{4}-\d{2}-\d{2}$/.test(String(v))&&!isNaN(new Date(v))&&new Date(v).toISOString().slice(0,10)===v);
export function installV11({app,pool,auth,role,bcrypt,makeId,closed}){
  app.get('/api/admin/report-data',auth,role('admin'),async(req,res)=>{
    const [data,meta]=await Promise.all([
      pool.query(`SELECT id,status,source_type,source_code,employee_id,partner_id,provider,created_at,first_contact_at,last_sales_activity_at,signed_up_at,completed_at,status_changed_at,review_requested_at,next_follow_up,install_date,payout_amount,payout_status,payout_paid_date FROM leads ORDER BY created_at DESC`),
      pool.query("SELECT value FROM gnd_system_meta WHERE key='v11_tracking_started_at'")
    ]);
    res.json({version:11,serverTime:new Date().toISOString(),trackingStartedAt:meta.rows[0]?.value||null,leads:data.rows});
  });
  app.get('/api/leads/:id/activity',auth,role('admin','employee'),async(req,res)=>{
    const row=(await pool.query('SELECT employee_id FROM leads WHERE id=$1',[req.params.id])).rows[0];
    if(!row||(req.user.role==='employee'&&row.employee_id!==req.user.employeeId))return res.status(404).json({error:'Lead not found'});
    // Reps see only sales events, not payout/admin-audit data.
    const args=[req.params.id];const restriction=req.user.role==='employee'?" AND event_type IN ('Contacted','No Answer','Sales Update')":'';
    const q=await pool.query(`SELECT a.id,a.event_type,a.from_status,a.to_status,a.note,a.created_at,u.display_name actor_name FROM lead_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.lead_id=$1 ${restriction} ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,args);
    res.json({activity:q.rows});
  });
  app.post('/api/leads/:id/contact',auth,role('admin','employee'),async(req,res)=>{
    const b=req.body||{};if(!['Contacted','No Answer'].includes(b.outcome))return res.status(400).json({error:'Choose Contacted or No Answer'});
    if(String(b.note||'').length>4000)return res.status(400).json({error:'Please shorten the note to 4,000 characters'});
    const c=await pool.connect();try{
      await c.query('BEGIN');const row=(await c.query('SELECT * FROM leads WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!row||(req.user.role==='employee'&&row.employee_id!==req.user.employeeId)){await c.query('ROLLBACK');return res.status(404).json({error:'Lead not found'});}
      if(closed.has(row.status)){await c.query('ROLLBACK');return res.status(409).json({error:'This lead is closed. Ask Admin to reopen it first.'});}
      const q=await c.query(`UPDATE leads SET first_contact_at=CASE WHEN $2='Contacted' THEN coalesce(first_contact_at,now()) ELSE first_contact_at END,last_sales_activity_at=now(),updated_at=now(),version=version+1 WHERE id=$1 RETURNING *`,[row.id,b.outcome]);
      await addActivity(c,{leadId:row.id,actorId:req.user.sub,type:b.outcome,note:String(b.note||'').trim()});await c.query('COMMIT');res.json({lead:q.rows[0]});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  app.patch('/api/admin/accounts/:kind/:id/status',auth,role('admin'),async(req,res)=>{
    const table=req.params.kind==='employees'?'employees':req.params.kind==='partners'?'partners':null;
    if(!table)return res.status(400).json({error:'Invalid account type'});
    const state=req.body?.status;if(!['Active','Pending','Pending Approval','Paused','Inactive'].includes(state))return res.status(400).json({error:'Invalid account status'});
    const c=await pool.connect();try{await c.query('BEGIN');const q=await c.query(`UPDATE ${table} SET status=$1 WHERE id=$2 RETURNING id`,[state,req.params.id]);if(!q.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'Account not found'});}
      const col=table==='employees'?'employee_id':'partner_id';await c.query(`UPDATE users SET status=$1,token_version=token_version+1 WHERE ${col}=$2`,[state,req.params.id]);await c.query('COMMIT');res.json({ok:true});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  app.post('/api/public/partner-applications',rateLimit({maximum:20,windowMs:3600000}),async(req,res)=>{
    const b=req.body||{},name=String(b.businessName||b.business||b.name||b.company||'').trim(),email=String(b.email||'').trim();
    if(!name||!email||!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Business name and valid email are required'});
    if([name,email,b.contactName,b.phone,b.partnerType,b.notes].some(v=>String(v||'').length>4000))return res.status(400).json({error:'Please shorten the form fields'});
    const id=makeId('APP');await pool.query('INSERT INTO partner_applications(id,business_name,contact_name,email,phone,partner_type,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,name,b.contactName||[b.firstName,b.lastName].filter(Boolean).join(' '),email,b.phone||'',b.partnerType||b.type||'',b.notes||'']);res.status(201).json({ok:true,id});
  });
  app.get('/api/admin/partner-applications',auth,role('admin'),async(req,res)=>res.json({applications:(await pool.query('SELECT * FROM partner_applications ORDER BY created_at DESC')).rows}));
  app.patch('/api/admin/partner-applications/:id',auth,role('admin'),async(req,res)=>{
    const status=req.body?.status;if(!['Pending Review','Contacted','Account Created','Declined'].includes(status))return res.status(400).json({error:'Invalid application status'});
    const q=await pool.query('UPDATE partner_applications SET status=$1 WHERE id=$2 RETURNING id',[status,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Application not found'});res.json({ok:true});
  });
}
