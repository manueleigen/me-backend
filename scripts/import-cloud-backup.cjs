// backend/scripts/import-cloud-backup.cjs
//
// Spielt das Backup aus ../strapi-cloud-backup/ in die LOKALE Strapi-Instanz ein.
// Laeuft direkt in der Strapi-Runtime (Document Service API) — es werden also
// weder API-Tokens noch freigegebene Public-Rechte gebraucht.
//
// CommonJS mit Absicht: der ESM-Build von @strapi/core hat in 5.52 einen
// kaputten internen Import (lodash/fp), der CJS-Build funktioniert.
//
// WICHTIG: Der Dev-Server (`pnpm run develop`) muss gestoppt sein,
// sonst sperrt SQLite die Datenbank.
//
// Aufruf (im Ordner backend/):
//   node scripts/import-cloud-backup.cjs            # Abbruch, falls schon Daten da sind
//   node scripts/import-cloud-backup.cjs --replace  # vorhandene Eintraege vorher loeschen
//   node scripts/import-cloud-backup.cjs --dry-run  # nur zeigen, was passieren wuerde

const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const BACKEND_DIR = path.resolve(__dirname, '..');
const BACKUP_DIR = path.resolve(BACKEND_DIR, '..', 'strapi-cloud-backup');

const REPLACE = process.argv.includes('--replace');
const DRY_RUN = process.argv.includes('--dry-run');

// Reihenfolge ist relevant: erst Ziele von Relationen, dann die Quellen.
const COLLECTIONS = [
  ['faqs', 'api::faq.faq'],
  ['skills', 'api::skill.skill'],
  ['process-steps', 'api::process-step.process-step'],
  ['shop-services', 'api::shop-service.shop-service'],
  ['testimonials', 'api::testimonial.testimonial'],
  ['projects', 'api::project.project'],
];

const SINGLES = [
  ['global', 'api::global.global'],
  ['website', 'api::website.website'],
  ['home-page', 'api::home-page.home-page'],
];

// Attribute, die eine Relation auf eine andere Collection sind:
// { uid: { attribut: 'plural-name-im-backup' } }
const RELATION_FIELDS = {
  'api::home-page.home-page': { faqs: 'faqs' },
};

const SYSTEM_FIELDS = new Set([
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'locale',
  'localizations',
]);

const isMedia = (v) =>
  v &&
  typeof v === 'object' &&
  typeof v.hash === 'string' &&
  typeof v.url === 'string' &&
  typeof v.mime === 'string';

const log = (...args) => console.log(...args);
const sameContent = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const content = JSON.parse(await fs.readFile(path.join(BACKUP_DIR, 'content.json'), 'utf-8'));
  const mediaManifest = JSON.parse(await fs.readFile(path.join(BACKUP_DIR, 'media.json'), 'utf-8'));

  log(`📦 Backup: ${BACKUP_DIR}`);
  log(`   exportiert am ${content._meta && content._meta.exportedAt} von ${content._meta && content._meta.source}`);
  log(`   ${mediaManifest.length} Media-Dateien, ${Object.keys(content).length - 1} Content-Types`);
  if (DRY_RUN) log('   (dry-run — es wird nichts geschrieben)');

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();
  strapi.log.level = 'error';

  const uploadService = strapi.plugin('upload').service('upload');

  /** oldMediaId -> neues File-Objekt der lokalen Instanz */
  const mediaMap = new Map();
  /** 'plural' -> Map(oldDocumentId -> newDocumentId) */
  const docIdMaps = new Map();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  /** Entfernt Systemfelder, mappt Medien auf neue IDs, saeubert Komponenten. */
  function toData(node) {
    if (Array.isArray(node)) return node.map((item) => toData(item));

    if (isMedia(node)) {
      const mapped = mediaMap.get(node.id);
      if (!mapped) {
        log(`   ⚠️  Medium ${node.id} (${node.name}) nicht in der Map — Feld bleibt leer`);
        return null;
      }
      return mapped.id;
    }

    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        if (SYSTEM_FIELDS.has(key)) continue;
        out[key] = toData(value);
      }
      return out;
    }

    return node;
  }

  /** Setzt Relationen auf die neuen documentIds um. */
  function applyRelations(data, uid, source) {
    const rels = RELATION_FIELDS[uid];
    if (!rels) return data;

    for (const [field, targetPlural] of Object.entries(rels)) {
      const original = source && source[field];
      if (!Array.isArray(original)) continue;
      const map = docIdMaps.get(targetPlural) || new Map();
      const ids = original
        .map((item) => map.get(item.documentId))
        .filter(Boolean)
        .map((documentId) => ({ documentId }));
      data[field] = { set: ids };
      if (original.length && ids.length !== original.length) {
        log(`   ⚠️  ${uid}.${field}: ${original.length - ids.length} Relation(en) nicht aufloesbar`);
      }
    }
    return data;
  }

  try {
    // ----------------------------------------------------- Vorabcheck ---
    const targets = [...COLLECTIONS, ...SINGLES];
    const existing = [];
    for (const [, uid] of targets) {
      const count = await strapi.documents(uid).count({ status: 'draft' });
      if (count > 0) existing.push(`${uid} (${count})`);
    }
    const fileCount = await strapi.db.query('plugin::upload.file').count();

    if ((existing.length || fileCount) && !REPLACE && !DRY_RUN) {
      log('\n⚠️  In der lokalen Instanz sind bereits Daten vorhanden:');
      for (const e of existing) log(`   - ${e}`);
      if (fileCount) log(`   - Medienbibliothek (${fileCount} Dateien)`);
      log('\n   Abbruch. Mit --replace werden diese Eintraege vorher geloescht.');
      await strapi.destroy();
      process.exit(1);
    }

    if (REPLACE && !DRY_RUN) {
      log('\n🗑  --replace: loesche vorhandene Eintraege...');
      for (const [, uid] of targets) {
        const docs = await strapi.documents(uid).findMany({ status: 'draft', limit: -1 });
        const list = Array.isArray(docs) ? docs : docs ? [docs] : [];
        for (const doc of list) {
          await strapi.documents(uid).delete({ documentId: doc.documentId });
        }
        if (list.length) log(`   - ${uid}: ${list.length} geloescht`);
      }
      const files = await strapi.db.query('plugin::upload.file').findMany({ limit: -1 });
      for (const file of files) {
        await uploadService.remove(file);
      }
      if (files.length) log(`   - Medienbibliothek: ${files.length} Dateien geloescht`);
    }

    // ---------------------------------------------------------- Media ---
    log('\n🖼  Medien werden hochgeladen...');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'strapi-media-'));

    for (const entry of mediaManifest) {
      const src = path.join(BACKUP_DIR, 'uploads', entry.filename);
      let stat;
      try {
        stat = await fs.stat(src);
      } catch {
        log(`   ⚠️  Datei fehlt im Backup: ${entry.filename}`);
        continue;
      }

      if (DRY_RUN) {
        log(`   [dry] ${entry.name} (${(stat.size / 1024).toFixed(0)} KB)`);
        continue;
      }

      // Kopie anlegen: der Upload-Service arbeitet direkt auf der Quelldatei.
      const tmpFile = path.join(tmpDir, entry.filename);
      await fs.copyFile(src, tmpFile);

      const [uploaded] = await uploadService.upload({
        data: {
          fileInfo: {
            name: entry.name,
            alternativeText: entry.alternativeText,
            caption: entry.caption,
          },
        },
        files: {
          filepath: tmpFile,
          originalFilename: entry.name,
          mimetype: entry.mime,
          size: stat.size,
        },
      });

      mediaMap.set(entry.id, uploaded);
      log(`   ✔ ${entry.name} -> id ${uploaded.id}`);
    }

    await fs.rm(tmpDir, { recursive: true, force: true });

    // ---------------------------------------------------- Collections ---
    for (const [plural, uid] of COLLECTIONS) {
      const bucket = content[plural];
      if (!bucket) {
        log(`\n⏭  ${plural}: nicht im Backup`);
        continue;
      }
      log(`\n📄 ${plural} (${uid})`);

      const byDocId = new Map();
      for (const entry of bucket.draft || []) {
        byDocId.set(entry.documentId, { draft: entry });
      }
      for (const entry of bucket.published || []) {
        byDocId.set(entry.documentId, { ...(byDocId.get(entry.documentId) || {}), published: entry });
      }

      const idMap = new Map();
      docIdMaps.set(plural, idMap);

      for (const [oldDocId, versions] of byDocId) {
        const source = versions.published || versions.draft;
        const label = source.title || source.name || source.question || source.category || oldDocId;

        if (DRY_RUN) {
          log(`   [dry] ${versions.published ? 'published' : 'draft'}: ${label}`);
          continue;
        }

        const data = applyRelations(toData(source), uid, source);
        const doc = await strapi.documents(uid).create({
          data,
          status: versions.published ? 'published' : 'draft',
        });
        idMap.set(oldDocId, doc.documentId);
        created++;
        log(`   ✔ ${versions.published ? 'published' : 'draft  '} ${label}`);

        // Unveroeffentlichte Aenderungen (abweichender Draft) nachziehen
        if (versions.published && versions.draft) {
          const draftData = applyRelations(toData(versions.draft), uid, versions.draft);
          if (!sameContent(draftData, data)) {
            await strapi.documents(uid).update({ documentId: doc.documentId, data: draftData });
            updated++;
            log(`     ↳ abweichende Draft-Version uebernommen`);
          }
        }
      }
    }

    // -------------------------------------------------------- Singles ---
    for (const [key, uid] of SINGLES) {
      const bucket = content[key];
      const source = bucket && (bucket.published || bucket.draft);
      if (!source) {
        log(`\n⏭  ${key}: keine Daten im Backup`);
        skipped++;
        continue;
      }
      log(`\n📄 ${key} (${uid})`);

      if (DRY_RUN) {
        log(`   [dry] single type wird gesetzt`);
        continue;
      }

      const data = applyRelations(toData(source), uid, source);
      const doc = await strapi.documents(uid).create({
        data,
        status: bucket.published ? 'published' : 'draft',
      });
      created++;
      log(`   ✔ gesetzt (${bucket.published ? 'published' : 'draft'})`);

      if (bucket.published && bucket.draft) {
        const draftData = applyRelations(toData(bucket.draft), uid, bucket.draft);
        if (!sameContent(draftData, data)) {
          await strapi.documents(uid).update({ documentId: doc.documentId, data: draftData });
          updated++;
          log(`   ↳ abweichende Draft-Version uebernommen`);
        }
      }
    }

    log(
      `\n✅ Import fertig: ${created} Eintraege angelegt, ${updated} Draft-Versionen nachgezogen, ${skipped} uebersprungen.`
    );
    log(`   Medien: ${mediaMap.size} von ${mediaManifest.length} uebernommen.`);
  } finally {
    await strapi.destroy();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\n❌ Import fehlgeschlagen:', err);
    process.exit(1);
  }
);
