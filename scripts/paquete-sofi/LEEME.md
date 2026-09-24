# Claude Code para Sofi — el conocimiento de Magma en tu compu

Este paquete lo armó Juan (con Claude) el 22/09/2026. Es todo lo que Claude aprendió de Magma en cinco meses de trabajo: cómo se arma un precio, cómo se le paga al equipo, qué trampas tiene el sheet, qué se decidió con Mariana, quién es quién, qué se habló en cada reunión. Con esto instalado, tu Claude Code arranca sabiendo lo mismo que el de Juan.

## Qué trae

| Qué | Para qué | A dónde va en tu Mac |
|---|---|---|
| `global/CLAUDE.md` | Quién sos y cómo te gusta trabajar. Se lee en TODOS los chats. | `~/.claude/CLAUDE.md` |
| `proyecto/.claude/` | Los comandos (`/brief`, `/plata`, `/cliente`…), la skill de números, el hook y los permisos. | `somos-magma-app/.claude/` |
| `memoria/` | Las memorias de Magma más el índice `MEMORY.md`. | `~/.claude/projects/<carpeta del proyecto>/memory/` |
| `instalar.sh` | Copia todo a su lugar. | — |

## Instalar (una sola vez, unos 10 minutos)

1. **Node.js.** Entrá a https://nodejs.org/es/download. Ignorá el recuadro con código (curl, nvm). Bajá hasta donde dice *"O obtiene una versión pre compilada de Node.js para macOS"* y apretá el botón verde oscuro **"macOS Installer (.pkg)"**. Los menús se dejan como vienen. Abrí el archivo bajado y dale *Continuar* hasta terminar. Es lo que corre los scripts que leen el sheet.
2. **Abrí el zip** que te mandó Juan (doble clic). Te queda la carpeta `somos-magma-app`. Podés dejarla en Descargas o arrastrarla a tu carpeta personal, pero **después no la muevas más** (si la movés, volvé a correr el paso 4).
3. **El archivo `.env.local`** que Juan te manda por AirDrop: arrastralo **adentro** de la carpeta `somos-magma-app`. Son las llaves del sheet y del mail. Empieza con punto, así que Finder lo esconde: `⌘⇧.` para verlo.
4. **Terminal.** Abrila (⌘ + espacio, escribí *Terminal*, Enter). Copiá esta línea entera, pegala en la ventana y apretá Enter:
   ```
   bash ~/Downloads/somos-magma-app/_para-sofi-claude-code/instalar.sh
   ```
   (Si dejaste la carpeta en otro lado que no sea Descargas, cambiá `~/Downloads` por ese lugar.)
   Te va a preguntar por la carpeta donde ya venías trabajando con Claude: **arrastrá esa carpeta a la ventana y apretá Enter**. Si no tenés, apretá Enter y sigue. Instala todo solo; la primera vez tarda unos minutos porque baja las dependencias. Tu carpeta vieja no se toca: su memoria y sus archivos se suman (los archivos quedan en `somos-magma-app/de-sofi/`).
   Al terminar te deja en el Escritorio `lo-de-sofi-para-juan.zip`: **mandáselo a Juan por AirDrop** para que su Claude también aprenda lo tuyo.
5. **Claude Code.** Abrí la app y elegí la carpeta `somos-magma-app` (si lo usás desde la Terminal: `cd ~/Downloads/somos-magma-app` y después `claude`). Escribí `/comandos`.

## Probar que anda

1. Abrí Claude Code en la carpeta `somos-magma-app`.
2. Escribí `/comandos` → tiene que mostrarte el menú.
3. Escribí `/brief` → corre el script del día y te cuenta qué cobrar, qué pagar, qué se viene. Si falla por credenciales, es el `.env.local`.
4. Preguntale "¿cómo se arma el precio de una media jornada?" → tiene que contestarte con la fórmula del margen (35% de Ganancias y 4% de IIBB sobre el margen de Magma, IVA por fuera). Si no la sabe, no está leyendo la memoria: mirá el punto 3 de "Si algo no anda".

## Conectar Gmail, Calendar y Drive (opcional, recomendado)

En claude.ai → Configuración → Conectores, con **sofi@somosmagma.com**. Con eso Claude Code te busca mails, mira el calendario y el Drive desde el chat. Sin esto igual andan los comandos: leen el sheet y el mail de admin@ con las llaves de `.env.local`.

## Cómo usarlo

- Hablale normal, en español. Los `/comandos` son atajos para ir más rápido.
- **Antes de tocar datos reales te muestra un preview y te pide OK.** Los scripts que escriben al sheet llevan `--escribir`; si no lo lleva, solo mira.
- Todo lo que le expliques de Magma lo guarda en memoria solo. **Tu memoria y la de Juan no se sincronizan**: si aprende algo que cambia una regla, pasáselo a Juan (o que quede en el sheet).
- No cambia código de la app ni hace commits: eso lo hace Juan. Si ves algo para mejorar, decile "anotalo en el backlog".
- Un tema grande = un chat (plata en uno, un cliente en otro). La memoria persiste entre chats.

## Qué NO está en el paquete

Todo lo de la empresa está. Quedó afuera lo personal de Juan: su perfil y preferencias de chat, su calendario personal, sus cuentas de Microsoft, el link de su documento de cuenta personal, y su preparación privada de conversaciones entre socios (del reparto comercial va la versión con hechos y decisiones). Sí están la cuenta de socios, las decisiones de sueldos del equipo, las tarjetas y lo fiscal, porque sos socia.

## Si algo no anda

1. **`/comandos` no aparece** → el instalador no encontró la carpeta del repo. Corré `bash instalar.sh /ruta/correcta`.
2. **`/brief` falla con error de credenciales** → falta `.env.local` o está en otra carpeta.
3. **Claude no sabe nada de Magma** → la memoria quedó en otra carpeta. La ruta depende de dónde está el repo: `~/.claude/projects/-Users-<tu usuario>-somos-magma-app/memory/`. El instalador la imprime; si el repo está en otro lado, volvé a correrlo con esa ruta.
4. **Cualquier otra cosa** → pasale a Juan el error tal cual sale.

---

## Para Juan

- **Regenerar el paquete** (cuando la memoria crezca o cambien los comandos): `node scripts/paquete-sofi.mjs` → escribe la carpeta `_para-sofi-claude-code/` y el zip `_para-sofi-todo.zip`. Con `--preview` solo lista qué entraría. Las exclusiones están en `scripts/paquete-sofi/excluir.txt`; los archivos adaptados o nuevos, en `scripts/paquete-sofi/memoria-extra/`.
- **Qué se le manda:** `_para-sofi-todo.zip` (repo + este paquete adentro; se descomprime como `somos-magma-app/`) y, **aparte por AirDrop, el `.env.local`**. El zip nunca lleva credenciales. Es el único zip: la carpeta `_para-sofi-claude-code/` queda solo para mirar.
- **Alternativa por GitHub** (si algún día conviene que reciba actualizaciones con `git pull`): darle acceso en Settings → Collaborators y que clone `https://github.com/arauzjuanmartin-star/somos-magma-app.git`; el instalador acepta la ruta como argumento: `bash instalar.sh /ruta/al/repo`.
- **Reinstalar** en la Mac de Sofi pisa las memorias que vinieron del paquete y respeta las que ella generó.
- `.claude/` está en `.gitignore`: por eso los comandos van en el paquete y no con el repo. Si querés que viajen con git, sacá `.claude/` del ignore y dejá solo `.claude/settings.local.json` y `.claude/worktrees/`.
