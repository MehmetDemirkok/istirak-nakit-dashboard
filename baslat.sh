#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  İştirak Nakit Akış Dashboard"
echo "  Lokal: http://127.0.0.1:5173"
echo "  Veriler bu bilgisayarda kalır."
echo ""
if [ ! -d node_modules ]; then
  echo "Bağımlılıklar yükleniyor..."
  npm install
fi
(sleep 2 && open "http://127.0.0.1:5173" 2>/dev/null || true) &
npm run dev
