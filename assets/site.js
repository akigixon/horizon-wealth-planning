/* ==========================================================
   Horizon Wealth Planning: site behaviour
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
     All maths runs locally. Figures are in today's dollars using a
     real (inflation-adjusted) monthly return.
     ========================================================== */
  const NOMINAL_RETURN = 0.05;
  const INFLATION = 0.025;
  const PLAN_TO_AGE = 90;
  const monthlyRate = Math.pow((1 + NOMINAL_RETURN) / (1 + INFLATION), 1 / 12) - 1;

  const calcForm = document.getElementById('calcForm');
  const calcError = document.getElementById('calcError');
  const calcChart = document.getElementById('calcChart');
  const out = {
    projected: document.getElementById('calcProjected'),
    needed: document.getElementById('calcNeeded'),
    gap: document.getElementById('calcGap'),
    gapLabel: document.getElementById('gapLabel'),
    extra: document.getElementById('calcExtra'),
    extraLabel: document.getElementById('extraLabel'),
    projLabel: document.getElementById('projLabel'),
    summary: document.getElementById('calcSummary')
  };

  const numberFmt = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 });
  const compactFmt = new Intl.NumberFormat('en-SG', { notation: 'compact', maximumFractionDigits: 1 });
  const money = n => 'S$' + numberFmt.format(Math.max(0, Math.round(n)));
  const moneyShort = n => 'S$' + compactFmt.format(Math.max(0, n));

  let lastResult = null;

  function readInputs() {
    const num = name => {
      const input = calcForm.elements[name];
      const value = Number(input.value);
      if (input.value === '' || !Number.isFinite(value)) return NaN;
      return Math.min(Math.max(value, Number(input.min)), Number(input.max));
    };
    return {
      age: Math.round(num('age')),
      retireAge: Math.round(num('retireAge')),
      savings: num('savings'),
      monthly: num('monthly'),
      income: num('income'),
      cpf: num('cpf')
    };
  }

  function markInvalid(names) {
    ['age', 'retireAge', 'savings', 'monthly', 'income', 'cpf'].forEach(name => {
      const input = calcForm.elements[name];
      const bad = names.includes(name);
      input.parentElement.classList.toggle('invalid', bad);
      input.setAttribute('aria-invalid', String(bad));
    });
  }

  function calculate() {
    const v = readInputs();
    const missing = Object.keys(v).filter(k => Number.isNaN(v[k]));

    if (missing.length) {
      markInvalid(missing);
      calcError.textContent = 'Fill in every field with a number to see your result.';
      return;
    }
    if (v.retireAge <= v.age) {
      markInvalid(['retireAge']);
      calcError.textContent = 'Your retirement age needs to be later than your current age.';
      return;
    }
    if (v.retireAge >= PLAN_TO_AGE) {
      markInvalid(['retireAge']);
      calcError.textContent = `Choose a retirement age below ${PLAN_TO_AGE}.`;
      return;
    }
    markInvalid([]);
    calcError.textContent = '';

    const monthsToRetire = (v.retireAge - v.age) * 12;
    const monthsInRetirement = (PLAN_TO_AGE - v.retireAge) * 12;
    const draw = Math.max(0, v.income - v.cpf);

    // Year-by-year balance for the chart
    const points = [{ age: v.age, balance: v.savings }];
    let balance = v.savings;
    for (let m = 1; m <= monthsToRetire; m++) {
      balance = balance * (1 + monthlyRate) + v.monthly;
      if (m % 12 === 0) points.push({ age: v.age + m / 12, balance });
    }
    const projected = balance;

    let runOutAge = null;
    for (let m = 1; m <= monthsInRetirement; m++) {
      balance = balance * (1 + monthlyRate) - draw;
      if (balance <= 0 && runOutAge === null) runOutAge = v.retireAge + Math.floor(m / 12);
      if (m % 12 === 0) points.push({ age: v.retireAge + m / 12, balance: Math.max(0, balance) });
    }

    const needed = draw * (1 - Math.pow(1 + monthlyRate, -monthsInRetirement)) / monthlyRate;
    const gap = needed - projected;
    const growth = (Math.pow(1 + monthlyRate, monthsToRetire) - 1) / monthlyRate;
    const extraMonthly = gap > 0 ? gap / growth : 0;

    lastResult = { v, points, projected, needed, gap, runOutAge };

    out.projLabel.textContent = `At ${v.retireAge} you're on track to have`;
    out.projected.textContent = money(projected);
    out.needed.textContent = money(needed);

    if (gap > 0) {
      out.gapLabel.textContent = 'Your gap';
      out.gap.textContent = money(gap);
      out.extraLabel.textContent = 'Extra to save a month';
      out.extra.textContent = money(extraMonthly);
      out.summary.textContent =
        `At this rate your savings would run out around age ${runOutAge}. ` +
        `To draw ${money(draw)} a month on top of CPF LIFE until ${PLAN_TO_AGE}, you'd need about ` +
        `${money(needed)} at ${v.retireAge}, which is ${money(gap)} more than you're on track for. ` +
        `Saving roughly ${money(extraMonthly)} more each month would close it.`;
    } else {
      out.gapLabel.textContent = 'Your surplus';
      out.gap.textContent = money(-gap);
      out.extraLabel.textContent = 'Extra to save a month';
      out.extra.textContent = money(0);
      out.summary.textContent =
        `You're on track. Your projected ${money(projected)} at ${v.retireAge} covers the ` +
        `${money(needed)} needed to draw ${money(draw)} a month until ${PLAN_TO_AGE}, with ${money(-gap)} to spare. ` +
        'A plan can help you protect that position and decide how to use the surplus.';
    }

    drawChart();
  }

  // Builds the chart with DOM methods (no innerHTML), so no markup injection is possible
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function drawChart() {
    if (!lastResult) return;
    const { v, points, needed } = lastResult;
    const W = 600, H = 260, padL = 56, padR = 12, padT = 16, padB = 30;
    const maxBalance = Math.max(needed, ...points.map(p => p.balance)) * 1.1 || 1;
    const x = age => padL + (age - v.age) / (PLAN_TO_AGE - v.age) * (W - padL - padR);
    const y = val => H - padB - (val / maxBalance) * (H - padT - padB);

    calcChart.replaceChildren();

    // Gridlines + y labels
    [0, 0.5, 1].forEach(f => {
      const val = maxBalance / 1.1 * f;
      calcChart.appendChild(svgEl('line', { class: 'chart-grid', x1: padL, x2: W - padR, y1: y(val), y2: y(val) }));
      calcChart.appendChild(svgEl('text', { class: 'chart-axis-label', x: padL - 8, y: y(val) + 4, 'text-anchor': 'end' }, moneyShort(val)));
    });

    // X labels every 10 years
    const firstTick = Math.ceil(v.age / 10) * 10;
    for (let a = firstTick; a <= PLAN_TO_AGE; a += 10) {
      calcChart.appendChild(svgEl('text', { class: 'chart-axis-label', x: x(a), y: H - 8, 'text-anchor': 'middle' }, String(a)));
    }

    // Retirement marker
    calcChart.appendChild(svgEl('line', { class: 'chart-retire', x1: x(v.retireAge), x2: x(v.retireAge), y1: padT, y2: H - padB }));

    // Balance area + line
    const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    const areaPath = `${linePath} L${x(last.age).toFixed(1)},${y(0)} L${x(points[0].age).toFixed(1)},${y(0)} Z`;
    calcChart.appendChild(svgEl('path', { class: 'chart-area', d: areaPath }));
    calcChart.appendChild(svgEl('path', { class: 'chart-line', d: linePath }));

    // What you need at retirement
    const needY = y(needed);
    calcChart.appendChild(svgEl('line', { class: 'chart-need', x1: padL, x2: x(v.retireAge), y1: needY, y2: needY }));
    calcChart.appendChild(svgEl('text', { class: 'chart-need-label', x: padL + 6, y: needY - 8 }, `Needed at ${v.retireAge}: ${moneyShort(needed)}`));
  }

  let calcTimer = null;
  calcForm.addEventListener('input', () => {
    clearTimeout(calcTimer);
    calcTimer = setTimeout(calculate, 150);
  });
  calcForm.addEventListener('submit', e => { e.preventDefault(); calculate(); });
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
    return !offerShown && !checklistInView && store.get('hw-lead') !== '1' && store.session('hw-offer') !== 'seen';
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
     10. ENQUIRY FORM VALIDATION & SUBMISSION
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
     11. NEWSLETTER SIGNUP
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
     12. FOOTER YEAR
     ========================================================== */
  document.getElementById('currentYear').textContent = new Date().getFullYear();
})();
