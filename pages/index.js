import { useState, useEffect } from 'react';

const ESTADOS = ['Pendiente', 'Aprobado', 'En curso', 'Entregado', 'Cancelado'];
const TIPOS = ['Video corporativo', 'Reel', 'Cobertura evento', 'Contenido mensual', 'Documental', 'Publicidad', 'Otro'];

export default function Home() {
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState('lista');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [mensaje, setMensaje] = useState(null);
  const [form, setForm] = useState({ fecha: new Date().toLocaleDateString('es-AR'), cliente: '', proyecto: '', tipo: '', monto: '', estado: 'Pendiente', responsable: '', notas: '' });

  useEffect(() => { cargarDatos(); }, []);

  async function cargarDatos() {
    setLoading(true);
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      setPresupuestos(data.presupuestos || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function guardarPresupuesto() {
    if (!form.cliente || !form.proyecto || !form.monto) { setMensaje({ tipo: 'error', texto: 'Completá cliente, proyecto y monto.' }); return; }
    setGuardando(true);
    try {
      const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) {
        setMensaje({ tipo: 'ok', texto: '✅ Presupuesto guardado en Sheets' });
        setForm({ fecha: new Date().toLocaleDateString('es-AR'), cliente: '', proyecto: '', tipo: '', monto: '', estado: 'Pendiente', responsable: '', notas: '' });
        setVista('lista'); cargarDatos();
      } else { setMensaje({ tipo: 'error', texto: data.error || 'Error guardando' }); }
    } catch (e) { setMensaje({ tipo: 'error', texto: 'Error de conexión' }); }
    setGuardando(false);
    setTimeout(() => setMensaje(null), 4000);
  }

  const presupuestosFiltrados = filtroEstado === 'Todos' ? presupuestos : presupuestos.filter(p => p.Estado === filtroEstado);
  const totalAprobados = presupuestos.filter(p => ['Aprobado', 'En curso'].includes(p.Estado)).reduce((acc, p) => acc + (parseFloat(String(p.Monto).replace(/[^0-9.]/g, '')) || 0), 0);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: '#0a0a0a', minHeight: '100vh', color: '#fff' }}>
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #ff4d00, #ff8c00)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16 }}>M</div>
          <div><div style={{ fontWeight: 700, fontSize: 16 }}>Somos Magma</div><div style={{ fontSize: 11, color: '#666' }}>Gestión de presupuestos</div></div>
        </div>
        <button onClick={() => setVista(vista === 'nuevo' ? 'lista' : 'nuevo')} style={{ background: vista === 'nuevo' ? '#333' : 'linear-gradient(135deg, #ff4d00, #ff8c00)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          {vista === 'nuevo' ? '← Volver' : '+ Nuevo presupuesto'}
        </button>
      </div>
      {mensaje && <div style={{ background: mensaje.tipo === 'ok' ? '#0f2a0f' : '#2a0f0f', color: mensaje.tipo === 'ok' ? '#5dbb5d' : '#bb5d5d', padding: '12px 24px', fontSize: 13, textAlign: 'center' }}>{mensaje.texto}</div>}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        {vista === 'lista' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {[{ label: 'Total presupuestos', valor: presupuestos.length }, { label: 'Aprobados / En curso', valor: presupuestos.filter(p => ['Aprobado', 'En curso'].includes(p.Estado)).length }, { label: 'Monto activo (ARS)', valor: `$${totalAprobados.toLocaleString('es-AR')}` }].map((s, i) => (
                <div key={i} style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{s.valor}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {['Todos', ...ESTADOS].map(e => <button key={e} onClick={() => setFiltroEstado(e)} style={{ background: filtroEstado === e ? '#ff4d00' : '#1a1a1a', color: filtroEstado === e ? '#fff' : '#888', border: '1px solid #333', borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>{e}</button>)}
              <button onClick={cargarDatos} style={{ marginLeft: 'auto', background: '#1a1a1a', color: '#555', border: '1px solid #333', borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer' }}>↻ Actualizar</button>
            </div>
            {loading ? <div style={{ textAlign: 'center', color: '#444', padding: 60 }}>Cargando desde Sheets...</div> : presupuestosFiltrados.length === 0 ? <div style={{ textAlign: 'center', color: '#444', padding: 60 }}>Sin datos todavía.</div> : (
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: '1px solid #222' }}>{['Fecha', 'Cliente', 'Proyecto', 'Tipo', 'Monto', 'Estado', 'Responsable'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#444', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                  <tbody>{presupuestosFiltrados.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td style={{ padding: '10px 14px', color: '#666' }}>{p.Fecha || '-'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.Cliente || '-'}</td>
                      <td style={{ padding: '10px 14px', color: '#aaa' }}>{p.Proyecto || '-'}</td>
                      <td style={{ padding: '10px 14px', color: '#666' }}>{p.Tipo || '-'}</td>
                      <td style={{ padding: '10px 14px', color: '#5dbb5d', fontWeight: 600 }}>{p.Monto ? `$${p.Monto}` : '-'}</td>
                      <td style={{ padding: '10px 14px' }}><span style={{ background: { Aprobado: '#0f2a0f', 'En curso': '#1a1a00', Pendiente: '#1a1010', Entregado: '#0a1a2a', Cancelado: '#2a0a0a' }[p.Estado] || '#1a1a1a', color: { Aprobado: '#5dbb5d', 'En curso': '#ddbb00', Pendiente: '#bb5d5d', Entregado: '#5d9dbb', Cancelado: '#666' }[p.Estado] || '#666', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{p.Estado || '-'}</span></td>
                      <td style={{ padding: '10px 14px', color: '#666' }}>{p.Responsable || '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h2 style={{ fontWeight: 700, marginBottom: 24, fontSize: 20 }}>Nuevo presupuesto</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              {[{ label: 'Cliente *', key: 'cliente', placeholder: 'Nombre del cliente' }, { label: 'Proyecto *', key: 'proyecto', placeholder: 'Descripción del trabajo' }, { label: 'Monto (ARS) *', key: 'monto', placeholder: '0' }, { label: 'Responsable', key: 'responsable', placeholder: 'Quién lo lleva' }, { label: 'Notas', key: 'notas', placeholder: 'Info adicional' }].map(f => (
                <div key={f.key}><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} /></div>
              ))}
              <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>Tipo de trabajo</label><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none' }}><option value=''>Seleccioná...</option>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>Estado</label><select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none' }}>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
              <button onClick={guardarPresupuesto} disabled={guardando} style={{ background: 'linear-gradient(135deg, #ff4d00, #ff8c00)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando...' : 'Guardar en Sheets'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
