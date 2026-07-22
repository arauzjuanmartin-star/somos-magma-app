/**
 * Cuenta corriente Juan / Sofi con Magma. Solo lectura.
 *
 * Responde: cuánto trabajaron, cuánto cobraron, desde cuándo dejaron de cobrar,
 * cuánto pusieron de su bolsillo con las tarjetas, y quién le debe a quién.
 *
 *   node scripts/cuenta-juan-sofi.mjs
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const neg=/^-/.test(s);const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return neg?-n:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1]);return isNaN(d)?null:d}
const money=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const ym=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'?'

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['PROYECTOS','PAGOS_STAFF','SUELDOS','TARJETAS','MOVIMIENTOS_TARJETA'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PAG,SUE,TAR,MOV]=r.data.valueRanges.map(v=>v.values||[])

const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]

const PERS={
  Juan:{ staff:/juan\s+mart[ií]n?\s+arauz/i, corto:/^juan$/i },
  Sofi:{ staff:/sofia\s+maria\s+grenier/i,   corto:/^sof[ií]a?$/i },
}

console.log(`\n${'█'.repeat(74)}`)
console.log('  CUENTA CORRIENTE JUAN / SOFI CON MAGMA')
console.log(`${'█'.repeat(74)}`)

for(const [q,re] of Object.entries(PERS)){
  console.log(`\n\n${'═'.repeat(74)}\n  ${q.toUpperCase()}\n${'═'.repeat(74)}`)

  // ---- 1. trabajo hecho en proyectos, por mes ----
  // Solo 2026: la solapa PROYECTOS guarda únicamente el año vigente. Comparar su
  // trabajo 2026 contra pagos que incluyen 2025 daría un saldo falso.
  const trabajo={}
  PRO.slice(1).forEach(row=>{
    if(!txt(row[2]))return
    const fe=fecha(row[3]); if(!fe||fe.getFullYear()!==2026)return
    STF.forEach((sc,i)=>{
      if(!re.staff.test(txt(row[sc])))return
      const k=ym(fe); trabajo[k]=trabajo[k]||{n:0,monto:0}
      trabajo[k].n++; trabajo[k].monto+=num(row[PRC[i]])
    })
  })

  // ---- 2. pagos recibidos via PAGOS_STAFF, por mes de pago (solo 2026) ----
  const pagos={}
  PAG.slice(1).forEach(row=>{
    if(!re.staff.test(txt(row[1])))return
    const fp=fecha(row[0]); if(!fp||fp.getFullYear()!==2026)return
    const k=ym(fp)
    pagos[k]=pagos[k]||{n:0,ade:0,pag:0}
    pagos[k].n++; pagos[k].ade+=num(row[6]); pagos[k].pag+=num(row[7])
  })

  const meses=[...new Set([...Object.keys(trabajo),...Object.keys(pagos)])].filter(k=>k!=='?').sort()
  console.log(`\n── TRABAJO EN PROYECTOS vs PAGOS RECIBIDOS ──\n`)
  console.log(`   ${'MES'.padEnd(9)}${'TRABAJOS'.padStart(9)}${'VALORIZADO'.padStart(15)}${'COBRADO'.padStart(15)}${'DIFERENCIA'.padStart(15)}`)
  let accT=0, accP=0
  meses.forEach(k=>{
    const t=trabajo[k]||{n:0,monto:0}, p=pagos[k]||{pag:0}
    accT+=t.monto; accP+=p.pag
    if(t.n===0&&p.pag===0)return
    const [y,m]=k.split('-')
    console.log(`   ${(MES[+m-1]+' '+y.slice(2)).padEnd(9)}${String(t.n).padStart(9)}${money(t.monto).padStart(15)}${money(p.pag).padStart(15)}${money(t.monto-p.pag).padStart(15)}`)
  })
  console.log(`   ${'─'.repeat(63)}`)
  console.log(`   ${'TOTAL'.padEnd(9)}${''.padStart(9)}${money(accT).padStart(15)}${money(accP).padStart(15)}${money(accT-accP).padStart(15)}`)

  // ---- 3. ¿cuándo fue el último pago? ----
  const fechasPago=PAG.slice(1).filter(x=>re.staff.test(txt(x[1]))&&num(x[7])>0).map(x=>fecha(x[0])).filter(f=>f&&f.getFullYear()===2026).sort((a,b)=>b-a)
  if(fechasPago.length){
    console.log(`\n   ➜ ÚLTIMO PAGO RECIBIDO: ${fechasPago[0].toLocaleDateString('es-AR')}`)
    const desde=fechasPago[0]
    const trabDespues=Object.entries(trabajo).filter(([k])=>{const [y,m]=k.split('-');return new Date(+y,+m-1,1)>desde})
    const montoDespues=trabDespues.reduce((s,[,v])=>s+v.monto,0)
    if(montoDespues>0) console.log(`   ➜ TRABAJÓ ${money(montoDespues)} DESPUÉS DE ESE PAGO, SIN COBRAR`)
  }

  // ---- 4. sueldos ----
  let sueldo=0, nS=0
  SUE.slice(1).forEach(row=>{
    if(!re.corto.test(txt(row[2])))return
    if(txt(row[1])&&txt(row[1])!=='2026')return
    if(/^(si|sí|true|x)$/i.test(txt(row[6]))){ sueldo+=num(row[4]); nS++ }
  })
  console.log(`\n── SUELDOS 2026 ──`)
  console.log(`   ${nS} sueldos cobrados · ${money(sueldo)}`)

  // ---- 5. saldo por trabajo (las tarjetas no se pueden imputar, ver abajo) ----
  console.log(`\n── SALDO POR TRABAJO EN PROYECTOS (2026) ──`)
  console.log(`   trabajó   ${money(accT).padStart(14)}`)
  console.log(`   cobró     ${money(accP).padStart(14)}`)
  console.log(`   ${'─'.repeat(28)}`)
  console.log(`   SALDO     ${money(accT-accP).padStart(14)}  ${accT-accP>0?'← MAGMA LE DEBE':'← cobró de más'}`)
}

// ---- tarjetas: por tarjeta, porque la columna Persona está vacía ----
console.log(`\n\n${'═'.repeat(74)}\n  TARJETAS — no se pueden imputar a una persona\n${'═'.repeat(74)}\n`)
const vaciasT=TAR.slice(1).filter(r=>!txt(r[1])).length
const vaciasM=MOV.slice(1).filter(r=>!txt(r[14])).length
console.log(`   ⚠️  columna "Persona" vacía en ${vaciasT}/${TAR.length-1} resúmenes y ${vaciasM}/${MOV.length-1} movimientos.`)
console.log(`   Sin eso no se puede saber cuánto puso Juan y cuánto Sofi. Falta decir de quién es cada tarjeta.\n`)
const porTar={}
MOV.slice(1).forEach(row=>{
  const t=txt(row[0])||'(sin tarjeta)'
  const cat=/personal/i.test(txt(row[8]))?'personal':/empresa|magma/i.test(txt(row[8]))?'empresa':'sinCat'
  porTar[t]=porTar[t]||{empresa:0,personal:0,sinCat:0,n:0}
  porTar[t][cat]+=num(row[7]); porTar[t].n++
})
console.log(`   ${'TARJETA'.padEnd(18)}${'MOVS'.padStart(6)}${'EMPRESA'.padStart(16)}${'PERSONAL'.padStart(16)}${'% PERSONAL'.padStart(12)}`)
Object.entries(porTar).sort((a,b)=>(b[1].empresa+b[1].personal)-(a[1].empresa+a[1].personal)).forEach(([t,d])=>{
  const tot=d.empresa+d.personal
  console.log(`   ${t.padEnd(18)}${String(d.n).padStart(6)}${money(d.empresa).padStart(16)}${money(d.personal).padStart(16)}${(tot?Math.round(d.personal/tot*100)+'%':'—').padStart(12)}`)
})
const totE=Object.values(porTar).reduce((s,d)=>s+d.empresa,0)
const totP=Object.values(porTar).reduce((s,d)=>s+d.personal,0)
console.log(`   ${'─'.repeat(68)}`)
console.log(`   ${'TOTAL'.padEnd(18)}${''.padStart(6)}${money(totE).padStart(16)}${money(totP).padStart(16)}${(Math.round(totP/(totE+totP)*100)+'%').padStart(12)}`)
console.log(`\n   Los resúmenes de tarjeta suman ${money(TAR.slice(1).reduce((s,r)=>s+num(r[4]),0))} en total.`)
console.log('')
