#!/bin/bash
# Instala el paquete de Claude Code de SOMOS MAGMA en esta Mac.
#   bash instalar.sh [/ruta/a/somos-magma-app]      (si no se pasa ruta: ~/somos-magma-app)
# Se puede correr las veces que haga falta: pisa lo que vino del paquete y respeta lo tuyo.
set -e
PAQ="$(cd "$(dirname "$0")" && pwd)"
# Se le pueden arrastrar carpetas: la del repo (somos-magma-app) y/o la carpeta vieja donde Sofi ya venía trabajando.
PROY=""; VIEJA=""
for a in "$@"; do
  a="${a%/}"
  if [ -f "$a/package.json" ] && [ -d "$a/scripts" ]; then PROY="$a"
  elif [ -d "$a" ]; then VIEJA="$(cd "$a" && pwd)"
  else echo "✗ No existe $a"; exit 1; fi
done
if [ -z "$PROY" ]; then
  if [ -f "$PAQ/../package.json" ] && [ -d "$PAQ/../scripts" ]; then PROY="$(cd "$PAQ/.." && pwd)"   # el paquete viene adentro del repo
  else PROY="$HOME/somos-magma-app"; fi
fi
if [ -z "$VIEJA" ] && [ -t 0 ]; then
  echo "¿Tenés una carpeta donde ya venías trabajando con Claude Code (por ejemplo 'somos magma claude')?"
  echo "Si sí: arrastrá esa carpeta a esta ventana y apretá Enter. Si no: apretá Enter y listo."
  printf "> "; IFS= read -r RESP || RESP=""
  RESP="$(printf '%s' "$RESP" | sed 's/\\\(.\)/\1/g; s/^[[:space:]]*//; s/[[:space:]]*$//')"   # saca las barras que agrega el arrastre
  if [ -n "$RESP" ]; then
    if [ -d "$RESP" ]; then VIEJA="$(cd "$RESP" && pwd)"; else echo "• No encontré esa carpeta ($RESP). Sigo sin traer lo viejo; después se puede correr de nuevo."; fi
  fi
  echo
fi
if [ ! -d "$PROY" ]; then
  echo "✗ No existe la carpeta $PROY."
  echo "  Primero cloná el repo (ver LEEME.md) o pasá la ruta: bash instalar.sh /ruta/a/somos-magma-app"
  exit 1
fi
PROY="$(cd "$PROY" && pwd)"
echo "Proyecto: $PROY"
echo

# 1) CLAUDE.md global (quién sos, cómo trabajás) — se lee en todos los chats
mkdir -p "$HOME/.claude"
if [ -f "$HOME/.claude/CLAUDE.md" ] && ! grep -q "^# Personal — Sofi" "$HOME/.claude/CLAUDE.md"; then
  cp "$HOME/.claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md.antes-de-magma"
  echo "• Tenías un ~/.claude/CLAUDE.md propio: quedó guardado como ~/.claude/CLAUDE.md.antes-de-magma"
fi
cp "$PAQ/global/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
echo "✓ ~/.claude/CLAUDE.md"

# 2) .claude del proyecto (comandos, skill de números, hook, permisos)
mkdir -p "$PROY/.claude"
cp -R "$PAQ/proyecto/.claude/." "$PROY/.claude/"
echo "✓ $PROY/.claude/  (comandos: $(ls "$PROY/.claude/commands" | wc -l | tr -d ' '))"

# 3) memoria — la carpeta la determina la ruta del proyecto (regla de Claude Code:
#    todo caracter que no sea letra o número se reemplaza por "-")
SLUG="$(printf '%s' "$PROY" | sed 's#[^A-Za-z0-9]#-#g')"
DEST="$HOME/.claude/projects/$SLUG/memory"
mkdir -p "$DEST"
N=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  cp "$PAQ/memoria/$f" "$DEST/$f"; N=$((N+1))
done < "$PAQ/memoria/manifest.txt"
INI='<!-- magma-paquete:inicio -->'; FIN='<!-- magma-paquete:fin -->'
if [ -f "$DEST/MEMORY.md" ] && grep -q "$INI" "$DEST/MEMORY.md"; then
  # ya había un paquete instalado: se reemplaza solo el bloque entre las marcas
  awk -v ini="$INI" -v fin="$FIN" -v nuevo="$PAQ/memoria/MEMORY.md" '
    $0==ini { while ((getline l < nuevo) > 0) print l; skip=1; next }
    $0==fin { skip=0; next }
    !skip { print }' "$DEST/MEMORY.md" > "$DEST/MEMORY.md.tmp" && mv "$DEST/MEMORY.md.tmp" "$DEST/MEMORY.md"
  echo "✓ MEMORY.md actualizado (las memorias tuyas quedan como estaban)"
elif [ -s "$DEST/MEMORY.md" ]; then
  # ya tenías memorias propias: el índice de Magma va arriba, lo tuyo abajo
  { cat "$PAQ/memoria/MEMORY.md"; echo; cat "$DEST/MEMORY.md"; } > "$DEST/MEMORY.md.tmp" && mv "$DEST/MEMORY.md.tmp" "$DEST/MEMORY.md"
  echo "✓ MEMORY.md: el índice de Magma quedó arriba de lo que ya tenías"
else
  cp "$PAQ/memoria/MEMORY.md" "$DEST/MEMORY.md"
  echo "✓ MEMORY.md"
fi
echo "✓ $N memorias en $DEST"

# 3b) lo que Sofi ya tenía en su carpeta vieja (memoria, CLAUDE.md, archivos): se suma, no se pisa nada
if [ -n "$VIEJA" ] && [ "$VIEJA" != "$PROY" ]; then
  echo
  echo "Trayendo lo que ya tenías en: $VIEJA"
  SLUG_V="$(printf '%s' "$VIEJA" | sed 's#[^A-Za-z0-9]#-#g')"
  MEM_V="$HOME/.claude/projects/$SLUG_V/memory"
  TITULO="# Lo que Sofi ya tenía en su carpeta anterior"
  if [ -d "$MEM_V" ] && ! grep -q "$TITULO" "$DEST/MEMORY.md" 2>/dev/null; then
    M=0; LINEAS="$DEST/.lineas-viejas.tmp"; : > "$LINEAS"
    [ -f "$MEM_V/MEMORY.md" ] && grep -v '^[[:space:]]*$' "$MEM_V/MEMORY.md" > "$LINEAS" || true
    for f in "$MEM_V"/*.md; do
      [ -f "$f" ] || continue; b="$(basename "$f")"; [ "$b" = "MEMORY.md" ] && continue
      if [ -e "$DEST/$b" ]; then n="${b%.md}-de-sofi.md"; sed -i '' "s#($b)#($n)#g" "$LINEAS"; else n="$b"; fi   # mismo nombre que una del paquete: se guarda aparte
      cp "$f" "$DEST/$n"; M=$((M+1))
    done
    { echo; echo "$TITULO"; cat "$LINEAS"; } >> "$DEST/MEMORY.md"; rm -f "$LINEAS"
    echo "✓ $M memorias tuyas sumadas al índice"
  elif [ -d "$MEM_V" ]; then echo "• tus memorias ya estaban sumadas (no se duplican)"
  else echo "• esa carpeta no tenía memoria de Claude Code (nada que traer)"; fi
  if [ -f "$VIEJA/CLAUDE.md" ] && ! grep -q "^# Lo que Sofi ya tenía en su CLAUDE.md" "$HOME/.claude/CLAUDE.md"; then
    { echo; echo "# Lo que Sofi ya tenía en su CLAUDE.md (carpeta anterior)"; cat "$VIEJA/CLAUDE.md"; } >> "$HOME/.claude/CLAUDE.md"
    echo "✓ tu CLAUDE.md anterior quedó sumado al de ~/.claude/CLAUDE.md"
  fi
  if [ -d "$VIEJA/.claude/commands" ]; then
    for f in "$VIEJA"/.claude/commands/*.md; do [ -f "$f" ] && [ ! -e "$PROY/.claude/commands/$(basename "$f")" ] && cp "$f" "$PROY/.claude/commands/"; done
    echo "✓ tus comandos propios (si tenías) quedaron en $PROY/.claude/commands/"
  fi
  mkdir -p "$PROY/de-sofi"
  rsync -a --exclude '.claude' --exclude 'CLAUDE.md' --exclude 'node_modules' --exclude '.DS_Store' "$VIEJA/" "$PROY/de-sofi/" 2>/dev/null || cp -R "$VIEJA/." "$PROY/de-sofi/"
  echo "✓ tus archivos copiados a $PROY/de-sofi/ (la carpeta vieja queda como estaba)"
  # un zip con lo tuyo para mandarle a Juan, así su Claude también lo aprende
  EXP="$HOME/Desktop/lo-de-sofi-para-juan.zip"; rm -f "$EXP"; TMPX="$(mktemp -d)"; mkdir -p "$TMPX/lo-de-sofi"
  [ -d "$MEM_V" ] && cp -R "$MEM_V" "$TMPX/lo-de-sofi/memoria"
  [ -f "$VIEJA/CLAUDE.md" ] && cp "$VIEJA/CLAUDE.md" "$TMPX/lo-de-sofi/CLAUDE.md"
  ( cd "$VIEJA" && find . -type f -not -path '*/.claude/*' -not -path '*/node_modules/*' -not -name '.DS_Store' | sort ) > "$TMPX/lo-de-sofi/archivos.txt"
  ( cd "$TMPX" && zip -qr "$EXP" lo-de-sofi ) && rm -rf "$TMPX"
  echo "✓ Para Juan: mandale por AirDrop $EXP (tu memoria + tu CLAUDE.md + la lista de tus archivos)"
fi
echo

# 4) chequeos de lo que falta
if command -v node >/dev/null 2>&1; then echo "✓ Node $(node -v)"; else echo "✗ Falta Node.js → https://nodejs.org (versión LTS). Sin esto los /comandos no corren."; fi
if [ -f "$PROY/.env.local" ]; then echo "✓ .env.local"; else echo "✗ Falta el archivo .env.local: Juan te lo manda por AirDrop; ponelo adentro de $PROY y volvé a correr este instalador."; fi
if [ -d "$PROY/node_modules" ]; then echo "✓ dependencias"
elif command -v npm >/dev/null 2>&1; then
  echo "• Instalando dependencias (una sola vez, puede tardar unos minutos)…"
  if (cd "$PROY" && npm install --no-audit --no-fund --loglevel=error); then echo "✓ dependencias instaladas"; else echo "✗ npm install falló: pasale a Juan lo que dice arriba"; fi
else echo "• Faltan las dependencias: instalá Node.js y volvé a correr este instalador"; fi
echo
echo "Listo. Abrí Claude Code en la carpeta $PROY y escribí /comandos"
