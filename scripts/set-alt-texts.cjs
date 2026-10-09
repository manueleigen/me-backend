// backend/scripts/set-alt-texts.cjs
//
// Setzt `alternativeText` in der Media Library (plugin::upload.file) aus einer
// JSON-Liste [{ id, name, alternativeText }]. Medien sind in Strapi nicht
// lokalisiert — es gibt also nur einen Alt-Text (hier: Deutsch).
// Laeuft in der Strapi-Runtime (kein API-Token). Der `name` dient nur als
// Sicherheitsabgleich: stimmt er nicht mit der Datei zur id ueberein, wird
// der Eintrag uebersprungen.
//
// WICHTIG: Dev-Server (`pnpm run develop`) vorher stoppen (SQLite-Lock).
//
// Aufruf (im Ordner backend/):
//   node scripts/set-alt-texts.cjs translations/alt-texts-2026-10-10.json [--dry-run]

const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const file = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');
if (!file) {
  console.error('Pfad zur Alt-Text-JSON fehlt.');
  process.exit(1);
}
const entries = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));

(async () => {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';
  let ok = 0;
  let skipped = 0;

  try {
    for (const e of entries) {
      const current = await app.db.query('plugin::upload.file').findOne({ where: { id: e.id } });
      if (!current) {
        console.error(`FEHLT: Media id ${e.id} (${e.name})`);
        skipped++;
        continue;
      }
      if (current.name !== e.name) {
        console.error(`NAME WEICHT AB: id ${e.id} ist "${current.name}", erwartet "${e.name}" — uebersprungen`);
        skipped++;
        continue;
      }
      console.log(`${DRY_RUN ? '[dry] ' : ''}alt #${e.id} ${e.name}: "${e.alternativeText}"`);
      if (!DRY_RUN) {
        await app.db.query('plugin::upload.file').update({
          where: { id: e.id },
          data: { alternativeText: e.alternativeText },
        });
      }
      ok++;
    }
    console.log(`fertig: ${ok} gesetzt, ${skipped} uebersprungen`);
  } finally {
    await app.destroy();
  }
  process.exit(skipped ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
