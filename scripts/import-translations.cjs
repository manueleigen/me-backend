// backend/scripts/import-translations.cjs
//
// Legt aus backend/translations/<locale>.json (Standard: en.json) die
// uebersetzten Locale-Versionen der vorhandenen Dokumente an bzw. aktualisiert
// sie. Laeuft in der Strapi-Runtime (Document Service API), kein API-Token
// noetig. Idempotent: ein zweiter Lauf aktualisiert nur.
//
// Struktur der Uebersetzungsdatei:
//   { "<content-type uid>": { "<documentId>": { feld: wert, ... } } }
//   Bei api::project.project ist `bodypage` ein Array in DE-Reihenfolge mit
//   { "__component": "content.project-image" } (Bild wird aus DE kopiert) bzw.
//   { "__component": "content.project-body-text", "Text": "..." }.
//
// Vorgehen pro Dokument:
//   1. Quell-Version (Default-Locale `de`) komplett laden (populate),
//   2. Daten in Schreibform bringen (Medien -> ids, Komponenten ohne ids,
//      Relationen weglassen), d. h. nicht-lokalisierte Felder werden explizit
//      mit den DE-Werten mitgegeben (wichtig: Strapi synchronisiert
//      nicht-lokalisierte Felder von der geschriebenen Locale zu den anderen —
//      fehlende Werte wuerden sonst die DE-Version leeren),
//   3. lokalisierte Felder mit den Uebersetzungen ueberschreiben,
//   4. `documents(uid).update({ documentId, locale, data, status: 'published' })`
//      — legt in Strapi 5 die Locale-Version an, falls sie fehlt, und
//      veroeffentlicht sie.
//   5. Hat die DE-Version noch keine veroeffentlichte Fassung, wird sie
//      publiziert (abschaltbar mit --skip-publish-source).
//
// WICHTIG: Der Dev-Server (`pnpm run develop`) muss gestoppt sein (SQLite-Lock).
//
// Aufruf (im Ordner backend/):
//   node scripts/import-translations.cjs --dry-run
//   node scripts/import-translations.cjs --only api::faq.faq --limit 1
//   node scripts/import-translations.cjs
//   Optionen: --locale en  --source de  --file translations/en.json
//             --only <uid>  --limit <n>  --skip-publish-source  --dry-run

const fs = require('fs/promises');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const BACKEND_DIR = path.resolve(__dirname, '..');

const has = (flag) => process.argv.includes(flag);
const argValue = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const DRY_RUN = has('--dry-run');
const SKIP_PUBLISH_SOURCE = has('--skip-publish-source');
const TARGET_LOCALE = argValue('--locale', 'en');
const SOURCE_LOCALE = argValue('--source', 'de');
const FILE = path.resolve(BACKEND_DIR, argValue('--file', `translations/${TARGET_LOCALE}.json`));
const ONLY = argValue('--only', null);
const LIMIT = Number(argValue('--limit', '0')) || 0;

// Populate pro Content-Type, damit Medien/Komponenten der Quelle mitkommen.
const POPULATE = {
  'api::project.project': { thumbnail: true, bodypage: { populate: '*' } },
  'api::testimonial.testimonial': { image: true },
  'api::global.global': { social_links: true },
  'api::home-page.home-page': { designApproachSections: true },
};

const SYSTEM_FIELDS = new Set([
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'firstPublishedAt',
  'locale',
  'localizations',
  'createdBy',
  'updatedBy',
]);

const isMedia = (v) =>
  v && typeof v === 'object' && typeof v.hash === 'string' && typeof v.url === 'string' && typeof v.mime === 'string';

const log = (...args) => console.log(...args);
const short = (v, n = 60) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};

/** Dokument-Service-Ausgabe -> schreibbare Daten (Medien als id, ohne System-/Komponenten-ids). */
function toData(node) {
  if (Array.isArray(node)) return node.map(toData);
  if (isMedia(node)) return node.id;
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

function buildBodypage(uid, documentId, sourceBody, translatedBody) {
  const src = Array.isArray(sourceBody) ? sourceBody : [];
  const tr = Array.isArray(translatedBody) ? translatedBody : [];
  if (src.length !== tr.length) {
    throw new Error(
      `${uid}/${documentId}: bodypage hat ${src.length} Eintraege in ${SOURCE_LOCALE}, aber ${tr.length} in der Uebersetzung`
    );
  }
  return src.map((comp, i) => {
    const t = tr[i] || {};
    if (t.__component && t.__component !== comp.__component) {
      throw new Error(
        `${uid}/${documentId}: bodypage[${i}] ist ${comp.__component}, Uebersetzung sagt ${t.__component}`
      );
    }
    if (comp.__component === 'content.project-image') {
      return { __component: comp.__component, image: comp.image ? comp.image.id : null };
    }
    if (comp.__component === 'content.project-body-text') {
      if (typeof t.Text !== 'string') {
        log(`   ⚠️  bodypage[${i}]: kein "Text" in der Uebersetzung — ${SOURCE_LOCALE}-Text bleibt`);
      }
      return { __component: comp.__component, Text: typeof t.Text === 'string' ? t.Text : comp.Text };
    }
    // unbekannte Komponente: 1:1 kopieren
    return toData(comp);
  });
}

async function main() {
  const translations = JSON.parse(await fs.readFile(FILE, 'utf-8'));
  const uids = Object.keys(translations).filter((uid) => !ONLY || uid === ONLY);

  log(`🌐 Uebersetzungen importieren: ${SOURCE_LOCALE} -> ${TARGET_LOCALE}`);
  log(`   Datei: ${path.relative(BACKEND_DIR, FILE)} (${uids.length} Content-Types)`);
  if (DRY_RUN) log('   (dry-run — es wird nichts geschrieben)');
  if (ONLY) log(`   nur: ${ONLY}`);
  if (LIMIT) log(`   limit: ${LIMIT} Dokument(e) pro Content-Type`);

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();
  strapi.log.level = 'error';

  const stats = { created: 0, updated: 0, publishedSource: 0, skipped: 0, failed: 0 };

  try {
    const localesService = strapi.plugin('i18n').service('locales');
    const ctService = strapi.plugin('i18n').service('content-types');

    for (const code of [SOURCE_LOCALE, TARGET_LOCALE]) {
      if (!(await localesService.findByCode(code))) {
        throw new Error(`Locale "${code}" existiert nicht in Strapi (Settings -> Internationalization)`);
      }
    }
    const defaultLocale = await localesService.getDefaultLocale();
    if (defaultLocale !== SOURCE_LOCALE) {
      log(`   ⚠️  Default-Locale ist ${defaultLocale}, Quelle ist ${SOURCE_LOCALE}`);
    }

    for (const uid of uids) {
      const model = strapi.contentTypes[uid];
      if (!model) {
        log(`\n⏭  ${uid}: unbekannter Content-Type — uebersprungen`);
        stats.skipped++;
        continue;
      }
      if (!ctService.isLocalizedContentType(model)) {
        log(`\n⏭  ${uid}: nicht lokalisiert (pluginOptions.i18n.localized fehlt) — uebersprungen`);
        stats.skipped++;
        continue;
      }

      const localizedAttrs = new Set(ctService.getLocalizedAttributes(model));
      const translated = translations[uid] || {};
      const wanted = new Set(Object.keys(translated));
      const populate = POPULATE[uid] || undefined;
      const isSingle = model.kind === 'singleType';

      // Quell-Dokumente in id-Reihenfolge laden, damit die Ziel-Locale in
      // derselben Reihenfolge angelegt wird (Data-Fetcher sortiert nach id).
      let sources;
      if (isSingle) {
        const one = await strapi.documents(uid).findFirst({ locale: SOURCE_LOCALE, populate });
        sources = one ? [one] : [];
      } else {
        sources = await strapi.documents(uid).findMany({
          locale: SOURCE_LOCALE,
          populate,
          sort: 'id:asc',
          limit: -1,
        });
      }
      const sourceIds = new Set(sources.map((d) => d.documentId));
      for (const documentId of wanted) {
        if (!sourceIds.has(documentId)) {
          log(`\n⚠️  ${uid}/${documentId}: kein ${SOURCE_LOCALE}-Dokument gefunden — uebersprungen`);
          stats.skipped++;
        }
      }

      const todo = sources.filter((d) => wanted.has(d.documentId));
      const list = LIMIT ? todo.slice(0, LIMIT) : todo;
      log(`\n📄 ${uid} (${list.length} von ${todo.length} Dokumenten, ${sources.length} in ${SOURCE_LOCALE})`);

      for (const source of list) {
        const { documentId } = source;
        const tr = translated[documentId];
        const label = source.title || source.name || source.question || source.category || source.siteTitle || source.heroTitle || documentId;

        try {
          // 1) DE-Kopie als Basis (inkl. nicht-lokalisierter Felder, uid-Felder, Medien-ids)
          const data = toData(source);
          // Relationen nicht mitschreiben (werden pro Locale im Admin gepflegt)
          for (const [attrName, attr] of Object.entries(model.attributes)) {
            if (attr.type === 'relation') delete data[attrName];
          }

          // 2) Uebersetzungen ueberlagern
          const applied = [];
          for (const [field, value] of Object.entries(tr)) {
            const attr = model.attributes[field];
            if (!attr) {
              log(`   ⚠️  ${label}: Feld "${field}" gibt es im Schema nicht — ignoriert`);
              continue;
            }
            if (!localizedAttrs.has(field)) {
              log(`   ⚠️  ${label}: Feld "${field}" ist nicht lokalisiert — ignoriert (bleibt ${SOURCE_LOCALE}-Wert)`);
              continue;
            }
            if (attr.type === 'dynamiczone' && field === 'bodypage') {
              data[field] = buildBodypage(uid, documentId, source.bodypage, value);
            } else {
              data[field] = value;
            }
            applied.push(field);
          }

          // 3) Zielstatus ermitteln
          const existingTarget = await strapi.documents(uid).findOne({ documentId, locale: TARGET_LOCALE });
          const action = existingTarget ? 'aktualisieren' : 'anlegen';
          const sourcePublished = await strapi.documents(uid).findOne({
            documentId,
            locale: SOURCE_LOCALE,
            status: 'published',
          });

          if (DRY_RUN) {
            log(`   [dry] ${action}: ${label}`);
            log(`         Felder: ${applied.join(', ') || '(keine)'}`);
            for (const f of applied) {
              if (f === 'bodypage') {
                log(
                  `         bodypage: ${data.bodypage
                    .map((c) => (c.__component === 'content.project-image' ? `img#${c.image}` : `text(${short(c.Text, 30)})`))
                    .join(' | ')}`
                );
              } else {
                log(`         ${f}: ${short(data[f])}`);
              }
            }
            const shared = Object.keys(data).filter((k) => !localizedAttrs.has(k));
            if (shared.length) log(`         geteilt (${SOURCE_LOCALE}-Werte): ${shared.join(', ')}`);
            if (!sourcePublished) {
              log(`         ${SOURCE_LOCALE}-Version ist nicht veroeffentlicht${SKIP_PUBLISH_SOURCE ? '' : ' -> wuerde publiziert'}`);
            }
            continue;
          }

          // 4) Schreiben + publizieren
          await strapi.documents(uid).update({
            documentId,
            locale: TARGET_LOCALE,
            data,
            status: 'published',
          });
          if (existingTarget) stats.updated++;
          else stats.created++;
          log(`   ✔ ${action === 'anlegen' ? 'angelegt   ' : 'aktualisiert'} ${label} [${applied.join(', ')}]`);

          // 5) Quelle publizieren, falls noetig
          if (!sourcePublished && !SKIP_PUBLISH_SOURCE) {
            await strapi.documents(uid).publish({ documentId, locale: SOURCE_LOCALE });
            stats.publishedSource++;
            log(`     ↳ ${SOURCE_LOCALE}-Version war nur Entwurf — publiziert`);
          }
        } catch (err) {
          stats.failed++;
          log(`   ❌ ${label}: ${err.message}`);
        }
      }
    }

    log(
      `\n✅ Fertig: ${stats.created} angelegt, ${stats.updated} aktualisiert, ${stats.publishedSource} ${SOURCE_LOCALE}-Versionen publiziert, ${stats.skipped} uebersprungen, ${stats.failed} fehlgeschlagen.`
    );
    if (stats.failed) process.exitCode = 1;
  } finally {
    await strapi.destroy();
  }
}

main().then(
  () => process.exit(process.exitCode || 0),
  (err) => {
    console.error('\n❌ Import fehlgeschlagen:', err);
    process.exit(1);
  }
);
