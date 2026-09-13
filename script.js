(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  const STORE_DIRECT='gnd_customer_leads';
  const STORE_REF='gnd_partner_referrals';
  const STORE_EMP='gnd_employees';
  const STORE_PARTNERS='gnd_partners';

  const LEAD_STATUSES=[
    'New','Assigned','Contacted','Follow-Up','Pending Customer','Qualified','Signed Up','Install Scheduled','Complete','Not Interested','Unable to Reach','Not Serviceable','Cancelled','Void'
  ];
  const PAYOUT_STATUSES=['Not Eligible','Pending','Approved','Paid','Void'];
  const EMPLOYEE_EDIT_STATUSES=['Contacted','Follow-Up','Pending Customer','Qualified','Signed Up','Install Scheduled','Not Interested','Unable to Reach'];
  const ADMIN_FINAL_STATUSES=new Set(['Complete','Not Serviceable','Cancelled','Void']);
  const ADMIN_REVIEW_STATUSES=new Set(['Signed Up','Install Scheduled']);
  const PROVIDERS=['','AT&T','Verizon','Spectrum','Frontier','Optimum','Xfinity','T-Mobile','Other'];
  const PRIORITIES=['Normal','High','Urgent'];
  const OPEN_STATUSES=new Set(['New','Assigned','Contacted','Follow-Up','Pending Customer','Qualified','Unable to Reach']);
  const WON_STATUSES=new Set(['Signed Up','Install Scheduled','Complete']);
  const PROGRESS_STATUSES=new Set(['Contacted','Follow-Up','Pending Customer','Qualified','Signed Up','Install Scheduled','Complete']);

  const STATUS_META={
    'New':{cls:'st-new',label:'New'},
    'Assigned':{cls:'st-assigned',label:'Assigned'},
    'Contacted':{cls:'st-contacted',label:'Contacted'},
    'Follow-Up':{cls:'st-followup',label:'Follow-Up'},
    'Pending Customer':{cls:'st-pending',label:'Pending Customer'},
    'Qualified':{cls:'st-qualified',label:'Qualified'},
    'Signed Up':{cls:'st-signed',label:'Signed Up'},
    'Install Scheduled':{cls:'st-scheduled',label:'Install Scheduled'},
    'Complete':{cls:'st-complete',label:'Complete'},
    'Not Interested':{cls:'st-lost',label:'Not Interested'},
    'Unable to Reach':{cls:'st-unreachable',label:'Unable to Reach'},
    'Not Serviceable':{cls:'st-unserviceable',label:'Not Serviceable'},
    'Cancelled':{cls:'st-cancelled',label:'Cancelled'},
    'Void':{cls:'st-void',label:'Void'}
  };
  const PAYOUT_META={
    'Not Eligible':{cls:'pay-none'},'Pending':{cls:'pay-pending'},'Approved':{cls:'pay-approved'},'Paid':{cls:'pay-paid'},'Void':{cls:'pay-void'}
  };
  const ACCOUNT_META={
    'Active':'acct-active','Pending':'acct-pending','Pending Approval':'acct-pending','Paused':'acct-paused','Inactive':'acct-inactive'
  };

  const SERVICE_ICONS={
    'Internet':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.9 9.3a11.2 11.2 0 0 1 14.2 0M7.8 12.5a6.9 6.9 0 0 1 8.4 0M10.5 15.7a2.7 2.7 0 0 1 3 0M12 19h.01"/></svg>',
    'Mobile':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11.5 18.5h1"/></svg>',
    'TV':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
    'Home Phone':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8 4.9 5.5c-.8.6-1.1 1.7-.7 2.6 2.1 5.2 6.5 9.6 11.7 11.7.9.4 2 0 2.6-.7l1.7-2.3c.5-.7.4-1.7-.3-2.2l-2.8-2.1c-.6-.4-1.4-.4-1.9.1l-1.5 1.3a14.4 14.4 0 0 1-3.6-3.6l1.3-1.5c.5-.6.5-1.4.1-1.9L9.4 4.1c-.5-.7-1.5-.8-2.2-.3Z"/></svg>',
    'Business Internet':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V6l8-3 8 3v15M8 9h2M14 9h2M8 13h2M14 13h2M9 21v-4h6v4"/></svg>',
    'Not Sure':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></svg>'
  };

  // Live operational data stays in this page's memory, not a previous user's browser cache.
  const liveRecords=new Map();let serverOffset=0,sharedReady=false,sharedVersion=0,syncPromise=null;
  function arr(key){return liveRecords.get(key)||[];}
  function put(key,value){liveRecords.set(key,value);}
  const insights=window.GNDInsights;
  const now=()=>new Date(Date.now()+serverOffset);
  function attention(x){return insights?.classify(x,now())||{level:'ontrack',rank:0,reasons:[]};}
  function ageChip(x){const a=attention(x);return a.rank?`<span class="attention-chip attention-${a.level}" title="${esc(a.reasons.join(' • '))}">${esc(a.level==='urgent'?'URGENT':a.level==='warning'?'24h+ / Delayed':'Needs attention')} · ${a.hours||0}h</span>`:'';}
  function lifecycleFields(x){return `<input type="hidden" name="expectedVersion" value="${esc(x.version||1)}"><div class="field full lead-activity-tools"><strong>Contact & activity</strong><p>Administrative edits do not reset the follow-up clock.</p><div class="lead-detail-actions"><button type="button" class="btn btn-secondary" data-contact-outcome="Contacted" data-contact-lead="${esc(x.id)}" ${insights.CLOSED.has(normalizeStatus(x.status))?'disabled':''}>Log Contacted</button><button type="button" class="btn btn-secondary" data-contact-outcome="No Answer" data-contact-lead="${esc(x.id)}" ${insights.CLOSED.has(normalizeStatus(x.status))?'disabled':''}>Log No Answer</button><button type="button" class="btn btn-secondary" data-activity-lead="${esc(x.id)}">Activity History</button></div><div class="activity-history" aria-live="polite"></div></div>`;}

  function id(prefix){return prefix+'-'+Math.random().toString(36).slice(2,6).toUpperCase()+Date.now().toString().slice(-5)}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function money(v){return Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2})}
  function dateOnly(v){if(!v)return'—';const d=new Date(String(v).length===10?v+'T12:00:00':v);return isNaN(d)?'—':d.toLocaleDateString()}
  function phoneHref(v){return String(v||'').replace(/[^0-9+]/g,'')}
  function formData(form){const fd=new FormData(form),o={};for(const [k,v] of fd.entries()){if(o[k]!==undefined)o[k]=Array.isArray(o[k])?[...o[k],v]:[o[k],v];else o[k]=v}return o}
  function setStatus(form,msg,type='success'){const s=$('.form-status',form);if(!s)return;s.className='form-status '+type;s.textContent=msg;s.style.display='block'}
  function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__gndToast);window.__gndToast=setTimeout(()=>t.classList.remove('show'),2400)}
  function normalizeStatus(s){const m={'Installed':'Complete','New Referral':'New','Not Signed Up':'Not Interested'};return m[s]||s||'New'}
  function statusMeta(s){return STATUS_META[normalizeStatus(s)]||STATUS_META.New}
  function statusBadge(s){const n=normalizeStatus(s),m=statusMeta(n);return `<span class="status-badge ${m.cls}">${esc(m.label)}</span>`}
  function payoutBadge(s){const n=s||'Not Eligible';return `<span class="status-badge ${PAYOUT_META[n]?.cls||'pay-none'}">${esc(n)}</span>`}
  function accountBadge(s){const n=s||'Active';return `<span class="status-badge ${ACCOUNT_META[n]||'acct-inactive'}">${esc(n)}</span>`}
  function isOpen(x){return OPEN_STATUSES.has(normalizeStatus(x.status))}
  function isWon(x){return WON_STATUSES.has(normalizeStatus(x.status))}
  function needsAdminReview(x){return ADMIN_REVIEW_STATUSES.has(normalizeStatus(x.status))}
  function adminReviewChip(x){return needsAdminReview(x)?'<span class="review-chip">Admin verification required</span>':''}
  function serviceText(x){return Array.isArray(x.services)?x.services.join(', '):(x.services||x.service||'—')}
  function addressText(x){return [x.address,x.unit?`Unit ${x.unit}`:'',x.city,x.state,x.zip].filter(Boolean).join(', ')}
  function partnerSource(x){return x._partner?(x.source||x.partnerCode||'Partner'):(x.source&&x.source!=='Direct'?x.source:'Direct')}
  function getEmployees(){return arr(STORE_EMP)}
  function getPartners(){return arr(STORE_PARTNERS)}
  const API=window.GNDAPI;
  function apiLeadToLocal(r,session){
    const partner=!!(r.partner_id||r.partnerId||r.source_type==='Partner'||session?.role==='partner');
    return {id:r.id,firstName:r.first_name??r.firstName??'',lastName:r.last_name??r.lastName??'',phone:r.phone||'',email:r.email||'',address:r.address||'',unit:r.unit||'',city:r.city||'',state:r.state||'',zip:r.zip||'',services:Array.isArray(r.services)?r.services:[],currentProvider:r.current_provider??r.currentProvider??'',moveIn:String(r.move_in??r.moveIn??'').slice(0,10),contactTime:r.contact_time??r.contactTime??'',notes:r.notes||'',source:r.source_code??r.source??(session?.partnerCode||'Direct'),partnerCode:r.partner_code??r.partnerCode??(partner?(session?.partnerCode||''):'') ,assignedEmployee:r.employee_id??r.employeeId??'',status:normalizeStatus(r.status),priority:r.priority||'Normal',nextFollowUp:String(r.next_follow_up??r.nextFollowUp??'').slice(0,10),provider:r.provider||'',orderNumber:r.order_number??r.orderNumber??'',installDate:String(r.install_date??r.installDate??'').slice(0,10),internalNotes:r.internal_notes??r.internalNotes??'',payoutAmount:r.payout_amount??r.payoutAmount??0,payoutStatus:r.payout_status??r.payoutStatus??'Not Eligible',payoutPaidDate:String(r.payout_paid_date??r.payoutPaidDate??'').slice(0,10),payoutReference:r.payout_reference??r.payoutReference??'',sourceType:r.source_type||'Direct',partnerId:r.partner_id||null,version:r.version||1,firstContactAt:r.first_contact_at||null,lastSalesActivityAt:r.last_sales_activity_at||null,signedUpAt:r.signed_up_at||null,completedAt:r.completed_at||null,statusChangedAt:r.status_changed_at||null,reviewRequestedAt:r.review_requested_at||null,createdAt:r.created_at??r.createdAt??'',updatedAt:r.updated_at??r.updatedAt??'',_partner:partner};
  }
  function employeeApiToLocal(e){return{id:e.id,name:e.name,email:e.email||'',phone:e.phone||'',role:e.role||'Employee Sales Rep',code:e.code||'',status:e.status||'Active',createdAt:e.created_at||''}}
  function partnerApiToLocal(x){return{id:x.id,name:x.name,contactName:x.contact_name||'',email:x.email||'',phone:x.phone||'',partnerType:x.partner_type||'Referral Partner',code:x.code||'',status:x.status||'Active',createdAt:x.created_at||''}}
  async function syncSharedData(){
    if(syncPromise)return syncPromise;
    const session=window.GNDAuth?.getSession?.();if(!session||!API?.token?.())return false;
    syncPromise=(async()=>{try{
      const lr=await API.leads(),mapped=(lr.leads||[]).map(r=>apiLeadToLocal(r,session));
      let employees=[],partners=[];
      if(session.role==='admin'){const [er,pr]=await Promise.all([API.employees(),API.partners()]);employees=(er.employees||[]).map(employeeApiToLocal);partners=(pr.partners||[]).map(partnerApiToLocal);}
      else if(session.role==='employee')employees=[{id:session.employeeId,name:session.name,code:session.employeeCode,role:'Employee / Contractor Sales Rep',status:'Active'}];
      else partners=[{id:session.partnerId,name:session.name,code:session.partnerCode,partnerType:'Referral Partner',status:'Active'}];
      if(session.role==='partner')mapped.forEach(x=>{x._partner=true;x.source=session.partnerCode||x.source;x.partnerCode=session.partnerCode||x.partnerCode});
      // Publish a consistent snapshot only after every required request succeeds.
      put(STORE_REF,mapped.filter(x=>x._partner));put(STORE_DIRECT,mapped.filter(x=>!x._partner));put(STORE_EMP,employees);put(STORE_PARTNERS,partners);
      if(lr.serverTime&&!isNaN(new Date(lr.serverTime)))serverOffset=+new Date(lr.serverTime)-Date.now();
      sharedReady=true;sharedVersion=lr.version||10;window.dispatchEvent(new CustomEvent('gnd-data-updated',{detail:{leads:allLeads(),employees,partners,asOf:now().toISOString(),version:lr.version||10}}));
      const status=$('#portalSyncStatus');if(status){status.textContent='Connected · updated '+now().toLocaleTimeString();status.className='sync-status connected';}
      return true;
    }catch(e){const status=$('#portalSyncStatus');if(status){status.textContent='Connection problem — displayed data may be out of date. Retry Refresh.';status.className='sync-status disconnected';}window.dispatchEvent(new CustomEvent('gnd-sync-error',{detail:e.message}));return false;}finally{syncPromise=null;}})();
    return syncPromise;
  }
  async function patchSharedLead(id,updates){
    if(!API?.token?.())throw Error('Please sign in again before saving');
    const d={...updates};if('assignedEmployee'in d){d.employeeId=d.assignedEmployee;delete d.assignedEmployee}
    return API.updateLead(id,d);
  }
  function employeeName(empId){return getEmployees().find(e=>e.id===empId)?.name||'Unassigned'}
  function partnerName(code){const p=getPartners().find(x=>x.code===code);return p?.name||code||'Partner'}
  function allLeads(){return [...arr(STORE_DIRECT).map(x=>({...x,status:normalizeStatus(x.status),_storeKey:STORE_DIRECT,_partner:false})),...arr(STORE_REF).map(x=>({...x,status:normalizeStatus(x.status),_storeKey:STORE_REF,_partner:true}))].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))}
  function save(key,obj){const a=arr(key);a.unshift(obj);put(key,a);return a}
  function updateLead(leadId,updates){for(const key of [STORE_DIRECT,STORE_REF]){const a=arr(key),i=a.findIndex(x=>x.id===leadId);if(i>=0){a[i]={...a[i],...updates,status:normalizeStatus(updates.status||a[i].status),updatedAt:new Date().toISOString()};put(key,a);return a[i]}}return null}
  function options(list,current,firstLabel){let h=firstLabel?`<option value="">${esc(firstLabel)}</option>`:'';return h+list.map(v=>`<option value="${esc(v)}"${String(v)===String(current||'')?' selected':''}>${esc(v)}</option>`).join('')}
  function employeeOptions(current){const emps=getEmployees().filter(e=>e.status==='Active');return `<option value="">Unassigned</option>`+emps.map(e=>`<option value="${esc(e.id)}"${e.id===current?' selected':''}>${esc(e.name)} — ${esc(e.role||'Sales Rep')}</option>`).join('')}
  function codeFromName(name,kind='partner'){const cleaned=String(name||'USER').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);const word=(cleaned[0]||'USER').slice(0,5);const initials=cleaned.slice(1,3).map(w=>w[0]).join('');const base=(word+initials).slice(0,6);const prefix=kind==='employee'?'SR':'PR';const existing=new Set([...getPartners().map(p=>String(p.code||'').toUpperCase()),...getEmployees().map(e=>String(e.code||'').toUpperCase())]);let code='';do{code=`${prefix}-${base}${Math.floor(10+Math.random()*90)}`}while(existing.has(code));return code}
  function ensureProfileCodes(){let changed=false;const emps=getEmployees().map(e=>{if(!e.code){changed=true;return{...e,code:codeFromName(e.name,'employee')}}return e});if(changed)put(STORE_EMP,emps);changed=false;const ps=getPartners().map(x=>{if(!x.code){changed=true;return{...x,code:codeFromName(x.name,'partner')}}return x});if(changed)put(STORE_PARTNERS,ps)}
  function codeExists(code){const c=String(code||'').trim().toUpperCase();return [...getPartners(),...getEmployees()].some(x=>String(x.code||'').toUpperCase()===c)}
  function referralUrl(code){return window.GNDMarketing?.referralUrl?.(code)||`https://getnetdirect.com/?ref=${encodeURIComponent(code||'')}#availability`}
  function marketingHref(profile,kind){const q=new URLSearchParams({code:profile.code||'',name:profile.name||'',type:kind==='employee'?(profile.role||'Sales Representative'):(profile.partnerType||'Referral Partner'),kind});return `marketing-tools.html?${q.toString()}`}
  // Profile codes are assigned and persisted by the server.
  function duplicateSet(leads){const map=new Map(),dupes=new Set();leads.filter(x=>normalizeStatus(x.status)!=='Void').forEach(x=>{let phone=String(x.phone||'').replace(/\D/g,'');if(phone.length===11&&phone[0]==='1')phone=phone.slice(1);const address=[x.address,x.unit,x.city,x.state,x.zip].map(v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ')).join('|');const keys=[];if(phone.length>=7)keys.push('phone:'+phone);if(x.address&&x.zip)keys.push('address:'+address);keys.forEach(k=>{if(map.has(k)){dupes.add(x.id);dupes.add(map.get(k));}else map.set(k,x.id);});});return dupes;}


  function renderLegend(targetId,compact=false){const el=$('#'+targetId);if(!el)return;const statuses=compact?['New','Contacted','Follow-Up','Signed Up','Install Scheduled','Complete','Cancelled','Void']:LEAD_STATUSES;el.innerHTML=statuses.map(s=>statusBadge(s)).join('')}

  /* Global navigation */
  const year=$('[data-year]');if(year)year.textContent=new Date().getFullYear();
  const menu=$('.menu-btn');if(menu)menu.addEventListener('click',()=>{const links=$('.nav-links');if(!links)return;const open=links.classList.toggle('open');menu.setAttribute('aria-expanded',open?'true':'false');menu.textContent=open?'✕':'☰'});
  $$('.nav-links a').forEach(a=>a.addEventListener('click',()=>{$('.nav-links')?.classList.remove('open');if(menu){menu.setAttribute('aria-expanded','false');menu.textContent='☰'}}));

  /* Service choice behavior */
  function wireServiceChoices(root=document){$$('.service-choice-grid',root).forEach(grid=>{const boxes=$$('input[type="checkbox"][name="services"]',grid);boxes.forEach(box=>{if(box.dataset.wired)return;box.dataset.wired='1';box.addEventListener('change',()=>{if(!box.checked)return;if(box.value==='Not Sure')boxes.forEach(o=>{if(o!==box)o.checked=false});else boxes.forEach(o=>{if(o.value==='Not Sure')o.checked=false})})})})}
  function serviceChoiceMarkup(){return Object.entries(SERVICE_ICONS).map(([name,icon])=>`<label class="service-choice"><input type="checkbox" name="services" value="${esc(name)}"><span class="service-choice-icon">${icon}</span><span class="service-choice-label">${esc(name==='Mobile'?'Mobile / Cell':name==='Business Internet'?'Business':name)}</span><span class="service-choice-check">✓</span></label>`).join('')}
  if($('#partnerServicesGrid'))$('#partnerServicesGrid').innerHTML=serviceChoiceMarkup();wireServiceChoices();

  /* Referral attribution */
  const params=new URLSearchParams(location.search);const incomingRef=String(params.get('ref')||'').trim();if(incomingRef)sessionStorage.setItem('gnd_ref',incomingRef);const ref=incomingRef||sessionStorage.getItem('gnd_ref')||'';$$('[data-ref-field]').forEach(el=>{if(ref)el.value=ref});const refNotice=$('#referralTrackingNotice');if(refNotice){if(ref){refNotice.hidden=false;const code=refNotice.querySelector('[data-ref-code]');if(code)code.textContent=ref}else refNotice.hidden=true}

  /* Public lead forms */
  async function submitPublic(form){
    if(!form.reportValidity()||form.dataset.submitting==='1')return;
    const d=formData(form);d.referralCode=d.referralCode||ref||'';
    const buttons=$$('button[type="submit"],#submitFullCustomer',form);form.dataset.submitting='1';buttons.forEach(b=>b.disabled=true);
    try{const r=await API.createPublicLead(d);if(!r.ok||!r.lead?.id)throw Error('The server did not confirm the lead');setStatus(form,`Thank you — request ${r.lead.id} was saved to GetNetDirect. A representative can follow up using the details you provided.`);form.reset();$$('[data-ref-field]').forEach(el=>{if(ref)el.value=ref});}
    catch(e){setStatus(form,'Your request was not confirmed. '+e.message+' Your entries are still here.','error');}
    finally{form.dataset.submitting='0';buttons.forEach(b=>b.disabled=false);}
  }
  $('#customerForm')?.addEventListener('submit',e=>{e.preventDefault();submitPublic(e.currentTarget)});
  $('#customerForm2')?.addEventListener('submit',e=>{e.preventDefault();submitPublic(e.currentTarget);});
  $('#partnerApplyForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(!f.reportValidity()||f.dataset.busy)return;f.dataset.busy='1';const button=$('button[type="submit"]',f);if(button)button.disabled=true;try{const r=await API.applyPartner(formData(f));setStatus(f,`Partner application ${r.id} was saved for Admin review.`);f.reset();}catch(err){setStatus(f,err.message||'Application was not saved. Please try again.','error');}finally{delete f.dataset.busy;if(button)button.disabled=false;}});


  /* Partner portal */
  function currentPartnerCode(){const session=window.GNDAuth?.getSession?.();const q=session?.role==='admin'?params.get('partner'):null;if(q){localStorage.setItem('gnd_partner_code',q);return q}if(session?.partnerCode)return session.partnerCode;return localStorage.getItem('gnd_partner_code')||'DEMO123'}
  const partnerCode=currentPartnerCode();
  if($('#partnerCodeDisplay'))$('#partnerCodeDisplay').textContent=partnerCode;if($('#partnerLinkDisplay'))$('#partnerLinkDisplay').textContent=referralUrl(partnerCode);if($('#partnerCodeField'))$('#partnerCodeField').value=partnerCode;const partnerProfile=getPartners().find(x=>x.code===partnerCode)||{name:(window.GNDAuth?.getSession?.()?.name||'GetNetDirect Referral Partner'),partnerType:'Referral Partner',code:partnerCode};const partnerMk=marketingHref(partnerProfile,'partner');if($('#partnerFlyerLink'))$('#partnerFlyerLink').href=partnerMk;if($('#partnerMarketingKitLink'))$('#partnerMarketingKitLink').href=partnerMk;window.GNDMarketing?.renderQR?.('partnerQrPreview',referralUrl(partnerCode),210);$('#downloadPartnerQr')?.addEventListener('click',()=>window.GNDMarketing?.downloadQR?.('partnerQrPreview',`GetNetDirect-${partnerCode}-QR.png`));
  $('#copyPartnerLink')?.addEventListener('click',async()=>{const txt=referralUrl(partnerCode);try{await navigator.clipboard.writeText(txt);toast('Referral link copied')}catch(e){toast(txt)}});
  $('#referralForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(!f.reportValidity()||f.dataset.submitting==='1')return;const d=formData(f);d.referralCode=d.partnerCode||partnerCode;f.dataset.submitting='1';const buttons=$$('button[type="submit"]',f);buttons.forEach(b=>b.disabled=true);try{const r=await API.createPublicLead(d);if(!r.ok||!r.lead?.id)throw Error('The server did not confirm your referral. Your entries have been kept.');setStatus(f,`Referral ${r.lead.id} submitted successfully.`);f.reset();$('#partnerCodeField').value=partnerCode;wireServiceChoices(f);await syncSharedData();renderPartner()}catch(err){setStatus(f,err.message||'Referral could not be submitted.','error')}finally{f.dataset.submitting='0';buttons.forEach(b=>b.disabled=false)}});

  function renderPartner(){
    if(!$('#partnerHistoryBody')&&!$('#partnerHistoryCards'))return;
    renderLegend('partnerStatusLegend',true);
    const leads=arr(STORE_REF).map(x=>({...x,status:normalizeStatus(x.status)})).filter(x=>(x.source||x.partnerCode)===partnerCode).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    const won=leads.filter(isWon).length,pending=leads.filter(isOpen).length,approved=leads.filter(x=>x.payoutStatus==='Approved').reduce((s,x)=>s+Number(x.payoutAmount||0),0),paid=leads.filter(x=>x.payoutStatus==='Paid').reduce((s,x)=>s+Number(x.payoutAmount||0),0);
    if($('#partnerStatReferrals'))$('#partnerStatReferrals').textContent=leads.length;if($('#partnerStatSigned'))$('#partnerStatSigned').textContent=won;if($('#partnerStatPending'))$('#partnerStatPending').textContent=pending;if($('#partnerStatApproved'))$('#partnerStatApproved').textContent=money(approved);if($('#partnerPaidTotal'))$('#partnerPaidTotal').textContent=money(paid);
    const rows=leads.length?leads.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id)}</span></td><td>${dateOnly(x.createdAt)}</td><td>${esc(serviceText(x))}</td><td>${dateOnly(x.moveIn)}</td><td>${statusBadge(x.status)}</td><td>${payoutBadge(x.payoutStatus||'Not Eligible')}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No referrals submitted yet.</td></tr>';
    if($('#partnerHistoryBody'))$('#partnerHistoryBody').innerHTML=rows;
    if($('#partnerHistoryCards'))$('#partnerHistoryCards').innerHTML=leads.length?leads.map(x=>`<article class="mobile-data-card"><div class="mobile-card-head"><div><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><span>${esc(x.id)} · ${dateOnly(x.createdAt)}</span></div>${statusBadge(x.status)}</div><dl><div><dt>Service</dt><dd>${esc(serviceText(x))}</dd></div><div><dt>Move-In</dt><dd>${dateOnly(x.moveIn)}</dd></div><div><dt>Payout</dt><dd>${payoutBadge(x.payoutStatus||'Not Eligible')}</dd></div></dl></article>`).join(''):'<div class="empty-card">No referrals submitted yet.</div>';
    const pRows=leads.filter(x=>Number(x.payoutAmount||0)>0||!['Not Eligible',undefined,''].includes(x.payoutStatus));
    if($('#partnerPayoutBody'))$('#partnerPayoutBody').innerHTML=pRows.length?pRows.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong></td><td>${statusBadge(x.status)}</td><td class="money">${money(x.payoutAmount)}</td><td>${payoutBadge(x.payoutStatus)}</td><td>${dateOnly(x.payoutPaidDate)}</td><td>${esc(x.payoutReference||'—')}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No payout entries yet.</td></tr>';
    if($('#partnerPayoutCards'))$('#partnerPayoutCards').innerHTML=pRows.length?pRows.map(x=>`<article class="mobile-data-card"><div class="mobile-card-head"><div><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><span>${money(x.payoutAmount)}</span></div>${payoutBadge(x.payoutStatus)}</div><dl><div><dt>Lead Outcome</dt><dd>${statusBadge(x.status)}</dd></div><div><dt>Paid Date</dt><dd>${dateOnly(x.payoutPaidDate)}</dd></div><div><dt>Reference</dt><dd>${esc(x.payoutReference||'—')}</dd></div></dl></article>`).join(''):'<div class="empty-card">No payout entries yet.</div>';
  }

  /* Admin portal */
  function leadDetailForm(x){
    return `<form class="admin-lead-form" data-lead-id="${esc(x.id)}"><div class="lead-detail-grid">${lifecycleFields(x)}
      ${needsAdminReview(x)?'<div class="field full admin-review-note"><strong>Admin verification needed</strong><span>The sales rep reported a signup or install schedule. Verify the result before marking Complete or approving a referral payout.</span></div>':''}
      <div class="field"><label>Status</label><select name="status">${options(LEAD_STATUSES,normalizeStatus(x.status))}</select></div>
      <div class="field"><label>Priority</label><select name="priority">${options(PRIORITIES,x.priority||'Normal')}</select></div>
      <div class="field"><label>Assigned Rep</label><select name="assignedEmployee">${employeeOptions(x.assignedEmployee)}</select></div>
      <div class="field"><label>Next Follow-Up</label><input name="nextFollowUp" type="date" value="${esc(x.nextFollowUp||'')}"></div>
      <div class="field"><label>Provider</label><select name="provider">${options(PROVIDERS,x.provider||'','Select provider')}</select></div>
      <div class="field"><label>Order / Confirmation #</label><input name="orderNumber" value="${esc(x.orderNumber||'')}"></div>
      <div class="field"><label>Install Date</label><input name="installDate" type="date" value="${esc(x.installDate||'')}"></div>
      <div class="field"><label>Partner Payout</label><input name="payoutAmount" inputmode="decimal" type="number" min="0" step="0.01" value="${esc(x.payoutAmount||0)}"></div>
      <div class="field"><label>Payout Status</label><select name="payoutStatus">${options(PAYOUT_STATUSES,x.payoutStatus||'Not Eligible')}</select></div>
      <div class="field"><label>Paid Date</label><input name="payoutPaidDate" type="date" value="${esc(x.payoutPaidDate||'')}"></div>
      <div class="field span2"><label>Payment Reference</label><input name="payoutReference" value="${esc(x.payoutReference||'')}" placeholder="Check, ACH, Zelle or batch reference"></div>
      <div class="field full"><label>Internal Notes</label><textarea name="internalNotes" placeholder="Call attempts, quote information, internal follow-up notes…">${esc(x.internalNotes||'')}</textarea></div>
      <div class="field full"><div class="lead-detail-actions"><button class="btn btn-primary" type="submit">Save Lead</button>${x._partner?`<button class="btn btn-secondary" type="button" data-copy-partner-update="${esc(x.id)}">Copy Partner Update</button>`:''}<span class="detail-note">Created ${dateOnly(x.createdAt)}${x.updatedAt?` · Updated ${dateOnly(x.updatedAt)}`:''}</span></div></div>
    </div></form>`;
  }

  function renderAdmin(){
    if(!$('#adminLeadTableBody')&&!$('#adminLeadCards'))return;
    renderLegend('adminStatusLegend');
    const filterSel=$('#adminLeadFilter');if(filterSel&&!filterSel.dataset.ready){filterSel.innerHTML='<option value="all">All statuses</option>'+options(LEAD_STATUSES,'');filterSel.dataset.ready='1'}
    const leads=allLeads(),dupes=duplicateSet(leads);const search=String($('#adminLeadSearch')?.value||'').toLowerCase(),filter=$('#adminLeadFilter')?.value||'all';let shown=leads.filter(x=>filter==='all'||normalizeStatus(x.status)===filter);if(search)shown=shown.filter(x=>[x.id,x.firstName,x.lastName,x.phone,x.email,x.address,x.city,x.zip,serviceText(x),partnerSource(x),employeeName(x.assignedEmployee)].join(' ').toLowerCase().includes(search));
    const af=$('#adminAttentionFilter')?.value||'all';if(af!=='all')shown=shown.filter(x=>{const a=attention(x);return af==='new'?a.isNew:af==='review'?a.isReview:af==='overdue'?a.followupOverdue:af==='unassigned'?a.unassigned&&a.level!=='closed':a.level===af;});shown.sort((a,b)=>attention(b).rank-attention(a).rank||attention(b).hours-attention(a).hours);
    const unpaid=leads.filter(x=>['Pending','Approved'].includes(x.payoutStatus)).reduce((s,x)=>s+Number(x.payoutAmount||0),0);
    $('#statLeads').textContent=leads.length;$('#statOpen').textContent=leads.filter(isOpen).length;$('#statSignedUp').textContent=leads.filter(isWon).length;$('#statInstalled').textContent=leads.filter(x=>normalizeStatus(x.status)==='Complete').length;if($('#statNeedsReview'))$('#statNeedsReview').textContent=leads.filter(needsAdminReview).length;$('#statUnpaidPayouts').textContent=money(unpaid);
    const empty='<tr><td colspan="8" class="empty-state">No leads match this view.</td></tr>';
    $('#adminLeadTableBody').innerHTML=shown.length?shown.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id)}</span>${dupes.has(x.id)?'<br><span class="warning-chip">Possible duplicate</span>':''}</td><td><div class="contact-stack"><span>${esc(x.phone||'—')}</span><span class="muted-inline">${esc(x.email||'')}</span></div></td><td>${esc(serviceText(x))}<br><span class="muted-inline">${esc(addressText(x))}</span></td><td><span class="lead-source">${esc(partnerSource(x))}</span></td><td>${esc(employeeName(x.assignedEmployee))}</td><td>${statusBadge(x.status)}${adminReviewChip(x)}${ageChip(x)}${x.nextFollowUp?`<br><span class="followup-date">Follow-up ${dateOnly(x.nextFollowUp)}</span>`:''}</td><td>${x._partner?payoutBadge(x.payoutStatus||'Not Eligible'):'—'}</td><td><button class="btn btn-secondary manage-btn" type="button" data-admin-toggle="${esc(x.id)}">Manage</button></td></tr><tr class="admin-detail-row"><td colspan="8"><div class="lead-detail" id="admin-detail-${esc(x.id)}">${leadDetailForm(x)}</div></td></tr>`).join(''):empty;
    $('#adminLeadCards').innerHTML=shown.length?shown.map(x=>`<article class="mobile-data-card lead-card"><div class="mobile-card-head"><div><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><span>${esc(x.id)} · ${esc(partnerSource(x))}</span></div>${statusBadge(x.status)}</div><dl><div><dt>Phone</dt><dd>${esc(x.phone||'—')}</dd></div><div><dt>Service</dt><dd>${esc(serviceText(x))}</dd></div><div><dt>Assigned</dt><dd>${esc(employeeName(x.assignedEmployee))}</dd></div><div><dt>Follow-Up</dt><dd>${dateOnly(x.nextFollowUp)}</dd></div>${x._partner?`<div><dt>Payout</dt><dd>${payoutBadge(x.payoutStatus||'Not Eligible')}</dd></div>`:''}</dl>${dupes.has(x.id)?'<span class="warning-chip">Possible duplicate</span>':''}${adminReviewChip(x)}${ageChip(x)}<button class="btn btn-secondary mobile-manage" type="button" data-mobile-admin-toggle="${esc(x.id)}">Manage Lead</button><div class="mobile-detail" id="mobile-admin-detail-${esc(x.id)}">${leadDetailForm(x)}</div></article>`).join(''):'<div class="empty-card">No leads match this view.</div>';
    renderLedger(leads.filter(x=>x._partner));renderEmployees();renderPartners();renderAdminMarketing();
  }

  function renderLedger(refs){
    const rows=refs.filter(x=>Number(x.payoutAmount||0)>0||x.payoutStatus&&x.payoutStatus!=='Not Eligible');const pending=rows.filter(x=>x.payoutStatus==='Pending').reduce((s,x)=>s+Number(x.payoutAmount||0),0),approved=rows.filter(x=>x.payoutStatus==='Approved').reduce((s,x)=>s+Number(x.payoutAmount||0),0),paid=rows.filter(x=>x.payoutStatus==='Paid').reduce((s,x)=>s+Number(x.payoutAmount||0),0);$('#ledgerPendingTotal').textContent=money(pending);$('#ledgerApprovedTotal').textContent=money(approved);$('#ledgerPaidTotal').textContent=money(paid);
    $('#payoutLedgerBody').innerHTML=rows.length?rows.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id)}</span></td><td>${esc(partnerName(partnerSource(x)))}</td><td>${statusBadge(x.status)}</td><td class="money">${money(x.payoutAmount)}</td><td>${payoutBadge(x.payoutStatus)}</td><td>${dateOnly(x.payoutPaidDate)}</td><td>${esc(x.payoutReference||'—')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No partner payout entries yet.</td></tr>';
    $('#payoutLedgerCards').innerHTML=rows.length?rows.map(x=>`<article class="mobile-data-card"><div class="mobile-card-head"><div><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><span>${esc(partnerName(partnerSource(x)))}</span></div>${payoutBadge(x.payoutStatus)}</div><dl><div><dt>Outcome</dt><dd>${statusBadge(x.status)}</dd></div><div><dt>Amount</dt><dd class="money">${money(x.payoutAmount)}</dd></div><div><dt>Paid</dt><dd>${dateOnly(x.payoutPaidDate)}</dd></div><div><dt>Reference</dt><dd>${esc(x.payoutReference||'—')}</dd></div></dl></article>`).join(''):'<div class="empty-card">No partner payout entries yet.</div>';
  }

  function renderEmployees(){const body=$('#employeeTableBody');if(!body)return;const emps=getEmployees(),leads=allLeads();body.innerHTML=emps.length?emps.map(e=>`<tr><td><strong>${esc(e.name)}</strong><br><span class="muted-inline">${esc(e.email||'')}</span></td><td>${esc(e.role||'Sales Rep')}</td><td><span class="lead-source">${esc(e.code||'—')}</span></td><td>${leads.filter(x=>x.assignedEmployee===e.id).length}</td><td>${accountBadge(e.status||'Active')}</td><td><a class="mini-action" href="employee-dashboard.html?employee=${encodeURIComponent(e.id)}">View</a> <button class="mini-action" type="button" data-copy-code-link="${esc(e.code||'')}">Link</button> <a class="mini-action" href="${esc(marketingHref(e,'employee'))}">QR/Flyer</a> <button class="mini-action" type="button" data-toggle-employee="${esc(e.id)}">${e.status==='Active'?'Deactivate':'Activate'}</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No sales reps created yet.</td></tr>'}
  function renderPartners(){const body=$('#partnerTableBody');if(!body)return;const ps=getPartners(),refs=arr(STORE_REF);body.innerHTML=ps.length?ps.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><span class="muted-inline">${esc(p.partnerType||'Referral Partner')}</span></td><td><span class="lead-source">${esc(p.code)}</span></td><td>${refs.filter(r=>(r.source||r.partnerCode)===p.code).length}</td><td>${accountBadge(p.status||'Active')}</td><td><a class="mini-action" href="partner-dashboard.html?partner=${encodeURIComponent(p.code)}">View</a> <button class="mini-action" type="button" data-copy-code-link="${esc(p.code)}">Link</button> <a class="mini-action" href="${esc(marketingHref(p,'partner'))}">QR/Flyer</a> <button class="mini-action" type="button" data-partner-status="${esc(p.id)}">${p.status==='Active'?'Deactivate':'Activate'}</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">No referral partners created yet.</td></tr>'}

  $('#employeeCreateForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(!f.reportValidity())return;const d=formData(f);d.code=String(d.code||'').trim().toUpperCase()||codeFromName(d.name,'employee');try{const r=await API.createEmployee(d);setStatus(f,`${d.name} added. Rep code: ${r.employee.code}`);f.reset();await syncSharedData();renderAdmin()}catch(err){setStatus(f,err.message||'Could not add sales rep.','error')}});
  $('#partnerCreateForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;if(!f.reportValidity())return;const d=formData(f);d.code=String(d.code||'').trim().toUpperCase()||codeFromName(d.name,'partner');try{const r=await API.createPartner(d);setStatus(f,`${d.name} added. Referral code: ${r.partner.code}`);f.reset();await syncSharedData();renderAdmin()}catch(err){setStatus(f,err.message||'Could not add referral partner.','error')}});
  $$('[data-generate-code]').forEach(btn=>btn.addEventListener('click',()=>{const kind=btn.dataset.generateCode;const form=btn.closest('form');const name=form?.querySelector('[name="name"]')?.value||'';const input=form?.querySelector('[name="code"]');if(input){input.value=codeFromName(name,kind);input.focus()}}));
  function marketingProfiles(){return [...getPartners().map(p=>({kind:'partner',...p})),...getEmployees().map(e=>({kind:'employee',...e}))].filter(x=>x.code)}
  function renderAdminMarketing(){const sel=$('#adminMarketingProfile');if(!sel)return;const current=sel.value;const profiles=marketingProfiles();sel.innerHTML='<option value="">Select a profile</option>'+profiles.map(x=>`<option value="${esc(x.kind+'|'+x.code)}">${esc(x.kind==='partner'?'Partner':'Team')} — ${esc(x.name)} (${esc(x.code)})</option>`).join('');if(profiles.some(x=>x.kind+'|'+x.code===current))sel.value=current;updateAdminMarketing()}
  function updateAdminMarketing(){const sel=$('#adminMarketingProfile');if(!sel)return;const [kind,code]=String(sel.value||'').split('|');const profile=kind==='partner'?getPartners().find(x=>x.code===code):getEmployees().find(x=>x.code===code);const link=$('#adminMarketingLink'),open=$('#openAdminFlyer'),download=$('#downloadAdminQr'),name=$('#adminQrName'),codeEl=$('#adminQrCode');if(!profile){if(link)link.value='';if(open){open.href='#';open.classList.add('disabled-link');open.setAttribute('aria-disabled','true')}if(download)download.disabled=true;if(name)name.textContent='GetNetDirect Referral QR';if(codeEl)codeEl.textContent='—';const q=$('#adminQrPreview');if(q)q.innerHTML='<div class="qr-placeholder">Select a profile to generate a QR code</div>';return}const url=referralUrl(profile.code);if(link)link.value=url;if(open){open.href=marketingHref(profile,kind);open.classList.remove('disabled-link');open.removeAttribute('aria-disabled')}if(download)download.disabled=false;if(name)name.textContent=profile.name;if(codeEl)codeEl.textContent=profile.code;window.GNDMarketing?.renderQR?.('adminQrPreview',url,210)}
  $('#adminMarketingProfile')?.addEventListener('change',updateAdminMarketing);$('#copyAdminMarketingLink')?.addEventListener('click',async()=>{const v=$('#adminMarketingLink')?.value;if(!v)return;try{await navigator.clipboard.writeText(v);toast('Referral link copied')}catch(e){toast(v)}});$('#downloadAdminQr')?.addEventListener('click',()=>{const sel=$('#adminMarketingProfile');if(!sel?.value)return;const code=sel.value.split('|')[1];window.GNDMarketing?.downloadQR?.('adminQrPreview',`GetNetDirect-${code}-QR.png`)});

  $('#adminLeadSearch')?.addEventListener('input',renderAdmin);$('#adminLeadFilter')?.addEventListener('change',renderAdmin);$('#refreshAdmin')?.addEventListener('click',async()=>{if(document.querySelector('.lead-detail.open,.mobile-detail.open')&&!confirm('Refresh will close the open lead editor. Continue?'))return;const ok=await syncSharedData();if(ok){renderAdmin();toast('Dashboard refreshed');}else toast('Connection problem — the dashboard has not refreshed.');});

  document.addEventListener('click',async e=>{
    const desktop=e.target.closest('[data-admin-toggle]');if(desktop){$('#admin-detail-'+desktop.dataset.adminToggle)?.classList.toggle('open');return}
    const mobile=e.target.closest('[data-mobile-admin-toggle]');if(mobile){$('#mobile-admin-detail-'+mobile.dataset.mobileAdminToggle)?.classList.toggle('open');return}
    const emp=e.target.closest('[data-toggle-employee]');if(emp){const account=getEmployees().find(x=>x.id===emp.dataset.toggleEmployee);if(!account)return;const next=account.status==='Active'?'Inactive':'Active';if(!confirm(next+' access for '+account.name+'?'))return;try{await API.setAccountStatus('employees',account.id,next);await syncSharedData();renderAdmin();toast('Account updated on the server');}catch(err){toast(err.message);}return}
    const cp=e.target.closest('[data-copy-code-link],[data-copy-partner-link]');if(cp){const code=cp.dataset.copyCodeLink||cp.dataset.copyPartnerLink;const txt=referralUrl(code);try{await navigator.clipboard.writeText(txt);toast('Referral link copied')}catch(err){toast(txt)}return}
    const update=e.target.closest('[data-copy-partner-update]');if(update){const lead=allLeads().find(x=>x.id===update.dataset.copyPartnerUpdate);if(!lead)return;const payout=Number(lead.payoutAmount||0)>0?` Payout: ${lead.payoutStatus||'Not Eligible'} ${money(lead.payoutAmount)}.`:'';const msg=`GetNetDirect referral update — ${lead.firstName||''} ${lead.lastName||''}: ${normalizeStatus(lead.status)}.${payout} Thank you for your referral.`;try{await navigator.clipboard.writeText(msg);toast('Partner update copied')}catch(err){toast('Could not copy update')}return}
  });
  document.addEventListener('submit',async e=>{const f=e.target.closest('.admin-lead-form');if(!f)return;e.preventDefault();const d=formData(f);if(d.payoutStatus==='Paid'&&!d.payoutPaidDate)d.payoutPaidDate=insights.day(now());try{await patchSharedLead(f.dataset.leadId,d);await syncSharedData();renderAdmin();toast('Lead updated')}catch(err){toast(err.message||'Lead update failed')}});

  /* Employee portal */
  function employeeFromPage(){const session=window.GNDAuth?.getSession?.();const req=(session?.role==='admin'?params.get('employee'):session?.employeeId)||session?.employeeId||'';const emps=getEmployees();return emps.find(x=>x.id===req)||emps.find(x=>x.status!=='Inactive')||null}
  function renderEmployeeSelector(){const sel=$('#employeeSelector');if(!sel)return;const emps=getEmployees().filter(x=>x.status!=='Inactive');sel.innerHTML=emps.length?emps.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} — ${esc(e.role||'Sales Rep')}</option>`).join(''):'<option value="">No sales reps created</option>';const c=employeeFromPage();if(c)sel.value=c.id;const s=window.GNDAuth?.getSession?.();if(s?.role!=='admin')$('#employeeSwitcherWrap')?.classList.add('hidden')}
  $('#openEmployeeView')?.addEventListener('click',()=>{const v=$('#employeeSelector')?.value;if(!v){toast('Create a sales rep first');return}localStorage.setItem('gnd_employee_view',v);location.href=`employee-dashboard.html?employee=${encodeURIComponent(v)}`});
  function employeeLeadDetail(x){
    const current=normalizeStatus(x.status);
    const finalLocked=ADMIN_FINAL_STATUSES.has(current);
    if(finalLocked)return `<div class="permission-panel"><strong>Admin-finalized lead</strong><p>${esc(current)} — this record is read-only for sales reps. Ask Admin to reopen it before making further changes.</p><p>Provider: ${esc(x.provider||'Not recorded')} · Order: ${esc(x.orderNumber||'Not recorded')}</p><p>${esc(x.internalNotes||'')}</p></div>`;
    const editableStatuses=[...EMPLOYEE_EDIT_STATUSES];
    if(!editableStatuses.includes(current)&&!finalLocked)editableStatuses.unshift(current);
    const statusControl=finalLocked
      ?`<div class="field"><label>Status</label><div class="locked-status">${statusBadge(current)}<small>Final status is controlled by Admin.</small></div></div>`
      :`<div class="field"><label>Status</label><select name="status">${options(editableStatuses,current)}</select><small class="field-help">Signed Up and Install Scheduled are sent to Admin for verification. Complete, Not Serviceable, Cancelled and Void are Admin-only.</small></div>`;
    return `<form class="employee-lead-form" data-lead-id="${esc(x.id)}"><div class="lead-detail-grid">${lifecycleFields(x)}${statusControl}<div class="field"><label>Next Follow-Up</label><input name="nextFollowUp" type="date" value="${esc(x.nextFollowUp||'')}"></div><div class="field"><label>Provider</label><select name="provider">${options(PROVIDERS,x.provider||'','Select provider')}</select></div><div class="field"><label>Order / Confirmation #</label><input name="orderNumber" value="${esc(x.orderNumber||'')}"></div><div class="field"><label>Install Date</label><input name="installDate" type="date" value="${esc(x.installDate||'')}"></div><div class="field full"><label>Sales Notes</label><textarea name="internalNotes">${esc(x.internalNotes||'')}</textarea></div><div class="field full"><button class="btn btn-primary" type="submit">Save Update</button></div></div></form>`}
  function renderEmployee(){
    if(!$('#employeeLeadTableBody')&&!$('#employeeLeadCards'))return;renderLegend('employeeStatusLegend',true);renderEmployeeSelector();const emp=employeeFromPage();if(!emp){$('#employeeWelcome').textContent='Sales Dashboard';$('#employeeSubtitle').textContent='No sales rep profile exists yet.';$('#employeeLeadTableBody').innerHTML='<tr><td colspan="7" class="empty-state">No employee profile available.</td></tr>';$('#employeeLeadCards').innerHTML='<div class="empty-card">No employee profile available.</div>';return}localStorage.setItem('gnd_employee_view',emp.id);$('#employeeWelcome').textContent=`Welcome, ${emp.name}`;$('#employeeSubtitle').textContent=`${emp.role||'Sales Representative'} · ${emp.email||emp.id}`;const repUrl=referralUrl(emp.code);if($('#employeeCodeDisplay'))$('#employeeCodeDisplay').textContent=emp.code;if($('#employeeLinkDisplay'))$('#employeeLinkDisplay').textContent=repUrl;if($('#employeeQrName'))$('#employeeQrName').textContent=`${emp.name} Referral QR`;if($('#employeeFlyerLink'))$('#employeeFlyerLink').href=marketingHref(emp,'employee');window.GNDMarketing?.renderQR?.('employeeQrPreview',repUrl,210);
    const fs=$('#employeeLeadFilter');if(fs&&!fs.dataset.ready){fs.innerHTML='<option value="all">All statuses</option>'+options(LEAD_STATUSES,'');fs.dataset.ready='1'}const search=String($('#employeeLeadSearch')?.value||'').toLowerCase(),filter=fs?.value||'all';const assigned=allLeads().filter(x=>x.assignedEmployee===emp.id);let leads=assigned.filter(x=>filter==='all'||normalizeStatus(x.status)===filter);if(search)leads=leads.filter(x=>[x.firstName,x.lastName,x.phone,x.address,x.city,serviceText(x)].join(' ').toLowerCase().includes(search));const progressed=assigned.filter(x=>PROGRESS_STATUSES.has(normalizeStatus(x.status))).length,signed=assigned.filter(isWon).length,complete=assigned.filter(x=>normalizeStatus(x.status)==='Complete').length,open=assigned.filter(isOpen).length;$('#empStatAssigned').textContent=assigned.length;$('#empOpenLeads').textContent=open;$('#empStatSigned').textContent=signed;$('#empStatInstalled').textContent=complete;$('#empStatContacted').textContent=progressed;$('#empConversionRate').textContent=assigned.length?Math.round((signed/assigned.length)*100)+'%':'0%';$('#empInstallRate').textContent=signed?Math.round((complete/signed)*100)+'%':'0%';
    $('#employeeLeadTableBody').innerHTML=leads.length?leads.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id)}</span></td><td><div class="contact-stack"><span>${esc(x.phone||'—')}</span><span class="muted-inline">${esc(x.email||'')}</span><div class="contact-actions">${x.phone?`<a class="mini-action" href="tel:${esc(phoneHref(x.phone))}">Call</a><a class="mini-action" href="sms:${esc(phoneHref(x.phone))}">Text</a>`:''}${x.email?`<a class="mini-action" href="mailto:${esc(x.email)}">Email</a>`:''}</div></div></td><td>${esc(addressText(x))}</td><td>${esc(serviceText(x))}</td><td>${esc(partnerSource(x))}</td><td>${statusBadge(x.status)}${ageChip(x)}${needsAdminReview(x)?'<span class="review-chip employee-review-chip">Waiting for Admin verification</span>':''}${x.nextFollowUp?`<br><span class="followup-date">${dateOnly(x.nextFollowUp)}</span>`:''}</td><td><button class="btn btn-secondary manage-btn" type="button" data-employee-toggle="${esc(x.id)}">Work Lead</button></td></tr><tr class="employee-detail-row"><td colspan="7"><div class="lead-detail" id="employee-detail-${esc(x.id)}">${employeeLeadDetail(x)}</div></td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No leads match this view.</td></tr>';
    $('#employeeLeadCards').innerHTML=leads.length?leads.map(x=>`<article class="mobile-data-card"><div class="mobile-card-head"><div><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><span>${esc(x.id)} · ${esc(partnerSource(x))}</span></div>${statusBadge(x.status)}</div>${ageChip(x)}<div class="mobile-contact-actions">${x.phone?`<a href="tel:${esc(phoneHref(x.phone))}">Call</a><a href="sms:${esc(phoneHref(x.phone))}">Text</a>`:''}${x.email?`<a href="mailto:${esc(x.email)}">Email</a>`:''}</div><dl><div><dt>Service</dt><dd>${esc(serviceText(x))}</dd></div><div><dt>Address</dt><dd>${esc(addressText(x))}</dd></div><div><dt>Follow-Up</dt><dd>${dateOnly(x.nextFollowUp)}</dd></div></dl><button class="btn btn-secondary mobile-manage" type="button" data-mobile-employee-toggle="${esc(x.id)}">Work Lead</button><div class="mobile-detail" id="mobile-employee-detail-${esc(x.id)}">${employeeLeadDetail(x)}</div></article>`).join(''):'<div class="empty-card">No leads match this view.</div>';
  }
  $('#employeeLeadSearch')?.addEventListener('input',renderEmployee);$('#employeeLeadFilter')?.addEventListener('change',renderEmployee);
  document.addEventListener('click',e=>{const d=e.target.closest('[data-employee-toggle]');if(d){$('#employee-detail-'+d.dataset.employeeToggle)?.classList.toggle('open');return}const m=e.target.closest('[data-mobile-employee-toggle]');if(m){$('#mobile-employee-detail-'+m.dataset.mobileEmployeeToggle)?.classList.toggle('open')}});
  document.addEventListener('submit',async e=>{const f=e.target.closest('.employee-lead-form');if(!f)return;e.preventDefault();const d=formData(f);if(d.status&&!EMPLOYEE_EDIT_STATUSES.includes(d.status)){const current=allLeads().find(x=>x.id===f.dataset.leadId);if(d.status===current?.status)delete d.status;}if(d.status&&ADMIN_FINAL_STATUSES.has(normalizeStatus(d.status))){toast('That final status is Admin-only');return}try{await patchSharedLead(f.dataset.leadId,d);await syncSharedData();renderEmployee();toast(needsAdminReview({status:d.status})?'Update saved — awaiting Admin verification':'Lead update saved')}catch(err){toast(err.message||'Lead update failed')}});

  $('#downloadEmployeeQr')?.addEventListener('click',()=>{const emp=employeeFromPage();if(emp?.code)window.GNDMarketing?.downloadQR?.('employeeQrPreview',`GetNetDirect-${emp.code}-QR.png`)});$('#copyEmployeeLink')?.addEventListener('click',async()=>{const emp=employeeFromPage();if(!emp?.code)return;const txt=referralUrl(emp.code);try{await navigator.clipboard.writeText(txt);toast('Referral link copied')}catch(e){toast(txt)}});


  function renderAll(){renderPartner();renderAdmin();renderEmployee();}
  async function refresh({automatic=false}={}){
    const ok=await syncSharedData();if(!ok)return false;
    const editing=$('.lead-detail.open,.mobile-detail.open')||document.activeElement?.matches('input,textarea,select');
    if(!automatic||!editing)renderAll();return true;
  }
  function openLead(leadId){
    const search=$('#adminLeadSearch');if(search)search.value=leadId;
    if($('#adminLeadFilter'))$('#adminLeadFilter').value='all';if($('#adminAttentionFilter'))$('#adminAttentionFilter').value='all';renderAdmin();
    const target=document.getElementById((innerWidth<=820?'mobile-admin-detail-':'admin-detail-')+leadId);if(target){target.classList.add('open');target.scrollIntoView({behavior:'smooth',block:'center'});}
  }
  window.GNDPortal={refresh,getData:()=>({leads:allLeads(),employees:getEmployees(),partners:getPartners(),asOf:now().toISOString(),ready:sharedReady,version:sharedVersion}),openLead,toast};
  $('#adminAttentionFilter')?.addEventListener('change',renderAdmin);
  document.addEventListener('click',async e=>{
    const account=e.target.closest('[data-partner-status]');if(account){const p=getPartners().find(x=>x.id===account.dataset.partnerStatus);if(!p)return;const next=p.status==='Active'?'Inactive':'Active';if(!confirm(next+' access for '+p.name+'?'))return;try{await API.setAccountStatus('partners',p.id,next);await refresh();toast('Partner account updated on the server');}catch(err){toast(err.message);}return;}
    const contact=e.target.closest('[data-contact-lead]');if(contact){if(!confirm('Record a '+contact.dataset.contactOutcome+' contact attempt? Save other edits separately first.'))return;contact.disabled=true;try{await API.logContact(contact.dataset.contactLead,{outcome:contact.dataset.contactOutcome});await refresh();toast('Contact attempt recorded');}catch(err){toast(err.message);}finally{contact.disabled=false;}return;}
    const activity=e.target.closest('[data-activity-lead]');if(activity){const output=activity.closest('.lead-activity-tools').querySelector('.activity-history');output.textContent='Loading history…';try{const r=await API.activity(activity.dataset.activityLead);output.innerHTML=r.activity.length?r.activity.map(a=>`<div><strong>${esc(a.event_type)}</strong> · ${esc(a.actor_name||'System')}<br><small>${esc(new Date(a.created_at).toLocaleString())}${a.to_status?' · '+esc(a.to_status):''}</small>${a.note?'<p>'+esc(a.note)+'</p>':''}</div>`).join(''):'No activity recorded yet. History begins with this update.';}catch(err){output.textContent=err.message;}return;}
  });
  renderAll();
  if(window.GNDAuth?.getSession?.()&&API?.token?.())refresh().then(ok=>{if(ok&&params.get('lead'))openLead(params.get('lead'));});
  setInterval(()=>{if(!document.hidden&&window.GNDAuth?.getSession?.()&&API?.token?.())refresh({automatic:true});},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&window.GNDAuth?.getSession?.()&&API?.token?.())refresh({automatic:true});});
})();
