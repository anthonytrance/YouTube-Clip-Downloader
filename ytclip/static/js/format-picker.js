/**
 * Renders format groups (video, audio, MP3) and tracks selection.
 * Returns the selected format via getSelected().
 */
window.FormatPicker = (() => {
  let _formats = [];
  let _selectedBtn = null;
  let _selectedFormat = null;
  let _container = null;
  let _videoDuration = 0;      // seconds, whole video
  let _clipSeconds = 0;        // seconds, current selection
  let _sizeSpans = [];         // {span, fmt} to refresh live

  function render(container, formats, videoDuration) {
    _container = container;
    _formats = formats || [];
    _videoDuration = videoDuration || 0;
    _clipSeconds = _videoDuration;   // until a range is set
    _selectedBtn = null;
    _selectedFormat = null;
    _sizeSpans = [];
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
        meta: `${f.container.toUpperCase()} · `,
        sizeFmt: f,
      })));
    }

    if (audioFormats.length || true) { // always show audio section
      const audioItems = audioFormats.length ? audioFormats : [];
      // Add MP3 option (always available — re-encode from best audio)
      const mp3Format = { itag: 'mp3_320', label: 'MP3 320 kbps', type: 'audio_mp3', url: null, _isMp3: true };
      container.appendChild(_makeGroup('Audio', [...audioItems, mp3Format], (f) => ({
        label: f._isMp3 ? 'MP3 320 kbps' : f.label,
        meta: f._isMp3 ? 'Audio only · ' : `${f.container.toUpperCase()} · Audio only · `,
        sizeFmt: f._isMp3 ? null : f,
      })));
    }
  }

  // Full-file bytes -> estimated bytes for the current clip length.
  function _clipBytes(fmt) {
    const full = fmt && fmt.filesize;
    if (!full || !_videoDuration) return null;
    return full * (_clipSeconds / _videoDuration);
  }

  function _sizeText(fmt) {
    if (!fmt) return '';
    const est = _clipBytes(fmt);
    return est ? `~${_sizeLbl(est)} for this clip` : '';
  }

  // Called as the start/end selection changes so sizes track the clip.
  function setClipSeconds(seconds) {
    _clipSeconds = Math.max(0, seconds || 0);
    for (const { span, fmt } of _sizeSpans) {
      span.textContent = _sizeText(fmt);
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

      const labelSpan = document.createElement('span');
      labelSpan.className = 'format-btn-label';
      labelSpan.textContent = desc.label;
      const metaSpan = document.createElement('span');
      metaSpan.className = 'format-btn-meta';
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'format-btn-size';
      sizeSpan.textContent = _sizeText(desc.sizeFmt);
      metaSpan.textContent = desc.meta;
      metaSpan.appendChild(sizeSpan);

      btn.appendChild(labelSpan);
      btn.appendChild(metaSpan);
      if (fmt._isMp3) {
        const re = document.createElement('span');
        re.className = 'format-btn-reencode';
        re.textContent = 'Requires re-encode';
        btn.appendChild(re);
      }
      _sizeSpans.push({ span: sizeSpan, fmt: desc.sizeFmt });
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
    if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
    return Math.max(0.1, Math.round(bytes / 1e5) / 10) + ' MB';
  }

  return { render, getSelected, setClipSeconds };
})();
