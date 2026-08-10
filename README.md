# İştirak Nakit Akış Dashboard

Lokal web uygulaması: iştirak Excel’lerini dashboard’a çevirir; PPTX / PDF / Excel üretir.  
**Tüm veri yalnızca bu bilgisayarda kalır** — dış API, telemetri veya bulut yok.

## Son kullanıcı (yazılımcı değil)

1. [Node.js LTS](https://nodejs.org) kurun.  
2. Bu klasörü bilgisayara kopyalayın.  
3. **Windows:** `Masaustu-Kisayol-Olustur.bat` → çift tık.  
   **macOS:** `Masaustu-Kisayol-Olustur.command` → çift tık.  
4. Masaüstündeki **Istirak Nakit Dashboard** kısayoluna çift tıklayın.  
5. Tarayıcı: [http://127.0.0.1:8787](http://127.0.0.1:8787)

Detaylı adımlar: **`KURULUM.txt`**

İlk giriş: `admin` / `Admin123!`

## Geliştirici

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build && npm start   # üretim: http://127.0.0.1:8787
```

## Kullanım akışı

1. **Şirketler** — Ana holding + iştirakleri ve profilleri yönetin.  
2. **Excel Yükle** — İştirak + yıl/ay seçip `.xlsx` yükleyin.  
3. **Dashboard** — Dönem bazlı KPI ve grafikler.  
4. **Rapor** — PPTX / PDF / Excel indirin.  
5. **İşlem Logları** — Kim, ne zaman, ne yaptı.  
6. **Hesabım** — Ad, soyad, e-posta ve profil fotoğrafı.

## Veri konumu

| Yol | İçerik |
|-----|--------|
| `data/app.db` | SQLite veritabanı |
| `data/uploads/` | Yüklenen Excel dosyaları |
| `data/samples/` | Örnek şablon |

Sunucu yalnızca `127.0.0.1` adresine bağlanır.

## Excel kuralları

- Asıl kaynak: **NAKİT AKIŞ-Haftalık**
- Satır kodları: `F-A.01`, `F-B.01`, … (kategoriler A–J)

## Teknoloji

React + Vite · Express · SQLite · ExcelJS · Recharts · PptxGenJS · PDFKit
