---
name: project_origen_de_esta_memoria
description: "LEER PRIMERO — esta memoria viene de los chats de Juan en Claude Code (paquete del 22/09/2026); cómo leer 'Juan' en los textos, qué quedó afuera, qué envejece y por qué las dos memorias no se sincronizan"
metadata:
  type: project
---

**De dónde sale:** Juan armó el sistema de Magma en Claude Code entre abril y septiembre de 2026 (la app, 300+ scripts, los comandos y unas 190 memorias). El **22/09/2026** se copió a la máquina de Sofi para que su Claude arranque sabiendo lo mismo. Ver [[project_claude_para_el_equipo]].

**Cómo leer los textos:**
- Cuando una memoria dice "Juan definió / Juan pidió / Juan me corrigió", es un hecho o una decisión de la empresa, tomada en los chats de Juan. Vale igual acá.
- Cuando un comando dice "mostrale a Juan", acá la que está hablando es **Sofi**: mostráselo a ella.
- Las frases en primera persona ("me equivoqué", "cité un número que no existía") son del Claude de Juan. Las lecciones valen para este también.
- Las memorias `feedback_*` son reglas de cómo trabajar. Aplican acá también, salvo que Sofi diga otra cosa ([[user_sofi_communication_style]]).

**Qué no se copió** (queda en la máquina de Juan): sus cuentas y preferencias personales, su calendario personal, el link de su documento de cuenta personal, y su preparación privada de conversaciones entre socios. Todo lo de la empresa está, incluida la cuenta de socios ([[project_modelo_cuenta_socios]]) y las decisiones de sueldos del equipo.

**Qué envejece:** los montos. **Ningún monto se cita de memoria**: se corre `node scripts/numeros-base.mjs` ([[feedback_numeros_no_de_memoria]]). Los links a artifacts (`claude.ai/artifact/…`, `claude.ai/code/artifact/…`) son de la cuenta de Juan: si Sofi no los puede abrir, hay que pedirle que los comparta. Las rutas `/Users/dronjuan/...` son de la Mac de Juan.

**Las dos memorias NO se sincronizan solas.** Lo que Sofi enseñe acá se guarda acá; lo que Juan enseñe allá queda allá. Si algo que aprende este Claude cambia una regla de la empresa, avisarle a Sofi para que se lo pase a Juan (o dejarlo en el sheet, que es lo que ven los dos). Para actualizar este lado, Juan regenera el paquete con `node scripts/paquete-sofi.mjs` y Sofi vuelve a correr `instalar.sh`: eso pisa las memorias que vinieron del paquete y respeta las que ella generó.

**Qué no hace este Claude:** no toca código de la app (`pages/`, `lib/`) ni hace commits ni push. Si aparece algo para mejorar, se anota en [[project_backlog_mejoras]] y se le pasa a Juan.
