#!/bin/bash
cd "$(dirname "$0")" || exit 1
PROJECT="$(pwd)"
DESKTOP="${HOME}/Desktop"
SHORTCUT="${DESKTOP}/İştirak Nakit Dashboard.command"

echo ""
echo "  ========================================"
echo "   İştirak Nakit Akış Dashboard"
echo "  ========================================"
echo ""
echo "  Project: $PROJECT"
echo "  Address: http://127.0.0.1:8787"
echo "  Data:    $PROJECT/data"
echo "  Close this window to stop the app."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed."
  echo "Install LTS from https://nodejs.org, then double-click this file again."
  open "https://nodejs.org" 2>/dev/null || true
  read -r -p "Press Enter to exit..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[Setup] Installing dependencies..."
  npm install || { echo "[ERROR] npm install failed"; read -r -p "Enter..."; exit 1; }
fi

if [ ! -f dist/index.html ] || [ ! -f dist-server/index.js ]; then
  echo "[Setup] Building the app..."
  npm run build || { echo "[ERROR] Build failed"; read -r -p "Enter..."; exit 1; }
fi

# Desktop shortcut — embeds the project path so it still works from Desktop
cat > "$SHORTCUT" <<EOF
#!/bin/bash
cd "$PROJECT" || {
  echo "[ERROR] Project folder not found: $PROJECT"
  echo "Run Start.command from the project folder again."
  read -r -p "Enter..."
  exit 1
}
exec ./Start.command
EOF
chmod +x "$SHORTCUT"
chmod +x "$PROJECT/Start.command" 2>/dev/null || true

(sleep 2 && open "http://127.0.0.1:8787" 2>/dev/null || true) &
echo "Starting the app..."
echo ""
npm start
echo ""
echo "App stopped."
read -r -p "Press Enter to exit..."
