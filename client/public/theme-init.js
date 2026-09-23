// Applies the saved theme before first paint (external file so the CSP can forbid inline scripts).
// Light is the default; dark is only used when the user picked it in Settings.
(function () {
  try {
    var dark = localStorage.getItem('cc_theme') === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0B0B0E' : '#FFFFFF');
  } catch (e) {
    /* storage unavailable */
  }
})();
