(function(){
  'use strict';
  const dialog=document.getElementById('accountManagerDialog');
  if(!dialog)return;
  const form=document.getElementById('accountManagerForm');
  const kindEl=document.getElementById('accountManagerKind'),idEl=document.getElementById('accountManagerId'),title=document.getElementById('accountManagerTitle'),subtitle=document.getElementById('accountManagerSubtitle');
  const currentUser=document.getElementById('accountManagerCurrentUsername'),lastLogin=document.getElementById('accountManagerLastLogin'),codeEl=document.getElementById('accountManagerCode');
  const username=document.getElementById('accountManagerUsername'),trackingCode=document.getElementById('accountManagerTrackingCode'),status=document.getElementById('accountManagerStatus'),password=document.getElementById('accountManagerPassword'),force=document.getElementById('accountManagerForceChange'),locked=document.getElementById('accountManagerLocked'),revoke=document.getElementById('accountManagerRevoke'),message=document.getElementById('accountManagerStatusMessage');
  let accounts=[];
  const esc=s=>String(s??'');
  const fmt=v=>{if(!v)return'Never';const d=new Date(v);return isNaN(d)?'Never':d.toLocaleString();};
  function showMessage(text,type='success'){message.className='form-status '+type;message.textContent=text;message.style.display='block';}
  function randomPassword(){
    const upper='ABCDEFGHJKLMNPQRSTUVWXYZ',lower='abcdefghijkmnopqrstuvwxyz',digits='23456789',symbols='!@#$%&*',all=upper+lower+digits+symbols,a=new Uint32Array(14);crypto.getRandomValues(a);
    const seed=[upper[a[0]%upper.length],lower[a[1]%lower.length],digits[a[2]%digits.length],symbols[a[3]%symbols.length]];
    for(let i=4;i<a.length;i++)seed.push(all[a[i]%all.length]);
    for(let i=seed.length-1;i>0;i--){const j=a[i%a.length]%(i+1);[seed[i],seed[j]]=[seed[j],seed[i]];}
    return seed.join('');
  }
  async function refreshAccounts(){const r=await window.GNDAPI.accounts();accounts=r.accounts||[];return accounts;}
  function linkedId(a){return a.role==='employee'?a.employeeId:a.partnerId;}
  async function openManager(kind,id){
    message.style.display='none';password.value='';revoke.checked=false;
    try{await refreshAccounts();const role=kind==='employees'?'employee':'partner',a=accounts.find(x=>x.role===role&&linkedId(x)===id);if(!a)throw Error('Could not find that portal account.');
      kindEl.value=kind;idEl.value=id;title.textContent='Set / Reset '+(role==='employee'?'Employee / Contractor':'Referral Partner')+' Login';subtitle.textContent=a.name||'Portal account';currentUser.textContent=a.username||'—';lastLogin.textContent=fmt(a.lastLoginAt);codeEl.textContent=a.code||'—';username.value=a.username||'';trackingCode.value=a.code||'';status.value=['Active','Pending Approval','Paused','Inactive'].includes(a.status)?a.status:'Active';force.checked=!!a.forcePasswordChange;locked.checked=!!a.accountLocked;
      dialog.showModal();
    }catch(e){window.alert(e.message||'Could not load the account.');}
  }
  function close(){if(dialog.open)dialog.close();}
  document.addEventListener('click',e=>{
    const manage=e.target.closest('[data-manage-account]');if(manage){const [kind,id]=manage.dataset.manageAccount.split(':');openManager(kind,id);return;}
    if(e.target.closest('[data-close-account-manager]')){close();return;}
    const toggle=e.target.closest('[data-password-toggle]');if(toggle){const input=document.getElementById(toggle.dataset.passwordToggle);if(!input)return;input.type=input.type==='password'?'text':'password';toggle.textContent=input.type==='password'?'Show':'Hide';return;}
  });
  document.getElementById('generateTemporaryPassword').addEventListener('click',()=>{password.value=randomPassword();password.type='text';force.checked=true;revoke.checked=true;showMessage('New password generated. Save the account changes for it to take effect.','success');});
  document.getElementById('copyTemporaryLogin').addEventListener('click',async()=>{
    if(!password.value){showMessage('Type or generate a new password first.','error');return;}
    const text=`GetNetDirect Portal Login\nUsername: ${username.value}\nNew Password: ${password.value}\nPortal: https://getnetdirect.com/portal.html`;
    try{await navigator.clipboard.writeText(text);showMessage('Temporary login copied.','success');}catch{showMessage('Copy failed. Select and copy the credentials manually.','error');}
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!form.reportValidity())return;
    const submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent='Saving…';message.style.display='none';
    try{
      await window.GNDAPI.setAccountStatus(kindEl.value,idEl.value,status.value);
      const r=await window.GNDAPI.manageAccount(kindEl.value,idEl.value,{username:username.value.trim(),trackingCode:trackingCode.value.trim(),temporaryPassword:password.value,forcePasswordChange:force.checked,accountLocked:locked.checked,revokeSessions:revoke.checked});
      currentUser.textContent=r.account?.username||username.value;codeEl.textContent=r.account?.code||trackingCode.value;password.value='';showMessage('Login updated successfully. If you entered a new password, it is effective now. The old password is no longer needed.','success');
      document.dispatchEvent(new CustomEvent('gnd-account-updated'));
    }catch(err){showMessage(err.message||'Could not update the account.','error');}
    finally{submit.disabled=false;submit.textContent='Save / Reset Login';}
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
})();
