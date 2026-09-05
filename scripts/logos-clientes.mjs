/**
 * LOGOS DE CLIENTES / AGENCIAS — baja los logos oficiales en PNG transparente
 * para el muro de logos de la Ficha de Servicios y de la web.
 * Fuente: Wikidata (propiedad P154 "logo image") + Wikimedia Commons, que devuelve
 * el SVG oficial renderizado a PNG con fondo transparente. Solo lectura, no toca el sheet.
 * Uso: node scripts/logos-clientes.mjs
 */
import { writeFileSync, existsSync } from 'fs'

const OUT = '/Users/dronjuan/somos-magma-app/public/branding/logos-clientes'
const UA = { 'User-Agent': 'SomosMagma-LogoFetch/1.0 (arauzjuanmartin@gmail.com)' }

// [archivo, qué buscar en Wikidata, pista para elegir la entidad correcta]
const MARCAS = [
  ['microsoft',      'Microsoft',                   /software|tecnol|empresa/i],
  ['santander',      'Banco Santander',             /banc/i],
  ['unilever',       'Unilever',                    /empresa|consumer|bienes/i],
  ['google',         'Google',                      /empresa|tecnol|subsidiar/i],
  ['mercado-libre',  'Mercado Libre',               /comercio|empresa|market/i],
  ['personal',       'Telecom Personal',            /telefon|movil|empresa/i],
  ['latam',          'LATAM Airlines Group',        /aerol|airline/i],
  ['iveco',          'Iveco',                       /veh|camion|empresa/i],
  ['case-ih',        'Case IH',                     /agric|maquinaria|marca/i],
  ['new-holland',    'New Holland Agriculture',     /agric|maquinaria|marca/i],
  ['ferrero',        'Ferrero',                     /empresa|chocolat|confit/i],
  ['nutella',        'Nutella',                     /crema|marca|avellana|hazelnut/i],
  ['adidas',         'Adidas',                      /deport|ropa|empresa/i],
  ['mondelez',       'Mondelez International',      /empresa|aliment|confit/i],
  ['garnier',        'Garnier',                     /cosm|marca|belleza/i],
  ['loreal',         "L'Oréal",                     /cosm|empresa|belleza/i],
  ['maybelline',     'Maybelline',                  /cosm|marca|maquillaje/i],
  ['medtronic',      'Medtronic',                   /medic|dispositiv|empresa/i],
  ['samsung',        'Samsung Electronics',         /electr|empresa|tecnol/i],
  ['air-france',     'Air France',                  /aerol|airline/i],
  ['klm',            'KLM',                         /aerol|airline/i],
  ['endeavor',       'Endeavor (organización)',     /organiz|emprend|ong|nonprofit/i],
  ['comafi',         'Banco Comafi',                /banc/i],
  ['honda',          'Honda',                       /empresa|automo|motor/i],
  ['peugeot',        'Peugeot',                     /automo|empresa|marca/i],
  ['citroen',        'Citroën',                     /automo|empresa|marca/i],
  ['castrol',        'Castrol',                     /lubric|aceite|marca|empresa/i],
  ['syngenta',       'Syngenta',                    /agroqu|agric|empresa|semilla/i],
  ['pampers',        'Pampers',                     /pañal|marca|diaper/i],
  ['gillette',       'Gillette',                    /afeit|marca|razor/i],
  ['philips',        'Philips',                     /electr|empresa|tecnol/i],
  ['stella-artois',  'Stella Artois',               /cerve|beer|marca/i],
  ['hard-rock-cafe', 'Hard Rock Cafe',              /restaur|cadena|caf/i],
  ['visa',           'Visa Inc.',                   /pago|financ|tarjet|empresa/i],
  ['four-seasons',   'Four Seasons Hotels',         /hotel/i],
  ['cencosud',       'Cencosud',                    /empresa|retail|comerc/i],
  ['afa',            'Asociación del Fútbol Argentino', /futbol|fútbol|asocia/i],
  ['universidad-austral', 'Universidad Austral',    /universidad|argentin/i],
  ['andreani',       'Grupo Logístico Andreani',    /log|correo|empresa/i],
  ['campari',        'Campari',                     /licor|bebida|marca|aperitivo/i],
  ['hp',             'HP Inc.',                     /empresa|tecnol|computad/i],
  ['movistar-arena-bsas', 'Movistar Arena (Buenos Aires)', /estadio|arena|recinto/i],
]

const j = async (url) => (await fetch(url, { headers: UA })).json()

async function logoDe(query, pista) {
  for (const lang of ['es', 'en']) {
    const s = await j(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=${lang}&uselang=${lang}&type=item&limit=7&format=json`)
    const ids = (s.search || []).map(r => r.id)
    if (!ids.length) continue
    const e = await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|labels|descriptions&languages=es|en&format=json`)
    const conLogo = ids.map(id => e.entities?.[id]).filter(x => x?.claims?.P154?.length)
    if (!conLogo.length) continue
    const desc = x => (x.descriptions?.es?.value || x.descriptions?.en?.value || '')
    const elegido = conLogo.find(x => pista.test(desc(x))) || conLogo[0]
    return {
      qid: elegido.id,
      label: elegido.labels?.es?.value || elegido.labels?.en?.value || '?',
      desc: desc(elegido),
      file: elegido.claims.P154[0].mainsnak.datavalue.value,
      matcheoPista: pista.test(desc(elegido)),
    }
  }
  return null
}

const res = []
for (const [slug, query, pista] of MARCAS) {
  const dest = `${OUT}/${slug}.png`
  try {
    const hit = await logoDe(query, pista)
    if (!hit) { res.push({ slug, ok: false, error: 'sin logo en Wikidata' }); console.log(`✗ ${slug} — sin logo`); continue }
    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(hit.file)}?width=1200`
    const r = await fetch(url, { headers: UA })
    if (!r.ok) { res.push({ slug, ok: false, error: `HTTP ${r.status}`, ...hit }); console.log(`✗ ${slug} — HTTP ${r.status}`); continue }
    const buf = Buffer.from(await r.arrayBuffer())
    writeFileSync(dest, buf)
    const kb = Math.round(buf.length / 1024)
    res.push({ slug, ok: true, kb, ...hit })
    console.log(`${hit.matcheoPista ? '✓' : '?'} ${slug.padEnd(22)} ${String(kb + 'kb').padStart(7)}  ${hit.label} — ${hit.desc}`)
  } catch (err) {
    res.push({ slug, ok: false, error: err.message }); console.log(`✗ ${slug} — ${err.message}`)
  }
}
writeFileSync(`${OUT}/_fuentes.json`, JSON.stringify(res, null, 2))
console.log(`\n${res.filter(r => r.ok).length}/${MARCAS.length} bajados a ${OUT}`)
