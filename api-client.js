(function(){
  'use strict';
  const API_URL='https://getnetdirect-api-production.up.railway.app',TOKEN_KEY='gnd_api_token';
  async function request(path,opts={}){
    const {publicRequest=false,...options}=opts,headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
    const token=localStorage.getItem(TOKEN_KEY);if(token&&!publicRequest)headers.Authorization='Bearer '+token;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(API_URL+path,{...options,headers,signal:controller.signal,cache:'no-store'});
      const type=response.headers.get('content-type')||'';
      if(!type.includes('application/json'))throw Error('The API returned an unexpected response. Check that the latest API is deployed.');
      const data=await response.json();
      if(!response.ok){const e=Error(data.error||`Request failed (${response.status})`);e.status=response.status;if(response.status===401&&!publicRequest)window.dispatchEvent(new Event('gnd-session-invalid'));throw e;}
      return data;
    }catch(e){if(e.name==='AbortError')throw Error('Connection timed out. Your form has not been cleared; please retry.');throw e;}finally{clearTimeout(timeout);}
  }
  const send=(path,method,data,publicRequest=false)=>request(path,{method,body:JSON.stringify(data),publicRequest});
  const api={url:API_URL,token:()=>localStorage.getItem(TOKEN_KEY)||'',setToken:t=>t?localStorage.setItem(TOKEN_KEY,t):localStorage.removeItem(TOKEN_KEY),clear:()=>localStorage.removeItem(TOKEN_KEY),
    login:async(username,password)=>{const r=await send('/auth/login','POST',{username,password},true);if(r.token)api.setToken(r.token);return r;},me:()=>request('/auth/me'),
    createPublicLead:data=>send('/api/public/leads','POST',data,true),leads:()=>request('/api/leads'),updateLead:(id,data)=>send('/api/leads/'+encodeURIComponent(id),'PATCH',data),
    employees:()=>request('/api/employees'),partners:()=>request('/api/partners'),createEmployee:data=>send('/api/admin/employees','POST',data),createPartner:data=>send('/api/admin/partners','POST',data),
    reportData:()=>request('/api/admin/report-data'),activity:id=>request('/api/leads/'+encodeURIComponent(id)+'/activity'),logContact:(id,data)=>send('/api/leads/'+encodeURIComponent(id)+'/contact','POST',data),
    setAccountStatus:(kind,id,status)=>send('/api/admin/accounts/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id)+'/status','PATCH',{status}),
    applyPartner:data=>send('/api/public/partner-applications','POST',data,true),applications:()=>request('/api/admin/partner-applications'),setApplicationStatus:(id,status)=>send('/api/admin/partner-applications/'+encodeURIComponent(id),'PATCH',{status})
  };window.GNDAPI=api;
})();
