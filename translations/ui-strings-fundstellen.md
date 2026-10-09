# UI-Strings – Fundstellen (Stand 2026-10-09, ca. 18:30 Uhr)

Schlüssel in `frontend/lib/i18n/ui.de.json` / `ui.en.json` = exakter deutscher Originalstring.
Mehrzeilige JSX-Texte sind als EIN String mit einfachen Leerzeichen aufgenommen (JSX kollabiert Whitespace).
Platzhalter: `{title}`, `{email}`, `{name}`, `{message}`.
Zeilennummern = Stand zum Zeitpunkt dieser Liste (alle per Skript gegengeprüft). Andere Agents editieren parallel – im Zweifel `grep -n` nutzen.

## Eingebundene Seiten / Komponenten

### app/layout.tsx
- :57 → `Zum Inhalt springen` (Skip-Link)
- :51 `lang={DEFAULT_LOCALE}` (kein String – muss pro Locale gesetzt werden)

### app/page.tsx
- keine hartkodierten Strings mehr (die früheren Suspense-Fallbacks `Loading...` / `Loading projects...` wurden entfernt)

### app/not-found.tsx
- :6 → `Seite nicht gefunden` (metadata.title)
- :14 → `Fehler 404`
- :15 → `Seite nicht gefunden` (H1)
- :17 → `Die aufgerufene Seite existiert nicht oder wurde verschoben.`
- :20 → `Zur Startseite`

### app/impressum/page.tsx
- :9 → `Impressum` (metadata.title)
- :10 → `Impressum und Anbieterkennzeichnung von Manuel Eigen, Designer & Full-Stack Developer, Berlin.` (metadata.description)
- :18 → `Impressum` (LegalPage title)
- Seiteninhalt (H2/Absätze) → `backend/translations/legal-en.md`, Abschnitt „Legal Notice"

### app/datenschutz/page.tsx
- :9 → `Datenschutzerklärung` (metadata.title)
- :10 → `Datenschutzerklärung der Website von Manuel Eigen, Designer & Full-Stack Developer, Berlin.`
- :19 → `Datenschutzerklärung` (LegalPage title)
- Seiteninhalt → `legal-en.md`, Abschnitt „Privacy Policy"

### app/agb/page.tsx
- :9 → `AGB` (metadata.title)
- :10 → `Allgemeine Geschäftsbedingungen von Manuel Eigen, Designer & Full-Stack Developer, Berlin.`
- :19 → `Allgemeine Geschäftsbedingungen` (LegalPage title)
- Seiteninhalt → `legal-en.md`, Abschnitt „Terms and Conditions"

### components/legal-page.tsx
- :21 → `← Zurück zur Startseite`

### app/api/contact/route.ts
- :67 → `Kontaktformular` (Absendername `Kontaktformular <…>`)
- :70 → `Anfrage über manueleigen.de: {name}` (Betreff)
- :71 → `Name: {name}\nE-Mail: {email}\n\nNachricht:\n{message}` (Mailtext)
- Hinweis: Die Antwort an den Client ist nur noch `{ ok, success, error: "generic" }` – keine sichtbaren Texte. Die Mail geht an Manuel; ob sie je nach Formular-Sprache übersetzt wird, entscheidet Agent I (Schlüssel liegen bereit).

### lib/seo.ts
- :54 → Title-Template `%s – Manuel Eigen` (kein Übersetzungsbedarf)
- :208 → `Leistungen` (JSON-LD `OfferCatalog.name`)

### components/hero.tsx
- :73 → `Manuel Eigen – Designer & Full-Stack Developer` (sr-only H1; EN identisch)

### components/client-logos.tsx
- :332 → `Über mich` (sr-only H2)
- :20–26 `name` der Logos = Markennamen (alt-Texte), nicht übersetzen

### components/services.tsx
- :34 → `Leistungen` (H2)

### components/project-slider.tsx
- :17 → `#projekt-` (HASH_PREFIX, URL-Fragment – kein UI-String; Agent I entscheidet, ob EN `#project-` bekommt)
- :228 → `Ausgewählte Arbeiten` (H2)
- :257 → `Projekt öffnen: {title}` (aria-label, Template-Literal `Projekt öffnen: ${project?.title ?? ""}`)
- :283 → `Vorheriges Projekt` (aria-label)
- :292 → `Nächstes Projekt` (aria-label)

### components/project-modal.tsx
- :204 → `Projekt schließen` (aria-label)
- :229 → `Kategorie` (H3)
- :243 → `Tools` (H3)
- :262 → `Nächstes Projekt` (Button)

### components/skills-grid.tsx
- :23 → `Kompetenzen` (H2; vorher `Skills & Expertise` – beide Schlüssel vorhanden)

### components/faq.tsx
- :35 → `Häufig gestellte Fragen` (H2)

### components/contact-form.tsx
- :37 → `Remote &` (Template `Remote & ${city}`) und Fallback `Remote`
- :97 → `Da ist etwas schiefgelaufen. Bitte versuch es noch einmal oder schreib mir direkt an {email}.` (Template-Literal mit `${contactEmail}`)
- :111 → `Lass uns reden` (H2)
- :113 → `Du hast ein Projekt, das auf Umsetzung wartet? Schreib mir!` (mit Komma – neuer Stand)
- :119 → `Name` (Label)
- :134 → `E-Mail` (Label)
- :150 → `Nachricht` (Label)
- :168 → `Website (bitte leer lassen)` (Honeypot-Label, aria-hidden)
- :209 → `Wird gesendet …`
- :213 → `Kontakt aufnehmen` (Submit-Button)
- :220 → `Mit dem Absenden werden deine Angaben zur Bearbeitung der Anfrage verwendet. Mehr dazu in der Datenschutzerklärung.` – im Code gesplittet: Text bis `in der{" "}` + Link `Datenschutzerklärung` (:222) + `.` (:224). Schlüssel `Datenschutzerklärung` separat vorhanden.
- :234 → `Danke für deine Nachricht! Ich werde mich so schnell wie möglich bei dir melden.`
- :255 → `Kontaktinformationen` (H3)
- :261 → `Standort`
- :269 → `E-Mail`
- :281 → `Telefon` (nur wenn contactPhone gesetzt)
- :294 → `Verfügbarkeit` (H3)
- :302 → `Verfügbar für neue Projekte` (Fallback, wenn CMS-availabilityText fehlt)

### components/footer.tsx
- :8 → `Manuel Eigen. Alle Rechte vorbehalten.` (DEFAULT_COPYRIGHT-Fallback; regulär kommt `copyrightText` aus dem CMS → en.json/global)
- :25 → `Rechtliches` (aria-label nav)
- :27 → `Impressum` (Linktext)
- :30 → `Datenschutz` (Linktext)
- :33 → `AGB` (Linktext)
- :41 → `Leichte Sprache` (auskommentiert)
- :50 → `Designer & Full-Stack Developer | Branding, Webdesign & Entwicklung, E-Commerce und Editorial Design` (nach `{contactName} | `)
- :55 → `Telefon:`
- :58 → `E-Mail:`

### components/sticky-header.tsx
- :33 → `Manuel Eigen`
- :34 → `– Designer` (im Code `&nbsp;– Designer`)
- :35 → `& Full-Stack Developer` (im Code `&nbsp;& Full-Stack Developer`)
- :44 → `Menü öffnen` (aria-label)

### components/side-menu.tsx
- :21 → `Klein`, :22 → `Normal`, :23 → `Groß` (FONT_SIZES-Labels)
- :141 → `Leistungen`, :142 → `Projekte` (primaryItems)
- :146 → `Kontakt` (secondaryItems)
- :187 → `Menü` (aria-label dialog)
- :203 → `Menü schließen` (aria-label)
- :209 → `Hauptnavigation` (aria-label nav)
- :238 → `Soziale Netzwerke` (aria-label nav)
- :270 → `Dark Mode`
- :271 → `(an)` / `(aus)` (sr-only)
- :275 → `Schriftgröße` (legend)

### components/rulers.tsx (Dev-Werkzeug, auf der Seite eingebunden)
- :86 → `Ziehe eine vertikale Hilfslinie` (title)
- :110 → `Ziehe eine horizontale Hilfslinie` (title)

## Nicht eingebundene Komponenten (Strings trotzdem übersetzt)

### components/navigation-menu.tsx
- :24 `Leistungen`, :25 `Projekte`, :26 `Skills`, :27 `Prozess`, :28 `Über mich`, :29 `Kontakt`
- :36 → `Navigation menu` (aria-label)
- :50 → `Navigation`, :63 → `Social`

### components/utility-menu.tsx
- :50 `Utility menu` (aria-label), :64 `Appearance`, :73 `Light Mode`, :78 `Dark Mode`, :83 `Font Size`, :93 `Small`, :103 `Normal`, :113 `Large`, :123 `Tablet-Ansicht`, :127 `Accessibility`, :134 `Leichte Sprache` (auskommentiert)

### components/testimonials.tsx
- :29 → `Kundenstimmen`

### components/process-steps.tsx
- :23 → `Mein Prozess`

### components/design-approach.tsx
- :20 → `Klarheit & Funktion`
- :22 → Absatz `Mein Designansatz verbindet …`
- :25 → `Kollaboration & Prozess`
- :27 → Absatz `Erfolgreiche Designprojekte entstehen …`
- :32 → `Designansatz & Philosophie` (Fallback-Titel)
- :69 → `Projekt besprechen →`

### components/berlin-design-scene.tsx
- :16 → `Grafikdesign in Berlin`
- :26 → `Die Berliner Designszene`
- :28–30 → Absatz `Berlin ist ein Schmelztiegel …`
- :33–35 → Absatz `Die Stadt vereint …`
- :45 → `Lokale Expertise, globale Perspektive`
- :47–49 → Absatz `Als Grafikdesigner mit Sitz in Berlin-Kreuzberg …`
- :52–54 → Absatz `Ob Start-up aus dem Silicon Allee …`
- :60 → `Projekt in Berlin besprechen →`

### components/site-description-testblock.tsx / -debug.tsx
- beide sind inzwischen Stubs (`return null`), keine Strings mehr.

### components/language-selector.tsx
- `DE` / `EN` – Sprachkürzel, nicht übersetzen.

## Nicht aufgenommen (bewusst)
- `app/schema.tsx` enthält keine eigenen Texte mehr (JSON-LD kommt aus `lib/seo.ts` + CMS).
- `lib/static-data.ts` (Build-Fallback mit veralteten „Grafikdesigner"-Texten) – nicht Teil des Auftrags.
- Kunden-/Plattformnamen (`social_links.platform`, Logo-Namen) bleiben unverändert.
- Entfernte Alt-Strings (nicht mehr im Code, daher nicht in den JSON-Dateien): `Es gab ein Problem beim Senden Ihrer Nachricht. …`, Label `E-mail`, Header-Zusätze `– Design` / `& Full-Stack Development`, Satz ohne Komma `Du hast ein Projekt das auf Umsetzung wartet? …`.
