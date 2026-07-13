/**
 * Progress UI — drives the progress bar and label,
 * and announces completions to screen readers.
 */
window.Progress = (() => {
  let _container, _bar, _label, _announce;

  function init({ container, bar, label, announce }) {
    _container = container; _bar = bar; _label = label; _announce = announce;
  }

  function show(message) {
    _container?.classList.remove('hidden');
    _set(0, message);
  }

  function set(pct, message) {
    _container?.classList.remove('hidden');
    _set(pct, message);
  }

  function announce(message) {
    if (_announce) { _announce.textContent = ''; requestAnimationFrame(() => { _announce.textContent = message; }); }
  }

  function hide() { _container?.classList.add('hidden'); }

  function _set(pct, message) {
    if (_bar) _bar.style.width = Math.round(Math.min(100, Math.max(0, pct))) + '%';
    if (_label) _label.textContent = message ?? '';
  }

  return { init, show, set, announce, hide };
})();
