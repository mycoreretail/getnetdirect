/* GetNetDirect v11. Pure, testable reporting and alert rules; no network or storage. */
(function(root,factory){const x=factory();if(typeof module==='object'&&module.exports)module.exports=x;root.GNDInsights=x;})(globalThis,function(){
  'use strict';
  const ZONE='America/New_York';
  const CLOSED=new Set(['Complete','Not Interested','Not Serviceable','Cancelled','Void']);
  const REVIEW=new Set(['Signed Up','Install Scheduled']);
  const normal=s=>({'Installed':'Complete','New Referral':'New','Not Signed Up':'Not Interested'}[s]||s||'New');
  function validDate(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
  const formatters=new Map();
  function stamp(value,zone=ZONE){
    const d=validDate(value);if(!d)return '';
    if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
    const p=Object.fromEntries(formatters.get(zone).formatToParts(d).map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  }
  const day=(value,zone=ZONE)=>stamp(value,zone).slice(0,10);
  function dateKey(v){if(!v)return '';const s=String(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
  function dayNumber(v){const k=dateKey(v);if(!k)return NaN;return Math.floor(Date.parse(k+'T12:00:00Z')/86400000);}
  function addDays(k,n){return new Date(Date.parse(dateKey(k)+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
  function monthDays(y,m){return new Date(Date.UTC(y,m,0)).getUTCDate();}
  function shiftMonth(k,delta){const [y,m,d]=k.split('-').map(Number);const t=new Date(Date.UTC(y,m-1+delta,1));const yy=t.getUTCFullYear(),mm=t.getUTCMonth()+1;return `${yy}-${String(mm).padStart(2,'0')}-${String(Math.min(d,monthDays(yy,mm))).padStart(2,'0')}`;}
  function period(kind,asOf,zone=ZONE){
    const now=stamp(asOf,zone),k=now.slice(0,10),time=now.slice(10);if(!k)throw Error('Invalid report time');
    let currentStart,previousStart,previousEnd;
    if(kind==='day'){currentStart=k;previousStart=addDays(k,-1);previousEnd=previousStart+time;}
    else if(kind==='month'){currentStart=k.slice(0,7)+'-01';const pk=shiftMonth(k,-1);previousStart=pk.slice(0,7)+'-01';previousEnd=pk+time;}
    else if(kind==='year'){currentStart=k.slice(0,4)+'-01-01';const pk=shiftMonth(k,-12);previousStart=pk.slice(0,4)+'-01-01';previousEnd=pk+time;}
    else throw Error('Invalid comparison');
    return {currentStart:currentStart+'T00:00:00',currentEnd:now,previousStart:previousStart+'T00:00:00',previousEnd};
  }
  function read(l,camel,snake){return l[camel]??l[snake]??null;}
  function classify(l,asOf=new Date(),zone=ZONE){
    const s=normal(l.status),today=day(asOf,zone),now=+new Date(asOf);
    if(CLOSED.has(s))return {level:'closed',rank:0,reasons:[],hours:0,isNew:false,isReview:false};
    const created=validDate(read(l,'createdAt','created_at'));
    const activity=validDate(read(l,'lastSalesActivityAt','last_sales_activity_at'));
    const firstContact=validDate(read(l,'firstContactAt','first_contact_at'));
    const review=REVIEW.has(s),untouched=!activity&&!firstContact&&['New','Assigned'].includes(s);
    // Administrative edits and reassignment are deliberately not a contact/clock reset.
    let base=review?validDate(read(l,'reviewRequestedAt','review_requested_at')):activity;
    if(!base&&review)base=validDate(read(l,'statusChangedAt','status_changed_at'));
    if(!base)base=created;
    const hours=base?Math.max(0,(now-+base)/3600000):0;
    const due=dateKey(read(l,'nextFollowUp','next_follow_up'));
    const install=dateKey(read(l,'installDate','install_date'));
    const reasons=[];let rank=0;
    const push=(r,text)=>{rank=Math.max(rank,r);reasons.push(text);};
    if(!created)push(2,'Missing received date — review record');
    if(untouched)push(1,'New / no sales activity recorded');
    if(review)push(1,'Admin verification required');
    const honorFutureFollowup=!!(due&&due>today&&!untouched&&!review);
    if(!honorFutureFollowup){
      if(hours>=48)push(3,review?'48h+ awaiting admin verification':untouched?'48h+ without recorded contact':'48h+ without sales activity');
      else if(hours>=24)push(2,review?'24–48h awaiting verification':untouched?'24–48h without recorded contact':'24–48h without sales activity');
    }
    if(due&&due<today)push(dayNumber(today)-dayNumber(due)>=2?3:2,`Follow-up overdue since ${due}`);
    else if(due===today)push(1,'Follow-up due today');
    if(review&&install&&install<today)push(3,`Installation date passed (${install}) — verify outcome`);
    if(!read(l,'assignedEmployee','employee_id'))push(1,'No sales rep assigned');
    if(!due&&!review&&!untouched)push(1,'Set the next follow-up date');
    const source=read(l,'source','source_code');
    if(source&&source!=='Direct'&&!read(l,'assignedEmployee','employee_id')&&!read(l,'partnerId','partner_id')&&!l._partner&&l.source_type!=='Partner')push(2,'Referral code not linked to a team member or partner');
    return {level:rank===3?'urgent':rank===2?'warning':rank===1?'new':'ontrack',rank,reasons,hours:Math.floor(hours),isNew:untouched,isReview:review,followupOverdue:!!(due&&due<today),followupToday:due===today,unassigned:!read(l,'assignedEmployee','employee_id'),missingFollowup:!due&&!review&&!untouched};
  }
  function summarize(leads,asOf,zone=ZONE){
    const queue=leads.map(l=>({lead:l,attention:classify(l,asOf,zone)})).filter(x=>x.attention.rank>0).sort((a,b)=>b.attention.rank-a.attention.rank||b.attention.hours-a.attention.hours||String(a.lead.id).localeCompare(String(b.lead.id)));
    return {queue,new:queue.filter(x=>x.attention.isNew).length,urgent:queue.filter(x=>x.attention.level==='urgent').length,warning:queue.filter(x=>x.attention.level==='warning').length,review:queue.filter(x=>x.attention.isReview).length,overdue:queue.filter(x=>x.attention.followupOverdue).length,today:queue.filter(x=>x.attention.followupToday).length,unassigned:queue.filter(x=>x.attention.unassigned).length};
  }
  const FIELDS={leads:['createdAt','created_at'],signups:['signedUpAt','signed_up_at'],completions:['completedAt','completed_at']};
  function eventTime(l,metric){const f=FIELDS[metric];return f?read(l,...f):null;}
  function percent(a,b){return b>0?{value:(a-b)/b*100,label:`${a>=b?'+':''}${((a-b)/b*100).toFixed(1)}%`}:{value:null,label:a?'No prior baseline':'No activity'};}
  function filtered(leads,{employee='',partner='',source='all'}={}){return leads.filter(l=>(!employee||read(l,'assignedEmployee','employee_id')===employee)&&(!partner||read(l,'partnerId','partner_id')===partner)&&(source==='all'||(l.sourceType||l.source_type||'Direct')===source));}
  function compare(leads,metric,kind,asOf,zone=ZONE){
    const p=period(kind,asOf,zone);const values=leads.filter(l=>normal(l.status)!=='Void').map(l=>stamp(eventTime(l,metric),zone)).filter(Boolean);
    const current=values.filter(x=>x>=p.currentStart&&x<=p.currentEnd).length,previous=values.filter(x=>x>=p.previousStart&&x<=p.previousEnd).length;
    return {kind,...p,current,previous,change:percent(current,previous)};
  }
  function trend(leads,{start,end,grain='month',zone=ZONE,asOf=new Date()}={}){
    if(!dateKey(start)||!dateKey(end)||start>end)throw Error('Choose a valid start and end date');
    if(dayNumber(end)-dayNumber(start)>366*15)throw Error('Please select a range of 15 years or less');
    if(!['day','month','year'].includes(grain))throw Error('Invalid grouping');
    if(grain==='day'&&dayNumber(end)-dayNumber(start)>370)throw Error('Choose monthly or yearly grouping for more than 371 days');
    const cut=grain==='day'?10:grain==='month'?7:4,map=new Map();
    for(let d=start;d<=end;d=addDays(d,1)){const key=d.slice(0,cut);if(!map.has(key))map.set(key,{period:key,leads:0,signups:0,completions:0});}
    const now=+new Date(asOf);
    leads.filter(l=>normal(l.status)!=='Void').forEach(l=>Object.keys(FIELDS).forEach(m=>{const at=validDate(eventTime(l,m));if(!at||+at>now)return;const k=day(at,zone);if(k>=start&&k<=end){const row=map.get(k.slice(0,cut));if(row)row[m]++;}}));
    return [...map.values()];
  }
  function cohort(leads,start,end,zone=ZONE){
    const members=leads.filter(l=>{const k=day(eventTime(l,'leads'),zone);return normal(l.status)!=='Void'&&k&&k>=start&&k<=end;});
    const signed=members.filter(l=>['Signed Up','Install Scheduled','Complete'].includes(normal(l.status))).length,complete=members.filter(l=>normal(l.status)==='Complete').length;
    return {received:members.length,signed,complete,open:members.filter(l=>!CLOSED.has(normal(l.status))).length,completionRate:members.length?complete/members.length*100:null};
  }
  function performance(leads,kind,profiles,start,end,zone=ZONE){
    const key=kind==='employee'?['assignedEmployee','employee_id']:['partnerId','partner_id'];
    const names=new Map(profiles.map(x=>[x.id,x.name]));const groups=new Map();
    leads.forEach(l=>{const k=day(eventTime(l,'leads'),zone);if(!k||k<start||k>end||normal(l.status)==='Void')return;const id=read(l,...key)||'';if(!groups.has(id))groups.set(id,[]);groups.get(id).push(l);});
    return [...groups].map(([id,list])=>({id,name:names.get(id)||(id?'Profile '+id:kind==='employee'?'Unassigned':'No referral partner'),...cohort(list,start,end,zone)})).sort((a,b)=>b.received-a.received||a.name.localeCompare(b.name));
  }
  return {ZONE,CLOSED,REVIEW,normal,stamp,day,dateKey,addDays,shiftMonth,dayNumber,period,percent,classify,summarize,filtered,compare,trend,cohort,performance,read,eventTime};
});
