/**
 * data-fetcher controller
 * Aggregates ALL homepage data in ONE request
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
    "api::data-fetcher.data-fetcher",
    ({ strapi }) => ({
        async find() {

            const homeEntries = await strapi.entityService.findMany(
                "api::home-page.home-page",
                {
                    // Einfache Felder wie heroTitle, heroText etc. NICHT hier angeben!
                    // Sie werden automatisch geladen.
                    populate: {
                        // Falls du Bilder oder Komponenten hast, kommen NUR diese hier rein:
                        // heroTitel: true,
                        // someComponent: { populate: '*' }
                    },
                }
            );

            //const home = homeEntries[0] ?? null;
            const home = homeEntries ?? null;

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
                strapi.entityService.findMany("api::shop-service.shop-service", {
                    sort: ["id:asc"],
                }),
                strapi.entityService.findMany("api::project.project", {
                    populate: ["thumbnail", "bodypage", "bodypage.image"],
                    sort: ["id:asc"],
                }),
                strapi.entityService.findMany("api::skill.skill"),
                strapi.entityService.findMany("api::faq.faq"),
                strapi.entityService.findMany("api::testimonial.testimonial"),
                strapi.entityService.findMany("api::process-step.process-step", {
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