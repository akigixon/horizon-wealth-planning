---
description: Security-scan the repo, then push to GitHub, update README + repo About, and deploy to GitHub Pages via Actions
argument-hint: "[optional commit message]"
allowed-tools: Bash, PowerShell, Read, Write, Edit, Glob, Grep
---

Publish this project to GitHub. Work through the steps below **in order**. The security scan is a hard gate: nothing may be committed, pushed, or sent to GitHub's API until it passes.

Commit message override (may be empty): $ARGUMENTS

## 0. Preflight

1. Confirm the `gh` CLI is available and authenticated: `gh auth status`. On Windows, `gh` may be on the PowerShell PATH but not the Git Bash PATH, so try both shells. If it is missing or not logged in, stop and tell the user to run `winget install GitHub.cli` and/or `gh auth login` themselves. Never ask for or handle a token.
2. Find the repo: `git remote get-url origin`. Derive `OWNER/REPO` from it.
   - If there is no `origin`, ask the user whether to create a new **public** repo with `gh repo create <name> --public --source . --remote origin` (Pages on a free plan needs a public repo). Wait for a clear yes.
3. Note the current branch. Deployment runs from `main`. If you are on another branch, ask before pushing to `main`.

## 1. Security scan (gate, do this before anything leaves the machine)

Scan **everything that would be pushed**: the working tree, staged and unstaged changes, untracked files that aren't ignored, and commits not yet on the remote (`git log origin/main..HEAD -p`, or the full history if the remote branch doesn't exist yet).

Check for:
- **Secrets**: API keys, tokens, and private keys. Grep for things like `AKIA[0-9A-Z]{16}`, `ghp_`, `gho_`, `github_pat_`, `sk-`, `sk_live_`, `pk_live_`, `xox[baprs]-`, `AIza[0-9A-Za-z_-]{35}`, `-----BEGIN .*PRIVATE KEY-----`, and `password\s*[:=]`, `secret\s*[:=]`, `api[_-]?key\s*[:=]`, `token\s*[:=]` with a literal value.
- **Sensitive files**: `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `credentials*`, `*.sqlite`/`*.db`, `.claude/settings.local.json`, and OS or editor junk (`Thumbs.db`, `.DS_Store`, `desktop.ini`). Add any that are present to `.gitignore` (create it if needed) rather than committing them.
- **Personal data**: real emails, phone numbers, addresses, or NRIC/SSN-like IDs. The CLAUDE.md placeholders (the Singapore address, phone and email in `index.html`) are expected. Flag anything else, including the git author email if it would expose a private address the user may not want public (suggest the GitHub `noreply` address, don't change it yourself).
- **Front-end risks in `index.html`**: `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval`/`new Function` with non-constant input; user input written with anything other than `textContent`; `target="_blank"` without `rel="noopener noreferrer"`; `http://` resource URLs (mixed content); external `<script src>` (forbidden by the project brief); forms posting to real endpoints.
- **Workflow risks in `.github/workflows/*.yml`**: over-broad `permissions`, `pull_request_target`, untrusted `${{ github.event.* }}` interpolated into `run:`, and third-party actions not from `actions/*`.
- If `gitleaks` or `trufflehog` is installed, run it too (`gitleaks detect --source . --no-banner`). Don't install anything without asking.

Report findings as a short table: severity, file:line, issue, fix.
- **Critical or high** (a secret, private key, real personal data, or an XSS sink with user input): **STOP**. Don't commit or push. Explain the problem and how to fix it. A secret already in git history must be rotated. Removing it from the latest commit is not enough.
- **Medium or low**: fix them if the fix is trivial and safe (e.g. `.gitignore` entries, `rel="noopener"`). Otherwise list them and ask the user whether to continue.
- If the scan is clean, say so in one line and continue.

## 2. README.md

Create `README.md`, or update it if it exists (keep any sections the user wrote and refresh the stale ones). Base it on `index.html` and `CLAUDE.md`. It should include:
- Title and one-line description (Horizon Wealth Planning: a one-page marketing site for a financial-planning firm)
- A **Live site** link: `https://<owner>.github.io/<repo>/` (lowercase owner)
- Features: responsive mobile-first layout, scroll reveal, animated stat counters, testimonial carousel, validated enquiry form with a simulated submission, accessibility (reduced motion, screen-reader text, `inert` slides)
- Tech: plain HTML/CSS/vanilla JS, no build step, Google Fonts only
- Run locally: open `index.html` in a browser
- Deployment: GitHub Actions → Pages on every push to `main`, and new asset files must be added to the workflow's "Prepare site files" step
- A note that the contact details are placeholders and the site isn't financial advice

Keep it concise. Don't add badges or claims that can't be checked.

## 3. GitHub Pages workflow

Make sure `.github/workflows/deploy-pages.yml` exists and is correct: it triggers on push to `main` plus `workflow_dispatch`, has minimal `permissions` (`contents: read`, `pages: write`, `id-token: write`), and uses `actions/checkout`, `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages`. Its "Prepare site files" step must copy **every** file the site needs (look at `index.html` for local `src`/`href` references and add any that are missing). Don't copy `README.md`, `CLAUDE.md` or `.claude/` into `_site`. Create the workflow if it's missing.

## 4. Commit and push

1. Show `git status` and the list of files to be committed. Stage specific paths, not `git add -A`, so nothing flagged in step 1 gets in.
2. Commit. Use `$ARGUMENTS` as the message if given; otherwise write a concise message that summarises the change. End it with the co-author attribution line required by the current session instructions, if there is one.
3. `git push origin main` (add `-u` if there's no upstream). Never force-push. If the push is rejected, stop and report it instead of rebasing or overwriting.

## 5. Enable Pages (source = GitHub Actions)

```
gh api repos/OWNER/REPO/pages
```
- 404: create it with `gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow`
- It exists but `build_type` isn't `workflow`: `gh api -X PUT repos/OWNER/REPO/pages -f build_type=workflow`

If the first workflow run failed because Pages wasn't enabled yet, re-run it with `gh workflow run deploy-pages.yml`.

## 6. Repo About (description, website, topics)

```
gh repo edit OWNER/REPO \
  --description "One-page marketing site for Horizon Wealth Planning — responsive HTML/CSS/vanilla JS, deployed with GitHub Pages" \
  --homepage "https://<owner>.github.io/<repo>/" \
  --add-topic html --add-topic css --add-topic javascript --add-topic github-pages --add-topic static-site --add-topic financial-planning
```
If a description already exists and the user clearly wrote it, keep it and only set the homepage and topics. Setting `--homepage` is what puts the Pages link in the repo's About panel.

## 7. Verify

1. Find the triggered run: `gh run list --workflow deploy-pages.yml --limit 1`. Then `gh run watch <id> --exit-status` (run it in the background if your tools allow). If it fails, show `gh run view <id> --log-failed` and diagnose.
2. Get the live URL from `gh api repos/OWNER/REPO/pages --jq .html_url` and check that it returns HTTP 200 (`curl -sI <url>`). The first deploy can take a minute or two to go live.
3. Confirm the About panel: `gh repo view OWNER/REPO --json description,homepageUrl,repositoryTopics`.

## 8. Summary

Finish with a short report:
- Security scan result (clean, or what was fixed or accepted)
- Commit SHA pushed
- README created or updated
- About description, homepage and topics set
- Workflow run status and the live Pages URL
- Anything that still needs the user to act
