(function(){
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const year=$('[data-year]'); if(year) year.textContent=new Date().getFullYear();
  const menu=$('.menu-btn');
  if(menu) menu.addEventListener('click',()=>{const links=$('.nav-links'); if(links) links.style.display=links.style.display==='flex'?'none':'flex';});

  const params=new URLSearchParams(location.search);
  const ref=params.get('ref')||localStorage.getItem('gnd_ref')||'';
  if(params.get('ref')) localStorage.setItem('gnd_ref',params.get('ref'));
  $$('[data-ref-field]').forEach(el=>{ if(ref) el.value=ref; });
  $$('[data-ref-display]').forEach(el=>{ el.textContent=ref||'Direct'; });

  function id(prefix){return prefix+'-'+Date.now().toString().slice(-7)}
  function save(key,obj){const arr=JSON.parse(localStorage.getItem(key)||'[]');arr.unshift(obj);localStorage.setItem(key,JSON.stringify(arr));return arr}
  function formData(form){const fd=new FormData(form), out={}; for(const [k,v] of fd.entries()){if(out[k]) out[k]=Array.isArray(out[k])?[...out[k],v]:[out[k],v]; else out[k]=v;} return out}
  function setStatus(form,msg,type='success'){const s=$('.form-status',form);if(!s)return;s.className='form-status '+type;s.textContent=msg;s.scrollIntoView({behavior:'smooth',block:'nearest'});}

  const customer=$('#customerForm');
  if(customer) customer.addEventListener('submit',e=>{
    e.preventDefault();
    if(!customer.reportValidity()) return;
    const data=formData(customer); data.id=id('GND'); data.createdAt=new Date().toISOString(); data.status='New'; data.source=data.referralCode||ref||'Direct';
    save('gnd_customer_leads',data);
    setStatus(customer,`Thank you — your request was received. Reference ${data.id}. A connection specialist can follow up using the contact information you provided.`);
    customer.reset(); $$('[data-ref-field]').forEach(el=>{if(ref)el.value=ref});
  });


  const fullCustomer=$('#customerForm2');
  if(fullCustomer){
    const btn=$('#submitFullCustomer');
    if(btn) btn.addEventListener('click',()=>{
      if(!fullCustomer.reportValidity()) return;
      const data=formData(fullCustomer); data.id=id('GND'); data.createdAt=new Date().toISOString(); data.status='New'; data.source=data.referralCode||ref||'Direct';
      save('gnd_customer_leads',data);
      setStatus(fullCustomer,`Thank you — your request was received. Reference ${data.id}. A connection specialist can follow up using the contact information you provided.`);
      fullCustomer.reset(); $$('[data-ref-field]').forEach(el=>{if(ref)el.value=ref});
    });
  }

  const referral=$('#referralForm');
  if(referral) referral.addEventListener('submit',e=>{
    e.preventDefault(); if(!referral.reportValidity())return;
    const data=formData(referral); data.id=id('REF'); data.createdAt=new Date().toISOString(); data.status='New Referral'; data.source=data.partnerCode||'DEMO-PARTNER';
    save('gnd_partner_referrals',data);
    setStatus(referral,`Referral submitted successfully. Confirmation ${data.id}.`);
    referral.reset();
  });

  const partnerApply=$('#partnerApplyForm');
  if(partnerApply) partnerApply.addEventListener('submit',e=>{
    e.preventDefault(); if(!partnerApply.reportValidity())return;
    const data=formData(partnerApply); data.id=id('PART'); data.createdAt=new Date().toISOString(); data.status='Pending Review';
    save('gnd_partner_applications',data);
    setStatus(partnerApply,`Application received. Reference ${data.id}. We will review your partner request and contact you.`);
    partnerApply.reset();
  });

  const copyBtn=$('[data-copy]');
  if(copyBtn) copyBtn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(copyBtn.dataset.copy);copyBtn.textContent='Copied';setTimeout(()=>copyBtn.textContent='Copy link',1400)}catch(e){}});

  function renderAdmin(){
    const body=$('#leadTableBody'); if(!body) return;
    const direct=JSON.parse(localStorage.getItem('gnd_customer_leads')||'[]');
    const refs=JSON.parse(localStorage.getItem('gnd_partner_referrals')||'[]');
    const all=[...direct,...refs].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    $('#statLeads').textContent=all.length;
    $('#statReferrals').textContent=refs.length;
    $('#statDirect').textContent=direct.length;
    $('#statInstalled').textContent=all.filter(x=>x.status==='Installed').length;
    if(!all.length){body.innerHTML='<tr><td colspan="7" style="text-align:center;color:#7b899b;padding:26px">No locally submitted leads yet. Submit a customer or partner referral form to see it here.</td></tr>';return}
    body.innerHTML=all.map(x=>`<tr><td><strong>${esc((x.firstName||'')+' '+(x.lastName||''))}</strong><br><span class="small">${esc(x.id||'')}</span></td><td>${esc(x.phone||'')}</td><td>${esc([x.address,x.city,x.state,x.zip].filter(Boolean).join(', '))}</td><td>${esc(Array.isArray(x.services)?x.services.join(', '):(x.services||x.service||'—'))}</td><td>${esc(x.source||'Direct')}</td><td><span class="badge new">${esc(x.status||'New')}</span></td><td>${new Date(x.createdAt).toLocaleDateString()}</td></tr>`).join('');
  }
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  renderAdmin();
})();
