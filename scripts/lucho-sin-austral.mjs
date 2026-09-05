/**
 * Si Lucho deja Austral: ¿de dónde salen sus 10 jornadas mínimas?
 * Mapea TODAS las jornadas de cámara de Magma por mes, cliente y persona. Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const MES=['','ene','feb','mar','abr','may','jun','jul','ago']
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const ES_CAM=s=>/film|foto|video|drone|dron/i.test(s) && !/edit|edicion|edición/i.test(s)
const ES_AUSTRAL=/austral/i
const MESES=8

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]
const J=[]
for(const r of PRO.slice(1)){
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()+1>8) continue
  const cli=(txt(r[4])||txt(r[5]))
  for(const i of PED){
    const serv=txt(r[i]); if(!serv||!ES_CAM(serv)) continue
    J.push({m:f.getMonth()+1, cli, austral:ES_AUSTRAL.test(cli), costo:num(r[i+1]), quien:txt(r[i+2])||'(sin asignar)'})
  }
}
const S=(a,k)=>a.reduce((s,x)=>s+x[k],0)
const aus=J.filter(j=>j.austral), res=J.filter(j=>!j.austral)

console.log('\n'+'█'.repeat(78))
console.log('  SI LUCHO DEJA AUSTRAL · todas las jornadas de cámara de Magma · ene-ago 2026')
console.log('█'.repeat(78))
console.log(`\n  Total ${J.length} jornadas de cámara = ${(J.length/MESES).toFixed(1)}/mes`)
console.log(`  Austral ${aus.length} (${(aus.length/MESES).toFixed(1)}/mes) · Resto ${res.length} (${(res.length/MESES).toFixed(1)}/mes)`)

console.log('\n  ── MES A MES: ¿HAY LUGAR PARA LAS 10 DE LUCHO FUERA DE AUSTRAL?')
console.log('     MES   cámara total   Austral   FUERA de Austral   Lucho ya hacía   ¿alcanza para 10?')
for(let m=1;m<=8;m++){
  const g=J.filter(j=>j.m===m), a=g.filter(j=>j.austral), f=g.filter(j=>!j.austral)
  const lu=f.filter(j=>/jorge\s*luis\s*chav|^lucho$/i.test(j.quien)).length
  const ok=f.length>=10
  console.log(`     ${MES[m]}   ${String(g.length).padStart(9)}   ${String(a.length).padStart(7)}   ${String(f.length).padStart(16)}   ${String(lu).padStart(14)}   ${ok?'\x1b[32msí — hay '+f.length+'\x1b[0m':'\x1b[31mNO — solo hay '+f.length+'\x1b[0m'}`)
}

console.log('\n  ── QUIÉN HACE HOY LAS JORNADAS FUERA DE AUSTRAL (a quién habría que sacárselas)')
const porQ={}
for(const j of res){ (porQ[j.quien] ||= {n:0,c:0}); porQ[j.quien].n++; porQ[j.quien].c+=j.costo }
for(const [q,v] of Object.entries(porQ).sort((a,b)=>b[1].n-a[1].n).slice(0,12))
  console.log(`     ${q.padEnd(28)} ${String(v.n).padStart(3)} jorn  ${(v.n/MESES).toFixed(1)}/mes   ${M(v.c/v.n).padStart(12)}/jorn`)

console.log('\n  ── LA OTRA MITAD DEL PROBLEMA: ¿QUIÉN CUBRE AUSTRAL?')
const ausL=aus.filter(j=>/jorge\s*luis\s*chav|^lucho$/i.test(j.quien))
console.log(`     Austral tiene ${aus.length} jornadas de cámara (${(aus.length/MESES).toFixed(1)}/mes). Lucho hace ${ausL.length} (${(100*ausL.length/aus.length).toFixed(0)}%).`)
console.log(`     Austral le paga a Lucho ${M(S(ausL,'costo')/ausL.length)}/jornada.`)
const ausO=aus.filter(j=>!/jorge\s*luis\s*chav|^lucho$/i.test(j.quien))
if(ausO.length) console.log(`     Los otros que ya trabajan en Austral cobran ${M(S(ausO,'costo')/ausO.length)}/jornada (${ausO.length} jorn).`)
console.log(`     Fuera de Austral, la jornada de cámara promedio se paga ${M(S(res,'costo')/res.length)}.`)
const dif=(S(res,'costo')/res.length)-(S(ausL,'costo')/ausL.length)
console.log(`     \x1b[33mReemplazarlo en Austral a precio del resto: +${M(dif)}/jornada × ${(ausL.length/MESES).toFixed(1)}/mes = +${M(dif*ausL.length/MESES)}/mes\x1b[0m`)

console.log('\n  ── EL RIESGO DEL ACUERDO')
const fueraMes=res.length/MESES
console.log(`     Fuera de Austral hay ${fueraMes.toFixed(1)} jornadas de cámara/mes en TODA Magma.`)
console.log(`     Lucho tiene garantizadas 10. Eso es el ${(100*10/fueraMes).toFixed(0)}% de todo lo que se filma fuera de Austral.`)
console.log(`     Hoy Lucho hace ${(res.filter(j=>/jorge\s*luis\s*chav|^lucho$/i.test(j.quien)).length/MESES).toFixed(1)}/mes de esas. Faltan ${(10-res.filter(j=>/jorge\s*luis\s*chav|^lucho$/i.test(j.quien)).length/MESES).toFixed(1)} que hoy hace otro.`)
console.log('')
