(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const params=new URLSearchParams(location.search);
  function referralUrl(code){return `https://getnetdirect.com/?ref=${encodeURIComponent(String(code||'').trim())}`}
  function getEl(elOrId){return typeof elOrId==='string'?document.getElementById(elOrId):elOrId}
  function renderQR(elOrId,text,size=200){
    const el=getEl(elOrId); if(!el)return;
    el.innerHTML='';
    if(!window.QRCode){el.innerHTML='<div class="qr-placeholder">QR library unavailable. Refresh while online.</div>';return}
    try{new QRCode(el,{text,width:size,height:size,colorDark:'#071a3b',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});el.dataset.qrText=text}catch(e){el.innerHTML='<div class="qr-placeholder">Unable to generate QR code.</div>'}
  }
  function dataUrlFromQR(elOrId){
    const el=getEl(elOrId);if(!el)return'';
    const canvas=el.querySelector('canvas');if(canvas)return canvas.toDataURL('image/png');
    const img=el.querySelector('img');return img?.src||'';
  }
  function downloadQR(elOrId,filename='GetNetDirect-QR.png'){
    const url=dataUrlFromQR(elOrId);if(!url)return false;
    const a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();return true;
  }
  async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch(e){return false}}
  window.GNDMarketing={referralUrl,renderQR,downloadQR,copyText};

  // Dedicated flyer designer page.
  if(!document.body.classList.contains('marketing-page'))return;
  const session=window.GNDAuth?.getSession?.()||(()=>{try{return JSON.parse(localStorage.getItem('gnd_basic_session')||'null')}catch(e){return null}})();
  const employees=(()=>{try{return JSON.parse(localStorage.getItem('gnd_employees')||'[]')}catch(e){return[]}})();
  const partners=(()=>{try{return JSON.parse(localStorage.getItem('gnd_partners')||'[]')}catch(e){return[]}})();
  let code=params.get('code')||session?.partnerCode||'';
  const matched=partners.find(x=>x.code===code)||employees.find(x=>x.code===code)||{};
  const initialName=params.get('name')||matched.name||session?.name||'GetNetDirect Referral Partner';
  const initialType=params.get('type')||matched.partnerType||matched.role||(params.get('kind')==='employee'?'Sales Representative':'Referral Partner');
  const toast=(msg)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__mkToast);window.__mkToast=setTimeout(()=>t.classList.remove('show'),2200)};

  const copy={
    movein:{eyebrow:'NEW MOVE-IN?',headline:'Get connected before move-in day.',sub:'Scan the code to request internet, mobile, TV or home phone options for your address.'},
    realtor:{eyebrow:'WELCOME HOME',headline:'One less thing to worry about after closing.',sub:'Scan to request help setting up internet, mobile, TV or home phone service at your new home.'},
    general:{eyebrow:'NEED HOME INTERNET?',headline:'Getting connected can be simple.',sub:'Scan to tell us your address and the services you need. A GetNetDirect connection specialist can follow up.'}
  };
  function updateFlyer(){
    code=($('#mkCode')?.value||code||'DEMO123').trim().toUpperCase();
    const name=$('#mkName')?.value||initialName,type=$('#mkType')?.value||initialType,contact=$('#mkContact')?.value||'',template=$('#mkTemplate')?.value||'movein',size=$('#mkSize')?.value||'letter',c=copy[template]||copy.movein,url=referralUrl(code);
    $('#mkLink').value=url;$('#flyerCode').textContent=code;$('#flyerName').textContent=name;$('#flyerType').textContent=type;$('#flyerContact').textContent=contact;$('#flyerContact').style.display=contact?'':'none';$('#flyerEyebrow').textContent=c.eyebrow;$('#flyerHeadline').textContent=c.headline;$('#flyerSubhead').textContent=c.sub;
    const sheet=$('#flyerSheet');sheet.className=`flyer-sheet flyer-${template} flyer-size-${size}`;
    renderQR('flyerQr',url,size==='half'?150:190);
  }
  $('#mkCode').value=code||'DEMO123';$('#mkName').value=initialName;$('#mkType').value=initialType;updateFlyer();
  ['mkCode','mkName','mkType','mkTemplate','mkSize','mkContact'].forEach(id=>{const el=$('#'+id);el?.addEventListener(el.tagName==='SELECT'?'change':'input',updateFlyer)});
  $('#mkCopyLink')?.addEventListener('click',async()=>{const v=$('#mkLink').value;const ok=await copyText(v);toast(ok?'Referral link copied':v)});
  $('#mkDownloadQr')?.addEventListener('click',()=>{if(!downloadQR('flyerQr',`GetNetDirect-${code}-QR.png`))toast('QR is still loading. Try again.')});
  $('#mkPrint')?.addEventListener('click',()=>window.print());
  $('#marketingBackBtn')?.addEventListener('click',()=>{if(history.length>1)history.back();else location.href=session?.role==='admin'?'admin.html':session?.role==='employee'?'employee-dashboard.html':'partner-dashboard.html'});
})();
