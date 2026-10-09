/**
 * data-fetcher controller
 * Aggregates ALL homepage data in ONE request — per locale, published only.
 *
 * GET /api/data-fetcher?locale=de   (default: de)
 * GET /api/data-fetcher?locale=en
 */

import { factories } from "@strapi/strapi";

const DEFAULT_LOCALE = "de";

export default factories.createCoreController(
    "api::data-fetcher.data-fetcher",
    ({ strapi }) => ({
        async find(ctx) {
            const raw = ctx.query?.locale;
            const locale =
                typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_LOCALE;

            const known = await strapi
                .plugin("i18n")
                .service("locales")
                .findByCode(locale);
            if (!known) {
                return ctx.badRequest(`Unknown locale "${locale}"`);
            }

            const base = { locale, status: "published" as const };

            /**
             * Collection laden. Reihenfolge: createdAt statt id — Published-
             * Zeilen haben in Strapi 5 eigene ids (Zeitpunkt der Veröffentlichung),
             * createdAt wird vom Entwurf übernommen und entspricht der Pflege-
             * Reihenfolge. Andere Locales werden in die Reihenfolge der Default-
             * Locale gebracht (per documentId), damit DE und EN identisch
             * sortiert sind, egal wann die Übersetzung angelegt wurde.
             */
            const findOrdered = async (
                uid:
                    | "api::shop-service.shop-service"
                    | "api::project.project"
                    | "api::skill.skill"
                    | "api::faq.faq"
                    | "api::testimonial.testimonial"
                    | "api::process-step.process-step",
                opts: { populate?: any; sort?: string[] } = {}
            ) => {
                const sort = opts.sort ?? ["createdAt:asc", "id:asc"];
                const rows: any[] = await strapi.documents(uid).findMany({
                    ...base,
                    populate: opts.populate,
                    sort,
                    limit: -1,
                });
                if (locale === DEFAULT_LOCALE) return rows;

                const reference: any[] = await strapi.documents(uid).findMany({
                    locale: DEFAULT_LOCALE,
                    status: "published",
                    fields: ["documentId"],
                    sort,
                    limit: -1,
                });
                const rank = new Map<string, number>(
                    reference.map((r, i) => [r.documentId, i])
                );
                const fallback = reference.length;
                return rows.sort(
                    (a, b) =>
                        (rank.get(a.documentId) ?? fallback) -
                            (rank.get(b.documentId) ?? fallback) ||
                        a.id - b.id
                );
            };

            /* ------------------------------------------------------------------
               1️⃣ Single type home-page (object, not array)
               ------------------------------------------------------------------ */
            const home =
                (await strapi
                    .documents("api::home-page.home-page")
                    .findFirst({ ...base })) ?? null;

            /* ------------------------------------------------------------------
               2️⃣ Collections
               ------------------------------------------------------------------ */
            const [
                services,
                projects,
                skills,
                faqs,
                testimonials,
                processSteps,
            ] = await Promise.all([
                findOrdered("api::shop-service.shop-service"),
                findOrdered("api::project.project", {
                    populate: { thumbnail: true, bodypage: { populate: "*" } },
                }),
                findOrdered("api::skill.skill"),
                findOrdered("api::faq.faq"),
                findOrdered("api::testimonial.testimonial"),
                findOrdered("api::process-step.process-step", {
                    sort: ["number:asc"],
                }),
            ]);

            /* ------------------------------------------------------------------
               3️⃣ Return FLAT bundle (no ctx.body)
               ------------------------------------------------------------------ */
            return {
                home,
                services,
                projects,
                skills,
                faqs,
                testimonials,
                processSteps,
            };
        },
    })
);
