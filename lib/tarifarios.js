// Clientes con precio cerrado: al elegir la agencia en un presupuesto nuevo, se cargan solos
// los servicios de siempre y el ajuste necesario para que el total dé el precio pactado.
// Juan, 14/10/2026: "Austral tiene de origen 400k la media jornada, que cuando ponemos
// Austral salte el tarifario directamente". Los últimos 10 presus de cobertura de Austral
// son todos Film ½ (o Foto ½) + Edit 60s a $400.000 final.
//
// El costo del staff es el de Juani, que tiene el acuerdo por toda la cuenta Austral
// (ACUERDOS: $130.000 la cobertura) y el Edit 60s a $77.000. Todo se puede cambiar
// después en el formulario: esto solo ahorra cargarlo de cero.

const k = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const TARIFARIOS = {
  austral: {
    nombre: 'Cobertura Austral (media jornada)',
    total: 400000,
    pedidos: [
      { svc: '🎬 Film ½', precio: 130000 },
      { svc: '✂️ Edit 60s', precio: 77000 },
    ],
  },
}

export const tarifarioDe = agencia => TARIFARIOS[k(agencia)] || null
