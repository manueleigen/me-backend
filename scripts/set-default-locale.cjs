// backend/scripts/set-default-locale.cjs
//
// Legt die Locale `de` an (falls sie fehlt) und setzt sie als Default-Locale
// des i18n-Plugins. Laeuft in der Strapi-Runtime (kein API-Token noetig).
//
// WICHTIG — Reihenfolge-Falle: Dieses Script MUSS laufen, BEVOR die
// Content-Types lokalisiert werden (`pluginOptions.i18n.localized: true` in
// den schema.json). Beim ersten Start mit lokalisierten Schemas setzt Strapi
// alle Zeilen mit `locale = NULL` auf die Default-Locale. Ist das noch `en`,
// werden alle deutschen Inhalte als Englisch markiert.
//
// Der Dev-Server (`pnpm run develop`) muss gestoppt sein (SQLite-Lock).
//
// Aufruf (im Ordner backend/):
//   node scripts/set-default-locale.cjs            # de anlegen + Default setzen
//   node scripts/set-default-locale.cjs --dry-run  # nur anzeigen
//   node scripts/set-default-locale.cjs --code de --name "Deutsch (de)"

const { createStrapi, compileStrapi } = require('@strapi/strapi');

const DRY_RUN = process.argv.includes('--dry-run');
const argValue = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const CODE = argValue('--code', 'de');
const NAME = argValue('--name', 'Deutsch (de)');

const log = (...args) => console.log(...args);

async function main() {
  log(`🌐 Default-Locale setzen: ${CODE} (${NAME})`);
  if (DRY_RUN) log('   (dry-run — es wird nichts geschrieben)');

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();
  strapi.log.level = 'error';

  try {
    const localesService = strapi.plugin('i18n').service('locales');
    const ctService = strapi.plugin('i18n').service('content-types');

    const before = await localesService.find();
    const currentDefault = await localesService.getDefaultLocale();
    log(`\n   Vorher: Locales = ${before.map((l) => l.code).join(', ') || '(keine)'}; Default = ${currentDefault}`);

    // Warnung, falls bereits lokalisierte Content-Types existieren
    const localized = Object.values(strapi.contentTypes)
      .filter((ct) => ct.uid.startsWith('api::') && ctService.isLocalizedContentType(ct))
      .map((ct) => ct.uid);
    if (localized.length) {
      log(`   ⚠️  Bereits lokalisierte Content-Types: ${localized.join(', ')}`);
      log('      Die Migration auf die Default-Locale ist dann evtl. schon gelaufen — Zeilen per SQL pruefen.');
    }

    let locale = await localesService.findByCode(CODE);
    if (locale) {
      log(`   Locale ${CODE} existiert bereits (id ${locale.id}, "${locale.name}")`);
    } else if (DRY_RUN) {
      log(`   [dry] wuerde Locale ${CODE} ("${NAME}") anlegen`);
    } else {
      locale = await localesService.create({ code: CODE, name: NAME });
      log(`   ✔ Locale ${CODE} angelegt (id ${locale.id})`);
    }

    if (currentDefault === CODE) {
      log(`   Default-Locale ist bereits ${CODE}`);
    } else if (DRY_RUN) {
      log(`   [dry] wuerde Default-Locale von ${currentDefault} auf ${CODE} setzen`);
    } else {
      await localesService.setDefaultLocale({ code: CODE });
      log(`   ✔ Default-Locale auf ${CODE} gesetzt`);
    }

    const after = await localesService.find();
    const afterDefault = await localesService.getDefaultLocale();
    log(`\n   Nachher: Locales = ${after.map((l) => l.code).join(', ')}; Default = ${afterDefault}`);

    if (!DRY_RUN && afterDefault !== CODE) {
      throw new Error(`Default-Locale ist ${afterDefault}, erwartet ${CODE}`);
    }
  } finally {
    await strapi.destroy();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\n❌ Fehlgeschlagen:', err);
    process.exit(1);
  }
);
