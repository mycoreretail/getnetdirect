(function(){
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const MOBILE_NAV_MAX=1100;

  function isMobileNav(){return window.matchMedia('(max-width: '+MOBILE_NAV_MAX+'px)').matches;}

  function closeMobileNav(){
    document.body.classList.remove('mobile-nav-open');
    const button=$('#mobileDashboardMenu');
    if(button)button.setAttribute('aria-expanded','false');
  }
  function openMobileNav(){
    document.body.classList.add('mobile-nav-open');
    const button=$('#mobileDashboardMenu');
    if(button)button.setAttribute('aria-expanded','true');
  }

  function setupNavigation(){
    const sidebar=$('.sidebar');
    if(!sidebar)return;

    if(!$('#mobileDashboardMenu')){
      const actions=$('.dash-nav-actions');
      if(actions){
        const button=document.createElement('button');
        button.id='mobileDashboardMenu';
        button.className='btn btn-secondary mobile-dashboard-menu';
        button.type='button';
        button.setAttribute('aria-expanded','false');
        button.setAttribute('aria-controls','portalSidebar');
        button.innerHTML='<span aria-hidden="true">☰</span><span>Menu</span>';
        actions.insertBefore(button,actions.firstChild);
      }
    }
    sidebar.id=sidebar.id||'portalSidebar';

    if(!$('#mobileNavOverlay')){
      const overlay=document.createElement('button');
      overlay.type='button';
      overlay.id='mobileNavOverlay';
      overlay.className='mobile-nav-overlay';
      overlay.setAttribute('aria-label','Close portal menu');
      document.body.appendChild(overlay);
    }

    const allLinks=$$('.side-link',sidebar);
    const sectionLinks=allLinks.map(link=>{
      const href=link.getAttribute('href')||'';
      if(!href.startsWith('#')||href.length<2)return null;
      const target=document.querySelector(href);
      return target?{link,href,target}:null;
    }).filter(Boolean);

    function activate(link){
      allLinks.forEach(a=>{
        a.classList.toggle('active',a===link);
        if(a===link)a.setAttribute('aria-current','location');
        else if(a.getAttribute('aria-current')==='location')a.removeAttribute('aria-current');
      });
    }

    function goToSection(item){
      activate(item.link);
      const perform=()=>{
        const header=$('.dash-nav');
        const offset=(header?.getBoundingClientRect().height||72)+12;
        const top=item.target.getBoundingClientRect().top+window.scrollY-offset;
        window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
        try{history.replaceState(null,'',item.href);}catch{}
      };
      if(isMobileNav()){
        closeMobileNav();
        setTimeout(perform,220);
      }else perform();
    }

    allLinks.forEach(link=>link.addEventListener('click',e=>{
      const href=link.getAttribute('href')||'';
      if(href.startsWith('#')&&href.length>1){
        const item=sectionLinks.find(x=>x.link===link);
        if(item){e.preventDefault();goToSection(item);}
      }else if(isMobileNav()){
        closeMobileNav();
      }
    }));

    let scheduled=false;
    function updateFromScroll(){
      scheduled=false;
      if(!sectionLinks.length)return;
      const header=$('.dash-nav');
      const marker=(header?.getBoundingClientRect().height||72)+36;
      let best=null;
      for(const item of sectionLinks){
        const rect=item.target.getBoundingClientRect();
        if(rect.top<=marker)best=item;
      }
      if(!best){
        best=sectionLinks.reduce((closest,item)=>{
          const d=Math.abs(item.target.getBoundingClientRect().top-marker);
          return !closest||d<closest.d?{item,d}:closest;
        },null)?.item;
      }
      if(best)activate(best.link);
    }

    window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateFromScroll);}}, {passive:true});
    window.addEventListener('resize',()=>{
      if(!isMobileNav())closeMobileNav();
      updateFromScroll();
    },{passive:true});
    window.addEventListener('hashchange',()=>{
      const item=sectionLinks.find(x=>x.href===location.hash);
      if(item)goToSection(item); else updateFromScroll();
    });

    $('#mobileDashboardMenu')?.addEventListener('click',()=>{
      document.body.classList.contains('mobile-nav-open')?closeMobileNav():openMobileNav();
    });
    $('#mobileNavOverlay')?.addEventListener('click',closeMobileNav);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileNav();});

    const initial=sectionLinks.find(x=>x.href===location.hash);
    if(initial){
      setTimeout(()=>goToSection(initial),100);
    }else{
      updateFromScroll();
    }
  }

  const isAdmin=()=>window.GNDAuth?.getSession?.()?.role==='admin';

  function leadById(id){
    return window.GNDPortal?.getData?.()?.leads?.find(x=>String(x.id)===String(id))||null;
  }

  function selectorEscape(v){
    if(window.CSS&&typeof CSS.escape==='function')return CSS.escape(String(v));
    return String(v).replace(/["\\]/g,'\\$&');
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
      const id=btn.dataset.adminToggle,cell=btn.parentElement,sel=selectorEscape(id);
      if(cell&&!cell.querySelector('[data-spam-lead="'+sel+'"]')){
        let wrap=cell.querySelector('.lead-row-actions');
        if(!wrap){
          wrap=document.createElement('div');wrap.className='lead-row-actions';
          cell.insertBefore(wrap,btn);wrap.appendChild(btn);
        }
        wrap.appendChild(spamButton(id,true));
      }
    });
    $$('[data-mobile-admin-toggle]').forEach(btn=>{
      const id=btn.dataset.mobileAdminToggle,card=btn.closest('.mobile-data-card'),sel=selectorEscape(id);
      if(card&&!card.querySelector('[data-spam-lead="'+sel+'"]')){
        let wrap=document.createElement('div');wrap.className='lead-row-actions';
        btn.parentNode.insertBefore(wrap,btn);wrap.appendChild(btn);wrap.appendChild(spamButton(id,false));
      }
    });
    $$('#attentionQueue [data-open-lead]').forEach(btn=>{
      const id=btn.dataset.openLead,row=btn.closest('.attention-row'),sel=selectorEscape(id);
      if(row&&!row.querySelector('[data-spam-lead="'+sel+'"]')){
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
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
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
      const dialog=$('#loginAlertDialog');if(dialog?.open&&!$('#loginAlertSpamList .spam-popup-row'))dialog.close();
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

  setupNavigation();
  injectSpamActions();
  const existing=window.GNDPortal?.getData?.();
  if(existing?.leads)ensurePopupList(existing.leads);
})();