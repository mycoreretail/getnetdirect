(function(){
  'use strict';
  const API_URL='https://getnetdirect-api-production.up.railway.app';
  const TOKEN_KEY='gnd_api_token';
  async function request(path,opts={}){
    const headers={'Content-Type':'application/json',...(opts.headers||{})};
    const token=localStorage.getItem(TOKEN_KEY);
    if(token) headers.Authorization='Bearer '+token;
    const res=await fetch(API_URL+path,{...opts,headers});
    let data={}; try{data=await res.json()}catch(e){}
    if(!res.ok) throw new Error(data.error||('Request failed ('+res.status+')'));
    return data;
  }
  const api={
    url:API_URL,
    token:()=>localStorage.getItem(TOKEN_KEY)||'',
    setToken:t=>t?localStorage.setItem(TOKEN_KEY,t):localStorage.removeItem(TOKEN_KEY),
    clear:()=>localStorage.removeItem(TOKEN_KEY),
    login:async(username,password)=>{const r=await request('/auth/login',{method:'POST',body:JSON.stringify({username,password})}); if(r.token) api.setToken(r.token); return r;},
    me:()=>request('/auth/me'),
    createPublicLead:data=>request('/api/public/leads',{method:'POST',body:JSON.stringify(data)}),
    leads:()=>request('/api/leads'),
    updateLead:(id,data)=>request('/api/leads/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(data)}),
    employees:()=>request('/api/employees'),
    partners:()=>request('/api/partners'),
    createEmployee:data=>request('/api/admin/employees',{method:'POST',body:JSON.stringify(data)}),
    createPartner:data=>request('/api/admin/partners',{method:'POST',body:JSON.stringify(data)})
  };
  window.GNDAPI=api;
})();
