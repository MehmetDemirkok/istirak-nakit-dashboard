/**
 * Müşteri sunumu için demo holding + iştirakler ve yüksek tutarlı nakit akış verisi.
 * Kullanım: node --import tsx scripts/seed-demo.ts
 *        veya: npm run seed:demo
 */
import { v4 as uuid } from 'uuid';
import { db } from '../server/db.js';
import { persistParseResult, type ImportPeriod } from '../server/importService.js';
import type { ParsedLine, ParseResult, ParsedWeekMeta } from '../server/excelParser.js';
import { weekIndexToMonth } from '../server/periodUtils.js';
import { DEMO_TAG, DEMO_PARENT_NAME, clearAllDemoData } from './demo-data.js';

const YEAR = 2026;

/** Deterministik pseudo-random (0..1) */
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function roundTry(n: number): number {
  return Math.round(n / 1000) * 1000;
}

type DetailSpec = { code: string; label: string; category: string; weight: number };

const DETAIL_SPECS: DetailSpec[] = [
  // A — Girişler
  { code: 'F-A.01', label: 'F-A.01. Yurt İçi Satışlar', category: 'A', weight: 0.52 },
  { code: 'F-A.02', label: 'F-A.02. Yurt Dışı Satışlar', category: 'A', weight: 0.22 },
  { code: 'F-A.03', label: 'F-A.03. Teşvik ve Destekler', category: 'A', weight: 0.06 },
  { code: 'F-A.04', label: 'F-A.04. Sermaye Artışları', category: 'A', weight: 0.04 },
  { code: 'F-A.05', label: 'F-A.05. Kur Farkı/Değerleme', category: 'A', weight: 0.03 },
  { code: 'F-A.06', label: 'F-A.06.Kullanılan Kredi', category: 'A', weight: 0.05 },
  { code: 'F-A.07', label: 'F-A.07.Banka Faiz Geliri', category: 'A', weight: 0.02 },
  { code: 'F-A.08', label: 'F-A.08.Ortaklardan Alınan Borçlar', category: 'A', weight: 0.03 },
  { code: 'F-A.09', label: 'F-A.09.Diğer Gelirler', category: 'A', weight: 0.03 },
  // B — Personel
  { code: 'F-B.01', label: 'B.01.Personel Net Maaş Ödemesi', category: 'B', weight: 0.55 },
  { code: 'F-B.02', label: 'B.02.Sgk Ödemesi', category: 'B', weight: 0.18 },
  { code: 'F-B.03', label: 'B.03.Personel Yemek Giderleri', category: 'B', weight: 0.08 },
  { code: 'F-B.04', label: 'B.04.Personel Yol Giderleri', category: 'B', weight: 0.04 },
  { code: 'F-B.05', label: 'B.05.Personel Özel Sağlık Sigortası (Allıanz)', category: 'B', weight: 0.05 },
  { code: 'F-B.06', label: 'B.06.Personel Kıdem Tazminatı Giderleri', category: 'B', weight: 0.03 },
  { code: 'F-B.07', label: 'B.07.Personel Eğitim Giderleri', category: 'B', weight: 0.02 },
  { code: 'F-B.08', label: 'B.08.Personel Muhtasar Ödemeleri', category: 'B', weight: 0.04 },
  { code: 'F-B.09', label: 'B.09.Personel Harcırah Gideri', category: 'B', weight: 0.01 },
  // C — Dışarıdan hizmet
  { code: 'F-C.01', label: 'C.01.Güvenlik Hizmeti Giderleri', category: 'C', weight: 0.18 },
  { code: 'F-C.02', label: 'C.02.İletişim Giderleri(Telefon-Adsl)', category: 'C', weight: 0.08 },
  { code: 'F-C.03', label: 'C.03.Su Ve Elektrik Giderleri', category: 'C', weight: 0.22 },
  { code: 'F-C.04', label: 'C.04.Tamir Bakım Onarım Giderleri', category: 'C', weight: 0.1 },
  { code: 'F-C.05', label: 'C.05.Personel Temini (Mutfak Servis Personeli)', category: 'C', weight: 0.08 },
  { code: 'F-C.06', label: 'C.06.Personel Temini (Temizlik Personeli)', category: 'C', weight: 0.08 },
  { code: 'F-C.07', label: 'C.07.ARGE Hizmet Alım Gideri', category: 'C', weight: 0.18 },
  { code: 'C.08', label: 'C.08.Diğer Dışarıdan Sağlanan Fayda ve Hizmet', category: 'C', weight: 0.08 },
  // D — Danışmanlık
  { code: 'F-D.01', label: 'D.01.İş Sağlığı ve Güvenliği Giderleri', category: 'D', weight: 0.08 },
  { code: 'F-D.02', label: 'D.02.Hukuk  Danışmanlık', category: 'D', weight: 0.2 },
  { code: 'F-D.03', label: 'D.03.Mali Hizmet Giderleri', category: 'D', weight: 0.18 },
  { code: 'F-D.04', label: 'D.04.Diğer Giderler (Değerleme Raporları Vb.)', category: 'D', weight: 0.08 },
  { code: 'F-D.05', label: 'D.05.Mimarlık- Mühendislik Danışmanlık Giderleri', category: 'D', weight: 0.16 },
  { code: 'F-D.06', label: 'D.06.IT/ Bilgi Teknolojileri Gideri', category: 'D', weight: 0.2 },
  { code: 'F-D.07', label: 'D.07. İnsan Kaynakları Danışmanlık Gideri', category: 'D', weight: 0.1 },
  // E — Çeşitli (ağırlıklar toplamı ~1)
  { code: 'F-E.01', label: 'E.01.Üyelik Giderleri', category: 'E', weight: 0.02 },
  { code: 'F-E.02', label: 'E.02.Yazılım Giderleri', category: 'E', weight: 0.08 },
  { code: 'F-E.03', label: 'E.03.Taşıt Kiralama Giderleri', category: 'E', weight: 0.06 },
  { code: 'F-E.04', label: 'E.04.Kırtasiye Giderleri', category: 'E', weight: 0.02 },
  { code: 'F-E.05', label: 'E.05.Bilgisayar ve Aksam Alımı', category: 'E', weight: 0.05 },
  { code: 'F-E.09', label: 'E.09.Kira Giderleri', category: 'E', weight: 0.22 },
  { code: 'F-E.10', label: 'E.10. İşletme Gideri', category: 'E', weight: 0.08 },
  { code: 'F-E.12', label: 'E.12.Ofis Giderleri(Mutfak,Temizlik Ve Diğer)', category: 'E', weight: 0.05 },
  { code: 'F-E.14', label: 'E.14.Temsil Ve Ağırlama Giderleri', category: 'E', weight: 0.04 },
  { code: 'F-E.16', label: 'E.16.Yurtiçi Seyahat Ve Konaklama Giderleri', category: 'E', weight: 0.06 },
  { code: 'F-E.17', label: 'E.17.Yurtdışı Seyahat Ve Konaklama Giderleri', category: 'E', weight: 0.07 },
  { code: 'F-E.21', label: 'E.21.Sigorta Giderleri', category: 'E', weight: 0.05 },
  { code: 'F-E.25', label: 'E.25.Banka Masrafları', category: 'E', weight: 0.02 },
  { code: 'F-E.26', label: 'E.26.Reklam / Tanıtım Giderleri', category: 'E', weight: 0.06 },
  { code: 'F-E.27', label: 'E.27.Akaryakıt, Araç Bakım ve HGS Giderleri', category: 'E', weight: 0.04 },
  { code: 'F-E.29', label: 'E.29.Sarf Malzeme Alımı', category: 'E', weight: 0.04 },
  { code: 'E.33', label: 'E.33.Diğer Çeşitli Giderler', category: 'E', weight: 0.04 },
  // F — Vergi
  { code: 'F-F.01', label: 'F.01.Ticaret Odası Giderleri', category: 'F', weight: 0.03 },
  { code: 'F-F.02', label: 'F.02.Damga Vergisi', category: 'F', weight: 0.05 },
  { code: 'F-F.03', label: 'F.03.Muhtasar', category: 'F', weight: 0.12 },
  { code: 'F-F.04', label: 'F.04.Kdv1', category: 'F', weight: 0.22 },
  { code: 'F-F.05', label: 'F.05.Kdv2', category: 'F', weight: 0.1 },
  { code: 'F-F.06', label: 'F.06.Geçici Vergi', category: 'F', weight: 0.18 },
  { code: 'F-F.07', label: 'F.07.MTV', category: 'F', weight: 0.02 },
  { code: 'F-F.08', label: 'F.08.ÖTV', category: 'F', weight: 0.03 },
  { code: 'F-F.09', label: 'F.09.Kurumlar Vergisi', category: 'F', weight: 0.25 },
  // G — Stok
  { code: 'F-G.01', label: 'G.01.Hammadde ve Ticari Mal Alışları', category: 'G', weight: 1 },
  // H — Yatırım
  { code: 'F-H.01', label: 'H.01.İnşaat Hakediş Ödemeleri', category: 'H', weight: 0.35 },
  { code: 'F-H.02', label: 'H.02.Makine ve Teçhizat Ödemeleri', category: 'H', weight: 0.3 },
  { code: 'F-H.03', label: 'H.03.Mimarlık-Mühendislik Proje Giderleri', category: 'H', weight: 0.15 },
  { code: 'F-H.04', label: 'H.04.Demirbaş Giderleri', category: 'H', weight: 0.1 },
  { code: 'F-H.05', label: 'H.05.Diğer Yatırımlara Ait Giderler', category: 'H', weight: 0.1 },
  // I — Finansman
  { code: 'I.01', label: 'I.01.Kredi Anapara+Faiz Ödemeleri', category: 'I', weight: 0.55 },
  { code: 'I.02', label: 'I.02.Ortaklara Borçlar ve Faizi Ödemeleri', category: 'I', weight: 0.25 },
  { code: 'I.03', label: 'I.03.Temettü Ödemeleri', category: 'I', weight: 0.2 },
  // J — Proje
  { code: 'J.01', label: 'J.01. Projelere Ait Hammadde/Mamul Alımı', category: 'J', weight: 0.4 },
  { code: 'J.02', label: 'J.02.Projeler Kapsamında Hizmet/Danışmanlık Ödemeleri', category: 'J', weight: 0.3 },
  { code: 'J.03', label: 'J.03.Bakım Onarım Giderleri', category: 'J', weight: 0.15 },
  { code: 'J.04', label: 'J.04.Projeler Kapsamında Diğer Ödemeler', category: 'J', weight: 0.15 },
];

type SubProfile = {
  name: string;
  /** Aylık ortalama nakit girişi (TRY) */
  monthlyInflow: number;
  /** Aylık ortalama çıkış oranları (girişe göre değil mutlak TRY) */
  monthlyOut: Record<string, number>;
  opening: number;
  profile: Record<string, string>;
  /** Ay sezon katsayıları (0–11), Ocak–Ağustos dolu */
  season: number[];
};

const SUBS: SubProfile[] = [
  {
    name: `${DEMO_TAG} Nova Savunma Sistemleri A.Ş.`,
    monthlyInflow: 185_000_000,
    monthlyOut: {
      B: 28_000_000,
      C: 9_500_000,
      D: 6_200_000,
      E: 8_800_000,
      F: 14_500_000,
      G: 42_000_000,
      H: 18_000_000,
      I: 12_000_000,
      J: 22_000_000,
    },
    opening: 320_000_000,
    season: [0.85, 0.9, 1.05, 1.1, 1.15, 1.2, 1.05, 1.0, 0.95, 1.1, 1.05, 1.25],
    profile: {
      founded_at: '2012-03-15',
      board_chair: 'Ahmet YILDIRIM',
      board_vice: 'Elif KAYA',
      board_members: 'Murat DEMİR, Zeynep ARSLAN, Can ÖZTÜRK',
      general_assembly_date: '2026-04-22',
      partnership: 'Nova Teknoloji Holding A.Ş. %78 · Savunma Sanayi Fonu %12 · Diğer %10',
      personnel_count: '842',
      credits: 'İş Bankası 450 M TL · Garanti BBVA 280 M TL · Eximbank 95 M USD',
      patents: '47 aktif patent, 12 faydalı model',
      project_count: '18',
      project_amount_try: '2.450.000.000',
      project_amount_usd: '185.000.000',
      project_amount_eur: '42.000.000',
      debts_to_partners: '68.500.000 TL',
      notes: 'Radar, elektro-optik ve komuta kontrol sistemleri. Ana iştirak — yüksek cirolu demo.',
    },
  },
  {
    name: `${DEMO_TAG} Nova Yazılım ve Bilişim A.Ş.`,
    monthlyInflow: 72_000_000,
    monthlyOut: {
      B: 22_000_000,
      C: 4_200_000,
      D: 3_800_000,
      E: 5_500_000,
      F: 6_800_000,
      G: 1_200_000,
      H: 4_500_000,
      I: 3_200_000,
      J: 8_500_000,
    },
    opening: 95_000_000,
    season: [0.95, 0.98, 1.0, 1.05, 1.08, 1.02, 0.95, 0.92, 1.05, 1.1, 1.15, 1.2],
    profile: {
      founded_at: '2016-09-01',
      board_chair: 'Selin AKSOY',
      board_vice: 'Burak ÇETİN',
      board_members: 'Deniz YILMAZ, Ayşe KOÇ',
      general_assembly_date: '2026-05-08',
      partnership: 'Nova Teknoloji Holding A.Ş. %85 · Kurucu ortaklar %15',
      personnel_count: '312',
      credits: 'Yapı Kredi 85 M TL · QNB 40 M TL',
      patents: '9 yazılım tescili, 3 patent başvurusu',
      project_count: '26',
      project_amount_try: '680.000.000',
      project_amount_usd: '12.500.000',
      project_amount_eur: '4.200.000',
      debts_to_partners: '12.000.000 TL',
      notes: 'Kurumsal yazılım, siber güvenlik ve SaaS ürünleri.',
    },
  },
  {
    name: `${DEMO_TAG} Nova Enerji ve Yatırım A.Ş.`,
    monthlyInflow: 118_000_000,
    monthlyOut: {
      B: 9_500_000,
      C: 6_800_000,
      D: 4_100_000,
      E: 7_200_000,
      F: 11_000_000,
      G: 8_500_000,
      H: 35_000_000,
      I: 18_500_000,
      J: 6_000_000,
    },
    opening: 210_000_000,
    season: [1.1, 1.05, 0.95, 0.9, 0.85, 0.9, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25],
    profile: {
      founded_at: '2014-11-20',
      board_chair: 'Hakan ERDEM',
      board_vice: 'Pınar ŞAHİN',
      board_members: 'Oğuz KARACA, Merve UYSAL, Emre GÜNEŞ',
      general_assembly_date: '2026-03-18',
      partnership: 'Nova Teknoloji Holding A.Ş. %65 · Enerji Yatırım Ortaklığı %25 · Diğer %10',
      personnel_count: '186',
      credits: 'Ziraat Bankası 620 M TL · EBRD 45 M EUR · TSKB 180 M TL',
      patents: '5 patent (enerji depolama)',
      project_count: '7',
      project_amount_try: '3.800.000.000',
      project_amount_usd: '28.000.000',
      project_amount_eur: '95.000.000',
      debts_to_partners: '145.000.000 TL',
      notes: 'GES, RES ve enerji depolama yatırımları — yüksek yatırım çıkışları.',
    },
  },
  {
    name: `${DEMO_TAG} Nova İleri Malzeme A.Ş.`,
    monthlyInflow: 54_000_000,
    monthlyOut: {
      B: 11_500_000,
      C: 3_400_000,
      D: 2_100_000,
      E: 3_800_000,
      F: 4_600_000,
      G: 16_000_000,
      H: 5_500_000,
      I: 2_800_000,
      J: 4_200_000,
    },
    opening: 48_000_000,
    season: [0.9, 0.95, 1.0, 1.1, 1.15, 1.05, 0.95, 0.9, 1.0, 1.05, 1.1, 1.15],
    profile: {
      founded_at: '2019-06-12',
      board_chair: 'İpek TAN',
      board_vice: 'Volkan ATEŞ',
      board_members: 'Seda POLAT, Kerem AYDIN',
      general_assembly_date: '2026-06-02',
      partnership: 'Nova Teknoloji Holding A.Ş. %70 · Teknopark ortaklığı %20 · Diğer %10',
      personnel_count: '148',
      credits: 'Akbank 95 M TL · Vakıfbank 55 M TL',
      patents: '21 malzeme patenti',
      project_count: '11',
      project_amount_try: '420.000.000',
      project_amount_usd: '8.200.000',
      project_amount_eur: '3.100.000',
      debts_to_partners: '8.750.000 TL',
      notes: 'Kompozit, alaşım ve özel kaplama üretimi.',
    },
  },
];

function buildWeeks(): ParsedWeekMeta[] {
  return Array.from({ length: 52 }, (_, i) => ({
    index: i + 1,
    label: `HAFTA ${i + 1}`,
  }));
}

function distributeToWeeks(monthly: number[], weeks: ParsedWeekMeta[]): number[] {
  const weekly = weeks.map(() => 0);
  for (let m = 0; m < 12; m++) {
    const idxs = weeks.map((w, i) => ({ i, w })).filter(({ w }) => weekIndexToMonth(w.index) === m);
    if (!idxs.length) continue;
    const base = monthly[m] / idxs.length;
    let allocated = 0;
    idxs.forEach(({ i }, j) => {
      if (j === idxs.length - 1) {
        weekly[i] = roundTry(monthly[m] - allocated);
      } else {
        const jitter = 0.85 + rnd(m * 100 + j + monthly[m]) * 0.3;
        const v = roundTry(base * jitter);
        weekly[i] = v;
        allocated += v;
      }
    });
  }
  return weekly;
}

function specsForCategory(cat: string): DetailSpec[] {
  return DETAIL_SPECS.filter((s) => s.category === cat);
}

function splitByWeight(total: number, specs: DetailSpec[], seed: number): number[] {
  const weights = specs.map((s, i) => s.weight * (0.85 + rnd(seed + i) * 0.3));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const amounts = weights.map((w) => roundTry((total * w) / sumW));
  const diff = total - amounts.reduce((a, b) => a + b, 0);
  if (amounts.length) amounts[0] = roundTry(amounts[0] + diff);
  return amounts;
}

function emptyMonthly(): number[] {
  return Array(12).fill(0);
}

function makeLine(
  code: string | null,
  category: string,
  label: string,
  lineKind: string,
  monthly: number[],
  weeks: ParsedWeekMeta[],
): ParsedLine {
  return {
    code,
    category,
    label,
    lineKind,
    monthly: [...monthly],
    weekly: distributeToWeeks(monthly, weeks),
  };
}

function buildCashFlow(sub: SubProfile, seedBase: number): ParseResult {
  const weeks = buildWeeks();
  const lines: ParsedLine[] = [];

  // Ocak–Ağustos dolu (müşteri sunumu), Eyl–Ara da doldurulur (tam yıl görünümü)
  const activeMonths = 12;

  const inflowMonthly = emptyMonthly();
  for (let m = 0; m < activeMonths; m++) {
    const season = sub.season[m];
    const jitter = 0.92 + rnd(seedBase + m) * 0.16;
    inflowMonthly[m] = roundTry(sub.monthlyInflow * season * jitter);
  }

  const outMonthly: Record<string, number[]> = {};
  for (const cat of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
    outMonthly[cat] = emptyMonthly();
    for (let m = 0; m < activeMonths; m++) {
      const season = sub.season[m];
      // Yatırım/stok ayları biraz daha oynak
      const extra = cat === 'H' || cat === 'G' || cat === 'J' ? 0.75 + rnd(seedBase + cat.charCodeAt(0) + m) * 0.55 : 1;
      const jitter = 0.9 + rnd(seedBase + 50 + m + cat.charCodeAt(0)) * 0.2;
      outMonthly[cat][m] = roundTry((sub.monthlyOut[cat] || 0) * season * jitter * extra);
    }
  }

  // Opening — sabit aylık başlangıç satırı (ilk ay opening, sonra bakiye mantığı summary'de)
  const openingMonthly = emptyMonthly();
  openingMonthly[0] = sub.opening;
  // Sonraki aylarda opening = önceki ayın bakiyesi gibi doldurulmaz; Excel'de genelde yıl başı.
  // Haftalık için opening'i Ocak'a koyuyoruz.
  lines.push(makeLine(null, 'E', 'Nakit Başlangıcı', 'opening', openingMonthly, weeks));

  lines.push(makeLine(null, 'A', 'A.Nakit Girişleri', 'section', emptyMonthly(), weeks));

  const aSpecs = specsForCategory('A');
  for (let m = 0; m < 12; m++) {
    /* amounts filled per line below */
  }
  const aMonthMatrix: number[][] = aSpecs.map(() => emptyMonthly());
  for (let m = 0; m < 12; m++) {
    const parts = splitByWeight(inflowMonthly[m], aSpecs, seedBase + 200 + m);
    parts.forEach((amt, i) => {
      aMonthMatrix[i][m] = amt;
    });
  }
  aSpecs.forEach((spec, i) => {
    lines.push(makeLine(spec.code, 'A', spec.label, 'detail', aMonthMatrix[i], weeks));
  });
  lines.push(makeLine(null, 'A', 'Toplam Nakit Girişler', 'total_inflow', inflowMonthly, weeks));

  const available = inflowMonthly.map((v, m) => roundTry(v + (m === 0 ? sub.opening : 0)));
  lines.push(makeLine(null, 'E', 'Toplam Kullanılabilir Nakit', 'available_cash', available, weeks));

  const sectionLabels: Record<string, string> = {
    B: 'B.Personel Giderleri Nakit Çıkışları',
    C: 'C.Dışarıdan Sağlanan Fayda Ve Hizmetler',
    D: 'D.Danışmanlık Giderleri Nakit Çıkışları',
    E: 'E.Çeşitli Giderler  Nakit Çıkışları',
    F: 'F.Vergi/Resim/Harçlar  Nakit Çıkışlar',
    G: 'G.Stoklara Ait Nakit Çıkışları',
    H: 'H.Yatırımlara Ait Nakit Çıkışları',
    I: 'I.Finansal Operasyonlara Ait Nakit Çıkışlar',
    J: 'J.Proje Faaliyetlerine Ait Nakit Çıkışları',
  };
  const totalKinds: Record<string, string> = {
    B: 'total_B',
    C: 'total_C',
    D: 'total_D',
    E: 'total_E',
    F: 'total_F',
    G: 'total_G',
    H: 'total_H',
    I: 'total_I',
    J: 'total_J',
  };
  const totalLabels: Record<string, string> = {
    B: 'Toplam Personel Giderleri Nakit Çıkışları',
    C: 'Toplam Dışarıdan Sağlanan Fayda Ve Hizmetler',
    D: 'Toplam Danışmanlık Giderleri  Nakit Çıkışları',
    E: 'Toplam Çeşitli Giderler  Nakit Çıkışları',
    F: 'Toplam Vergi/Resim/Harçlar  Nakit Çıkışları',
    G: 'Toplam Stoklara Ait Nakit Çıkışları',
    H: 'Toplam Yatırımlara Ait Nakit Çıkışları',
    I: 'Toplam Finansmana Ait Nakit Çıkışları',
    J: 'Toplam Proje Faaliyetlerinden Kaynaklanan Nakit Çıkışları',
  };

  const outflowMonthly = emptyMonthly();

  for (const cat of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
    if (cat !== 'C' && cat !== 'G') {
      lines.push(makeLine(null, cat, sectionLabels[cat], 'section', emptyMonthly(), weeks));
    } else if (cat === 'G') {
      // G section as detail header in sample — skip empty section, use total only
    }

    const specs = specsForCategory(cat);
    const matrix: number[][] = specs.map(() => emptyMonthly());
    for (let m = 0; m < 12; m++) {
      const parts = splitByWeight(outMonthly[cat][m], specs, seedBase + cat.charCodeAt(0) * 10 + m);
      parts.forEach((amt, i) => {
        matrix[i][m] = amt;
      });
      outflowMonthly[m] += outMonthly[cat][m];
    }
    specs.forEach((spec, i) => {
      lines.push(makeLine(spec.code, cat, spec.label, 'detail', matrix[i], weeks));
    });
    lines.push(makeLine(null, cat, totalLabels[cat], totalKinds[cat], outMonthly[cat], weeks));
  }

  lines.push(makeLine(null, 'E', 'Toplam Nakit Çıkışları', 'total_outflow', outflowMonthly, weeks));

  const netMonthly = inflowMonthly.map((v, m) => roundTry(v - outflowMonthly[m]));
  lines.push(makeLine(null, 'A', 'Net Nakit Giriş/Çıkış', 'net', netMonthly, weeks));

  const balanceMonthly = emptyMonthly();
  let running = sub.opening;
  for (let m = 0; m < 12; m++) {
    running = roundTry(running + netMonthly[m]);
    balanceMonthly[m] = running;
  }
  lines.push(makeLine(null, 'E', 'Nakit Bakiye', 'balance', balanceMonthly, weeks));

  // Haftalık bakiyeyi de tutarlı yap (opening + kümülatif net)
  const balanceLine = lines.find((l) => l.lineKind === 'balance')!;
  const netLine = lines.find((l) => l.lineKind === 'net')!;
  let weekBal = sub.opening;
  balanceLine.weekly = weeks.map((_, i) => {
    weekBal = roundTry(weekBal + (netLine.weekly[i] || 0));
    return weekBal;
  });

  const yearIn = inflowMonthly.reduce((a, b) => a + b, 0);
  const yearOut = outflowMonthly.reduce((a, b) => a + b, 0);

  return {
    ok: true,
    sheetName: 'DEMO-NAKİT-AKIŞ',
    year: YEAR,
    weeks,
    lines,
    warnings: [],
    errors: [],
    summary: {
      totalInflowYear: yearIn,
      totalOutflowYear: yearOut,
      netYear: yearIn - yearOut,
      lastBalance: balanceMonthly[11],
    },
  };
}

function upsertProfile(companyId: string, profile: Record<string, string>) {
  const fields = Object.keys(profile);
  const sets = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => profile[f]);
  const info = db
    .prepare(`UPDATE company_profiles SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`)
    .run(...values, companyId);
  if (!info.changes) {
    db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(companyId);
    db.prepare(
      `UPDATE company_profiles SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`,
    ).run(...values, companyId);
  }
}

function createCompany(name: string, role: 'parent' | 'subsidiary', parentId: string | null) {
  const id = uuid();
  db.prepare(
    `INSERT INTO companies (id, name, role, parent_id) VALUES (?, ?, ?, ?)`,
  ).run(id, name, role, parentId);
  db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(id);
  return id;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' TL';
}

function main() {
  console.log('── Demo veri yükleniyor ──');
  const cleared = clearAllDemoData();
  if (cleared.removed) console.log(`  Eski demo şirketler silindi: ${cleared.removed}`);

  const parentId = createCompany(DEMO_PARENT_NAME, 'parent', null);
  upsertProfile(parentId, {
    founded_at: '2008-01-28',
    board_chair: 'Cemile TEZEL',
    board_vice: 'Ahmet YILDIRIM',
    board_members: 'Elif KAYA, Hakan ERDEM, Selin AKSOY, İpek TAN',
    general_assembly_date: '2026-04-10',
    partnership: 'Kurucu aile %55 · Kurumsal yatırımcılar %30 · Halka açık %15',
    personnel_count: '1.488 (konsolide)',
    credits: 'Konsolide kredi limiti ~2,1 milyar TL',
    patents: 'Grup toplamı 82 patent',
    project_count: '62',
    project_amount_try: '7.350.000.000',
    project_amount_usd: '233.700.000',
    project_amount_eur: '144.300.000',
    debts_to_partners: '234.250.000 TL',
    notes: `${DEMO_TAG} Müşteri sunumu holding şirketi. Nakit akışları iştiraklerden konsolide edilir.`,
  });
  console.log(`  Ana şirket: ${DEMO_PARENT_NAME} (${parentId})`);

  const period: ImportPeriod = { year: YEAR, month: null };

  SUBS.forEach((sub, idx) => {
    const id = createCompany(sub.name, 'subsidiary', parentId);
    upsertProfile(id, sub.profile);
    const parsed = buildCashFlow(sub, 1000 + idx * 777);
    const result = persistParseResult(id, `demo://${sub.name}`, `demo-${YEAR}-tam-yil.xlsx`, parsed, period);
    console.log(
      `  İştirak: ${sub.name.replace(DEMO_TAG + ' ', '')}\n` +
        `    Giriş: ${fmt(parsed.summary.totalInflowYear)} · Çıkış: ${fmt(parsed.summary.totalOutflowYear)} · ` +
        `Net: ${fmt(parsed.summary.netYear)} · Bakiye: ${fmt(parsed.summary.lastBalance)}\n` +
        `    Import: ${result.status} — ${result.message}`,
    );
  });

  // Konsolide özet
  const cons = db
    .prepare(
      `SELECT
         SUM(CASE WHEN line_kind = 'detail' AND category = 'A' AND period_type = 'year' THEN amount ELSE 0 END) as inflow,
         SUM(CASE WHEN line_kind = 'detail' AND category IN ('B','C','D','E','F','G','H','I','J') AND period_type = 'year' THEN amount ELSE 0 END) as outflow
       FROM cash_flow_lines
       WHERE company_id IN (SELECT id FROM companies WHERE parent_id = ?)`,
    )
    .get(parentId) as { inflow: number; outflow: number };

  console.log('── Konsolide (iştirak toplamı) ──');
  console.log(`  Toplam giriş: ${fmt(cons.inflow || 0)}`);
  console.log(`  Toplam çıkış: ${fmt(cons.outflow || 0)}`);
  console.log(`  Net:         ${fmt((cons.inflow || 0) - (cons.outflow || 0))}`);
  console.log('── Tamam ──');
  console.log('  Giriş: admin / Admin123!');
  console.log('  Dashboard’da holding veya iştirak seçerek yüksek tutarları görebilirsiniz.');
}

main();
