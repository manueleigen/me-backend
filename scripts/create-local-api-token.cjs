// backend/scripts/create-local-api-token.cjs
//
// Legt in der LOKALEN Instanz einen API-Token fuer das Frontend an und gibt den
// Schluessel einmalig aus (Strapi speichert nur den Hash — spaeter nicht mehr lesbar).
//
// Scope = genau das, was das Frontend braucht:
//   - find/findOne auf allen Inhalts-Typen
//   - create auf contact-submission (Kontaktformular)
// Bewusst KEIN Lesezugriff auf contact-submission — so verhaelt sich der Token
// wie der alte Cloud-Token (der dort mit 403 geantwortet hat).
//
// WICHTIG: Dev-Server vorher stoppen (SQLite-Lock).
//
// Aufruf (im Ordner backend/):
//   node scripts/create-local-api-token.cjs [name]

const { createStrapi, compileStrapi } = require('@strapi/strapi');

const TOKEN_NAME = process.argv[2] || 'Frontend Local';

// Inhalts-Typen, die das Frontend liest
const READ_UIDS = [
  'api::project.project',
  'api::testimonial.testimonial',
  'api::faq.faq',
  'api::shop-service.shop-service',
  'api::skill.skill',
  'api::process-step.process-step',
  'api::home-page.home-page',
  'api::global.global',
  'api::website.website',
  'api::data-fetcher.data-fetcher',
];

// Schreibzugriff nur fuers Kontaktformular
const CREATE_UIDS = ['api::contact-submission.contact-submission'];

async function main() {
  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';

  try {
    // Welche Content-API-Actions kennt diese Instanz wirklich?
    const available = new Set(app.contentAPI.permissions.providers.action.keys());

    const wanted = [];
    for (const uid of READ_UIDS) {
      for (const action of ['find', 'findOne']) {
        const key = `${uid}.${action}`;
        if (available.has(key)) wanted.push(key);
      }
    }
    for (const uid of CREATE_UIDS) {
      const key = `${uid}.create`;
      if (available.has(key)) wanted.push(key);
    }

    if (!wanted.length) {
      throw new Error('Keine passenden Content-API-Actions gefunden.');
    }

    const service = app.service('admin::api-token');

    // Gleichnamigen Token ersetzen — der Schluessel eines bestehenden Tokens
    // laesst sich nicht erneut auslesen.
    const existing = await service.getByName(TOKEN_NAME);
    if (existing) {
      await service.revoke(existing.id);
      console.log(`↻ Vorhandenen Token "${TOKEN_NAME}" ersetzt.`);
    }

    const token = await service.create({
      name: TOKEN_NAME,
      description: 'Lokales Frontend: Lesezugriff + Kontaktformular',
      type: 'custom',
      lifespan: null,
      permissions: wanted,
    });

    console.log(`\n✅ API-Token "${TOKEN_NAME}" angelegt (${wanted.length} Permissions):`);
    for (const p of wanted) console.log(`   - ${p}`);
    console.log(`\nACCESS_KEY=${token.accessKey}\n`);
  } finally {
    await app.destroy();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\n❌ Token konnte nicht angelegt werden:', err);
    process.exit(1);
  }
);
