/* Checklist page: print button. Kept external so the CSP can forbid inline script. */
(function () {
  'use strict';
  var btn = document.getElementById('printBtn');
  if (btn) btn.addEventListener('click', function () { window.print(); });
})();
