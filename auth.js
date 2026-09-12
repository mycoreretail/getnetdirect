/*
  BASIC STATIC GITHUB LOGIN
  -------------------------
  This is only a lightweight access gate for a static GitHub Pages site.
  It is NOT server-side security. Anyone with technical knowledge can inspect
  the public JavaScript. Do not use this to protect sensitive data.

  To change accounts later, replace the username and SHA-256 passwordHash below.
*/
(function(){
  const SESSION_KEY='gnd_basic_session';
  const SESSION_HOURS=12;

  const USERS=[
    {
      username:'admin',
      passwordHash:'cebf16ddcd0ebba13d81f6a969235d919ba841a9d633f1d63fe1c327926f6dd7',
      role:'admin',
      name:'GetNetDirect Admin',
      destination:'admin.html'
    },
    {
      username:'employee',
      passwordHash:'2bb24b35b0827f730affc0a9f41977fc0553f7fd5765ab74ca30f542369a4d78',
      role:'employee',
      name:'GetNetDirect Employee',
      destination:'employee-dashboard.html'
    },
    {
      username:'partner',
      passwordHash:'0864c997735da3dfe5f2f68316a5f6b5e5d8ed39704d5f43d6480ecde1388462',
      role:'partner',
      name:'Referral Partner',
      destination:'partner-dashboard.html',
      partnerCode:'DEMO123'
    }
  ];

  async function sha256(value){
    const bytes=new TextEncoder().encode(value);
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function getSession(){
    try{
      const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
      if(!s || !s.expiresAt || Date.now()>s.expiresAt){
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    }catch(e){return null;}
  }

  function saveSession(user){
    const s={
      username:user.username,
      role:user.role,
      name:user.name,
      partnerCode:user.partnerCode||'',
      expiresAt:Date.now()+(SESSION_HOURS*60*60*1000)
    };
    localStorage.setItem(SESSION_KEY,JSON.stringify(s));
    if(user.partnerCode) localStorage.setItem('gnd_partner_code',user.partnerCode);
    return s;
  }

  function logout(){
    localStorage.removeItem(SESSION_KEY);
    location.href='portal.html?loggedout=1';
  }

  async function login(username,password){
    const name=String(username||'').trim().toLowerCase();
    const user=USERS.find(u=>u.username.toLowerCase()===name);
    if(!user) return {ok:false};
    const hash=await sha256(String(password||''));
    if(hash!==user.passwordHash) return {ok:false};
    saveSession(user);
    return {ok:true,user};
  }

  function protectPage(){
    const required=document.body?.dataset?.requiredRole;
    if(!required) return;
    const s=getSession();
    if(!s){
      location.replace('portal.html?reason=login');
      return;
    }
    if(s.role!=='admin' && s.role!==required){
      location.replace('portal.html?reason=wrong-role');
      return;
    }
    document.querySelectorAll('[data-auth-name]').forEach(el=>el.textContent=s.name||s.username);
  }

  window.GNDAuth={login,logout,getSession,protectPage};
  protectPage();

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-logout]');
    if(btn){e.preventDefault();logout();}
  });
})();
