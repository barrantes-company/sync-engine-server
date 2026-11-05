(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SyncSafeContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Canvas avatars and legacy inline images: raster only, never SVG/HTML.
  const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[a-z0-9+/]+={0,2}$/i;
  // MediaRecorder/legacy voice notes: base64 audio, not arbitrary data documents.
  const AUDIO_DATA_URL = /^data:audio\/(?:webm|ogg|wav|mpeg|mp3|mp4|aac|m4a|x-m4a)(?:;codecs=[a-z0-9.,-]+)?;base64,[a-z0-9+/]+={0,2}$/i;
  const PURPOSES = new Set(['link', 'download', 'image', 'avatar', 'audio', 'video']);

  function safeUrl(value, purpose = 'link', baseUrl) {
    if (!PURPOSES.has(purpose) || typeof value !== 'string') return '';
    const input = value.trim();
    if (!input || /[\u0000-\u001f\u007f]/.test(input)) return '';
    if (/^data:/i.test(input)) {
      if (['image', 'avatar', 'download'].includes(purpose) && RASTER_DATA_URL.test(input)) return input;
      if (purpose === 'audio' && AUDIO_DATA_URL.test(input)) return input;
      return '';
    }
    try {
      const base = baseUrl || (typeof location !== 'undefined' ? location.href : 'https://sync-engine.invalid/');
      const url = new URL(input, base);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function setSafeUrl(element, attribute, value, purpose) {
    const url = safeUrl(value, purpose);
    if (url) element.setAttribute(attribute, url);
    else element.removeAttribute(attribute);
    return url;
  }

  function safeLocalBlobUrl(value, baseUrl) {
    if (typeof value !== 'string' || !value.startsWith('blob:')) return '';
    try {
      const base = baseUrl || (typeof location !== 'undefined' ? location.href : 'https://sync-engine.invalid/');
      const url = new URL(value, base);
      const origin = new URL(base).origin;
      return url.protocol === 'blob:' && url.origin === origin ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function setSafeLocalBlobUrl(element, attribute, value, baseUrl) {
    const url = safeLocalBlobUrl(value, baseUrl);
    if (url) element.setAttribute(attribute, url);
    else element.removeAttribute(attribute);
    return url;
  }

  return { safeUrl, setSafeUrl, safeLocalBlobUrl, setSafeLocalBlobUrl };
});
