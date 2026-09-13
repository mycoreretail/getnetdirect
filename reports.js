(function(){
  'use strict';
  const C=window.GNDInsights,API=window.GNDAPI,$=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data=null,employees=[],partners=[],series=[],lastReport=null;
  const metricNames={leads:'Leads received',signups:'First signup recorded',completions:'First completion verified'};
  function error(msg=''){const el=$('#reportError');el.hidden=!msg;el.textContent=msg;}
  function rangePreset(){if(!data)return;const zone=$('#reportTimezone').value,today=C.day(data.serverTime,zone),preset=$('#reportPreset').value;let start;
    if(preset==='custom')return;
    if(preset==='30'){start=C.addDays(today,-29);$('#reportGrain').value='day';}
    else if(preset==='12'){start=C.shiftMonth(today.slice(0,7)+'-01',-11);$('#reportGrain').value='month';}
    else if(preset==='all'){start=data.leads.map(x=>C.day(x.created_at,zone)).filter(Boolean).sort()[0]||today;$('#reportGrain').value=C.dayNumber(today)-C.dayNumber(start)>730?'year':'month';}
    else{start=today.slice(0,4)+'-01-01';$('#reportGrain').value='month';}
    $('#reportStart').value=start;$('#reportEnd').value=today;$('#reportStart').max=today;$('#reportEnd').max=today;
  }
  function dataTable(rows){return rows.length?rows.map(x=>`<tr><th scope="row">${esc(x.name)}</th><td>${x.received}</td><td>${x.signed}</td><td>${x.complete}</td><td>${x.open}</td><td>${x.completionRate==null?'—':x.completionRate.toFixed(1)+'%'}</td></tr>`).join(''):'<tr><td colspan="6">No leads in this filtered period.</td></tr>';}
  function chart(rows){
    if(!rows.length)return '<p>No date range selected.</p>';
    const width=860,height=310,left=48,right=18,top=24,bottom=54,w=width-left-right,h=height-top-bottom;
    const largest=Math.max(0,...rows.flatMap(x=>[x.leads,x.signups,x.completions]));const max=Math.max(4,Math.ceil(largest/4)*4),x=i=>left+(rows.length===1?w/2:i*w/(rows.length-1)),y=v=>top+h-v/max*h;
    let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="trendSvgTitle trendSvgDesc"><title id="trendSvgTitle">Received leads, recorded signups and verified completions</title><desc id="trendSvgDesc">${rows.length} periods. Highest count ${largest}. Values are also provided in the expandable data table.</desc>`;
    for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line class="chart-gridline" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-axis-label" x="${left-10}" y="${y(v)+5}" text-anchor="end">${v}</text>`;}
    const gap=Math.max(1,Math.ceil(rows.length/6));rows.forEach((r,i)=>{if(i%gap===0||i===rows.length-1)svg+=`<text class="chart-axis-label" x="${x(i)}" y="${height-20}" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}">${esc(r.period)}</text>`;});
    Object.keys(metricNames).forEach((m,index)=>{svg+=`<polyline class="chart-series chart-${m}" points="${rows.map((r,i)=>`${x(i)},${y(r[m])}`).join(' ')}"/>`;rows.forEach((r,i)=>{svg+=`<circle class="chart-dot chart-${m}" cx="${x(i)}" cy="${y(r[m])}" r="${rows.length<35?4:2}"><title>${esc(r.period)} · ${metricNames[m]}: ${r[m]}</title></circle>`;});});
    svg+='</svg>';if(!largest)svg+='<p class="report-note">No recorded activity in this selected range. No sample data is added to your live reports.</p>';return svg;
  }
  function render(){
    if(!data)return;error();
    try{
      const zone=$('#reportTimezone').value,start=$('#reportStart').value,end=$('#reportEnd').value,grain=$('#reportGrain').value,metric=$('#reportMetric').value;
      if(!start||!end||start>end)throw Error('Choose a start date before or equal to the end date.');
      const serverStamp=C.stamp(data.serverTime,zone),today=serverStamp.slice(0,10);if(end>today)throw Error('Choose an end date on or before today.');
      // Find an instant belonging to the selected local end-of-day; comparisons use a local calendar stamp.
      let asOf=data.serverTime;
      if(end<today){let t=Date.parse(end+'T23:59:59Z');for(let n=0;n<3;n++){const local=C.stamp(new Date(t),zone);t+=Date.parse(end+'T23:59:59Z')-Date.parse(local+'Z');}asOf=new Date(t).toISOString();}
      const leads=C.filtered(data.leads,{employee:$('#reportEmployee').value,partner:$('#reportPartner').value,source:$('#reportSource').value});
      series=C.trend(leads,{start,end,grain,zone,asOf:data.serverTime});
      const comparisons=['day','month','year'].map(k=>C.compare(leads,metric,k,asOf,zone));
      const earliest=leads.map(x=>C.stamp(C.eventTime(x,metric),zone)).filter(Boolean).sort()[0]||'';
      $('#comparisonCards').innerHTML=comparisons.map((x,i)=>{const unavailable=!x.previous&&(!earliest||earliest>x.previousEnd);return `<article class="comparison-card"><span class="comparison-label">${['Day over day','Month over month · MTD','Year over year · YTD'][i]}</span><div class="comparison-main"><strong>${x.current}</strong><span class="comparison-change ${x.change.value==null?'neutral':x.change.value>=0?'positive':'negative'}">${unavailable?'No prior history':esc(x.change.label)}</span></div><p>${esc(metricNames[metric])} <b>vs ${x.previous}</b></p><small>${esc(x.currentStart.slice(0,10))} → ${esc(x.currentEnd.slice(0,10))}<br>Previous: ${esc(x.previousStart.slice(0,10))} → ${esc(x.previousEnd.slice(0,10))}</small></article>`;}).join('');
      $('#comparisonContext').textContent='Through '+C.stamp(asOf,zone).replace('T',' ')+' · '+$('#reportTimezone').selectedOptions[0].text;
      $('#rangeLabel').textContent=start+' → '+end;
      $('#trendCaption').textContent='Calendar '+grain+' buckets · first-event dates where recorded · current periods may be partial';
      $('#trendChart').innerHTML=chart(series);$('#trendDataBody').innerHTML=series.map(r=>`<tr><th scope="row">${esc(r.period)}</th><td>${r.leads}</td><td>${r.signups}</td><td>${r.completions}</td></tr>`).join('');
      const cohort=C.cohort(leads,start,end,zone);
      $('#reportCohort').innerHTML=[['RECEIVED IN RANGE',cohort.received],['CURRENTLY OPEN',cohort.open],['CURRENTLY COMPLETE',cohort.complete],['COMPLETION RATE',cohort.completionRate==null?'—':cohort.completionRate.toFixed(1)+'%']].map(([label,v])=>`<article><span>${label}</span><strong>${v}</strong></article>`).join('');
      const counts=new Map();leads.forEach(l=>{const k=C.day(l.created_at,zone),status=C.normal(l.status);if(k>=start&&k<=end&&status!=='Void')counts.set(status,(counts.get(status)||0)+1);});
      const statusRows=[...counts].sort((a,b)=>b[1]-a[1]);$('#outcomeChart').innerHTML=statusRows.length?statusRows.map(([s,n])=>`<div class="outcome-row"><span>${esc(s)}</span><div class="outcome-track"><div class="outcome-fill outcome-${s.toLowerCase().replace(/[^a-z]/g,'')}" style="width:${n/Math.max(...counts.values())*100}%"></div></div><strong>${n}</strong></div>`).join(''):'<p class="report-note">No outcomes to chart in this range.</p>';
      const team=C.performance(leads,'employee',employees,start,end,zone),ps=C.performance(leads,'partner',partners,start,end,zone);
      $('#teamReportBody').innerHTML=dataTable(team);$('#partnerReportBody').innerHTML=dataTable(ps);
      const missing=leads.filter(l=>['Signed Up','Install Scheduled','Complete'].includes(C.normal(l.status))&&!l.signed_up_at).length,missingComplete=leads.filter(l=>C.normal(l.status)==='Complete'&&!l.completed_at).length;
      $('#historyNotice').hidden=false;$('#historyNotice').textContent=`Activity-date tracking began ${data.trackingStartedAt?C.day(data.trackingStartedAt,zone):'with v11'}. ${missing} current signup-stage records and ${missingComplete} current completions do not have their original event date. Their undated events are excluded from time-based event charts; their current outcomes remain in the cohort tables. Received dates are preserved.`;
      lastReport={zone,start,end,grain,metric,comparisons,cohort,team,partners:ps,series};$('#exportReports').disabled=false;
    }catch(e){error(e.message);$('#exportReports').disabled=true;}
  }
  async function load(){
    $('#refreshReports').disabled=true;error();$('#reportConnection').textContent='Refreshing shared data…';
    try{
      const [r,er,pr]=await Promise.all([API.reportData(),API.employees(),API.partners()]);
      if(r.version!==11||!Array.isArray(r.leads))throw Error('Reports require the v11 API update as well as the website files.');
      const first=!data;data=r;employees=er.employees||[];partners=pr.partners||[];
      for(const [id,list,label]of [['reportEmployee',employees,'All reps'],['reportPartner',partners,'All partners']]){const el=$('#'+id),old=el.value;el.innerHTML=`<option value="">${label}</option>`+list.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');if(list.some(x=>x.id===old))el.value=old;}
      if(first)rangePreset();render();$('#reportConnection').className='sync-status connected';$('#reportConnection').textContent='Shared database · updated '+new Date(data.serverTime).toLocaleString();
    }catch(e){error(e.status===404?'The API has not received the v11 reporting files yet. Upload the complete update, including the api folder.':e.message);$('#reportConnection').className='sync-status disconnected';$('#reportConnection').textContent='Reports are not connected. Previously displayed results may be stale.';$('#exportReports').disabled=true;}
    finally{$('#refreshReports').disabled=false;}
  }
  const safeCell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  function exportCSV(){if(!lastReport)return;const r=lastReport,rows=[['GetNetDirect report'],['Timezone',r.zone],['From',r.start,'Through',r.end],['Definition','First dated events; Void records excluded. Current outcome tables are received-date cohorts.'],[],['Period','Leads received','First signup','First completion'],...r.series.map(x=>[x.period,x.leads,x.signups,x.completions]),[],['Team','Received','Signup stage or complete','Complete','Open','Completion %'],...r.team.map(x=>[x.name,x.received,x.signed,x.complete,x.open,x.completionRate==null?'':x.completionRate.toFixed(2)]),[],['Partner','Received','Signup stage or complete','Complete','Open','Completion %'],...r.partners.map(x=>[x.name,x.received,x.signed,x.complete,x.open,x.completionRate==null?'':x.completionRate.toFixed(2)])];const blob=new Blob(['\ufeff'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`GetNetDirect-Report-${r.start}-to-${r.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('#reportFilters').addEventListener('submit',e=>{e.preventDefault();render();});$('#reportPreset').addEventListener('change',()=>{rangePreset();render();});['#reportStart','#reportEnd'].forEach(id=>$(id).addEventListener('change',()=>{$('#reportPreset').value='custom';}));$('#refreshReports').addEventListener('click',load);$('#exportReports').addEventListener('click',exportCSV);
  if(window.GNDAuth?.getSession?.()?.role==='admin'&&API?.token?.())load();else location.replace('portal.html?reason=login');
})();
