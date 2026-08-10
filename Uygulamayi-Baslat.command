#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  ========================================"
echo "   İştirak Nakit Akış Dashboard"
echo "  ========================================"
echo ""
echo "  Veriler bu bilgisayarda kalır."
echo "  Adres: http://127.0.0.1:8787"
echo "  Kapatmak için bu pencereyi kapatın."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[HATA] Node.js bulunamadı."
  echo "https://nodejs.org adresinden LTS sürümünü kurun."
  read -r -p "Çıkmak için Enter..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "İlk kurulum: bağımlılıklar yükleniyor..."
  npm install || { echo "[HATA] npm install başarısız"; read -r -p "Enter..."; exit 1; }
fi

if [ ! -f dist/index.html ] || [ ! -f dist-server/index.js ]; then
  echo "İlk kurulum: uygulama derleniyor..."
  npm run build || { echo "[HATA] Derleme başarısız"; read -r -p "Enter..."; exit 1; }
fi

(sleep 2 && open "http://127.0.0.1:8787" 2>/dev/null || true) &
npm start
echo ""
echo "Uygulama kapandı."
read -r -p "Çıkmak için Enter..."
