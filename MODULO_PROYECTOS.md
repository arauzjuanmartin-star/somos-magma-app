# MÓDULO PROYECTOS — ESPECIFICACIÓN COMPLETA Y APROBADA

## Comportamiento general

Lista de proyectos aprobados/en curso en acordeón.
Click en una fila → se expande el panel de carga de staff debajo.
El resumen financiero se actualiza en tiempo real mientras asignás staff.

---

## UI — Tabla principal

Columnas: `N°` | `Proyecto` | `Agencia / Cliente` | `PM` | `Total` | `Staff` | `(botón)`

- **Badge Staff:**
  - `Pendiente` → naranja `#BA7517` / fondo `#BA751715`
  - `OK` → verde `#1D9E75` / fondo `#1D9E7515`
- **Botón:**
  - Sin staff asignado → `"Cargar"`
  - Con staff asignado → `"Ver"`

---

## UI — Panel expandido (acordeón)

Al hacer click en la fila se abre un panel debajo con:

### 1. Leyenda
```
"Asignar staff por servicio — si elegís Somos Magma la ganancia va a Magma"
```

### 2. Cabecera de columnas
```
SERVICIO          STAFF                    MONTO
```

### 3. Una fila por servicio (Pedido 1, Pedido 2, etc.)
```
[📷 Foto 1]    [Dropdown staff ▼]    [$250,000]
[🎥 Video 1]   [Dropdown staff ▼]    [$290,000]
[✂️ Edit 60s]  [Dropdown staff ▼]    [$150,000]
[🚁 Drone]     [Dropdown staff ▼]    [$100,000]
```

**Comportamiento del dropdown:**
- Primer opción siempre: `— Sin asignar —`
- Segunda opción siempre: `Somos Magma` (en morado, negrita)
- Resto: lista completa de RRHH ordenada alfabéticamente

**Si se elige "Somos Magma":**
- La fila entera se pone con fondo morado suave `#9635AB08` y borde `#9635AB30`
- El monto de esa fila se suma a "Somos Magma" en el resumen (no a freelance)
- Aparece nota explicativa abajo: *"Somos Magma hace [servicio] — los $XXX quedan como ingreso interno de Magma."*

### 4. Resumen financiero (tiempo real)
```
┌─────────────────────────────────────────────────────┐
│ Presupuestado   Staff freelance   Somos Magma   Fee Magma │
│  $1.370.000       $540.000        $300.000      +$530.000  │
└─────────────────────────────────────────────────────┘
```

- **Presupuestado** → `parseMonto(p['Total '])` (con espacio!)
- **Staff freelance** → suma de montos donde staff ≠ "Somos Magma" y staff ≠ ""
- **Somos Magma** → suma de montos donde staff === "Somos Magma" (morado `#9635AB`)
- **Fee Magma** → Presupuestado − Freelance − Somos Magma
  - Si positivo → verde `#1D9E75` con prefijo `+`
  - Si negativo → rojo `#E24B4A`

### 5. Nota explicativa (aparece solo si hay servicios de Somos Magma)
```
Somos Magma hace [servicios] — los $XXX quedan como ingreso interno de Magma.
```
Fondo morado suave `#9635AB08`, borde `#9635AB20`.

### 6. Botón guardar
```
[Guardar staff]  → azul #1543F8, ancho completo
```

---

## Lógica al guardar

1. Llama a `POST /api/proyecto-staff`
2. Body: `{ num: "1782", staffData: [{nombre: "Ivan Aranda", monto: 250000}, ...] }`
3. La API busca la fila en hoja PROYECTOS donde `N° presupuesto === num`
4. Escribe en columnas Staff, Staff 2, Staff 3... y Precio, Precio 2, Precio 3...
5. Marca columna `Carga Staff` = TRUE
6. En el frontend: badge cambia a "OK" verde, botón cambia a "Ver", toast "Staff guardado ✓"

---

## API — pages/api/proyecto-staff.js

```javascript
import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { num, staffData } = req.body
  // staffData = [{nombre: 'Ivan Aranda', monto: 250000}, ...]

  const sheets = await getSheets()
  const SHEET_ID = process.env.SHEET_ID

  // Leer la hoja PROYECTOS
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'PROYECTOS!A:BZ',
  })
  const rows = r.data.values
  const headers = rows[0]

  // Encontrar la fila del proyecto
  const colNum = headers.indexOf('N° presupuesto')
  let rowIndex = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][colNum]) === String(num)) { rowIndex = i + 1; break }
  }
  if (rowIndex === -1) return res.status(404).json({ error: 'Proyecto no encontrado' })

  // Preparar batch de updates
  const data = []

  // Marcar Carga Staff = TRUE
  const colCarga = headers.indexOf('Carga Staff')
  if (colCarga >= 0) {
    const colLetra = colToLetter(colCarga)
    data.push({ range: `PROYECTOS!${colLetra}${rowIndex}`, values: [[true]] })
  }

  // Escribir staff y montos por pedido
  staffData.forEach((s, idx) => {
    // Staff: columna "Staff" para idx=0, "Staff 2" para idx=1, etc.
    const staffKey = idx === 0 ? 'Staff' : `Staff ${idx + 1}`
    // Precio: columna "Precio" para idx=0, "Precio 2" para idx=1, etc.
    const precioKey = idx === 0 ? 'Precio' : `Precio ${idx + 1}`

    const colStaff = headers.indexOf(staffKey)
    const colPrecio = headers.indexOf(precioKey)

    if (colStaff >= 0 && s.nombre) {
      data.push({ range: `PROYECTOS!${colToLetter(colStaff)}${rowIndex}`, values: [[s.nombre]] })
    }
    if (colPrecio >= 0 && s.monto) {
      data.push({ range: `PROYECTOS!${colToLetter(colPrecio)}${rowIndex}`, values: [[s.monto]] })
    }
  })

  // Ejecutar todos los updates
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data }
  })

  res.json({ ok: true })
}

function colToLetter(col) {
  let s = ''
  col++
  while (col > 0) {
    col--
    s = String.fromCharCode(65 + (col % 26)) + s
    col = Math.floor(col / 26)
  }
  return s
}
```

---

## Componente React — función Proyectos completa

```javascript
function Proyectos({ data, mail }) {
  const [open, setOpen] = useState(null)
  const [staffSelections, setStaffSelections] = useState({}) // { "1782": [{nombre, monto}, ...] }
  const [guardados, setGuardados] = useState({}) // { "1782": true }
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState('')

  // Fuente: hoja PROYECTOS (no PRESUPUESTOS)
  const proyectos = (data.proyectos || []).filter(p => p['N° presupuesto'])

  // Staff real de RRHH
  const staffRRHH = ['Somos Magma', ...(data.rrhh || []).map(r => r['Nombre Apellido']).filter(Boolean).sort()]

  // Leer servicios de un proyecto de la hoja PROYECTOS
  const getServicios = (proy) => {
    const servicios = []
    for (let j = 1; j <= 12; j++) {
      const pedidoKey = `Pedido ${j}`
      const precioKey = j === 1 ? 'Precio' : `Precio ${j}`
      const staffKey = j === 1 ? 'Staff' : `Staff ${j}`
      const pedido = proy[pedidoKey]
      const precio = parseMonto(proy[precioKey])
      const staffAsignado = proy[staffKey] || ''
      if (pedido) servicios.push({ pedido, precio, staffAsignado, idx: j - 1 })
    }
    return servicios
  }

  // Calcular resumen financiero
  const calcResumen = (num, servicios) => {
    const sels = staffSelections[num] || servicios.map(s => ({ nombre: s.staffAsignado, monto: s.precio }))
    const total = parseMonto((proyectos.find(p => String(p['N° presupuesto']) === String(num)) || {})['Total '])
    let freelance = 0, magma = 0
    sels.forEach(s => {
      if (s.nombre === 'Somos Magma') magma += s.monto
      else if (s.nombre) freelance += s.monto
    })
    return { total, freelance, magma, fee: total - freelance - magma }
  }

  const updateStaff = (num, idx, campo, valor) => {
    setStaffSelections(prev => {
      const proy = proyectos.find(p => String(p['N° presupuesto']) === String(num))
      const servicios = getServicios(proy)
      const current = prev[num] || servicios.map(s => ({ nombre: s.staffAsignado, monto: s.precio }))
      const updated = [...current]
      updated[idx] = { ...updated[idx], [campo]: campo === 'monto' ? parseFloat(valor) || 0 : valor }
      return { ...prev, [num]: updated }
    })
  }

  const guardar = async (num) => {
    setSaving(num)
    const proy = proyectos.find(p => String(p['N° presupuesto']) === String(num))
    const servicios = getServicios(proy)
    const sels = staffSelections[num] || servicios.map(s => ({ nombre: s.staffAsignado, monto: s.precio }))
    const staffData = sels.filter(s => s.nombre).map(s => ({ nombre: s.nombre, monto: s.monto }))

    const res = await fetch('/api/proyecto-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-email': mail },
      body: JSON.stringify({ num, staffData })
    })
    setSaving(null)
    if (res.ok) {
      setGuardados(prev => ({ ...prev, [num]: true }))
      setOpen(null)
      setToast('Staff guardado ✓')
      setTimeout(() => setToast(''), 2500)
    }
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#1D9E75', color: '#fff',
          padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, zIndex: 999 }}>
          {toast}
        </div>
      )}

      {/* Tabla */}
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
        {proyectos.length === 0 && <div style={S.nd}>Sin proyectos activos</div>}
        {proyectos.map((p, i) => {
          const num = p['N° presupuesto']
          const staffOk = p['Carga Staff'] === true || p['Carga Staff'] === 'TRUE' || guardados[num]
          const isOpen = open === num
          const servicios = getServicios(p)
          const sels = staffSelections[num] || servicios.map(s => ({ nombre: s.staffAsignado, monto: s.precio }))
          const { total, freelance, magma, fee } = calcResumen(num, servicios)
          const svcsMagma = servicios.filter((s, idx) => (sels[idx]?.nombre || s.staffAsignado) === 'Somos Magma').map(s => s.pedido)

          return (
            <div key={i} style={{ ...S.card, marginBottom: 8 }}>
              {/* Fila de la tabla */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 70px 110px 90px 90px',
                alignItems: 'center', cursor: 'pointer', padding: '10px 0' }}
                onClick={() => setOpen(isOpen ? null : num)}>
                <span style={{ padding: '0 12px', color: '#1543F8', fontFamily: 'monospace', fontSize: 11 }}>#{num}</span>
                <span style={{ padding: '0 12px', fontWeight: 500, fontSize: 13 }}>{p['Proyecto'] || '—'}</span>
                <span style={{ padding: '0 12px', fontSize: 12, color: '#555' }}>{[p['Agencia'], p['Cliente']].filter(Boolean).join(' / ')}</span>
                <span style={{ padding: '0 12px', fontSize: 12, color: '#555' }}>{p['PM'] || '—'}</span>
                <span style={{ padding: '0 12px', fontFamily: 'monospace', fontSize: 12 }}>{fmt(parseMonto(p['Total ']))}</span>
                <span style={{ padding: '0 12px' }}>
                  <span style={{ ...S.badge, background: staffOk ? '#1D9E7520' : '#BA751720', color: staffOk ? '#1D9E75' : '#BA7517' }}>
                    {staffOk ? 'OK' : 'Pendiente'}
                  </span>
                </span>
                <span style={{ padding: '0 12px' }}>
                  <button style={S.fb} onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : num) }}>
                    {staffOk ? 'Ver' : 'Cargar'}
                  </button>
                </span>
              </div>

              {/* Panel expandido */}
              {isOpen && (
                <div style={{ borderTop: '0.5px solid #2A2A2A', padding: '16px' }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Asignar staff por servicio — si elegís "Somos Magma" la ganancia va a Magma
                  </div>

                  {/* Cabecera */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 110px', gap: 8, marginBottom: 6 }}>
                    {['Servicio', 'Staff', 'Monto'].map(h => (
                      <span key={h} style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px' }}>{h}</span>
                    ))}
                  </div>

                  {/* Filas por servicio */}
                  {servicios.map((s, idx) => {
                    const staffActual = sels[idx]?.nombre || s.staffAsignado
                    const esMagma = staffActual === 'Somos Magma'
                    return (
                      <div key={idx} style={{
                        display: 'grid', gridTemplateColumns: '1fr 1.2fr 110px', gap: 8, alignItems: 'center', marginBottom: 8,
                        ...(esMagma ? { background: '#9635AB08', border: '0.5px solid #9635AB30', borderRadius: 6, padding: '4px 0' } : {})
                      }}>
                        <div style={{ padding: '8px 10px', background: esMagma ? 'transparent' : '#1E1E1E', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {s.pedido}
                          {esMagma && <span style={{ fontSize: 10, color: '#9635AB', padding: '2px 6px', background: '#9635AB15', borderRadius: 3, fontWeight: 500 }}>Magma</span>}
                        </div>
                        <select
                          value={staffActual}
                          onChange={e => updateStaff(num, idx, 'nombre', e.target.value)}
                          style={{ padding: '7px 10px', borderRadius: 6, border: `0.5px solid ${esMagma ? '#9635AB40' : '#333'}`, background: '#1E1E1E', color: esMagma ? '#9635AB' : '#F0F0F0', fontSize: 12, outline: 'none', width: '100%' }}>
                          <option value="">— Sin asignar —</option>
                          {staffRRHH.map(st => (
                            <option key={st} value={st} style={st === 'Somos Magma' ? { color: '#9635AB', fontWeight: 500 } : {}}>
                              {st}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={sels[idx]?.monto ?? s.precio}
                          onChange={e => updateStaff(num, idx, 'monto', e.target.value)}
                          style={{ padding: '7px 10px', borderRadius: 6, border: '0.5px solid #333', background: '#1E1E1E', color: esMagma ? '#9635AB' : '#F0F0F0', fontFamily: 'monospace', fontSize: 12, outline: 'none', width: '100%' }}
                        />
                      </div>
                    )
                  })}

                  {/* Resumen */}
                  <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: '#1E1E1E', borderRadius: 8, marginTop: 12, flexWrap: 'wrap', borderLeft: '3px solid #2A2A2A' }}>
                    {[
                      ['Presupuestado', fmt(total), null],
                      ['Staff freelance', fmt(freelance), '#BA7517'],
                      ['Somos Magma', fmt(magma), '#9635AB'],
                      ['Fee Magma', (fee >= 0 ? '+' : '') + fmt(fee), fee >= 0 ? '#1D9E75' : '#E24B4A'],
                    ].map(([lbl, val, col]) => (
                      <div key={lbl}>
                        <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: 14, fontWeight: 500, fontFamily: 'monospace', color: col || 'inherit' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Nota Somos Magma */}
                  {svcsMagma.length > 0 && (
                    <div style={{ fontSize: 11, color: '#9635AB', marginTop: 8, padding: '6px 10px', background: '#9635AB08', borderRadius: 6, border: '0.5px solid #9635AB20' }}>
                      Somos Magma hace {svcsMagma.join(', ')} — los {fmt(magma)} quedan como ingreso interno de Magma.
                    </div>
                  )}

                  {/* Botón guardar */}
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => guardar(num)}
                      disabled={saving === num}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1543F8', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%', opacity: saving === num ? 0.6 : 1 }}>
                      {saving === num ? 'Guardando...' : 'Guardar staff'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Lista completa de staff (hoja RRHH real)

El dropdown siempre tiene primero "Somos Magma" y después el RRHH real:

```javascript
// Viene de data.rrhh — hoja RRHH del Sheets
// En el dropdown: primero Somos Magma, después el resto ordenado A-Z
const staffRRHH = [
  'Somos Magma',          // ← siempre primero, en morado
  'Andrés Julio Verón',
  'Blas Lafontaine',
  'Catalina Rajzak',
  'Clara Patti',
  'Clara Rapela',
  'Daniela Viviana Ayala',
  'Diego Agustin Acosta',
  'Gaspar Peñalba',
  'Ivan Aranda',
  'Juan Martin Arauz',
  'Lucía María Grenier Basavilbaso',
  'Lucas Vignale',
  'Paula Ximena Pereira',
  'Santino D\'Angelo',
  'Sofia Maria Grenier Basavilbaso',
  'Tomás Halbach',
  // ... y los que se agreguen en RRHH
]
```

---

## Notas técnicas importantes

1. **`Total ` con espacio** — la columna en PROYECTOS tiene un espacio al final: `p['Total ']`
2. **Staff columna 1** — se llama `'Staff'` sin número, no `'Staff 1'`
3. **Precio columna 1** — se llama `'Precio'` sin número, no `'Precio 1'`
4. **`Carga Staff`** — viene como `FALSE`/`TRUE` string o boolean. Verificar: `p['Carga Staff'] === true || p['Carga Staff'] === 'TRUE'`
5. **La API usa `batchUpdate`** para escribir todos los campos en un solo request (más eficiente)
6. **El fee Magma** = Presupuestado − Freelance − Somos Magma. Si es negativo → se gastó más de lo presupuestado
7. **Somos Magma en el resumen** = servicios que Magma hace internamente (Juan, Sofi, etc.) donde el ingreso queda en la empresa
