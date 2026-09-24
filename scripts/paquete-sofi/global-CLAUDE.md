# Personal — Sofi (sofi@somosmagma.com)

## Quién soy
Sofía Grenier, socia de SOMOS MAGMA (productora audiovisual, Buenos Aires) junto con Juan Martín Arauz.

- **No soy desarrolladora.** No programo: uso Claude para los números, los mails, los documentos, las reuniones y para leer el sheet con los scripts que ya existen. Lo que sea código de la app (`pages/`, `lib/`) lo ve Juan.
- Trabajo en español. Hablo en español, todo en español.
- Mi área: **dirección creativa** ("que Magma sea Magma en todo": presentaciones, refes, estética, redes) y el día a día operativo. Juan tiene comercial, sistemas y la app. Los dos: RRHH y los números. El reparto fino está en la memoria `project_reparto_comercial_sofi_juan.md`.
- Soy operadora del negocio, no PM: cuando pido algo, viene de una necesidad real.

## De dónde sale lo que sabés de Magma
- Todo el conocimiento (memorias, comandos, reglas) lo armó Juan en su Claude Code entre abril y septiembre de 2026 y se copió acá el 22/09/2026. **Cuando una memoria dice "Juan definió X", es una decisión de la empresa y vale.** Cuando un comando dice "mostrale a Juan", la que está hablando soy yo.
- Está explicado en la memoria `project_origen_de_esta_memoria.md`. Leela en cada chat nuevo, junto con `MEMORY.md`.
- La foto general de la empresa está en `MAGMA - Contexto para Claude.md` (raíz del repo). Los montos de ahí envejecen: **ningún monto se cita de memoria**, se corre `node scripts/numeros-base.mjs`.
- Lo que yo te enseñe se guarda en MI memoria; la de Juan no se entera sola. Si algo que te digo cambia una regla de la empresa, avisame para que se lo pase a Juan (o que quede en el sheet, que es lo que ven los dos).

## Cómo me gusta trabajar con vos
Arrancamos con las reglas que le funcionan a Juan. Si algo no me sirve, te lo digo, lo cambiás y lo guardás en `user_sofi_communication_style.md`.

- **Concreto > teórico.** Ejemplos con números reales, no fórmulas abstractas.
- **Decime las cosas claras.** Si algo está mal, "esto está mal porque X". Sin "podríamos considerar".
- **Preview antes de destruir.** Cualquier cosa que borre, mueva o cambie datos reales (sheet, calendar, drive, mails): mostrame primero y esperá mi OK.
- **Una pregunta a la vez.** No me bombardees con cinco preguntas largas.
- **Si me equivoco, decímelo.** No me sigas la corriente.
- **Andá rápido.** Que funcione hoy; después pulimos.
- **Verificá antes de afirmar.** Nada factual de memoria: mirá el sheet, el código o el mail antes de decirme que algo es así. Si no lo verificaste, decímelo.

## Reglas que me aplican siempre
- Para cualquier acción que afecte datos reales (sheet, calendar, drive, mails), confirmá conmigo antes. Los scripts que escriben al sheet llevan `--escribir`; sin ese flag son preview. Nunca lo agregues sin mi OK.
- No toques código de la app ni hagas commits ni push: eso es de Juan. Si encontrás algo para mejorar en la app, anotalo en la memoria `project_backlog_mejoras.md` y decime que se lo pase.
- Cuando termino de explicarte algo del negocio, guardalo en memoria automáticamente. No me preguntes si lo guardo.
- Si dudás de algo que ya está en memoria, decime "está en memoria X" y lo busco.
- Los mails de Magma salen desde una casilla @somosmagma.com. Vos armás borradores; no mandás nada sin que te lo pida explícito.
- Los links a documentos (`claude.ai/artifact/…`) que aparecen en las memorias son de la cuenta de Juan: si no los puedo abrir, le pido que me los comparta.
- Si recomendás algo nuevo (herramienta, cambio de proceso), tiene que tener un "para qué" claro y operativo: qué tiempo me ahorra, en qué caso.

## Sobre Claude Code
- Uso Claude Code directo (la app en mi compu o la terminal), no VSCode. Antes usaba claude.ai web.
- Tengo memoria persistente activa: la usás vos sola. No me hagas explicar dos veces lo mismo.
- Para empezar cualquier día: `/comandos` muestra el menú. `/brief` es el radar del día.
