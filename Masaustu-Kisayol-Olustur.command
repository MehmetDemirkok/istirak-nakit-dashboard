#!/bin/bash
cd "$(dirname "$0")"
SRC="$(pwd)/Uygulamayi-Baslat.command"
DEST="$HOME/Desktop/İştirak Nakit Dashboard.command"

chmod +x "$SRC" 2>/dev/null || true
cp "$SRC" "$DEST"
chmod +x "$DEST"

echo ""
echo "Masaüstüne kısayol kopyalandı:"
echo "  $DEST"
echo ""
echo "Çift tıklayarak uygulamayı açabilirsiniz."
echo "(İlk seferde Güvenlik ayarlarından izin gerekebilir.)"
echo ""
read -r -p "Çıkmak için Enter..."
