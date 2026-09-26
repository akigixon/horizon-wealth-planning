/* Runs in <head> before first paint so the saved theme never flashes.
   Also refuses to render inside someone else's frame (clickjacking),
   since GitHub Pages cannot send X-Frame-Options / frame-ancestors headers. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js'); // lets .reveal styles hide content only when JS runs

  // Browsers often block the redirect silently, so hide the page either way
  if (window.top !== window.self) {
    root.style.display = 'none';
    try { window.top.location.replace(window.self.location.href); } catch (e) { /* stay hidden */ }
  }

  try {
    var saved = localStorage.getItem('hw-theme');
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch (e) { /* storage blocked: fall back to the OS preference */ }
})();
