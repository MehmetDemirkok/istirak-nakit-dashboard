# İştirak Nakit Akış Dashboard

Lokal web uygulaması: iştirak Excel’lerini dashboard’a çevirir ve sunum (PPTX) üretir.  
**Tüm veri yalnızca bu bilgisayarda kalır** — dış API, telemetri veya bulut yok.

## Gereksinimler

- Node.js 20+ (Windows veya macOS)
- Örnek Excel şablonuyla aynı yapı (`NAKİT AKIŞ-Haftalık` sayfası)

## Hızlı başlangıç

### Windows
`baslat.bat` dosyasına çift tıklayın.

### macOS
```bash
chmod +x baslat.sh
./baslat.sh
```

### Manuel
```bash
npm install
npm run dev
```

Tarayıcı: [http://127.0.0.1:5173](http://127.0.0.1:5173)  
API: [http://127.0.0.1:8787](http://127.0.0.1:8787)

## Giriş (admin)

İlk çalıştırmada otomatik admin oluşturulur:

| Alan | Değer |
|------|--------|
| Kullanıcı | `admin` |
| Şifre | `Admin123!` |

Oturum bu bilgisayarda saklanır (SQLite + çerez/token).

## Kullanım akışı

1. **Şirketler** — Ana şirket + iştirakleri, profil ve detayları tek sayfada yönetin (veya “3 Demo Şirket Yükle”).
2. **Excel Yükle** — İştirak + **yıl/ay** seçip `.xlsx` yükleyin; veri dashboardda o dönemden izlenir.
3. **Dashboard** — Şirket ve dönem (yıl/ay) seçerek KPI ve grafikleri görüntüleyin.
4. **Rapor çıktısı** — Aynı dönem için **PPTX / PDF / Excel** indirin.
5. **İşlem Logları** — Kim, ne zaman, hangi işlemi yaptı (giriş, şirket, Excel, dashboard, export…).


## Veri konumu (gizlilik)

| Yol | İçerik |
|-----|--------|
| `data/app.db` | SQLite veritabanı |
| `data/uploads/` | Yüklenen Excel dosyaları |
| `data/samples/` | Örnek şablon |

Sunucu yalnızca `127.0.0.1` adresine bağlanır.

## Üretim modu

```bash
npm run build
NODE_ENV=production npm start
```

Windows PowerShell:
```powershell
npm run build
$env:NODE_ENV="production"; npm start
```

Tek süreç: API + statik arayüz `http://127.0.0.1:8787`

## Excel kuralları

- Asıl kaynak: **NAKİT AKIŞ-Haftalık**
- Satır kodları: `F-A.01`, `F-B.01`, … (kategoriler A–J)
- Aylık görünüm haftalardan ve/veya `GRAFİK` sayfasından üretilir

## Teknoloji

React + Vite · Express · SQLite · ExcelJS · Recharts · PptxGenJS
