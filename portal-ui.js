(function(){
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function setupActiveSidebar(){
    const sidebar=$('.sidebar');
    if(!sidebar)return;
    const links=$$('.side-link[href^="#"]',sidebar);
    if(!links.length)return;
    const targets=links.map(link=>{
      const hash=link.getAttribute('href');
      return {link,hash,target:hash&&hash.length>1?document.querySelector(hash):null};
    }).filter(x=>x.target);

    function activate(link){
      $$('.side-link.active',sidebar).forEach(a=>a.classList.remove('active'));
      if(link){
        link.classList.add('active');
        try{link.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});}catch{}
      }
    }

    links.forEach(link=>link.addEventListener('click',()=>activate(link)));

    let scheduled=false;
    function updateFromScroll(){
      scheduled=false;
      const marker=Math.min(165,window.innerHeight*.28);
      let best=null,bestTop=-Infinity;
      for(const item of targets){
        const rect=item.target.getBoundingClientRect();
        if(rect.top<=marker && rect.bottom>70 && rect.top>bestTop){best=item;bestTop=rect.top;}
      }
      if(!best){
        let distance=Infinity;
        for(const item of targets){
          const d=Math.abs(item.target.getBoundingClientRect().top-marker);
          if(d<distance){distance=d;best=item;}
        }
      }
      if(best)activate(best.link);
    }
    window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateFromScroll);}}, {passive:true});
    window.addEventListener('hashchange',()=>{
      const link=links.find(a=>a.getAttribute('href')===location.hash);
      if(link)activate(link); else updateFromScroll();
    });
    const hashLink=links.find(a=>a.getAttribute('href')===location.hash);
    if(hashLink)activate(hashLink); else updateFromScroll();
  }

  const isAdmin=()=>window.GNDAuth?.getSession?.()?.role==='admin';

  function leadById(id){
    return window.GNDPortal?.getData?.()?.leads?.find(x=>String(x.id)===String(id))||null;
  }

  function spamButton(id,small=false){
    const b=document.createElement('button');
    b.type='button';
    b.className='btn btn-spam'+(small?' compact-btn':'');
    b.dataset.spamLead=id;
    b.textContent='Spam / Delete';
    b.setAttribute('aria-label','Delete this lead as spam');
    return b;
  }

  function injectSpamActions(){
    if(!isAdmin())return;
    $$('[data-admin-toggle]').forEach(btn=>{
      const id=btn.dataset.adminToggle,cell=btn.parentElement;
      if(cell && !cell.querySelector('[data-spam-lead="'+CSS.escape(id)+'"]')){
        let wrap=cell.querySelector('.lead-row-actions');
        if(!wrap){
          wrap=document.createElement('div');wrap.className='lead-row-actions';
          cell.insertBefore(wrap,btn);wrap.appendChild(btn);
        }
        wrap.appendChild(spamButton(id,true));
      }
    });
    $$('[data-mobile-admin-toggle]').forEach(btn=>{
      const id=btn.dataset.mobileAdminToggle,card=btn.closest('.mobile-data-card');
      if(card && !card.querySelector('[data-spam-lead="'+CSS.escape(id)+'"]')){
        let wrap=document.createElement('div');wrap.className='lead-row-actions';
        btn.parentNode.insertBefore(wrap,btn);wrap.appendChild(btn);wrap.appendChild(spamButton(id,false));
      }
    });
    $$('#attentionQueue [data-open-lead]').forEach(btn=>{
      const id=btn.dataset.openLead,row=btn.closest('.attention-row');
      if(row && !row.querySelector('[data-spam-lead="'+CSS.escape(id)+'"]')){
        let wrap=document.createElement('div');wrap.className='lead-row-actions';
        btn.parentNode.insertBefore(wrap,btn);wrap.appendChild(btn);wrap.appendChild(spamButton(id,true));
      }
    });
  }

  function ensurePopupList(leads){
    if(!isAdmin())return;
    const dialog=$('#loginAlertDialog');if(!dialog)return;
    let host=$('#loginAlertSpamList',dialog);
    if(!host){
      host=document.createElement('div');host.id='loginAlertSpamList';host.className='spam-popup-list';
      const note=$('.report-note',dialog);
      dialog.insertBefore(host,note||$('#loginGoQueue',dialog));
    }
    const rows=(leads||[]).filter(x=>['New','Assigned'].includes(String(x.status||''))).slice(0,10);
    host.innerHTML=rows.length?rows.map(l=>`<div class="spam-popup-row"><div><strong>${escapeHtml((l.firstName||'')+' '+(l.lastName||''))}</strong><span>${escapeHtml(l.phone||'No phone')} · ${escapeHtml(l.source||l.partnerCode||'Direct')}</span></div><div class="spam-popup-actions"><button type="button" class="btn btn-secondary compact-btn" data-open-lead="${escapeHtml(l.id)}">Open</button><button type="button" class="btn btn-spam compact-btn" data-spam-lead="${escapeHtml(l.id)}">Spam / Delete</button></div></div>`).join(''):'';
  }

  function escapeHtml(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function deleteSpam(id,button){
    const lead=leadById(id);
    const name=lead?((lead.firstName||'')+' '+(lead.lastName||'')).trim():'this lead';
    const phone=lead?.phone?' ('+lead.phone+')':'';
    if(!confirm('Delete '+name+phone+' as spam?\n\nThis permanently removes the lead from active leads, alerts, and reports.'))return;
    const original=button?.textContent;
    if(button){button.disabled=true;button.textContent='Deleting…';}
    try{
      await window.GNDAPI.deleteLead(id);
      window.GNDPortal?.toast?.('Spam lead deleted');
      await window.GNDPortal?.refresh?.();
      const dialog=$('#loginAlertDialog');if(dialog?.open && !$('#loginAlertSpamList .spam-popup-row'))dialog.close();
    }catch(err){
      window.GNDPortal?.toast?.(err.message||'Could not delete lead');
    }finally{
      if(button?.isConnected){button.disabled=false;button.textContent=original||'Spam / Delete';}
    }
  }

  document.addEventListener('click',e=>{
    const spam=e.target.closest('[data-spam-lead]');
    if(spam){e.preventDefault();e.stopPropagation();deleteSpam(spam.dataset.spamLead,spam);return;}
    const open=e.target.closest('#loginAlertSpamList [data-open-lead]');
    if(open){
      $('#loginAlertDialog')?.close();
      window.GNDPortal?.openLead?.(open.dataset.openLead);
    }
  });

  window.addEventListener('gnd-data-updated',e=>{
    const data=e.detail||{};
    ensurePopupList(data.leads||[]);
    setTimeout(injectSpamActions,0);
  });

  const observer=new MutationObserver(()=>injectSpamActions());
  const adminRoot=$('#leads')||$('#adminActionCenter');
  if(adminRoot)observer.observe(document.body,{subtree:true,childList:true});

  setupActiveSidebar();
  injectSpamActions();
  const existing=window.GNDPortal?.getData?.();
  if(existing?.leads)ensurePopupList(existing.leads);
})();