# Horizon Wealth Planning

A one-page marketing site for a financial-planning firm offering retirement, investment and insurance planning.

**Live site:** https://akigixon.github.io/horizon-wealth-planning/

## Features

- Responsive, mobile-first layout with a hamburger menu that becomes a full nav bar on desktop
- Fade-in scroll reveal and animated statistic counters
- Testimonial carousel showing 1–3 cards depending on screen width, with dots and autoplay
- Enquiry form with inline validation and a simulated submission (nothing is sent anywhere)
- Newsletter sign-up
- Accessibility: respects `prefers-reduced-motion`, screen-reader text for animated numbers, off-screen slides are `inert`, and content stays visible if JavaScript fails

## Tech

Plain HTML, CSS and vanilla JavaScript in a single `index.html`, with no frameworks, build tools or package manager. The only external resources are Google Fonts (Playfair Display and Inter), an Unsplash hero image and randomuser.me avatars.

## Run locally

Open `index.html` in a browser. There is no build step.

## Deployment

`.github/workflows/deploy-pages.yml` deploys the site to GitHub Pages on every push to `main`. The workflow only copies `index.html` into the published site, so if you add new asset files (images, CSS, JS), add them to the workflow's **Prepare site files** step.

## Disclaimer

This is a demo site. The company, address, phone number and email are placeholders, and nothing on the site is financial advice.
