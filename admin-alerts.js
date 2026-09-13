(function(){
  'use strict';
  if(window.GNDAuth?.getSession?.()?.role!=='admin')return;
  const C=window.GNDInsights,$=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let seen=null,lastSnapshot=null,first=true,lastApplications=0;
  const session=window.GNDAuth.getSession(),popupKey='gnd-v11-alert-popup-'+session.username+'-'+session.expiresAt;
  function update({leads,employees,asOf,version}){
    if(!$('#adminActionCenter'))return;
    lastSnapshot={leads,employees,asOf};const summary=C.summarize(leads,asOf);
    const mapping={alertNew:'new',alertUrgent:'urgent',alertWarning:'warning',alertReview:'review',alertOverdue:'overdue',alertUnassigned:'unassigned'};
    Object.entries(mapping).forEach(([id,key])=>{if($('#'+id))$('#'+id).textContent=summary[key];});
    if($('#alertSyncTime'))$('#alertSyncTime').textContent='As of '+new Date(asOf).toLocaleString('en-US',{timeZone:C.ZONE})+' Eastern · checks every 30 seconds while this page is open';
    if($('#alertVersionWarning'))$('#alertVersionWarning').hidden=version>=11;
    const names=new Map(employees.map(e=>[e.id,e.name]));
    $('#attentionQueue').innerHTML=summary.queue.length?summary.queue.slice(0,8).map(({lead:l,attention:a})=>`<article class="attention-row severity-${a.level}"><div class="queue-symbol" aria-hidden="true">${a.level==='urgent'?'!':a.level==='warning'?'◷':'+'}</div><div class="queue-copy"><strong>${esc(l.firstName+' '+l.lastName)}</strong><span>${esc(names.get(l.assignedEmployee)||'Unassigned')} · ${esc(l.status)} · ${a.hours}h</span><p>${esc(a.reasons.join(' · '))}</p></div><button type="button" class="btn btn-secondary" data-open-lead="${esc(l.id)}">Open Lead</button></article>`).join(''):'<div class="clear-queue"><strong>No overdue or unworked leads.</strong><p>New customer requests will appear here after they reach the shared database.</p></div>';
    $('#attentionQueueCount').textContent=summary.queue.length>8?`Showing 8 of ${summary.queue.length} leads needing attention. Use the filters below for the full queue.`:'Sorted by urgency, then oldest activity first. Counts may overlap.';
    if(seen){const fresh=leads.filter(x=>!seen.has(x.id));if(fresh.length){$('#newLeadBanner').hidden=false;$('#newLeadBannerText').textContent=`${fresh.length} new lead${fresh.length===1?'':'s'} arrived. Open the lead list to assign or work them.`;window.GNDPortal.toast('New customer lead received');}}
    seen=new Set(leads.map(x=>x.id));
    if(first){first=false;if(summary.queue.length&&!sessionStorage.getItem(popupKey)){sessionStorage.setItem(popupKey,'1');$('#loginAlertSummary').textContent=`${summary.new} new / unworked • ${summary.urgent} urgent • ${summary.warning} delayed • ${summary.review} awaiting your verification`;const dialog=$('#loginAlertDialog');if(dialog?.showModal)dialog.showModal();}}
    if(Date.now()-lastApplications>60000){lastApplications=Date.now();loadApplications();}
  }
  async function loadApplications(){const host=$('#partnerApplicationInbox');if(!host)return;try{const r=await window.GNDAPI.applications();const rows=r.applications||[];$('#applicationCount').textContent=rows.filter(x=>x.status==='Pending Review').length;
    host.innerHTML=rows.length?rows.map(a=>`<article class="application-card"><div><strong>${esc(a.business_name)}</strong><p>${esc(a.contact_name)} · ${esc(a.partner_type||'Referral Partner')}</p><p>${esc(a.email)} · ${esc(a.phone||'')}</p><small>Submitted ${esc(new Date(a.created_at).toLocaleDateString())} · ${esc(a.id)}</small></div><div class="field"><label for="application-${esc(a.id)}">Review status</label><select id="application-${esc(a.id)}" data-application-status="${esc(a.id)}">${['Pending Review','Contacted','Account Created','Declined'].map(v=>`<option${v===a.status?' selected':''}>${v}</option>`).join('')}</select></div></article>`).join(''):'<p class="report-note">No partner applications received yet. Applications created before v11 are not automatically imported from browser storage.</p>';
  }catch(e){host.textContent='Partner application inbox is not connected yet. Upload the v11 API update.';}}
  window.addEventListener('gnd-data-updated',e=>update(e.detail));
  window.addEventListener('gnd-sync-error',e=>{$('#alertSyncTime').textContent='Connection problem: '+e.detail+' Alerts may be stale until the next successful refresh.';});
  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-open-lead]');if(open)window.GNDPortal.openLead(open.dataset.openLead);
    const filter=e.target.closest('[data-attention-filter]');if(filter){$('#adminAttentionFilter').value=filter.dataset.attentionFilter;$('#adminLeadFilter').value='all';$('#adminLeadSearch').value='';$('#adminAttentionFilter').dispatchEvent(new Event('change'));$('#leads').scrollIntoView({behavior:'smooth',block:'start'});}
    if(e.target.closest('[data-dismiss-login-alert]'))$('#loginAlertDialog').close();
    if(e.target.closest('#loginGoQueue')){$('#loginAlertDialog').close();$('#adminActionCenter').scrollIntoView({behavior:'smooth'});}
    if(e.target.closest('#dismissNewLeadBanner'))$('#newLeadBanner').hidden=true;
  });
  document.addEventListener('change',async e=>{const field=e.target.closest('[data-application-status]');if(!field)return;field.disabled=true;try{await window.GNDAPI.setApplicationStatus(field.dataset.applicationStatus,field.value);window.GNDPortal.toast('Application review updated');await loadApplications();}catch(err){window.GNDPortal.toast(err.message);}finally{field.disabled=false;}});
  const existing=window.GNDPortal?.getData?.();if(existing?.ready)update(existing);
})();
