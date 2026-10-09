// backend/scripts/apply-content-changes.cjs
//
// Wendet Feldaenderungen aus einer JSON-Datei auf Strapi-Dokumente an und
// publiziert sie (Document Service, laeuft in der Strapi-Runtime, kein Token).
//
// WICHTIG: Dev-Server (`pnpm run develop`) vorher stoppen (SQLite-Lock).
//
// Aufruf (im Ordner backend/):
//   node scripts/apply-content-changes.cjs <changes.json> [--dry-run]
//
// Format der JSON-Datei:
// {
//   "update": { "<uid>": { "<documentId>": { "<locale>": { feld: wert, ... } } } },
//   "unpublish": [ { "uid": "<uid>", "documentId": "<id>", "locale": "*" } ]
// }

const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const file = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');
if (!file) {
  console.error('Pfad zur changes.json fehlt.');
  process.exit(1);
}
const changes = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));

(async () => {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  try {
    for (const [uid, docs] of Object.entries(changes.update ?? {})) {
      for (const [documentId, locales] of Object.entries(docs)) {
        for (const [locale, data] of Object.entries(locales)) {
          const before = await app.documents(uid).findOne({ documentId, locale, status: 'draft' });
          if (!before) {
            console.error(`FEHLT: ${uid} ${documentId} (${locale})`);
            continue;
          }
          console.log(`${DRY_RUN ? '[dry] ' : ''}update ${uid} ${documentId} (${locale}): ${Object.keys(data).join(', ')}`);
          if (!DRY_RUN) {
            await app.documents(uid).update({ documentId, locale, data, status: 'published' });
          }
        }
      }
    }
    for (const u of changes.unpublish ?? []) {
      console.log(`${DRY_RUN ? '[dry] ' : ''}unpublish ${u.uid} ${u.documentId} (${u.locale ?? '*'})`);
      if (!DRY_RUN) {
        await app.documents(u.uid).unpublish({ documentId: u.documentId, locale: u.locale ?? '*' });
      }
    }
    console.log('fertig');
  } finally {
    await app.destroy();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
