/** Demo şirketleri tanıma ve silme (seed / clear ortak) */
import { db } from '../server/db.js';

export const DEMO_TAG = '[DEMO]';
export const DEMO_PARENT_NAME = 'Nova Teknoloji Holding A.Ş.';

export function listDemoCompanyIds(): string[] {
  const tagged = db
    .prepare(`SELECT id FROM companies WHERE name LIKE ?`)
    .all(`${DEMO_TAG}%`) as { id: string }[];

  const parent = db
    .prepare(`SELECT id FROM companies WHERE name = ?`)
    .get(DEMO_PARENT_NAME) as { id: string } | undefined;

  const ids = new Set(tagged.map((c) => c.id));
  if (parent) {
    ids.add(parent.id);
    const kids = db
      .prepare(`SELECT id FROM companies WHERE parent_id = ?`)
      .all(parent.id) as { id: string }[];
    kids.forEach((k) => ids.add(k.id));
  }

  // Not alanında DEMO_TAG geçen holding/iştirak (eski seed varyantları)
  const byNotes = db
    .prepare(
      `SELECT c.id FROM companies c
       JOIN company_profiles p ON p.company_id = c.id
       WHERE p.notes LIKE ?`,
    )
    .all(`%${DEMO_TAG}%`) as { id: string }[];
  byNotes.forEach((r) => ids.add(r.id));

  return [...ids];
}

/** Tüm demo şirketleri + bağlı nakit akış / profil / import kayıtlarını siler. */
export function clearAllDemoData(): { removed: number; names: string[] } {
  const ids = listDemoCompanyIds();
  if (!ids.length) return { removed: 0, names: [] };

  const names = (
    db
      .prepare(
        `SELECT name FROM companies WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY role DESC, name`,
      )
      .all(...ids) as { name: string }[]
  ).map((r) => r.name);

  // Önce iştirakler, sonra ana şirket (FK düzeni)
  const ordered = db
    .prepare(
      `SELECT id, role FROM companies WHERE id IN (${ids.map(() => '?').join(',')})
       ORDER BY CASE role WHEN 'subsidiary' THEN 0 ELSE 1 END`,
    )
    .all(...ids) as { id: string; role: string }[];

  const tx = db.transaction(() => {
    for (const row of ordered) {
      db.prepare(`DELETE FROM companies WHERE id = ?`).run(row.id);
    }
  });
  tx();

  return { removed: ordered.length, names };
}
