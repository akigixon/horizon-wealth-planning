/* ==========================================================
   Apex Wealth Planning: site behaviour
   Plain vanilla JS, no dependencies. Loaded with `defer` from an
   external file so the Content-Security-Policy can forbid inline script.
   Never insert user input with innerHTML: always use textContent.
   ========================================================== */
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pageLoadedAt = Date.now();

  /* Small storage wrapper: storage can throw (private mode, blocked cookies) */
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
    session(key, value) {
      try {
        if (value === undefined) return sessionStorage.getItem(key);
        sessionStorage.setItem(key, value);
      } catch (e) { return null; }
      return null;
    }
  };

  /* ==========================================================
     0. SECURITY HELPERS FOR FORMS
     There is no server yet, so these are client-side hygiene, not a
     replacement for server-side validation, rate limiting and CAPTCHA
     once real submission is wired up.
     ========================================================== */
  const MIN_FILL_TIME_MS = 2500;       // humans can't complete a form this fast
  const SUBMIT_COOLDOWN_MS = 30000;    // one submission per form per 30s
  const lastSubmit = new Map();

  // Strips control characters (keeps newlines where allowed) and caps length
  function clean(value, maxLength, allowNewlines) {
    const pattern = allowNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
    return String(value).replace(pattern, ' ').trim().slice(0, maxLength);
  }

  // True when the submission looks automated (honeypot filled or impossibly fast)
  function looksAutomated(form) {
    const honeypot = form.querySelector('input[name="website"]');
    return Boolean(honeypot && honeypot.value) || Date.now() - pageLoadedAt < MIN_FILL_TIME_MS;
  }

  // True when this form was submitted too recently
  function isThrottled(key) {
    const last = lastSubmit.get(key) || 0;
    if (Date.now() - last < SUBMIT_COOLDOWN_MS) return true;
    lastSubmit.set(key, Date.now());
    return false;
  }

  const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

  /* ==========================================================
     1. LIGHT / DARK THEME
     theme.js (in <head>) applies a saved choice before paint;
     this wires up the toggle button.
     ========================================================== */
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    const explicit = root.getAttribute('data-theme');
    if (explicit) return explicit;
    return darkQuery.matches ? 'dark' : 'light';
  }

  function syncThemeUi() {
    const theme = currentTheme();
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeMeta.setAttribute('content', theme === 'dark' ? '#0B1316' : '#17252B');
  }

  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store.set('hw-theme', next);
    syncThemeUi();
    drawChart(); // chart colours come from CSS, but labels are re-measured
  });

  darkQuery.addEventListener('change', syncThemeUi);
  syncThemeUi();

  /* ==========================================================
     2. MOBILE NAVIGATION (hamburger toggle)
     ========================================================== */
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  const navLinks = document.querySelectorAll('.nav-link');

  function setMenu(open) {
    navMenu.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  navToggle.addEventListener('click', () => {
    setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
  });

  navLinks.forEach(link => link.addEventListener('click', () => setMenu(false)));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && navMenu.classList.contains('open')) {
      setMenu(false);
      navToggle.focus();
    }
  });

  document.addEventListener('click', e => {
    if (navMenu.classList.contains('open') && !e.target.closest('.nav')) setMenu(false);
  });

  window.matchMedia('(min-width: 1024px)').addEventListener('change', e => {
    if (e.matches) setMenu(false);
  });

  /* ==========================================================
     3. SCROLL EFFECTS: header border, back-to-top, active link
     ========================================================== */
  const header = document.getElementById('siteHeader');
  const backToTop = document.getElementById('backToTop');

  function onScroll() {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 10);
    backToTop.classList.toggle('visible', y > 600);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  const sections = document.querySelectorAll('main section[id]');
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        const isActive = link.getAttribute('href') === '#' + entry.target.id;
        link.classList.toggle('active', isActive);
        if (isActive) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  sections.forEach(section => sectionObserver.observe(section));

  /* ==========================================================
     4. FADE-IN ON SCROLL (for any element with .reveal)
     ========================================================== */
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  /* ==========================================================
     5. ANIMATED STAT COUNTERS
     The final value is in the HTML so it shows without JS.
     ========================================================== */
  function animateCounter(el) {
    const target = Number(el.dataset.target);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const format = n => prefix + n.toLocaleString('en-SG') + suffix;

    if (prefersReducedMotion) {
      el.textContent = format(target);
      return;
    }

    const duration = 1800;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const counterObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('.stat-number').forEach(el => counterObserver.observe(el));

  /* ==========================================================
     6. RETIREMENT GAP CALCULATOR
     All maths runs locally. Figures are in today's dollars: the growth
     rate is the blend of equities and fixed income chosen on the
     allocation slider, minus inflation, compounded monthly.
     ========================================================== */
  const EQUITY_RETURN = 0.07;        // assumed long-run yearly return on equities
  const FIXED_INCOME_RETURN = 0.035; // assumed long-run yearly return on fixed income
  const INFLATION = 0.025;
  const PLAN_TO_AGE = 90;
  const CPF_LIFE_AGE = 65;           // CPF LIFE payouts start at 65 at the earliest

  const calcForm = document.getElementById('calcForm');
  const calcError = document.getElementById('calcError');
  const calcChart = document.getElementById('calcChart');
  const out = {
    projected: document.getElementById('calcProjected'),
    needed: document.getElementById('calcNeeded'),
    gap: document.getElementById('calcGap'),
    gapLabel: document.getElementById('gapLabel'),
    extra: document.getElementById('calcExtra'),
    projLabel: document.getElementById('projLabel'),
    neededLabel: document.getElementById('neededLabel'),
    earliest: document.getElementById('calcEarliest'),
    earliestNote: document.getElementById('calcEarliestNote'),
    summary: document.getElementById('calcSummary'),
    returnNote: document.getElementById('calcReturn'),
    eqPct: document.getElementById('calcEqPct'),
    fiPct: document.getElementById('calcFiPct'),
    buildTitle: document.getElementById('buildTitle'),
    putIn: document.getElementById('calcPutIn'),
    growth: document.getElementById('calcGrowth'),
    growthShare: document.getElementById('calcGrowthShare'),
    segIn: document.getElementById('segIn'),
    segGrowth: document.getElementById('segGrowth'),
    readout: document.getElementById('chartReadout')
  };

  const numberFmt = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 });
  const compactFmt = new Intl.NumberFormat('en-SG', { notation: 'compact', maximumFractionDigits: 1 });
  const pctFmt = new Intl.NumberFormat('en-SG', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const money = n => 'S$' + numberFmt.format(Math.max(0, Math.round(n)));
  const moneyShort = n => 'S$' + compactFmt.format(Math.max(0, n));

  // Blended yearly return for an equity share (0–1), and the real monthly rate used for compounding
  const blendedReturn = equityShare => equityShare * EQUITY_RETURN + (1 - equityShare) * FIXED_INCOME_RETURN;
  const realMonthlyRate = nominal => Math.pow((1 + nominal) / (1 + INFLATION), 1 / 12) - 1;

  function readInputs() {
    const num = name => {
      const input = calcForm.elements[name];
      const value = Number(input.value);
      if (input.value === '' || !Number.isFinite(value)) return NaN;
      return Math.min(Math.max(value, Number(input.min)), Number(input.max));
    };
    const equity = num('equity') / 100;
    return {
      age: Math.round(num('age')),
      retireAge: Math.round(num('retireAge')),
      savings: num('savings'),
      monthly: num('monthly'),
      income: num('income'),
      cpf: num('cpf'),
      equity,
      nominalReturn: blendedReturn(equity),
      rate: realMonthlyRate(blendedReturn(equity))
    };
  }

  /* Sliders: show the value, fill the track up to the thumb, and give
     screen readers a spoken value such as "S$80,000" or "65 years" */
  const sliders = Array.from(calcForm.querySelectorAll('.calc-range'));
  const ageSlider = calcForm.elements.age;
  const retireSlider = calcForm.elements.retireAge;

  function formatSlider(input) {
    const value = Number(input.value);
    if (input.dataset.format === 'split') return `${value}% equities, ${100 - value}% fixed income`;
    const atMax = value >= Number(input.max) ? '+' : ''; // e.g. "S$2,000,000+" for larger balances
    return input.dataset.format === 'money' ? money(value) + atMax : `${value} years`;
  }

  function paintSlider(input) {
    const pct = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
    const text = formatSlider(input);
    const format = input.dataset.format;
    document.getElementById(`${input.id}Value`).textContent =
      format === 'money' ? text : format === 'split' ? `${input.value} / ${100 - input.value}` : input.value;
    input.setAttribute('aria-valuetext', text);
    if (format === 'split') {
      out.eqPct.textContent = `${input.value}%`;
      out.fiPct.textContent = `${100 - input.value}%`;
      out.returnNote.textContent =
        `Expected return ${pctFmt.format(blendedReturn(input.value / 100))} a year before inflation`;
    }
  }

  // Retirement must stay after today's age: moving one slider nudges the other
  function keepAgesApart(changed) {
    const age = Number(ageSlider.value);
    const retire = Number(retireSlider.value);
    if (retire > age) return;
    if (changed === ageSlider) retireSlider.value = Math.min(age + 1, Number(retireSlider.max));
    else ageSlider.value = Math.max(retire - 1, Number(ageSlider.min));
    // At the extremes (age 75, retire 40) nudging may not be enough, so re-check
    if (Number(retireSlider.value) <= Number(ageSlider.value)) ageSlider.value = Number(retireSlider.value) - 1;
    paintSlider(ageSlider);
    paintSlider(retireSlider);
  }

  // Monthly withdrawal from savings at a given age (in months): the full income
  // until CPF LIFE starts, then the income minus the CPF LIFE payout
  function withdrawalAt(v, ageInMonths) {
    const cpf = ageInMonths >= CPF_LIFE_AGE * 12 ? v.cpf : 0;
    return Math.max(0, v.income - cpf);
  }

  // Savings you'd have at age `retireAge` if you keep saving until then (compounded monthly)
  function balanceAt(v, retireAge) {
    const growth = Math.pow(1 + v.rate, (retireAge - v.age) * 12);
    return v.savings * growth + v.monthly * (growth - 1) / v.rate;
  }

  // Lump sum needed at `retireAge` to fund withdrawals until PLAN_TO_AGE
  function neededAt(v, retireAge) {
    let total = 0;
    let discount = 1;
    for (let m = retireAge * 12; m < PLAN_TO_AGE * 12; m++) {
      discount /= 1 + v.rate;
      total += withdrawalAt(v, m) * discount;
    }
    return total;
  }

  // Earliest age (from today) at which projected savings cover what's needed; null if none before PLAN_TO_AGE
  function earliestRetirementAge(v) {
    for (let r = v.age; r < PLAN_TO_AGE; r++) {
      if (balanceAt(v, r) >= neededAt(v, r)) return r;
    }
    return null;
  }

  function calculate() {
    const v = readInputs();
    if (Object.values(v).some(Number.isNaN) || v.retireAge <= v.age || v.retireAge >= PLAN_TO_AGE) {
      calcError.textContent = 'Move the sliders so your retirement age is later than your current age.';
      return;
    }
    calcError.textContent = '';

    const monthsToRetire = (v.retireAge - v.age) * 12;

    // Year-by-year balance for the chart
    const points = [{ age: v.age, balance: v.savings }];
    let balance = v.savings;
    for (let m = 1; m <= monthsToRetire; m++) {
      balance = balance * (1 + v.rate) + v.monthly;
      if (m % 12 === 0) points.push({ age: v.age + m / 12, balance });
    }
    const projected = balance;

    let runOutAge = null;
    for (let m = v.retireAge * 12; m < PLAN_TO_AGE * 12; m++) {
      balance = balance * (1 + v.rate) - withdrawalAt(v, m);
      if (balance <= 0 && runOutAge === null) runOutAge = Math.floor((m + 1) / 12);
      if ((m + 1) % 12 === 0) points.push({ age: (m + 1) / 12, balance: Math.max(0, balance) });
    }

    const needed = neededAt(v, v.retireAge);
    const gap = needed - projected;
    const growthFactor = (Math.pow(1 + v.rate, monthsToRetire) - 1) / v.rate;
    const extraMonthly = gap > 0 ? gap / growthFactor : 0;
    const earliest = earliestRetirementAge(v);

    // Compounding effect: what you put in vs what investment growth adds
    const putIn = v.savings + v.monthly * monthsToRetire;
    const growthAmount = Math.max(0, projected - putIn);
    const growthShare = projected > 0 ? growthAmount / projected : 0;

    // Headline: the earliest age you could retire
    if (earliest === null) {
      out.earliest.textContent = `Not before ${PLAN_TO_AGE}`;
      out.earliestNote.textContent = 'at your current savings rate';
    } else if (earliest === v.age) {
      out.earliest.textContent = 'Now';
      out.earliestNote.textContent = 'your savings already cover it';
    } else {
      out.earliest.textContent = `Age ${earliest}`;
      const years = earliest - v.age;
      out.earliestNote.textContent = `${years} ${years === 1 ? 'year' : 'years'} from now`;
    }

    const earliestText = earliest === null ? `not before ${PLAN_TO_AGE}`
      : earliest === v.age ? 'right now' : `at age ${earliest}`;
    const cpfNote = v.retireAge < CPF_LIFE_AGE
      ? `, with CPF LIFE adding ${money(v.cpf)} a month from ${CPF_LIFE_AGE}`
      : ` including your ${money(v.cpf)} CPF LIFE payout`;
    const mixNote = `With ${Math.round(v.equity * 100)}% in equities and ${Math.round((1 - v.equity) * 100)}% in fixed income ` +
      `(about ${pctFmt.format(v.nominalReturn)} a year), compound growth adds ${money(growthAmount)} to the ${money(putIn)} you put in. `;

    out.projLabel.textContent = `Your retirement fund at ${v.retireAge}`;
    out.projected.textContent = money(projected);
    out.neededLabel.textContent = `You'll need at ${v.retireAge}`;
    out.needed.textContent = money(needed);

    out.buildTitle.textContent = `How your ${money(projected)} builds up by ${v.retireAge}`;
    out.putIn.textContent = money(putIn);
    out.growth.textContent = money(growthAmount);
    out.growthShare.textContent = `${Math.round(growthShare * 100)}% of your fund comes from compounding`;
    out.segIn.style.flexGrow = String(Math.max(0.0001, 1 - growthShare));
    out.segGrowth.style.flexGrow = String(Math.max(0.0001, growthShare));

    if (gap > 0) {
      out.gapLabel.textContent = 'Your gap';
      out.gap.textContent = money(gap);
      out.extra.textContent = money(extraMonthly);
      out.summary.textContent = mixNote +
        `At your current pace, the earliest you could retire is ${earliestText}. ` +
        `If you retire at ${v.retireAge}, your savings would run out around age ${runOutAge}. ` +
        `To have ${money(v.income)} a month until ${PLAN_TO_AGE}${cpfNote}, you'd need about ${money(needed)} ` +
        `at ${v.retireAge}, which is ${money(gap)} more than you're on track for. ` +
        `Saving roughly ${money(extraMonthly)} more each month would close it.`;
    } else {
      out.gapLabel.textContent = 'Your surplus';
      out.gap.textContent = money(-gap);
      out.extra.textContent = money(0);
      out.summary.textContent = mixNote +
        `You're on track, and you could retire as early as ${earliest === v.age ? 'now' : `age ${earliest}`}. ` +
        `Retiring at ${v.retireAge}, your fund covers the ${money(needed)} needed for ` +
        `${money(v.income)} a month until ${PLAN_TO_AGE}${cpfNote}, leaving ${money(-gap)} to spare.`;
    }

    chart.update({ v, points, projected, needed, earliest });
  }

  /* ----------------------------------------------------------
     6b. Animated chart
     The data is resampled to a fixed number of points so any two
     states can be tweened smoothly while sliders move. It draws
     itself in the first time it scrolls into view. Built with DOM
     methods only (no innerHTML), so no markup injection is possible.
     ---------------------------------------------------------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  const chart = (() => {
    const W = 600, H = 300, padR = 18, padB = 34;
    let padL = 60;
    let padT = 34;
    let k = 1; // label scale: the SVG shrinks on phones, so its text and pills grow to stay readable
    const SAMPLES = 121;
    const TWEEN_MS = 520;
    let shown = null;      // state currently on screen
    let target = null;     // state we're animating towards
    let tweenFrom = null;
    let tweenStart = 0;
    let frame = 0;
    let hoverAge = null;
    let introState = 'pending'; // pending -> playing -> done

    // Rounds the axis maximum up to a tidy number (1, 2, 2.5 or 5 x 10^n)
    function niceCeil(value) {
      if (value <= 0) return 1;
      const exp = Math.pow(10, Math.floor(Math.log10(value)));
      const f = value / exp;
      const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
      return nice * exp;
    }

    function toState(r) {
      const { v, points } = r;
      const bal = [];
      const putIn = [];
      const span = PLAN_TO_AGE - v.age;
      for (let i = 0; i < SAMPLES; i++) {
        const age = v.age + span * i / (SAMPLES - 1);
        const k = Math.min(points.length - 2, Math.floor(age - v.age));
        const a = points[k], b = points[k + 1];
        const t = Math.min(1, Math.max(0, age - a.age));
        bal.push(a.balance + (b.balance - a.balance) * t);
        const years = Math.min(age, v.retireAge) - v.age;
        putIn.push(v.savings + v.monthly * 12 * years);
      }
      const peak = Math.max(r.needed, ...bal);
      return {
        startAge: v.age, retireAge: v.retireAge, earliest: r.earliest,
        needed: r.needed, projected: r.projected, maxY: niceCeil(peak * 1.08),
        bal, putIn
      };
    }

    const ease = t => 1 - Math.pow(1 - t, 3);
    const lerp = (a, b, t) => a + (b - a) * t;

    function mix(a, b, t) {
      return {
        startAge: lerp(a.startAge, b.startAge, t),
        retireAge: lerp(a.retireAge, b.retireAge, t),
        earliest: b.earliest,
        needed: lerp(a.needed, b.needed, t),
        projected: lerp(a.projected, b.projected, t),
        maxY: lerp(a.maxY, b.maxY, t),
        bal: a.bal.map((x, i) => lerp(x, b.bal[i], t)),
        putIn: a.putIn.map((x, i) => lerp(x, b.putIn[i], t))
      };
    }

    function render(s) {
      k = calcChart.clientWidth && calcChart.clientWidth < 480 ? 1.65 : 1;
      padL = k > 1 ? 86 : 60;
      padT = k > 1 ? 50 : 34;
      calcChart.classList.toggle('is-compact', k > 1);
      const span = PLAN_TO_AGE - s.startAge;
      const x = age => padL + (age - s.startAge) / span * (W - padL - padR);
      const y = val => H - padB - Math.max(0, val) / s.maxY * (H - padT - padB);
      const ageAt = i => s.startAge + span * i / (SAMPLES - 1);
      const base = y(0);
      const f = n => n.toFixed(1);

      calcChart.replaceChildren();

      // Gradient under the balance line
      const defs = svgEl('defs', {});
      const grad = svgEl('linearGradient', { id: 'chartFill', x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.append(svgEl('stop', { offset: '0%', class: 'chart-stop-top' }), svgEl('stop', { offset: '100%', class: 'chart-stop-bottom' }));
      defs.append(grad);
      calcChart.append(defs);

      // Retirement zone
      const rx = x(s.retireAge);
      calcChart.append(svgEl('rect', { class: 'chart-zone', x: f(rx), y: padT, width: f(W - padR - rx), height: f(base - padT) }));
      calcChart.append(svgEl('text', { class: 'chart-zone-label', x: f(W - padR - 8), y: f(padT + 14 * k), 'text-anchor': 'end' }, 'Retirement'));

      // Grid + y labels
      for (let g = 0; g <= 4; g++) {
        const val = s.maxY * g / 4;
        calcChart.append(svgEl('line', { class: g ? 'chart-grid' : 'chart-baseline', x1: padL, x2: W - padR, y1: f(y(val)), y2: f(y(val)) }));
        calcChart.append(svgEl('text', { class: 'chart-axis-label', x: padL - 10, y: f(y(val) + 4), 'text-anchor': 'end' }, moneyShort(val)));
      }

      // X labels every 10 years (plus today's age)
      const start = Math.round(s.startAge);
      calcChart.append(svgEl('text', { class: 'chart-axis-label', x: f(x(s.startAge)), y: f(H - 10 + 4 * (k - 1)), 'text-anchor': 'start' }, `Age ${start}`));
      for (let a = Math.ceil((s.startAge + (k > 1 ? 11 : 7)) / 10) * 10; a <= PLAN_TO_AGE; a += 10) {
        calcChart.append(svgEl('text', { class: 'chart-axis-label', x: f(x(a)), y: f(H - 10 + 4 * (k - 1)), 'text-anchor': a === PLAN_TO_AGE ? 'end' : 'middle' }, String(a)));
      }

      // Balance area + line
      const pts = s.bal.map((b, i) => `${f(x(ageAt(i)))},${f(y(b))}`);
      const linePath = 'M' + pts.join(' L');
      calcChart.append(svgEl('path', { class: 'chart-area', d: `${linePath} L${f(W - padR)},${f(base)} L${f(padL)},${f(base)} Z` }));

      // Money you put in (only while you're still saving)
      const inPts = [];
      for (let i = 0; i < SAMPLES && ageAt(i) <= s.retireAge + 0.001; i++) inPts.push(`${f(x(ageAt(i)))},${f(y(s.putIn[i]))}`);
      if (inPts.length > 1) calcChart.append(svgEl('path', { class: 'chart-putin', d: 'M' + inPts.join(' L') }));

      calcChart.append(svgEl('path', { class: 'chart-line', d: linePath, pathLength: 1 }));

      // Needed at retirement
      const needY = y(s.needed);
      calcChart.append(svgEl('line', { class: 'chart-need chart-mark', x1: padL, x2: f(rx), y1: f(needY), y2: f(needY) }));
      calcChart.append(svgEl('text', { class: 'chart-need-label chart-mark', x: padL + 8, y: f(needY - 8 * k) },
        `Needed at ${Math.round(s.retireAge)}: ${moneyShort(s.needed)}`));

      // Earliest possible retirement
      if (s.earliest !== null && s.earliest > s.startAge + 0.5) {
        const ex = x(s.earliest);
        calcChart.append(svgEl('line', { class: 'chart-earliest chart-mark', x1: f(ex), x2: f(ex), y1: padT - 4, y2: f(base) }));
        const label = `Earliest: ${s.earliest}`;
        const w = (label.length * 6.4 + 16) * k;
        const lx = Math.min(Math.max(ex - w / 2, padL), W - padR - w);
        const g = svgEl('g', { class: 'chart-mark' });
        g.append(svgEl('rect', { class: 'chart-pill-earliest', x: f(lx), y: f(padT - 6 - 20 * k), width: f(w), height: f(20 * k), rx: f(10 * k) }),
          svgEl('text', { class: 'chart-pill-text', x: f(lx + w / 2), y: f(padT - 6 - 6 * k), 'text-anchor': 'middle' }, label));
        calcChart.append(g);
      }

      // Peak: the retirement fund, with a halo and a label
      const py = y(s.projected);
      const peak = svgEl('g', { class: 'chart-mark chart-peak' });
      const plabel = `${moneyShort(s.projected)} at ${Math.round(s.retireAge)}`;
      const pw = (plabel.length * 6.6 + 18) * k;
      const ph = 22 * k;
      const plx = Math.min(Math.max(rx - pw / 2, padL), W - padR - pw);
      let ply = Math.max(padT + 2, py - 12 - ph);
      // If the pill would sit on top of the "Needed at" label, drop it below the point instead
      const needText = `Needed at ${Math.round(s.retireAge)}: ${moneyShort(s.needed)}`;
      const nx2 = padL + 8 + needText.length * 6.3 * k;
      const ny1 = needY - 8 * k - 13 * k, ny2 = needY - 8 * k + 3;
      if (plx < nx2 && ply < ny2 && ply + ph > ny1) ply = Math.min(py + 14, base - ph - 4);
      peak.append(
        svgEl('circle', { class: 'chart-halo', cx: f(rx), cy: f(py), r: 10 }),
        svgEl('circle', { class: 'chart-dot', cx: f(rx), cy: f(py), r: 5 }),
        svgEl('rect', { class: 'chart-pill', x: f(plx), y: f(ply), width: f(pw), height: f(ph), rx: f(ph / 2) }),
        svgEl('text', { class: 'chart-pill-text chart-pill-text-dark', x: f(plx + pw / 2), y: f(ply + ph * 0.68), 'text-anchor': 'middle' }, plabel)
      );
      calcChart.append(peak);

      // Hover / keyboard readout
      if (hoverAge !== null && hoverAge >= s.startAge) {
        const i = Math.round((hoverAge - s.startAge) / span * (SAMPLES - 1));
        const val = s.bal[Math.min(SAMPLES - 1, Math.max(0, i))];
        const hx = x(hoverAge), hy = y(val);
        const tip = svgEl('g', { class: 'chart-tip' });
        const tw = 118 * k, th = 40 * k;
        const tx = hx + 12 + tw > W - padR ? hx - 12 - tw : hx + 12;
        const ty = Math.min(Math.max(hy - th - 6, padT), base - th - 6);
        tip.append(
          svgEl('line', { class: 'chart-tip-line', x1: f(hx), x2: f(hx), y1: padT, y2: f(base) }),
          svgEl('circle', { class: 'chart-dot', cx: f(hx), cy: f(hy), r: 5 }),
          svgEl('rect', { class: 'chart-tip-box', x: f(tx), y: f(ty), width: f(tw), height: f(th), rx: 8 }),
          svgEl('text', { class: 'chart-tip-age', x: f(tx + 10 * k), y: f(ty + 16 * k) }, `Age ${hoverAge}`),
          svgEl('text', { class: 'chart-tip-value', x: f(tx + 10 * k), y: f(ty + 32 * k) }, money(val))
        );
        calcChart.append(tip);
      }
    }

    function step(now) {
      const t = Math.min(1, (now - tweenStart) / TWEEN_MS);
      shown = mix(tweenFrom, target, ease(t));
      render(shown);
      if (t < 1) frame = requestAnimationFrame(step);
    }

    function update(result) {
      target = toState(result);
      cancelAnimationFrame(frame);
      if (introState === 'playing') finishIntro();
      if (!shown || prefersReducedMotion || introState === 'pending') {
        shown = target;
        render(shown);
        return;
      }
      tweenFrom = shown;
      tweenStart = performance.now();
      frame = requestAnimationFrame(step);
    }

    function finishIntro() {
      introState = 'done';
      calcChart.classList.remove('is-pending', 'is-intro');
    }

    // Draw-in the first time the chart is seen
    if (prefersReducedMotion) {
      introState = 'done';
    } else {
      calcChart.classList.add('is-pending');
      new IntersectionObserver((entries, obs) => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        introState = 'playing';
        calcChart.classList.remove('is-pending');
        calcChart.classList.add('is-intro');
        setTimeout(() => { if (introState === 'playing') finishIntro(); }, 2200);
      }, { threshold: 0.45 }).observe(calcChart);
    }

    // Hover or touch to read the balance at any age
    function balanceFor(age) {
      const i = Math.round((age - shown.startAge) / (PLAN_TO_AGE - shown.startAge) * (SAMPLES - 1));
      return shown.bal[Math.min(SAMPLES - 1, Math.max(0, i))];
    }

    function setHover(age) {
      hoverAge = age;
      if (shown) render(shown);
      out.readout.textContent = age === null || !shown ? '' : `Age ${age}: ${money(balanceFor(age))}`;
    }

    calcChart.addEventListener('pointermove', e => {
      if (!shown || introState === 'playing') return;
      const r = calcChart.getBoundingClientRect();
      const vx = (e.clientX - r.left) / r.width * W;
      const age = Math.round(shown.startAge + (vx - padL) / (W - padL - padR) * (PLAN_TO_AGE - shown.startAge));
      setHover(Math.min(PLAN_TO_AGE, Math.max(Math.round(shown.startAge), age)));
    });
    calcChart.addEventListener('pointerleave', () => setHover(null));
    calcChart.addEventListener('blur', () => setHover(null));
    calcChart.addEventListener('keydown', e => {
      if (!shown || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const startAge = Math.round(shown.startAge);
      const current = hoverAge === null ? Math.round(shown.retireAge) : hoverAge;
      setHover(Math.min(PLAN_TO_AGE, Math.max(startAge, current + (e.key === 'ArrowRight' ? 1 : -1))));
    });

    window.addEventListener('resize', () => { if (shown) render(shown); });

    return { update, redraw: () => { if (shown) render(shown); } };
  })();

  function drawChart() { chart.redraw(); }

  let calcFrame = 0;
  calcForm.addEventListener('input', e => {
    if (!e.target.classList.contains('calc-range')) return;
    if (e.target === ageSlider || e.target === retireSlider) keepAgesApart(e.target);
    paintSlider(e.target);
    cancelAnimationFrame(calcFrame);
    calcFrame = requestAnimationFrame(calculate); // updates live while dragging
  });
  calcForm.addEventListener('submit', e => { e.preventDefault(); calculate(); });
  sliders.forEach(paintSlider);
  calculate();

  /* Links with data-interest pre-select that option in the enquiry form */
  /* (delegated, so links added later, like the checklist thank-you, work too) */
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-interest]');
    const select = document.getElementById('interest');
    if (!link || !select) return;
    const wanted = link.getAttribute('data-interest');
    if (Array.from(select.options).some(o => o.value === wanted)) select.value = wanted;
  });

  /* ==========================================================
     7. TESTIMONIAL CAROUSEL
     ========================================================== */
  const carousel = document.getElementById('carousel');
  const track = document.getElementById('carouselTrack');
  const slides = Array.from(track.children);
  const dotsWrap = document.getElementById('carouselDots');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  const AUTOPLAY_DELAY = 6000;

  let current = 0;
  let visible = 1;
  let timer = null;
  let isHovered = false;
  let hasFocus = false;

  // Star icons are static markup (no user data), so innerHTML is safe here
  const starSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  document.querySelectorAll('.stars').forEach(el => { el.innerHTML = starSvg.repeat(5); });

  slides.forEach((slide, i) => slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`));

  const maxIndex = () => Math.max(0, slides.length - visible);

  function readVisible() {
    return parseInt(getComputedStyle(carousel).getPropertyValue('--visible'), 10) || 1;
  }

  function buildDots() {
    dotsWrap.replaceChildren();
    for (let i = 0; i <= maxIndex(); i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
      dot.setAttribute('aria-controls', 'carouselTrack');
      dot.addEventListener('click', () => { goTo(i); restartAutoplay(); });
      dotsWrap.appendChild(dot);
    }
  }

  function update() {
    track.style.transform = `translateX(-${current * (100 / visible)}%)`;

    slides.forEach((slide, i) => {
      const inView = i >= current && i < current + visible;
      slide.setAttribute('aria-hidden', String(!inView));
      if ('inert' in slide) slide.inert = !inView;
    });

    Array.from(dotsWrap.children).forEach((dot, i) => {
      if (i === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function goTo(index) {
    const max = maxIndex();
    if (index > max) index = 0;
    if (index < 0) index = max;
    current = index;
    update();
  }

  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  function startAutoplay() {
    if (prefersReducedMotion || isHovered || hasFocus || timer) return;
    track.setAttribute('aria-live', 'off');
    timer = setInterval(next, AUTOPLAY_DELAY);
  }

  function stopAutoplay() {
    clearInterval(timer);
    timer = null;
    track.setAttribute('aria-live', 'polite');
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  nextBtn.addEventListener('click', () => { next(); restartAutoplay(); });
  prevBtn.addEventListener('click', () => { prev(); restartAutoplay(); });

  carousel.addEventListener('mouseenter', () => { isHovered = true; stopAutoplay(); });
  carousel.addEventListener('mouseleave', () => { isHovered = false; startAutoplay(); });
  carousel.addEventListener('focusin', () => { hasFocus = true; stopAutoplay(); });
  carousel.addEventListener('focusout', e => {
    if (!carousel.contains(e.relatedTarget)) { hasFocus = false; startAutoplay(); }
  });

  carousel.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  const SWIPE_THRESHOLD = 50;

  track.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
    stopAutoplay();
  }, { passive: true });

  track.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
    startAutoplay();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoplay(); else startAutoplay();
  });

  function handleResize() {
    const newVisible = readVisible();
    if (newVisible !== visible) {
      visible = newVisible;
      buildDots();
      current = Math.min(current, maxIndex());
      update();
    }
  }

  window.addEventListener('resize', handleResize);

  visible = readVisible();
  buildDots();
  update();
  startAutoplay();

  /* ==========================================================
     8. CHECKLIST LEAD FORM (lead magnet)
     Submission is simulated: data is logged, then the checklist
     is delivered instantly on the thank-you state.
     ========================================================== */
  const leadForm = document.getElementById('leadForm');
  const leadFormWrap = document.getElementById('leadFormWrap');
  const offer = document.getElementById('offer');

  function setBandError(input, message) {
    document.getElementById(`${input.id}-error`).textContent = message;
    input.classList.toggle('invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function validateLead() {
    const name = leadForm.elements.firstName;
    const email = leadForm.elements.email;
    const nameVal = clean(name.value, 60);
    const emailVal = clean(email.value, 254);
    const nameErr = nameVal.length < 1 ? 'Enter your first name so we know what to call you.'
      : /[<>]/.test(nameVal) ? 'Remove the < and > characters from your name.' : '';
    const emailErr = !emailVal ? 'Enter your email so we can send the checklist.'
      : !EMAIL_RE.test(emailVal) ? 'Check your email address, for example name@example.com.' : '';
    setBandError(name, nameErr);
    setBandError(email, emailErr);
    if (nameErr) name.focus(); else if (emailErr) email.focus();
    return !nameErr && !emailErr ? { firstName: nameVal, email: emailVal } : null;
  }

  function showLeadSuccess(firstName) {
    const box = document.createElement('div');
    box.className = 'lead-success';
    box.setAttribute('role', 'status');
    box.setAttribute('tabindex', '-1');

    const h = document.createElement('h3');
    h.textContent = `It's on its way, ${firstName}.`; // textContent: never render input as HTML
    const p = document.createElement('p');
    p.textContent = 'We have also emailed you a copy. Open it now, then book a free call if you want help with any of the items.';

    const actions = document.createElement('div');
    actions.className = 'calc-actions';
    const open = document.createElement('a');
    open.className = 'btn btn-primary';
    open.href = 'retirement-checklist.html';
    open.textContent = 'Open the checklist';
    const book = document.createElement('a');
    book.className = 'btn btn-ghost';
    book.href = '#contact';
    book.setAttribute('data-interest', 'Retirement Planning');
    book.textContent = 'Book a free consultation';
    actions.append(open, book);

    box.append(h, p, actions);
    leadFormWrap.replaceChildren(box);
    box.focus();
  }

  leadForm.addEventListener('submit', e => {
    e.preventDefault();
    const data = validateLead();
    if (!data) return;

    store.set('hw-lead', '1');
    hideOffer();

    if (looksAutomated(leadForm) || isThrottled('lead')) {
      showLeadSuccess(data.firstName); // show the same result, but don't record it
      return;
    }

    console.log('Checklist lead:', JSON.stringify({ ...data, source: 'checklist', submittedAt: new Date().toISOString() }));
    showLeadSuccess(data.firstName);
  });

  ['firstName', 'email'].forEach(name => {
    const input = leadForm.elements[name];
    input.addEventListener('input', () => { if (input.classList.contains('invalid')) setBandError(input, ''); });
  });

  /* ==========================================================
     9. CHECKLIST SLIDE-IN OFFER
     Appears once per visit after the visitor has read past the
     calculator (or moves to leave on desktop). Never shown again
     after they dismiss it or sign up.
     ========================================================== */
  const offerClose = document.getElementById('offerClose');
  const offerCta = document.getElementById('offerCta');
  const checklistSection = document.getElementById('checklist');
  let offerShown = false;
  let checklistInView = false;

  function canShowOffer() {
    return !offerShown && !checklistInView && store.get('hw-lead') !== '1' && store.session('hw-offer') !== 'seen' &&
      !inviteIsOpen() && store.session('hw-invite') !== 'seen'; // never stack with the lunch talk invitation
  }

  function showOffer() {
    if (!canShowOffer()) return;
    offerShown = true;
    store.session('hw-offer', 'seen');
    offer.classList.add('visible');
  }

  function hideOffer() {
    offer.classList.remove('visible');
  }

  offerClose.addEventListener('click', hideOffer);
  offerCta.addEventListener('click', hideOffer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideOffer(); });

  new IntersectionObserver(entries => {
    entries.forEach(entry => {
      checklistInView = entry.isIntersecting;
      if (checklistInView) hideOffer();
    });
  }).observe(checklistSection);

  // Trigger 1: the visitor has scrolled past the calculator and the
  // checklist section itself is off screen (so we don't offer what they can see)
  const calculatorSection = document.getElementById('calculator');
  function onScrollOffer() {
    if (!canShowOffer()) {
      if (offerShown) window.removeEventListener('scroll', onScrollOffer);
      return;
    }
    if (calculatorSection.getBoundingClientRect().bottom < 0) showOffer();
  }
  window.addEventListener('scroll', onScrollOffer, { passive: true });

  // Trigger 2: exit intent on desktop (pointer leaves through the top edge)
  document.addEventListener('mouseout', e => {
    if (!e.relatedTarget && e.clientY <= 0 && Date.now() - pageLoadedAt > 8000) showOffer();
  });

  /* ==========================================================
     10. LUNCH TALK INVITATION
     Opens after 10 seconds of *visible* time on the page, once per
     visit, and stops appearing once the event date has passed.
     Dismissing it snoozes it for a few days; signing up hides it for good.
     To run a new event: update the dialog copy, the Event JSON-LD and
     EVENT_ENDS_AT below.
     ========================================================== */
  const EVENT_ENDS_AT = new Date('2026-09-30T12:30:00+08:00').getTime(); // talk starts (Singapore time): sign-ups close
  const INVITE_DELAY_MS = 10000;
  const INVITE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

  const invite = document.getElementById('invite');
  const inviteBody = document.getElementById('inviteBody');
  const inviteForm = document.getElementById('inviteForm');
  const inviteEmail = document.getElementById('inviteEmail');
  const announce = document.getElementById('announce');
  const eventUpcoming = Date.now() < EVENT_ENDS_AT;
  const dialogSupported = typeof invite.showModal === 'function';

  function inviteIsOpen() { return invite.open; }

  function inviteAllowedAutomatically() {
    const snoozedUntil = Number(store.get('hw-invite-snooze')) || 0;
    return eventUpcoming && dialogSupported &&
      store.get('hw-invite') !== 'registered' &&
      store.session('hw-invite') !== 'seen' &&
      Date.now() > snoozedUntil;
  }

  function openInvite() {
    if (!dialogSupported || invite.open) return;
    hideOffer();
    setMenu(false);
    store.session('hw-invite', 'seen');
    invite.showModal();
  }

  // Don't interrupt someone who is typing into a form or has the mobile menu open
  function visitorIsBusy() {
    const active = document.activeElement;
    return Boolean(active && active.closest('form') && active.matches('input, textarea, select')) ||
      navMenu.classList.contains('open');
  }

  if (eventUpcoming && dialogSupported && store.get('hw-invite') !== 'registered') {
    announce.hidden = false;
    document.getElementById('announceBtn').addEventListener('click', openInvite);
  }

  if (inviteAllowedAutomatically()) {
    let visibleMs = 0;
    let lastTick = Date.now();
    const inviteTimer = setInterval(() => {
      const now = Date.now();
      if (!document.hidden) visibleMs += now - lastTick; // time in a background tab doesn't count
      lastTick = now;
      if (visibleMs < INVITE_DELAY_MS || visitorIsBusy()) return;
      clearInterval(inviteTimer);
      if (inviteAllowedAutomatically()) openInvite();
    }, 500);
  }

  document.getElementById('inviteClose').addEventListener('click', () => invite.close('dismissed'));

  // Clicking the dimmed backdrop (outside the dialog box) closes it
  invite.addEventListener('click', e => {
    if (e.target !== invite) return;
    const r = invite.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) invite.close('dismissed');
  });

  invite.addEventListener('close', () => {
    if (store.get('hw-invite') !== 'registered') store.set('hw-invite-snooze', String(Date.now() + INVITE_SNOOZE_MS));
  });

  function showInviteSuccess(email) {
    const box = document.createElement('div');
    box.className = 'invite-success';
    box.setAttribute('role', 'status');
    box.setAttribute('tabindex', '-1');

    const h = document.createElement('h3');
    h.textContent = 'Your seat request is in';
    const p = document.createElement('p');
    p.textContent = `We'll send your invitation for Wednesday, 30 September, 12:30pm to 1:30pm, to ${email}. Check your inbox and confirm your seat, as places are limited.`; // textContent: never render input as HTML

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'btn btn-primary';
    done.textContent = 'Done';
    done.addEventListener('click', () => invite.close('registered'));

    box.append(h, p, done);
    inviteBody.replaceChildren(box);
    box.focus();
  }

  inviteForm.addEventListener('submit', e => {
    e.preventDefault();
    const value = clean(inviteEmail.value, 254);
    const error = !value ? 'Enter your email so we can send your invitation.'
      : !EMAIL_RE.test(value) ? 'Check your email address, for example name@example.com.' : '';

    document.getElementById('inviteEmail-error').textContent = error;
    inviteEmail.classList.toggle('invalid', Boolean(error));
    inviteEmail.setAttribute('aria-invalid', String(Boolean(error)));
    if (error) { inviteEmail.focus(); return; }

    store.set('hw-invite', 'registered');
    if (!looksAutomated(inviteForm) && !isThrottled('invite')) {
      console.log('Lunch talk registration:', JSON.stringify({ email: value, event: '2026-09-30 lunch talk', submittedAt: new Date().toISOString() }));
    }
    showInviteSuccess(value);
    announce.hidden = true;
  });

  inviteEmail.addEventListener('input', () => {
    if (!inviteEmail.classList.contains('invalid')) return;
    inviteEmail.classList.remove('invalid');
    inviteEmail.removeAttribute('aria-invalid');
    document.getElementById('inviteEmail-error').textContent = '';
  });

  /* ==========================================================
     11. WHATSAPP CHAT WIDGET ("Ollie" the otter)
     Without JS the launcher is a plain wa.me link. With JS it opens a
     small panel; every choice opens WhatsApp with the message pre-filled.
     The number lives in WHATSAPP_NUMBER and in the two wa.me links in index.html.
     ========================================================== */
  const WHATSAPP_NUMBER = '6590019980'; // country code + number, digits only
  const chatLauncher = document.getElementById('chatLauncher');
  const chatPanel = document.getElementById('chatPanel');
  const chatForm = document.getElementById('chatForm');
  const chatMessage = document.getElementById('chatMessage');

  // The user's text only ever travels as an encoded URL parameter to WhatsApp
  function openWhatsApp(text) {
    const url = `https://wa.me/${WHATSAPP_NUMBER}` + (text ? `?text=${encodeURIComponent(text)}` : '');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function setChat(open) {
    chatPanel.hidden = !open;
    chatLauncher.setAttribute('aria-expanded', String(open));
    chatLauncher.setAttribute('aria-label', open ? 'Close chat' : 'Chat with Apex Wealth on WhatsApp');
    if (open) {
      hideOffer();
      chatPanel.querySelector('.chat-chip:not([hidden])').focus();
    }
  }

  chatLauncher.setAttribute('role', 'button');
  chatLauncher.setAttribute('aria-controls', 'chatPanel');
  chatLauncher.setAttribute('aria-expanded', 'false');
  chatLauncher.addEventListener('click', e => {
    e.preventDefault();
    setChat(chatPanel.hidden);
  });
  chatLauncher.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); setChat(chatPanel.hidden); } // buttons also respond to Space
  });

  document.getElementById('chatClose').addEventListener('click', () => { setChat(false); chatLauncher.focus(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !chatPanel.hidden) { setChat(false); chatLauncher.focus(); }
  });

  document.addEventListener('click', e => {
    if (!chatPanel.hidden && !e.target.closest('#chat')) setChat(false);
  });

  // The lunch talk chip only makes sense while sign-ups are open
  chatPanel.querySelectorAll('[data-event-only]').forEach(chip => { chip.hidden = !eventUpcoming; });

  chatPanel.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', () => openWhatsApp(chip.getAttribute('data-wa')));
  });

  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = clean(chatMessage.value, 500);
    openWhatsApp(text);
    chatForm.reset();
  });

  /* ==========================================================
     12. ENQUIRY FORM VALIDATION & SUBMISSION
     ========================================================== */
  const form = document.getElementById('enquiryForm');
  const formCard = document.getElementById('formCard');
  const submitBtn = document.getElementById('submitBtn');
  const PHONE_RE = /^\d{8,15}$/;

  // Validation rules: each returns an error message, or '' if valid
  const validators = {
    fullName: v => {
      const t = clean(v, 100);
      if (!t) return 'Enter your full name.';
      if (t.length < 2) return 'Your name needs at least 2 characters.';
      if (/[<>]/.test(t)) return 'Remove the < and > characters from your name.';
      return '';
    },
    email: v => {
      const t = clean(v, 254);
      if (!t) return 'Enter your email address.';
      if (!EMAIL_RE.test(t)) return 'Check your email address, for example name@example.com.';
      return '';
    },
    phone: v => {
      const t = v.trim();
      if (!t) return 'Enter your phone number.';
      if (!/^\d+$/.test(t)) return 'Use digits only, with no spaces or symbols.';
      if (!PHONE_RE.test(t)) return 'Phone numbers are 8 to 15 digits long.';
      return '';
    },
    ageRange: v => (v ? '' : 'Select your age range.'),
    interest: v => (v ? '' : 'Select what you would like help with.'),
    contactMethod: v => (v ? '' : 'Choose how you would like us to contact you.'),
    message: v => {
      const t = clean(v, 2000, true);
      if (!t) return 'Enter a short message about your goals.';
      if (t.length < 10) return 'Add a little more detail (at least 10 characters).';
      return '';
    },
    consent: v => (v ? '' : 'Tick the box so we are allowed to reply to your enquiry.')
  };

  function getValue(name) {
    if (name === 'contactMethod') {
      const checked = form.querySelector('input[name="contactMethod"]:checked');
      return checked ? checked.value : '';
    }
    if (name === 'consent') return form.consent.checked;
    return form.elements[name].value;
  }

  function showError(name, message) {
    const errorEl = document.getElementById(`${name}-error`);
    errorEl.textContent = message;

    let target;
    if (name === 'contactMethod') target = document.getElementById('contactMethodGroup');
    else if (name === 'consent') target = document.getElementById('consentWrap');
    else target = form.elements[name];

    target.classList.toggle('invalid', Boolean(message));

    if (name === 'contactMethod') {
      form.querySelectorAll('input[name="contactMethod"]').forEach(r => r.setAttribute('aria-invalid', String(Boolean(message))));
    } else {
      form.elements[name].setAttribute('aria-invalid', String(Boolean(message)));
    }
  }

  function validateField(name) {
    const message = validators[name](getValue(name));
    showError(name, message);
    return !message;
  }

  Object.keys(validators).forEach(name => {
    const fields = name === 'contactMethod'
      ? form.querySelectorAll('input[name="contactMethod"]')
      : [form.elements[name]];

    fields.forEach(field => {
      const isToggle = field.type === 'radio' || field.type === 'checkbox';
      field.addEventListener(isToggle ? 'change' : 'blur', () => validateField(name));
      if (!isToggle) {
        field.addEventListener('input', () => {
          if (field.classList.contains('invalid')) validateField(name);
        });
      }
    });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    const results = Object.keys(validators).map(name => ({ name, valid: validateField(name) }));
    const firstInvalid = results.find(r => !r.valid);

    if (firstInvalid) {
      const el = firstInvalid.name === 'contactMethod'
        ? form.querySelector('input[name="contactMethod"]')
        : form.elements[firstInvalid.name];
      el.focus();
      return;
    }

    const data = {
      fullName: clean(getValue('fullName'), 100),
      email: clean(getValue('email'), 254),
      phone: getValue('phone').trim(),
      ageRange: getValue('ageRange'),
      areaOfInterest: getValue('interest'),
      preferredContactMethod: getValue('contactMethod'),
      message: clean(getValue('message'), 2000, true),
      consent: getValue('consent'),
      submittedAt: new Date().toISOString()
    };

    const automated = looksAutomated(form) || isThrottled('enquiry');

    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    // Static markup only; no user data here
    submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Sending…</span>';

    setTimeout(() => {
      if (!automated) console.log('Enquiry submitted:', JSON.stringify(data, null, 2));
      showSuccess(data.fullName);
    }, 1500);
  });

  function showSuccess(name) {
    const success = document.createElement('div');
    success.className = 'form-success';
    success.setAttribute('role', 'status');
    success.setAttribute('tabindex', '-1');
    // Static markup only; the user's name is added below with textContent
    success.innerHTML = `
      <div class="success-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h3></h3>
      <p>Your request has been received. An adviser will contact you within one business day to arrange your free consultation.</p>
    `;
    // textContent prevents any HTML in the name from being injected
    success.querySelector('h3').textContent = `Thank you, ${name}!`;

    formCard.replaceChildren(success);
    success.focus();
  }

  /* ==========================================================
     13. NEWSLETTER SIGNUP
     ========================================================== */
  const newsletterForm = document.getElementById('newsletterForm');
  const newsletterEmail = document.getElementById('newsletterEmail');
  const newsletterMsg = document.getElementById('newsletterMsg');

  newsletterForm.addEventListener('submit', e => {
    e.preventDefault();
    const value = clean(newsletterEmail.value, 254);
    let error = '';

    if (!value) error = 'Enter your email address to subscribe.';
    else if (!EMAIL_RE.test(value)) error = 'Check your email address, for example name@example.com.';

    newsletterEmail.classList.toggle('invalid', Boolean(error));
    newsletterEmail.setAttribute('aria-invalid', String(Boolean(error)));
    newsletterMsg.className = 'newsletter-msg ' + (error ? 'error' : 'success');

    if (error) {
      newsletterMsg.textContent = error;
      newsletterEmail.focus();
      return;
    }

    newsletterMsg.textContent = 'Subscribed. Check your inbox to confirm.';
    if (!looksAutomated(newsletterForm) && !isThrottled('newsletter')) {
      console.log('Newsletter signup:', JSON.stringify({ email: value }));
    }
    newsletterForm.reset();
  });

  newsletterEmail.addEventListener('input', () => {
    if (newsletterEmail.classList.contains('invalid')) {
      newsletterEmail.classList.remove('invalid');
      newsletterEmail.removeAttribute('aria-invalid');
      newsletterMsg.textContent = '';
    }
  });

  /* ==========================================================
     14. FOOTER YEAR
     ========================================================== */
  document.getElementById('currentYear').textContent = new Date().getFullYear();
})();
