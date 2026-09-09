// ============================== NOMBRES DEL STAFF ==============================
// El mismo nombre aparece escrito de diez formas en el sheet: "Lucho", "lucho",
// "Jorge Luis Chavez", "Santino D'Angelo" con apóstrofe recto o curvo. Si no se
// unifican, la misma persona sale dos veces en toda cuenta por persona.
//
// Vivía adentro de pages/index.js; se mudó acá para que lib/jornadas.js y los
// componentes usen exactamente el mismo criterio (si hay dos, hay dos números).

export const STAFF_CANON_MAP={juan:'Juan Martin Arauz','juan martin':'Juan Martin Arauz',sofi:'Sofia Maria Grenier Basavilbaso',sofia:'Sofia Maria Grenier Basavilbaso',lulu:'Lucía María Grenier Basavilbaso',lucia:'Lucía María Grenier Basavilbaso',luli:'Lucía María Grenier Basavilbaso',dani:'Daniela Viviana Ayala',tom:'Tomás Halbach',santino:'Santino D’ Angelo','santino d angelo':'Santino D’ Angelo',gaspar:'Gaspar Peñalba',felipe:'Felipe Martinez',felip:'Felipe Martinez',ivan:'Ivan Aranda',pablo:'Pablo Leonel Molanes Araujo',lucas:'Lucas Ignacio Godoy',julian:'Julián Exequiel Pérez',blas:'Blas Lafontaine',mailen:'Mailen Santana',pedro:'Pedro Maddonni',nahuel:'Nahuel David Aguilar',lucho:'Jorge Luis Chavez',chanas:'Luciano Nicolas Scigliotti',luciano:'Luciano Nicolas Scigliotti',tutu:'Martin Nahuel Litman (Tutu)','martin litman':'Martin Nahuel Litman (Tutu)',pocho:'Martín Ponczyk (Pocho)','martin dario ponczyk':'Martín Ponczyk (Pocho)',paz:'Paz Bunge',pachu:'Paz Bunge',clari:'Clara Patti',eli:'Eli Cagliano',andy:'Andrés Julio Verón',gabo:'Gabriel Franco',manu:'Manuel Peñalba',nacho:'Ignacio Bettera',teo:'Mateo Minchilli',martin:'Martin Remedi',diego:'Diego Di Ciurcio','diego bariloche':'Diego Di Ciurcio','diego dc':'Diego Di Ciurcio',juli:'Juli Butteri'}

export const canonKey=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’´`]/g,'').replace(/\s+/g,' ').trim()
export const canonStaff=name=>{ const k=canonKey(name); return STAFF_CANON_MAP[k]||String(name||'').trim() }

// "Somos Magma" no es una persona: es la línea que se queda la empresa.
export const esMagma=n=>/somos magma|^magma$/i.test(String(n||'').trim())
