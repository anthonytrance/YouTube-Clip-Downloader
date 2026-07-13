/**
 * Accessible A/B timeline scrubber.
 * Syncs with time-input fields and fires onChange(startMs, endMs).
 */
window.Timeline = (() => {
  let _duration = 0;
  let _startMs = 0;
  let _endMs = 0;
  let _onChange = null;
  let _track, _range, _handleStart, _handleEnd;

  function init({ track, range, handleStart, handleEnd, onChange }) {
    _track = track; _range = range;
    _handleStart = handleStart; _handleEnd = handleEnd;
    _onChange = onChange;
    _bindHandle(_handleStart, 'start');
    _bindHandle(_handleEnd, 'end');
    _bindKeyboard(_handleStart, 'start');
    _bindKeyboard(_handleEnd, 'end');
  }

  function setDuration(durationMs) {
    _duration = durationMs;
    _startMs = 0;
    _endMs = durationMs;
    _render();
  }

  function setRange(startMs, endMs) {
    _startMs = Math.max(0, Math.min(startMs, _duration));
    _endMs   = Math.max(_startMs, Math.min(endMs, _duration));
    _render();
  }

  function getRange() { return { startMs: _startMs, endMs: _endMs }; }

  function _pctToMs(pct) { return Math.round(pct * _duration); }
  function _msToPct(ms)  { return _duration ? ms / _duration : 0; }

  function _render() {
    if (!_duration) return;
    const s = _msToPct(_startMs) * 100;
    const e = _msToPct(_endMs) * 100;
    _handleStart.style.left = s + '%';
    _handleEnd.style.left   = e + '%';
    _range.style.left  = s + '%';
    _range.style.width = (e - s) + '%';
    // ARIA
    _handleStart.setAttribute('aria-valuenow', Math.round(s));
    _handleStart.setAttribute('aria-valuetext', TimeInput.ariaLabel(_startMs));
    _handleEnd.setAttribute('aria-valuenow', Math.round(e));
    _handleEnd.setAttribute('aria-valuetext', TimeInput.ariaLabel(_endMs));
  }

  function _bindHandle(handle, which) {
    let dragging = false;

    const getNewMs = (clientX) => {
      const rect = _track.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return _pctToMs(pct);
    };

    const onMove = (clientX) => {
      const ms = getNewMs(clientX);
      if (which === 'start') {
        _startMs = Math.min(ms, _endMs - 100);
      } else {
        _endMs = Math.max(ms, _startMs + 100);
      }
      _startMs = Math.max(0, _startMs);
      _endMs   = Math.min(_duration, _endMs);
      _render();
      _onChange?.(_startMs, _endMs);
    };

    // Mouse
    handle.addEventListener('mousedown', e => {
      dragging = true; e.preventDefault();
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    const onMouseMove = e => { if (dragging) onMove(e.clientX); };
    const onMouseUp   = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    // Touch
    handle.addEventListener('touchstart', e => {
      e.preventDefault();
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    }, { passive: false });
    const onTouchMove = e => { e.preventDefault(); onMove(e.touches[0].clientX); };
    const onTouchEnd  = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }

  function _bindKeyboard(handle, which) {
    handle.addEventListener('keydown', e => {
      if (!_duration) return;
      const step = e.shiftKey ? _duration * 0.05 : Math.max(500, _duration * 0.005);
      let changed = false;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        if (which === 'start') _startMs = Math.max(0, _startMs - step);
        else                   _endMs   = Math.max(_startMs + 100, _endMs - step);
        changed = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        if (which === 'start') _startMs = Math.min(_endMs - 100, _startMs + step);
        else                   _endMs   = Math.min(_duration, _endMs + step);
        changed = true;
      }
      if (e.key === 'Home') {
        if (which === 'start') _startMs = 0;
        else                   _endMs   = _startMs + 100;
        changed = true;
      }
      if (e.key === 'End') {
        if (which === 'start') _startMs = _endMs - 100;
        else                   _endMs   = _duration;
        changed = true;
      }
      if (changed) {
        e.preventDefault();
        _render();
        _onChange?.(_startMs, _endMs);
      }
    });
  }

  return { init, setDuration, setRange, getRange };
})();
