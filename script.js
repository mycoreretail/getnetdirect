(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const STORE_DIRECT='gnd_customer_leads';
  const STORE_REF='gnd_partner_referrals';
  const STORE_EMP='gnd_employees';

  const year=$('[data-year]'); if(year) year.textContent=new Date().getFullYear();
  const menu=$('.menu-btn');
  if(menu) menu.addEventListener('click',()=>{
    const links=$('.nav-links'); if(!links)return;
    const open=links.classList.toggle('open');
    menu.setAttribute('aria-expanded',open?'true':'false');
    menu.textContent=open?'✕':'☰';
  });
  $$('.nav-links a').forEach(a=>a.addEventListener('click',()=>{
    const links=$('.nav-links'); if(links)links.classList.remove('open');
    if(menu){menu.setAttribute('aria-expanded','false');menu.textContent='☰';}
  }));

  const params=new URLSearchParams(location.search);
  const ref=params.get('ref')||localStorage.getItem('gnd_ref')||'';
  if(params.get('ref')) localStorage.setItem('gnd_ref',params.get('ref'));
  $$('[data-ref-field]').forEach(el=>{if(ref) el.value=ref;});
  $$('[data-ref-display]').forEach(el=>{el.textContent=ref||'Direct';});

  function arr(key){try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(e){return[]}}
  function put(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function id(prefix){return prefix+'-'+Math.random().toString(36).slice(2,6).toUpperCase()+Date.now().toString().slice(-4)}
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function money(v){const n=Number(v||0);return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2})}
  function dateOnly(v){if(!v)return'—';const d=new Date(v.length===10?v+'T12:00:00':v);return isNaN(d)?'—':d.toLocaleDateString()}
  function phoneHref(v){return String(v||'').replace(/[^0-9+]/g,'')}
  function formData(form){const fd=new FormData(form),out={};for(const[k,v]of fd.entries()){if(out[k])out[k]=Array.isArray(out[k])?[...out[k],v]:[out[k],v];else out[k]=v;}return out}
  function save(key,obj){const a=arr(key);a.unshift(obj);put(key,a);return a}
  function setStatus(form,msg,type='success'){const s=$('.form-status',form);if(!s)return;s.className='form-status '+type;s.textContent=msg;s.style.display='block';}
  function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__gndToast);window.__gndToast=setTimeout(()=>t.classList.remove('show'),2200)}
  function allLeads(){
    return [
      ...arr(STORE_DIRECT).map(x=>({...x,_storeKey:STORE_DIRECT,_partner:false})),
      ...arr(STORE_REF).map(x=>({...x,_storeKey:STORE_REF,_partner:true}))
    ].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  }
  function updateLead(leadId,updates){
    for(const key of [STORE_DIRECT,STORE_REF]){
      const data=arr(key);const i=data.findIndex(x=>x.id===leadId);
      if(i>=0){data[i]={...data[i],...updates,updatedAt:new Date().toISOString()};put(key,data);return data[i];}
    }
    return null;
  }
  function getEmployees(){return arr(STORE_EMP)}
  function employeeName(empId){const e=getEmployees().find(x=>x.id===empId);return e?e.name:'Unassigned'}
  function serviceText(x){return Array.isArray(x.services)?x.services.join(', '):(x.services||x.service||'—')}
  function addressText(x){return [x.address,x.unit?('Unit '+x.unit):'',x.city,x.state,x.zip].filter(Boolean).join(', ')}
  function statusClass(status){
    const s=String(status||'').toLowerCase();
    if(s.includes('installed'))return'installed';
    if(s.includes('signed up'))return'signed';
    if(s.includes('scheduled'))return'scheduled';
    if(s.includes('qualified'))return'qualified';
    if(s.includes('assigned'))return'assigned';
    if(s.includes('contact'))return'contact';
    if(s.includes('not signed'))return'not-signed';
    if(s.includes('cancel'))return'cancel';
    return'new';
  }
  function payoutClass(status){
    const s=String(status||'').toLowerCase();
    if(s==='paid')return'paid-pay';
    if(s==='approved')return'approved-pay';
    if(s==='pending')return'pending-pay';
    return'none-pay';
  }
  function isWon(x){return['Signed Up','Install Scheduled','Installed'].includes(x.status)}
  function isOpen(x){return !['Installed','Not Signed Up','Cancelled'].includes(x.status)}
  function partnerSource(x){return x._partner ? (x.source||x.partnerCode||'Partner') : (x.source&&x.source!=='Direct'?x.source:'')}
  const LEAD_STATUSES=['New','New Referral','Assigned','Contacted','Qualified','Signed Up','Install Scheduled','Installed','Not Signed Up','Cancelled'];
  const PAYOUT_STATUSES=['Not Set','Pending','Approved','Paid'];
  const PROVIDERS=['','AT&T','Verizon','Spectrum','Frontier','Optimum','Xfinity','T-Mobile','Other'];
  function options(list,current){return list.map(v=>`<option value="${esc(v)}"${String(v)===String(current||'')?' selected':''}>${esc(v||'Select')}</option>`).join('')}
  function employeeOptions(current){
    const employees=getEmployees().filter(e=>e.status!=='Inactive');
    return `<option value="">Unassigned</option>`+employees.map(e=>`<option value="${esc(e.id)}"${e.id===current?' selected':''}>${esc(e.name)}</option>`).join('');
  }

  /* Public customer forms */
  const customer=$('#customerForm');
  if(customer) customer.addEventListener('submit',e=>{
    e.preventDefault();if(!customer.reportValidity())return;
    const data=formData(customer);data.id=id('GND');data.createdAt=new Date().toISOString();data.status='New';data.source=data.referralCode||ref||'Direct';
    save(STORE_DIRECT,data);setStatus(customer,`Thank you — your request was received. Reference ${data.id}. A connection specialist can follow up using the contact information you provided.`);customer.reset();$$('[data-ref-field]').forEach(el=>{if(ref)el.value=ref});
  });

  const fullCustomer=$('#customerForm2');
  if(fullCustomer){const btn=$('#submitFullCustomer');if(btn)btn.addEventListener('click',()=>{
    if(!fullCustomer.reportValidity())return;const data=formData(fullCustomer);data.id=id('GND');data.createdAt=new Date().toISOString();data.status='New';data.source=data.referralCode||ref||'Direct';
    save(STORE_DIRECT,data);setStatus(fullCustomer,`Thank you — your request was received. Reference ${data.id}. A connection specialist can follow up using the contact information you provided.`);fullCustomer.reset();$$('[data-ref-field]').forEach(el=>{if(ref)el.value=ref});
  });}

  const partnerApply=$('#partnerApplyForm');
  if(partnerApply) partnerApply.addEventListener('submit',e=>{
    e.preventDefault();if(!partnerApply.reportValidity())return;const data=formData(partnerApply);data.id=id('PART');data.createdAt=new Date().toISOString();data.status='Pending Review';save('gnd_partner_applications',data);setStatus(partnerApply,`Application received. Reference ${data.id}. We will review your partner request and contact you.`);partnerApply.reset();
  });

  /* Partner portal */
  function currentPartnerCode(){
    const q=params.get('partner');
    if(q){localStorage.setItem('gnd_partner_code',q);return q}
    return localStorage.getItem('gnd_partner_code')||'DEMO123';
  }
  const partnerCode=currentPartnerCode();
  const codeDisplay=$('#partnerCodeDisplay'),linkDisplay=$('#partnerLinkDisplay'),codeField=$('#partnerCodeField');
  if(codeDisplay)codeDisplay.textContent=partnerCode;
  if(linkDisplay)linkDisplay.textContent=`https://getnetdirect.com/?ref=${partnerCode}`;
  if(codeField)codeField.value=partnerCode;
  const copyPartnerLink=$('#copyPartnerLink');
  if(copyPartnerLink)copyPartnerLink.addEventListener('click',async()=>{const text=`https://getnetdirect.com/?ref=${partnerCode}`;try{await navigator.clipboard.writeText(text);toast('Referral link copied')}catch(e){toast(text)}});

  const referral=$('#referralForm');
  if(referral) referral.addEventListener('submit',e=>{
    e.preventDefault();if(!referral.reportValidity())return;
    const data=formData(referral);data.id=id('REF');data.createdAt=new Date().toISOString();data.status='New Referral';data.source=data.partnerCode||partnerCode;data.payoutAmount=0;data.payoutStatus='Not Set';
    save(STORE_REF,data);setStatus(referral,`Referral submitted successfully. Confirmation ${data.id}.`);referral.reset();if(codeField)codeField.value=partnerCode;renderPartner();
  });

  function renderPartner(){
    const history=$('#partnerHistoryBody');if(!history)return;
    const leads=arr(STORE_REF).filter(x=>(x.source||x.partnerCode)===partnerCode).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    const won=leads.filter(isWon).length;const pending=leads.filter(isOpen).length;const approved=leads.filter(x=>x.payoutStatus==='Approved').reduce((s,x)=>s+Number(x.payoutAmount||0),0);const paid=leads.filter(x=>x.payoutStatus==='Paid').reduce((s,x)=>s+Number(x.payoutAmount||0),0);
    if($('#partnerStatReferrals'))$('#partnerStatReferrals').textContent=leads.length;
    if($('#partnerStatSigned'))$('#partnerStatSigned').textContent=won;
    if($('#partnerStatPending'))$('#partnerStatPending').textContent=pending;
    if($('#partnerStatApproved'))$('#partnerStatApproved').textContent=money(approved);
    if($('#partnerPaidTotal'))$('#partnerPaidTotal').textContent=money(paid);
    history.innerHTML=leads.length?leads.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id||'')}</span></td><td>${dateOnly(x.createdAt)}</td><td>${esc(serviceText(x))}</td><td>${dateOnly(x.moveIn)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status||'New Referral')}</span></td><td>${Number(x.payoutAmount||0)>0?`<span class="money">${money(x.payoutAmount)}</span><br><span class="badge ${payoutClass(x.payoutStatus)}">${esc(x.payoutStatus||'Not Set')}</span>`:'—'}</td></tr>`).join(''):`<tr><td colspan="6" class="empty-state">No referrals submitted under code ${esc(partnerCode)} yet.</td></tr>`;
    const pbody=$('#partnerPayoutBody');if(pbody){
      const payouts=leads.filter(x=>Number(x.payoutAmount||0)>0||x.payoutStatus&&x.payoutStatus!=='Not Set');
      pbody.innerHTML=payouts.length?payouts.map(x=>`<tr${x.payoutStatus==='Paid'?' class="paid-row"':''}><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong></td><td><span class="badge ${statusClass(x.status)}">${esc(x.status||'—')}</span></td><td class="money">${money(x.payoutAmount)}</td><td><span class="badge ${payoutClass(x.payoutStatus)}">${esc(x.payoutStatus||'Not Set')}</span></td><td>${dateOnly(x.payoutPaidDate)}</td><td>${esc(x.payoutReference||'—')}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No payout entries yet.</td></tr>';
    }
  }
  renderPartner();

  /* Admin portal */
  function renderAdmin(){
    const body=$('#adminLeadTableBody');if(!body)return;
    const leads=allLeads();const direct=arr(STORE_DIRECT),refs=arr(STORE_REF);
    const search=String($('#adminLeadSearch')?.value||'').trim().toLowerCase();const filter=$('#adminLeadFilter')?.value||'all';
    const filtered=leads.filter(x=>{
      const hay=[x.firstName,x.lastName,x.phone,x.email,x.address,x.city,x.source,serviceText(x)].join(' ').toLowerCase();
      return(!search||hay.includes(search))&&(filter==='all'||x.status===filter);
    });
    const unpaid=refs.filter(x=>['Pending','Approved'].includes(x.payoutStatus)).reduce((s,x)=>s+Number(x.payoutAmount||0),0);
    if($('#statLeads'))$('#statLeads').textContent=leads.length;
    if($('#statReferrals'))$('#statReferrals').textContent=refs.length;
    if($('#statSignedUp'))$('#statSignedUp').textContent=leads.filter(isWon).length;
    if($('#statUnpaidPayouts'))$('#statUnpaidPayouts').textContent=money(unpaid);
    if($('#statInstalled'))$('#statInstalled').textContent=leads.filter(x=>x.status==='Installed').length;

    if(!filtered.length){body.innerHTML='<tr><td colspan="8" class="empty-state">No leads match this view yet.</td></tr>';}else{
      body.innerHTML=filtered.map(x=>{
        const source=x._partner?partnerSource(x):(x.source||'Direct');
        const payout=x._partner&&Number(x.payoutAmount||0)>0?`${money(x.payoutAmount)} · ${x.payoutStatus||'Not Set'}`:'—';
        return `<tr class="lead-main-row"><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id||'')}</span></td><td><div class="contact-stack"><span>${esc(x.phone||'—')}</span><span class="muted-inline">${esc(x.email||'')}</span></div></td><td><strong>${esc(serviceText(x))}</strong><br><span class="muted-inline">${esc(addressText(x))}</span></td><td>${x._partner?`<span class="lead-source">${esc(source)}</span>`:'Direct'}</td><td>${esc(employeeName(x.assignedEmployee))}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status||'New')}</span></td><td>${esc(payout)}</td><td><button class="btn btn-secondary manage-btn" type="button" data-admin-toggle="${esc(x.id)}">Manage</button></td></tr>
        <tr class="admin-detail-row"><td colspan="8"><div class="lead-detail" id="admin-detail-${esc(x.id)}"><form class="admin-lead-form" data-lead-id="${esc(x.id)}">
          <div class="lead-detail-grid">
            <div class="field"><label>Assigned Employee</label><select name="assignedEmployee">${employeeOptions(x.assignedEmployee)}</select></div>
            <div class="field"><label>Lead Status</label><select name="status">${options(LEAD_STATUSES,x.status)}</select></div>
            <div class="field"><label>Provider</label><select name="provider">${options(PROVIDERS,x.provider||'')}</select></div>
            <div class="field"><label>Order / Confirmation #</label><input name="orderNumber" value="${esc(x.orderNumber||'')}"></div>
            <div class="field"><label>Install Date</label><input name="installDate" type="date" value="${esc(x.installDate||'')}"></div>
            ${x._partner?`<div class="field"><label>Partner Payout Amount</label><input name="payoutAmount" type="number" min="0" step="0.01" value="${esc(x.payoutAmount||0)}"></div><div class="field"><label>Payout Status</label><select name="payoutStatus">${options(PAYOUT_STATUSES,x.payoutStatus||'Not Set')}</select></div><div class="field"><label>Paid Date</label><input name="payoutPaidDate" type="date" value="${esc(x.payoutPaidDate||'')}"></div><div class="field"><label>Payment Reference</label><input name="payoutReference" value="${esc(x.payoutReference||'')}" placeholder="ACH/check/reference #"></div>`:''}
            <div class="field full"><label>Internal Notes</label><textarea name="internalNotes" placeholder="Call attempts, customer preferences, order notes...">${esc(x.internalNotes||'')}</textarea></div>
            <div class="field full"><div class="lead-detail-actions"><button class="btn btn-primary" type="submit">Save Lead</button>${x._partner?`<button class="btn btn-secondary" type="button" data-copy-partner-update="${esc(x.id)}">Copy Partner Update</button>`:''}<span class="detail-note">Last updated: ${dateOnly(x.updatedAt||x.createdAt)}</span></div></div>
          </div>
        </form></div></td></tr>`;
      }).join('');
    }
    renderLedger(leads.filter(x=>x._partner));renderEmployees();
  }

  function renderLedger(refs){
    const body=$('#payoutLedgerBody');if(!body)return;
    const rows=refs.filter(x=>Number(x.payoutAmount||0)>0||x.payoutStatus&&x.payoutStatus!=='Not Set');
    const pending=rows.filter(x=>['Pending','Approved'].includes(x.payoutStatus)).reduce((s,x)=>s+Number(x.payoutAmount||0),0);
    const paid=rows.filter(x=>x.payoutStatus==='Paid').reduce((s,x)=>s+Number(x.payoutAmount||0),0);
    if($('#ledgerPendingTotal'))$('#ledgerPendingTotal').textContent=money(pending);
    if($('#ledgerPaidTotal'))$('#ledgerPaidTotal').textContent=money(paid);
    body.innerHTML=rows.length?rows.map(x=>`<tr${x.payoutStatus==='Paid'?' class="paid-row"':''}><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id)}</span></td><td><span class="lead-source">${esc(partnerSource(x))}</span></td><td><span class="badge ${statusClass(x.status)}">${esc(x.status||'—')}</span></td><td class="money">${money(x.payoutAmount)}</td><td><span class="badge ${payoutClass(x.payoutStatus)}">${esc(x.payoutStatus||'Not Set')}</span></td><td>${dateOnly(x.payoutPaidDate)}</td><td>${esc(x.payoutReference||'—')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No payout ledger entries yet. Open a partner lead and enter a payout amount/status.</td></tr>';
  }

  function renderEmployees(){
    const body=$('#employeeTableBody');if(!body)return;
    const employees=getEmployees();const leads=allLeads();
    body.innerHTML=employees.length?employees.map(e=>`<tr><td><strong>${esc(e.name)}</strong><br><span class="muted-inline">${esc(e.id)}</span></td><td>${esc(e.role||'Sales Representative')}</td><td>${esc(e.email||'—')}<br><span class="muted-inline">${esc(e.phone||'')}</span></td><td>${leads.filter(x=>x.assignedEmployee===e.id).length}</td><td><span class="badge ${e.status==='Inactive'?'not-signed':'installed'}">${esc(e.status||'Active')}</span></td><td><a class="btn btn-secondary manage-btn" href="employee-dashboard.html?employee=${encodeURIComponent(e.id)}">Open Portal</a> <button class="btn btn-secondary manage-btn" type="button" data-toggle-employee="${esc(e.id)}">${e.status==='Inactive'?'Activate':'Deactivate'}</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No employees created yet. Use the form above to create your first employee portal.</td></tr>';
  }

  const employeeCreate=$('#employeeCreateForm');
  if(employeeCreate)employeeCreate.addEventListener('submit',e=>{
    e.preventDefault();if(!employeeCreate.reportValidity())return;const data=formData(employeeCreate);data.id=id('EMP');data.createdAt=new Date().toISOString();data.status='Active';save(STORE_EMP,data);setStatus(employeeCreate,`${data.name} was created. Their portal ID is ${data.id}.`);employeeCreate.reset();renderAdmin();
  });
  $('#adminLeadSearch')?.addEventListener('input',renderAdmin);$('#adminLeadFilter')?.addEventListener('change',renderAdmin);$('#refreshAdmin')?.addEventListener('click',()=>{renderAdmin();toast('Dashboard refreshed')});

  document.addEventListener('click',async e=>{
    const toggle=e.target.closest('[data-admin-toggle]');if(toggle){const d=document.getElementById('admin-detail-'+toggle.dataset.adminToggle);if(d)d.classList.toggle('open');return}
    const empToggle=e.target.closest('[data-toggle-employee]');if(empToggle){const data=getEmployees();const i=data.findIndex(x=>x.id===empToggle.dataset.toggleEmployee);if(i>=0){data[i].status=data[i].status==='Inactive'?'Active':'Inactive';put(STORE_EMP,data);renderAdmin();toast('Employee status updated')}return}
    const copy=e.target.closest('[data-copy-partner-update]');if(copy){const lead=allLeads().find(x=>x.id===copy.dataset.copyPartnerUpdate);if(!lead)return;const payout=Number(lead.payoutAmount||0)>0?` Payout: ${lead.payoutStatus||'Not Set'} ${money(lead.payoutAmount)}.`:'';const msg=`GetNetDirect referral update — ${lead.firstName||''} ${lead.lastName||''}: ${lead.status||'In Progress'}.${payout} Thank you for your referral.`;try{await navigator.clipboard.writeText(msg);toast('Partner update copied')}catch(err){toast('Could not copy message')}return}
  });

  document.addEventListener('submit',e=>{
    const form=e.target.closest('.admin-lead-form');if(!form)return;e.preventDefault();const data=formData(form);if(data.payoutStatus==='Paid'&&!data.payoutPaidDate)data.payoutPaidDate=new Date().toISOString().slice(0,10);updateLead(form.dataset.leadId,data);renderAdmin();toast('Lead updated');
  });

  renderAdmin();

  /* Employee portal */
  function employeeFromPage(){
    const requested=params.get('employee')||localStorage.getItem('gnd_employee_view')||'';
    const employees=getEmployees();return employees.find(x=>x.id===requested)||employees.find(x=>x.status!=='Inactive')||null;
  }
  function renderEmployeeSelector(){
    const sel=$('#employeeSelector');if(!sel)return;const employees=getEmployees().filter(x=>x.status!=='Inactive');
    sel.innerHTML=employees.length?employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} — ${esc(e.role||'Sales Representative')}</option>`).join(''):'<option value="">No employees created yet</option>';
    const current=employeeFromPage();if(current)sel.value=current.id;
  }
  $('#openEmployeeView')?.addEventListener('click',()=>{const idv=$('#employeeSelector')?.value;if(!idv){toast('Create an employee in the admin portal first');return}localStorage.setItem('gnd_employee_view',idv);location.href=`employee-dashboard.html?employee=${encodeURIComponent(idv)}`;});

  function renderEmployee(){
    const body=$('#employeeLeadTableBody');if(!body)return;renderEmployeeSelector();const emp=employeeFromPage();
    if(!emp){$('#employeeWelcome').textContent='Employee Dashboard';$('#employeeSubtitle').textContent='No employee profiles exist yet. Create one from the admin portal.';body.innerHTML='<tr><td colspan="7" class="empty-state">No employee profile is available yet.</td></tr>';return}
    localStorage.setItem('gnd_employee_view',emp.id);$('#employeeWelcome').textContent=`Welcome, ${emp.name}`;$('#employeeSubtitle').textContent=`${emp.role||'Sales Representative'} · ${emp.email||emp.id}`;
    const search=String($('#employeeLeadSearch')?.value||'').toLowerCase();let leads=allLeads().filter(x=>x.assignedEmployee===emp.id);if(search)leads=leads.filter(x=>[x.firstName,x.lastName,x.phone,x.address,x.city,serviceText(x)].join(' ').toLowerCase().includes(search));
    const assigned=allLeads().filter(x=>x.assignedEmployee===emp.id);const contacted=assigned.filter(x=>['Contacted','Qualified','Signed Up','Install Scheduled','Installed'].includes(x.status)).length;const signed=assigned.filter(isWon).length;const installed=assigned.filter(x=>x.status==='Installed').length;const open=assigned.filter(isOpen).length;
    $('#empStatAssigned').textContent=assigned.length;$('#empStatContacted').textContent=contacted;$('#empStatSigned').textContent=signed;$('#empStatInstalled').textContent=installed;$('#empConversionRate').textContent=assigned.length?Math.round((signed/assigned.length)*100)+'%':'0%';$('#empInstallRate').textContent=signed?Math.round((installed/signed)*100)+'%':'0%';$('#empOpenLeads').textContent=open;
    body.innerHTML=leads.length?leads.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="muted-inline">${esc(x.id)}</span></td><td><div class="contact-stack"><span>${esc(x.phone||'—')}</span><span class="muted-inline">${esc(x.email||'')}</span><div class="contact-actions">${x.phone?`<a class="mini-action" href="tel:${esc(phoneHref(x.phone))}">Call</a><a class="mini-action" href="sms:${esc(phoneHref(x.phone))}">Text</a>`:''}${x.email?`<a class="mini-action" href="mailto:${esc(x.email)}">Email</a>`:''}</div></div></td><td>${esc(addressText(x))}</td><td>${esc(serviceText(x))}</td><td>${x._partner?`<span class="lead-source">${esc(partnerSource(x))}</span>`:'Direct'}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status||'New')}</span></td><td><button class="btn btn-secondary manage-btn" type="button" data-employee-toggle="${esc(x.id)}">Work Lead</button></td></tr><tr class="employee-detail-row"><td colspan="7"><div class="lead-detail" id="employee-detail-${esc(x.id)}"><form class="employee-lead-form" data-lead-id="${esc(x.id)}"><div class="lead-detail-grid"><div class="field"><label>Status</label><select name="status">${options(LEAD_STATUSES,x.status)}</select></div><div class="field"><label>Provider</label><select name="provider">${options(PROVIDERS,x.provider||'')}</select></div><div class="field"><label>Order / Confirmation #</label><input name="orderNumber" value="${esc(x.orderNumber||'')}"></div><div class="field"><label>Install Date</label><input name="installDate" type="date" value="${esc(x.installDate||'')}"></div><div class="field full"><label>Employee Notes</label><textarea name="internalNotes" placeholder="Call attempts, quote details, follow-up notes...">${esc(x.internalNotes||'')}</textarea></div><div class="field full"><div class="lead-detail-actions"><button class="btn btn-primary" type="submit">Save Update</button><span class="detail-note">Partner payout information is managed by an administrator.</span></div></div></div></form></div></td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No leads are assigned to this employee yet.</td></tr>';
  }
  $('#employeeLeadSearch')?.addEventListener('input',renderEmployee);
  document.addEventListener('click',e=>{const t=e.target.closest('[data-employee-toggle]');if(!t)return;const d=document.getElementById('employee-detail-'+t.dataset.employeeToggle);if(d)d.classList.toggle('open')});
  document.addEventListener('submit',e=>{const form=e.target.closest('.employee-lead-form');if(!form)return;e.preventDefault();updateLead(form.dataset.leadId,formData(form));renderEmployee();toast('Lead update saved')});
  renderEmployee();
})();
