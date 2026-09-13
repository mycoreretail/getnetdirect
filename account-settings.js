(function(){
  'use strict';
  const form=document.getElementById('myLoginForm');
  if(!form)return;
  const status=document.getElementById('myLoginStatus');
  const username=document.getElementById('myLoginUsername');
  const current=document.getElementById('myLoginCurrentUser');
  function message(text,type){if(!status)return;status.className='form-status '+(type||'success');status.textContent=text;status.style.display='block';}
  function refreshLabels(){const s=window.GNDAuth?.getSession?.();if(s){if(current)current.textContent=s.username||s.name||'Admin';if(username&&!username.value)username.placeholder='Current username: '+(s.username||'admin');}}
  refreshLabels();
  document.addEventListener('click',e=>{const b=e.target.closest('[data-password-toggle]');if(!b)return;const input=document.getElementById(b.dataset.passwordToggle);if(!input)return;input.type=input.type==='password'?'text':'password';b.textContent=input.type==='password'?'Show':'Hide';});
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!form.reportValidity())return;
    const data=new FormData(form),currentPassword=String(data.get('currentPassword')||''),newUsername=String(data.get('newUsername')||'').trim(),newPassword=String(data.get('newPassword')||''),confirm=String(data.get('confirmPassword')||'');
    if(newPassword!==confirm){message('The new passwords do not match.','error');return;}
    if(!newUsername&&!newPassword){message('Enter a new username or a new password.','error');return;}
    const submit=form.querySelector('button[type="submit"]');if(submit){submit.disabled=true;submit.textContent='Updating…';}
    try{
      const r=await window.GNDAPI.changeCredentials({currentPassword,newUsername,newPassword});
      if(!r?.user)throw new Error('The account update did not complete.');
      const previous=window.GNDAuth?.getSession?.()||{};
      const next={...previous,...r.user,name:r.user.name||previous.name,expiresAt:Date.now()+12*60*60*1000};
      localStorage.setItem('gnd_basic_session',JSON.stringify(next));
      document.querySelectorAll('[data-auth-name]').forEach(el=>el.textContent=next.name||next.username);
      form.reset();refreshLabels();message('Your Admin login has been updated. Use the new credentials the next time you sign in.','success');
    }catch(err){message(err.message||'Could not update your login.','error');}
    finally{if(submit){submit.disabled=false;submit.textContent='Update My Login';}}
  });
})();
