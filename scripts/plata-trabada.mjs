/** Plata trabada REAL: solo eventos ya ocurridos. */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim(), num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','FACTURACION!A:Z'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC]=R.data.valueRanges.map(v=>v.values||[])
const HOY=new Date(2026,7,19)
const fac={}
FAC.slice(1).forEach(r=>{const n=txt(r[1]); if(!n)return
  fac[n]=fac[n]||{cobrado:false,nroFc:''}
  if(/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(r[4])))fac[n].cobrado=true
  if(txt(r[14]))fac[n].nroFc=txt(r[14]) })
let A=[],B=[],C=[],futuro=0
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const n=txt(r[2]), t=num(r[7]); if(t<=0)return
  if(f>HOY){ if(!fac[n]||!fac[n].cobrado)futuro+=t; return }
  const row={n,f,ag:txt(r[4])||txt(r[5]),proy:txt(r[6]),t,pm:txt(r[51])||'—',dias:Math.round((HOY-f)/86400000)}
  if(!fac[n])A.push(row)
  else if(!fac[n].nroFc&&!fac[n].cobrado)C.push(row)
  else if(!fac[n].cobrado)B.push({...row,fc:fac[n].nroFc}) })
const S=a=>a.reduce((s,x)=>s+x.t,0)
console.log('╔══ LA PLATA QUE FALTA ENTRAR (eventos ya realizados) ══╗\n')
console.log(`A · NI CARGADO EN FACTURACION ....... ${A.length} proy · ${M(S(A))}`)
console.log(`B · CARGADO, SIN FACTURA EMITIDA .... ${C.length} proy · ${M(S(C))}`)
console.log(`C · FACTURA EMITIDA, SIN COBRAR ..... ${B.length} proy · ${M(S(B))}`)
console.log(`    ─────────────────────────────────────────────────`)
console.log(`    TOTAL EN LA CALLE ............... ${A.length+B.length+C.length} proy · ${M(S(A)+S(B)+S(C))}`)
console.log(`    (aparte: ${M(futuro)} de eventos que todavía no ocurrieron — no es problema)\n`)
const pr=(t,arr)=>{console.log('── '+t+' ──'); arr.sort((a,b)=>b.dias-a.dias).forEach(x=>
  console.log(`  ${String(x.dias).padStart(3)}d  #${x.n.padEnd(5)} ${x.ag.slice(0,16).padEnd(17)} ${x.proy.slice(0,28).padEnd(29)} ${M(x.t).padStart(12)}  ${x.pm}`))
  console.log('')}
pr('A · producido y ni cargado',A); pr('B · cargado pero sin factura emitida',C)
console.log('── C · facturado sin cobrar, por antigüedad ──')
const bk={'0-30 días (normal)':0,'31-60 días':0,'61-90 días':0,'+90 días':0}
B.forEach(x=>{bk[x.dias<=30?'0-30 días (normal)':x.dias<=60?'31-60 días':x.dias<=90?'61-90 días':'+90 días']+=x.t})
Object.entries(bk).forEach(([k,v])=>console.log('  ',k.padEnd(22),M(v)))
console.log('\n  los más viejos:')
B.sort((a,b)=>b.dias-a.dias).slice(0,6).forEach(x=>console.log(`   ${String(x.dias).padStart(3)}d  #${x.n.padEnd(5)} ${x.ag.slice(0,16).padEnd(17)} ${M(x.t).padStart(12)}  ${x.pm}`))
console.log('\n── quién tiene cada cosa ──')
const porPM={}
;[...A.map(x=>({...x,k:'ni cargado'})),...C.map(x=>({...x,k:'sin factura'})),...B.map(x=>({...x,k:'sin cobrar'}))].forEach(x=>{
  porPM[x.pm]=porPM[x.pm]||{n:0,$:0}; porPM[x.pm].n++; porPM[x.pm].$+=x.t})
Object.entries(porPM).sort((a,b)=>b[1].$-a[1].$).forEach(([k,v])=>console.log('  ',k.padEnd(8),String(v.n).padStart(3),'proy',M(v.$).padStart(14)))
