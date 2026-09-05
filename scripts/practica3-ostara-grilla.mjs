/**
 * PRACTICA 3 — punto 7: retomar la GRILLA DE PRECIOS PARA OSTARA.
 * Saca de PROYECTOS todo lo que Magma le hizo a Ostara: qué servicios compran,
 * cuántas veces, a qué precio de venta y con qué costo/margen real.
 * Con eso se arma la grilla (precio de lista por servicio para ese cliente).
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const CLIENTE = process.argv[2] || 'ostara'

const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
function norm(p){const s=txt(p).toLowerCase().replace(/[^\wáéíóúñ\s½]/g,'').trim()
  if(/edit|edici/.test(s))return 'Edición'
  if(/motion|anim/.test(s))return 'Motion'
  if(/foto/.test(s))return /1\/2|½|medi/.test(s)?'Foto ½':'Foto 1'
  if(/video/.test(s))return /1\/2|½|medi/.test(s)?'Video ½':'Video 1'
  if(/film/.test(s))return /1\/2|½|medi/.test(s)?'Film ½':'Film 1'
  if(/drone|fpv/.test(s))return 'Drone/FPV'
  if(/asist/.test(s))return 'Asistente'
  if(/produ/.test(s))return 'Producción'
  if(/vivo|stream/.test(s))return 'Vivo'
  if(/sonid|audio/.test(s))return 'Sonido'
  if(/viatic/.test(s))return 'Viáticos'
  if(/rental|alquil/.test(s))return 'Rental'
  return txt(p).slice(0,16)||'(otros)'
}

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values, H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia'), iDif=H.indexOf('Diferencia')
const iAg=H.indexOf('Agencia'), iCli=H.indexOf('Cliente'), iProy=H.indexOf('Proyecto'), iNro=0
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const re = new RegExp(CLIENTE, 'i')

const S={}, G={}, proyectos=[]   // S = el cliente · G = todo Magma 2026 (para comparar parejo)
let facturado=0, costoTotal=0
PRO.slice(1).forEach(r=>{
  const fg=fecha(r[3])
  if (fg && fg.getFullYear()===2026) {
    const margenProy=num(r[iFee])+num(r[iDif])
    const lineas=[]
    PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
      if(v<=1)return
      lineas.push({k:norm(p), v, magma:/somos magma/i.test(pers)})})
    if (lineas.length) {
      const peso=lineas.reduce((s,l)=>s+l.v,0)
      let extra=margenProy; lineas.forEach(l=>{if(l.magma) extra+=l.v})
      lineas.forEach(l=>{
        G[l.k]=G[l.k]||{veces:0,venta:0,costo:0}
        G[l.k].veces++; G[l.k].venta+=l.v+extra*(l.v/peso); G[l.k].costo+=l.magma?0:l.v
      })
    }
  }
  if (!re.test(txt(r[iAg])) && !re.test(txt(r[iCli]))) return
  const f=fecha(r[3])
  const total=num(r[iTot]); facturado+=total
  const margenProy=num(r[iFee])+num(r[iDif])
  const lineas=[]
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(v<=1)return
    lineas.push({k:norm(p), v, magma:/somos magma/i.test(pers), pers})})
  const costo = lineas.filter(l=>!l.magma).reduce((s,l)=>s+l.v,0)
  costoTotal += costo
  proyectos.push({ nro:txt(r[iNro]), f, proy:txt(r[iProy]), cli:txt(r[iCli]), total, costo, lineas })
  if(!lineas.length)return
  const pesoTotal=lineas.reduce((s,l)=>s+l.v,0)
  let margenExtra=margenProy
  lineas.forEach(l=>{ if(l.magma) margenExtra+=l.v })
  lineas.forEach(l=>{
    const share=l.v/pesoTotal
    S[l.k]=S[l.k]||{veces:0,costo:0,venta:0,precios:[]}
    S[l.k].veces++
    S[l.k].costo += l.magma?0:l.v
    S[l.k].venta += l.v + margenExtra*share
    S[l.k].precios.push(l.v)
  })
})

console.log(`\n████ ${CLIENTE.toUpperCase()} — ${proyectos.length} proyectos · facturado ${M(facturado)} · costo staff ${M(costoTotal)} · margen ${((1-costoTotal/facturado)*100).toFixed(0)}%\n`)

const porAnio={}
proyectos.forEach(p=>{ const y=p.f?p.f.getFullYear():'s/f'; porAnio[y]=porAnio[y]||{n:0,fact:0}; porAnio[y].n++; porAnio[y].fact+=p.total })
console.log('  por año:', Object.entries(porAnio).sort().map(([y,v])=>`${y}: ${v.n} proy ${M(v.fact)}`).join(' · '))

console.log('\n═══ GRILLA — qué compran y a qué precio (venta prorrateada) ═══')
console.log('  El "promedio Magma" se calcula con el MISMO método (mismo prorrateo, mismo universo 2026)')
console.log('  para que las dos columnas sean comparables.\n')
console.log('  servicio        veces   costo prom    VENTA prom   margen    PROM. MAGMA    dif')
Object.entries(S).sort((a,b)=>b[1].venta-a[1].venta).forEach(([k,v])=>{
  const cp=v.costo/v.veces, vp=v.venta/v.veces
  const g=G[k]
  const gp=g&&g.veces?g.venta/g.veces:null
  const dif=gp?((vp/gp-1)*100):null
  console.log(`  ${k.padEnd(14)} ${String(v.veces).padStart(5)} ${M(cp).padStart(13)} ${M(vp).padStart(13)} ${((1-cp/vp)*100).toFixed(0).padStart(7)}% ${(gp?M(gp):'—').padStart(14)} ${(dif===null?'—':(dif>=0?'+':'')+dif.toFixed(0)+'%').padStart(7)}`)
})

console.log('\n═══ PROYECTOS (último primero) ═══')
proyectos.sort((a,b)=>(b.f?.getTime()||0)-(a.f?.getTime()||0)).slice(0,30).forEach(p=>{
  const fs = p.f ? `${String(p.f.getDate()).padStart(2,'0')}/${String(p.f.getMonth()+1).padStart(2,'0')}/${p.f.getFullYear()}` : '  s/fecha '
  console.log(`  #${p.nro.padStart(5)} ${fs}  ${p.proy.slice(0,38).padEnd(39)} ${M(p.total).padStart(13)}  costo ${M(p.costo).padStart(12)}  ${p.lineas.map(l=>l.k).join(', ').slice(0,50)}`)
})
