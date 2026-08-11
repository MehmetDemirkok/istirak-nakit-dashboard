/**
 * Tüm demo şirketleri ve bağlı verilerini siler.
 * Kullanım: npm run seed:clear
 */
import { clearAllDemoData } from './demo-data.js';

const result = clearAllDemoData();

if (!result.removed) {
  console.log('── Demo veri yok — silinecek bir şey bulunamadı ──');
  process.exit(0);
}

console.log('── Demo veriler silindi ──');
for (const name of result.names) {
  console.log(`  · ${name}`);
}
console.log(`  Toplam: ${result.removed} şirket (+ nakit akış / profil / import)`);
console.log('── Tamam ──');
