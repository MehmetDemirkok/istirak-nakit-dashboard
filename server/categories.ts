/** Shared category definitions matching Excel + presentation template */

export const CATEGORY_META: Record<
  string,
  { key: string; label: string; shortLabel: string; kind: 'inflow' | 'outflow' | 'summary' }
> = {
  A: { key: 'A', label: 'Nakit Girişleri', shortLabel: 'Gelir', kind: 'inflow' },
  B: { key: 'B', label: 'Personel Giderleri', shortLabel: 'Personel G.', kind: 'outflow' },
  C: {
    key: 'C',
    label: 'Dışarıdan Sağlanan Fayda Ve Hizmetler',
    shortLabel: 'Dışarıdan Sağ. Hiz.',
    kind: 'outflow',
  },
  D: { key: 'D', label: 'Danışmanlık Giderleri', shortLabel: 'Danışmanlık G.', kind: 'outflow' },
  E: { key: 'E', label: 'Çeşitli Giderler', shortLabel: 'Çeşitli G.', kind: 'outflow' },
  F: { key: 'F', label: 'Vergi/Resim/Harçlar', shortLabel: 'Vergi/Resim/Harçlar', kind: 'outflow' },
  G: { key: 'G', label: 'Stoklara Ait Nakit Çıkışları', shortLabel: 'Stok Maliyeti', kind: 'outflow' },
  H: {
    key: 'H',
    label: 'Yatırımlara Ait Nakit Çıkışları',
    shortLabel: 'Yatırımlara Ait G.',
    kind: 'outflow',
  },
  I: {
    key: 'I',
    label: 'Finansmana Ait Nakit Çıkışları',
    shortLabel: 'Finansmana Ait G.',
    kind: 'outflow',
  },
  J: {
    key: 'J',
    label: 'Proje Faaliyetlerine Ait Nakit Çıkışları',
    shortLabel: 'Proje Faaliyetleri Kapsamında G.',
    kind: 'outflow',
  },
};

export const MONTH_LABELS = [
  'OCAK',
  'ŞUBAT',
  'MART',
  'NİSAN',
  'MAYIS',
  'HAZİRAN',
  'TEMMUZ',
  'AĞUSTOS',
  'EYLÜL',
  'EKİM',
  'KASIM',
  'ARALIK',
];

export const OUTFLOW_ORDER = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export function categoryFromCodeOrLabel(code?: string | null, label?: string | null): string {
  const src = `${code || ''} ${label || ''}`.toUpperCase();
  const coded = src.match(/F-([A-J])[\.\d]/i) || src.match(/(?:^|[\s])([A-J])\.\d{2}/i);
  if (coded) return coded[1].toUpperCase();
  if (/NAKIT GIRI|NAKİT GIRI|YURT ICI SATIS|YURT İÇİ SATIŞ|GELIR/i.test(src)) return 'A';
  if (/PERSONEL/i.test(src)) return 'B';
  if (/DISARIDAN|DIŞARIDAN|GÜVENLIK|GUVENLIK/i.test(src)) return 'C';
  if (/DANISMANLIK|DANIŞMANLIK/i.test(src)) return 'D';
  if (/CESITLI|ÇEŞİTLİ|KIRA|OFIS|OFİS/i.test(src)) return 'E';
  if (/VERGI|VERGİ|KDV|MUHTASAR|DAMGA/i.test(src)) return 'F';
  if (/STOK|HAMMADDE/i.test(src)) return 'G';
  if (/YATIRIM|INSAAT|İNŞAAT|MAKINE|MAKİNE/i.test(src)) return 'H';
  if (/FINANS|FİNANS|KREDI|KREDİ|TEMETTU|TEMETTÜ/i.test(src)) return 'I';
  if (/PROJE/i.test(src)) return 'J';
  return 'E';
}

export function detectLineKind(code?: string | null, label?: string | null): string {
  const text = `${code || ''} ${label || ''}`.trim();
  const lower = text.toLowerCase();
  if (/nakit ba[sş]lang/i.test(lower)) return 'opening';
  if (/toplam nakit giri[sş]/i.test(lower)) return 'total_inflow';
  if (/toplam kullan[ıi]labilir/i.test(lower)) return 'available_cash';
  if (/toplam personel/i.test(lower)) return 'total_B';
  if (/toplam d[ıi][sş]ar[ıi]dan/i.test(lower)) return 'total_C';
  if (/toplam dan[ıi][sş]manl[ıi]k/i.test(lower)) return 'total_D';
  if (/toplam [cç]e[sş]itli/i.test(lower)) return 'total_E';
  if (/toplam vergi/i.test(lower)) return 'total_F';
  if (/toplam stok/i.test(lower)) return 'total_G';
  if (/toplam yat[ıi]r[ıi]mlara/i.test(lower)) return 'total_H';
  if (/toplam finansmana|toplam finansal/i.test(lower)) return 'total_I';
  if (/toplam proje/i.test(lower)) return 'total_J';
  if (/toplam nakit [cç][ıi]k[ıi][sş]/i.test(lower)) return 'total_outflow';
  if (/net nakit/i.test(lower)) return 'net';
  if (/nakit bakiye/i.test(lower)) return 'balance';
  if (/^f-[a-j]\./i.test(text) || /^[a-j]\.\d/i.test(text)) return 'detail';
  if (
    /nakit giri[sş]leri|personel giderleri nakit|d[ıi][sş]ar[ıi]dan sa[gğ]lanan|dan[ıi][sş]manl[ıi]k giderleri|[cç]e[sş]itli giderler|vergi\/resim|yat[ıi]r[ıi]mlara ait|finansal operasyon|proje faaliyet/i.test(
      lower,
    )
  ) {
    return 'section';
  }
  return 'detail';
}
