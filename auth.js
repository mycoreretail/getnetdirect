(function(){
  'use strict';
  const SESSION_KEY='gnd_basic_session';
  const SESSION_HOURS=12;
  function destination(role){return role==='admin'?'admin.html':role==='employee'?'employee-dashboard.html':'partner-dashboard.html'}
  function getSession(){
    try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(!s||!s.expiresAt||Date.now()>s.expiresAt){localStorage.removeItem(SESSION_KEY);window.GNDAPI?.clear?.();return null}return s}catch(e){return null}
  }
  function saveSession(user){
    const s={username:user.username,role:user.role,name:user.name||user.displayName||user.username,employeeId:user.employeeId||null,partnerId:user.partnerId||null,employeeCode:user.employeeCode||'',partnerCode:user.partnerCode||'',forcePasswordChange:!!user.forcePasswordChange,lastLoginAt:user.lastLoginAt||null,destination:destination(user.role),expiresAt:Date.now()+SESSION_HOURS*60*60*1000};
    localStorage.setItem(SESSION_KEY,JSON.stringify(s));
    if(s.employeeId)localStorage.setItem('gnd_employee_view',s.employeeId);
    if(s.partnerCode)localStorage.setItem('gnd_partner_code',s.partnerCode);
    return s;
  }
  async function login(username,password){
    try{if(!window.GNDAPI)throw new Error('Portal service unavailable');const r=await window.GNDAPI.login(String(username||'').trim(),String(password||''));if(!r?.user)return{ok:false,error:'Invalid login'};const s=saveSession(r.user);return{ok:true,user:s}}catch(e){return{ok:false,error:e.message||'Login failed'}}
  }
  function logout(){localStorage.removeItem(SESSION_KEY);window.GNDAPI?.clear?.();location.href='portal.html?loggedout=1'}
  function protectPage(){
    const required=document.body?.dataset?.requiredRole;if(!required)return;const s=getSession();if(!s){location.replace('portal.html?reason=login');return}if(s.forcePasswordChange){location.replace('portal.html?reason=password-change');return}if(required!=='any'&&s.role!=='admin'&&s.role!==required){location.replace('portal.html?reason=wrong-role');return}document.querySelectorAll('[data-auth-name]').forEach(el=>el.textContent=s.name||s.username)
  }
  window.addEventListener('gnd-session-invalid',()=>{localStorage.removeItem(SESSION_KEY);window.GNDAPI?.clear?.();if(document.body?.dataset?.requiredRole)location.replace('portal.html?reason=login');});
  window.GNDAuth={login,logout,getSession,protectPage};protectPage();
  if(document.body?.dataset?.requiredRole&&window.GNDAPI?.token?.())window.GNDAPI.me().then(r=>{
    const previous=getSession();if(!previous||!r.user)return;
    const current={...previous,...r.user,name:r.user.name||previous.name,expiresAt:previous.expiresAt};localStorage.setItem(SESSION_KEY,JSON.stringify(current));protectPage();
  }).catch(()=>{/* The API client handles expired or disabled sessions; network errors remain visible. */});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-logout]');if(b){e.preventDefault();logout()}});
})();
