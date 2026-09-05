/** Todo lo NO cobrado por antigüedad, sin importar si el N° de factura está cargado. */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim(), num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const D=d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','FACTURACION!A:Z'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC]=R.data.valueRanges.map(v=>v.values||[])
const HOY=new Date()   // fecha real: antes estaba fijo al 19/08 y los tramos de antigüedad quedaban viejos
const fmap={}
FAC.slice(1).forEach(r=>{const n=txt(r[1]); if(!n)return
  if(!fmap[n])fmap[n]={cob:false,fc:''}
  if(/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(r[4])))fmap[n].cob=true
  if(txt(r[14]))fmap[n].fc=txt(r[14]) })
const pend=[]
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f>HOY)return
  const n=txt(r[2]), t=num(r[7]); if(t<=0)return
  if(fmap[n]?.cob)return
  pend.push({n,f,d:Math.round((HOY-f)/86400000),ag:txt(r[4])||txt(r[5]),proy:txt(r[6]),t,pm:txt(r[51])||'—',
    estado: !fmap[n]?'ni cargado':!fmap[n].fc?'sin N° de factura':'facturado'}) })
const S=a=>a.reduce((s,x)=>s+x.t,0)
console.log('TODO LO NO COBRADO (eventos ya realizados):',pend.length,'proyectos ·',M(S(pend)),'\n')
const tramos=[['+90 días',x=>x.d>90],['61-90 días',x=>x.d>60&&x.d<=90],['31-60 días',x=>x.d>30&&x.d<=60],['0-30 días (en plazo)',x=>x.d<=30]]
tramos.forEach(([lbl,fn])=>{const g=pend.filter(fn)
  console.log(`━━ ${lbl}: ${g.length} proy · ${M(S(g))}`)
  g.sort((a,b)=>b.d-a.d).forEach(x=>console.log(`   ${String(x.d).padStart(3)}d  #${x.n.padEnd(5)} ${x.ag.slice(0,17).padEnd(18)} ${x.proy.slice(0,26).padEnd(27)} ${M(x.t).padStart(12)}  ${x.estado.padEnd(17)} ${x.pm}`))
  console.log('')})
const porAg={}
pend.filter(x=>x.d>30).forEach(x=>{porAg[x.ag]=porAg[x.ag]||{n:0,$:0};porAg[x.ag].n++;porAg[x.ag].$+=x.t})
console.log('── ATRASADO (+30d) POR CLIENTE — a quién llamar ──')
Object.entries(porAg).sort((a,b)=>b[1].$-a[1].$).forEach(([k,v])=>console.log('  ',k.slice(0,22).padEnd(23),String(v.n).padStart(2),'proy',M(v.$).padStart(13)))
