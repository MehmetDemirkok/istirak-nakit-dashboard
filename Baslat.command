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
echo "  Proje: $PROJECT"
echo "  Adres: http://127.0.0.1:8787"
echo "  Kapatmak için bu pencereyi kapatın."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[HATA] Node.js yok."
  echo "https://nodejs.org adresinden LTS kurun, sonra bu dosyaya tekrar çift tıklayın."
  open "https://nodejs.org" 2>/dev/null || true
  read -r -p "Çıkmak için Enter..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[Kurulum] Bağımlılıklar yükleniyor..."
  npm install || { echo "[HATA] npm install başarısız"; read -r -p "Enter..."; exit 1; }
fi

if [ ! -f dist/index.html ] || [ ! -f dist-server/index.js ]; then
  echo "[Kurulum] Uygulama derleniyor..."
  npm run build || { echo "[HATA] Derleme başarısız"; read -r -p "Enter..."; exit 1; }
fi

# Masaüstü kısayolu — proje yolunu gömer (Desktop’tan çalışınca kaybolmaz)
cat > "$SHORTCUT" <<EOF
#!/bin/bash
cd "$PROJECT" || {
  echo "[HATA] Proje klasörü bulunamadı: $PROJECT"
  echo "Klasördeki Baslat.command dosyasını tekrar çalıştırın."
  read -r -p "Enter..."
  exit 1
}
exec ./Baslat.command
EOF
chmod +x "$SHORTCUT"
chmod +x "$PROJECT/Baslat.command" 2>/dev/null || true

(sleep 2 && open "http://127.0.0.1:8787" 2>/dev/null || true) &
echo "Uygulama başlatılıyor..."
echo ""
npm start
echo ""
echo "Uygulama kapandı."
read -r -p "Çıkmak için Enter..."
