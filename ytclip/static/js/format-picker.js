/**
 * Renders format groups (video, audio, MP3) and tracks selection.
 * Returns the selected format via getSelected().
 */
window.FormatPicker = (() => {
  let _formats = [];
  let _selectedBtn = null;
  let _selectedFormat = null;
  let _container = null;

  function render(container, formats) {
    _container = container;
    _formats = formats || [];
    _selectedBtn = null;
    _selectedFormat = null;
    container.innerHTML = '';

    const videoFormats  = _formats.filter(f => f.type === 'video');
    const audioFormats  = _formats.filter(f => f.type === 'audio' || f.type === 'combined');

    // Deduplicate video by label (keep highest bitrate per label)
    const seen = new Set();
    const dedupedVideo = videoFormats.filter(f => {
      if (seen.has(f.label)) return false;
      seen.add(f.label);
      return true;
    });

    if (dedupedVideo.length) {
      container.appendChild(_makeGroup('Video', dedupedVideo, (f) => ({
        label: f.label,
        meta: `${f.container.toUpperCase()} · ${_sizeLbl(f.filesize)}`,
      })));
    }

    if (audioFormats.length || true) { // always show audio section
      const audioItems = audioFormats.length ? audioFormats : [];
      // Add MP3 option (always available — re-encode from best audio)
      const mp3Format = { itag: 'mp3_320', label: 'MP3 320 kbps', type: 'audio_mp3', url: null, _isMp3: true };
      container.appendChild(_makeGroup('Audio', [...audioItems, mp3Format], (f) => ({
        label: f._isMp3 ? 'MP3 320 kbps' : f.label,
        meta: f._isMp3 ? 'Audio only' : `${f.container.toUpperCase()} · Audio only · ${_sizeLbl(f.filesize)}`,
        reencodeNote: f._isMp3 ? 'Requires re-encode' : null,
      })));
    }
  }

  function _makeGroup(heading, items, descFn) {
    const wrap = document.createElement('div');
    const h = document.createElement('p');
    h.className = 'format-group-heading';
    h.textContent = heading;
    wrap.appendChild(h);

    const list = document.createElement('div');
    list.className = 'format-list';

    for (const fmt of items) {
      const desc = descFn(fmt);
      const btn = document.createElement('button');
      btn.className = 'format-btn';
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `
        <span class="format-btn-label">${_esc(desc.label)}</span>
        <span class="format-btn-meta">${_esc(desc.meta)}</span>
        ${desc.reencodeNote ? `<span class="format-btn-reencode">${_esc(desc.reencodeNote)}</span>` : ''}
      `;
      btn.addEventListener('click', () => _select(btn, fmt));
      list.appendChild(btn);
    }

    wrap.appendChild(list);
    return wrap;
  }

  function _select(btn, fmt) {
    if (_selectedBtn) {
      _selectedBtn.classList.remove('selected');
      _selectedBtn.setAttribute('aria-pressed', 'false');
    }
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');
    _selectedBtn = btn;
    _selectedFormat = fmt;
    document.getElementById('download-btn')?.removeAttribute('disabled');
  }

  function getSelected() { return _selectedFormat; }

  function _sizeLbl(bytes) {
    if (!bytes) return '? MB';
    if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    return (bytes / 1e6).toFixed(0) + ' MB';
  }

  function _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render, getSelected };
})();
