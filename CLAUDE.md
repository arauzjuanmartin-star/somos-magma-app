# SOMOS MAGMA App — Claude Project Rules

## Qué es esto
App Next.js para reemplazar el flujo operativo de SOMOS MAGMA (productora audiovisual, Buenos Aires) que hoy vive en Google Sheets.

**Estado:** Equipo migra al uso diario de la app a partir de mayo 2026. El sheet "Master Magma 2025" sigue como **backup automático y fuente histórica** — la app lee y escribe ahí siempre.

## Stack
- **Frontend/backend**: Next.js 14 + React 18 (Pages Router)
- **Storage**: Google Sheets via service account (`magma-sheets-364@somos-magma.iam.gserviceaccount.com`)
- **AI**: Claude API para procesamiento de PDFs (resúmenes de tarjetas, etc.)
- **Deploy**: Vercel
- **Local dev**: `.env.local` con `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `ANTHROPIC_API_KEY`
- **IDE**: VSCode + Claude Code extension

## Regla de oro #1 — TODO escribe al sheet
**Cualquier feature nueva en la app DEBE escribir al sheet de Master Magma.** Si un cambio en la app no queda registrado en sheets, es un bug y hay que avisarle a Juan inmediatamente. El sheet es la red de seguridad.

**Y no alcanza con que la columna exista: los valores tienen que cerrar entre sí.** Que el sheet se vea lleno y prolijo no prueba nada — el IIBB estuvo calculado sobre la base equivocada de enero a junio 2026 con las siete columnas existiendo y escribiéndose. Al tocar cualquier cálculo que se persiste, correr `node scripts/presupuestos-verificar.mjs 30`. Hay un hook (`.claude/hooks/verificar-sheet.mjs`) que lo recuerda solo al editar `pages/api/*`, `lib/sheets.js` o `pages/index.js`.

## Regla de oro #2 — La app tiene que ser MÁS rápida que el sheet
Si una operación requiere más clics o pasos en la app que en el sheet, el equipo no migra. Cada flujo nuevo se evalúa contra esto. Mejor un formulario simple que funcione hoy que un módulo perfecto en 2 meses.

## Regla de oro #3 — Operaciones destructivas siempre con preview
Antes de eliminar filas, mover datos masivos, o cualquier cosa irreversible: mostrar preview en consola y pedir OK explícito a Juan. Cero deletes a ciegas.

## Memoria persistente
Existe sistema de memoria en `~/.claude/projects/-Users-dronjuan-somos-magma-app/memory/` con info crítica del proyecto. Leer `MEMORY.md` (índice) en cada chat nuevo. Memorias clave:

- `project_app_status_real.md` — estado real de uso
- `project_margen_formula.md` — fórmula de margen y precio (35% Gan + 4% IIBB sobre margen Magma; IVA siempre por fuera)
- `project_sheet_replication_bug.md` — bug del sheet que justifica migración
- `project_juan_daily_control_flow.md` — Calendar→Proyectos→Facturación→Pagos
- `reference_sheet_direct_access.md` — boilerplate para scripts locales
- `project_team_payments.md`, `project_banking_accounts.md` — equipo y cuentas

## Estructura del proyecto

```
pages/
  index.js          # Dashboard + módulos principales (1500+ líneas, todo en uno por simplicidad)
  api/              # Endpoints que escriben al sheet
lib/
  sheets.js         # getAllData() + getSheets() — entrada única al sheet
scripts/            # Scripts utilitarios (.mjs) — auditorías, setups, fixes
.env.local          # Credenciales (NO committear)
```

## Convenciones del proyecto

- **Idioma**: español argentino para UI y comentarios. Nombres de funciones/variables en inglés solo si ya existen así.
- **Formato números**: argentino (`$1.156.055,78`). Cuidado al parsear desde el sheet — confirmar locale.
- **Fechas**: `DD/MM/YYYY` para mostrar, `Date` interno.
- **API endpoints**: leer headers de la solapa con `getSheets()`, mapear por nombre, escribir con `valueInputOption: 'USER_ENTERED'` para que Sheets respete tipos.
- **Cuando una columna se renumera (Pedido 1, Pedido 2...)** ya hay lógica en `lib/sheets.js` para PRESUPUESTOS y PROYECTOS.

## Solapas del sheet (resumen)

| Solapa | Propósito |
|---|---|
| PRESUPUESTOS | Presus en curso (solo año vigente) |
| PROYECTOS | Trabajos confirmados/aprobados |
| FACTURACION | Facturas emitidas + cobros |
| CARGAR STAFF | Formulario de carga (no es tabla de datos) |
| PAGOS_STAFF | Pagos a freelancers |
| RRHH | Roster de freelancers + datos fiscales |
| Contactos/agencias | Clientes y agencias |
| HISTORICO_2023, _2024, _2025 | Histórico cerrado por año |
| COBROS, GASTOS_FIJOS, TARJETAS, PRESTAMOS, MOVIMIENTOS_TARJETA | Egresos |
| RESERVAS, CUENTAS, SUELDOS, LOG | Auxiliares |

## Conceptos de negocio críticos (no confundir)

- **Fee Agencia** en el sheet = margen Magma (Magma actúa como agencia sobre los freelancers — no es una agencia externa)
- **Staff = "Somos Magma"** en presu = ganancia para la empresa (lo absorbe alguien interno)
- **Diferencia** en PROYECTOS = ajuste post-evento entre presupuestado y pagado al staff
- **Recargo / descuento** = sobre línea Magma, no sobre costo del operador

## Cosas que NO hay que hacer

- No mocks. Trabajamos contra el sheet real.
- No tests automatizados todavía — Juan testea en producción contra el equipo.
- No agregar dependencias sin pedir. La app funciona simple.
- No reformatear código ajeno.
- No proponer migraciones de framework / DB / arquitectura sin pedir.
- No commits sin que Juan apruebe.
