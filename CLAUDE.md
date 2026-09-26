# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

One-page lead-generation site for "Apex Wealth Planning", a Singapore financial planner. Hard constraint from the original brief: **plain HTML/CSS/vanilla JS only — no frameworks, build tools, package manager, or external JS**. Only external resources are Google Fonts (Fraunces for display, Instrument Sans for body) and randomuser.me avatars.

There is no build, lint, or test step. To run, serve the folder over HTTP (e.g. `python -m http.server`) and open it; opening `index.html` from `file://` mostly works but the CSP and storage behave differently there.

Files:
- `index.html`: the page (HTML only, plus the JSON-LD structured data block).
- `assets/site.css`, `assets/site.js`: all styles and behaviour for the page.
- `assets/theme.js`: tiny blocking script in `<head>`; applies the saved light/dark theme before paint, adds the `js` class, and hides the page if it is framed.
- `retirement-checklist.html` + `assets/checklist.css` / `checklist.js`: the lead magnet delivered after sign-up (`noindex`).
- `sitemap.xml`, `assets/favicon.svg`, `assets/og-image.png` (social share image, a 1200×630 screenshot of the hero).

Deployment: `.github/workflows/deploy-pages.yml` publishes to GitHub Pages on every push to `main`. It copies an explicit allow-list of files into `_site/`, so **any new file must be added to its "Prepare site files" step**. Actions are pinned to commit SHAs; Dependabot updates them. The repo's Pages source must be set to "GitHub Actions".

## Security model (read before adding anything)

- A strict Content-Security-Policy `<meta>` in each HTML file allows scripts only from `'self'` and styles only from `'self'` + Google Fonts. **Inline `<script>`, inline `<style>`, `style=""` attributes and `on*=` handlers are blocked.** Put JS in `assets/*.js` and CSS in `assets/*.css`. Setting `element.style.x` from JS is fine. Adding any third-party service (analytics, form backend, CRM) means adding its origin to the matching CSP directive (`script-src`, `connect-src`, `form-action`, `img-src`…).
- GitHub Pages can't send security headers, so `frame-ancestors`/`X-Frame-Options` aren't available; `theme.js` hides the page when it is framed instead.
- Never render user input with `innerHTML`; use `textContent` or DOM methods. `innerHTML` is only used for static markup (stars, spinner, success icon).
- Forms have a hidden honeypot input named `website` inside `.hp-field`, a minimum fill time, and a per-form cooldown (`looksAutomated`, `isThrottled`, `clean` in `site.js`). Bots get the normal success UI but nothing is recorded. These are client-side only; when a real backend is added it must validate, rate-limit and CAPTCHA server-side too.

## Architecture

`site.css` and `site.js` are split into numbered, commented sections. Follow the same pattern when adding features.

- **CSS**: design tokens are on `:root` (harbour slate `--ink #17252B`, copper orange `--orange #E8772E`, `--orange-text` for orange text on light surfaces, stone background `--bg #F3F4F1`, spacing and type scale). Use the tokens, not literal values. `--band` / `--on-band` are the always-dark header, hero, checklist and footer bands. Styles are mobile-first: base rules target mobile, then `@media (min-width: 768px)`, `1024px` (desktop nav replaces the hamburger) and `1200px` (header CTA appears).
- **Themes**: dark tokens are defined twice, under `:root[data-theme="dark"]` and under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`. Keep both blocks identical. The toggle stores `hw-theme` in localStorage. Check contrast (WCAG AA) in both themes for any new colour.
- **JS**: one IIFE in strict mode in `site.js`. `prefersReducedMotion` disables the counters, carousel autoplay and smooth scrolling; the hero sunrise animation is the page's one intentional motion moment.

Cross-cutting behaviours:
- **Scroll reveal**: add `class="reveal"` (optionally `delay-1..3`) to any element. Use sparingly.
- **Stat counters**: `.stat-number` elements are driven by `data-target`, `data-prefix` and `data-suffix`; the HTML holds the final value so it shows without JS. The real value is duplicated in a `.visually-hidden` span for screen readers.
- **Retirement gap calculator** (`#calculator`): inputs are `.calc-range` sliders (`data-format="money"` or `"age"`); `paintSlider` writes the value into the matching `#{id}Value` `<output>`, sets `aria-valuetext` and the `--fill` track position, and `keepAgesApart` stops "retire at" going below "your age". Change ranges with the `min`/`max`/`step` attributes in the HTML. Pure client-side maths (5% return, 2.5% inflation, plan to age 90, CPF LIFE payouts from 65; constants at the top of section 6). Savings must fund the full income until `CPF_LIFE_AGE`, then income minus the CPF payout (`withdrawalAt`). The headline result is `earliestRetirementAge`: the first age where `balanceAt(age) >= neededAt(age)`. The chart is built with `createElementNS`, never `innerHTML`. Any link with `data-interest="…"` pre-selects that option in the enquiry form.
- **Lead magnet** (`#checklist`, `#leadForm`): simulated submit logs the lead, sets `hw-lead` in localStorage and swaps in a thank-you with a link to `retirement-checklist.html`. If you change the number of checklist items, update the "24" in the copy.
- **Slide-in offer** (`#offer`): shown once per session after the visitor scrolls past the calculator (or exit intent on desktop), never while the checklist section is visible and never after sign-up.
- **Carousel**: the number of visible cards comes from the CSS custom property `--visible` on `.carousel` (1, 2 or 3, set per breakpoint). Slides are the children of `#carouselTrack`. Dots, star icons and slide `aria-label`s are generated by JS. To add a testimonial, copy a `.carousel-slide` block and leave `.stars` empty.
- **Enquiry form**: validation is driven by the `validators` map (field name → function returning an error string). Each field needs a matching `<span id="{name}-error">`. The radio group (`contactMethod`) and the consent checkbox are special-cased in `getValue` and `showError`. Submission is simulated (1.5s spinner, JSON logged to the console, then `#formCard` is replaced with a success message).
- **Nav active state**: an IntersectionObserver over `main section[id]` matches each section to a nav link by its `href="#id"`. New sections need an `id` and a matching nav link.

## SEO

- Title, description, canonical, Open Graph and Twitter tags are in `<head>`; the canonical/og URLs point at `https://akigixon.github.io/horizon-wealth-planning/`. Update them all if the domain changes, plus `sitemap.xml`.
- The JSON-LD `@graph` holds `FinancialService` (NAP + opening hours), `WebSite` and `FAQPage`. **The FAQPage questions and answers must match the visible FAQ text**, and the business details must match the contact section.

Contact details (a Singapore address, phone number and email), the stats and the testimonials are placeholders.
