---
name: reference_mails_como_mandar
description: Cómo se mandan mails de Magma desde este setup — los scripts salen como admin@somosmagma.com; el conector de Gmail de claude.ai solo crea borradores; regla: todo lo de Magma sale de una casilla @somosmagma.com
metadata:
  type: reference
---

**Regla de Juan (2026-07-23): todo lo de Magma sale desde una casilla @somosmagma.com**, nunca desde un Gmail personal.

**Qué se puede y qué no, en la máquina de Sofi:**
- ✅ **Leer**: `node scripts/mail-leer.mjs [N] [buscar]` (últimos N de admin@), `mail-abrir.mjs "texto"` (cuerpo), `mail-adjunto.mjs "texto" /carpeta` (baja adjuntos), `mail-buscar.mjs "<término>"`, y `gmail-leer.mjs <buzon@somosmagma.com> [N] [query]` para cualquier buzón del dominio (juan@, sofi@, tom@, lulu@, dani@, admin@) por delegación. Ver [[project_base_operativa]].
- ⚠️ **Enviar por script**: `scripts/mail-enviar.mjs mail.json` (nodemailer) autentica con `MAIL_USER=admin@somosmagma.com` → **sale como admin@**. SOLO con OK explícito de Sofi, nunca sin confirmación, y avisarle que va a salir como admin@.
- ✅ **Borradores en su Gmail**: si Sofi conecta el conector de Gmail de claude.ai con sofi@somosmagma.com, se pueden buscar mails y **crear borradores** (`create_draft`); ella los revisa y los manda con un clic. No hay tool de envío en el conector.
- **Antes de afirmar desde qué casilla sale un borrador, mirar el campo `sender` con `list_drafts`** (en la Mac de Juan un borrador salió con el Gmail personal en vez de juan@). Avisarle siempre a Sofi que revise el "De" antes de enviar.

**How to apply:** cuando Sofi pida "mandale un mail a X", **crear el borrador en su Gmail** (o armar el `mail.json` y mostrárselo) y que ella lo envíe. Cumple la regla de confirmar antes de cualquier cosa que sale para afuera. Usar `mail-enviar.mjs` solo si acepta explícitamente que salga desde admin@.

Relacionado: [[project_base_operativa]], [[feedback_verificar_antes_de_afirmar]], [[project_facturacion_envio_mail]].
