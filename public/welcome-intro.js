(function () {
  'use strict';

  const intro = document.getElementById('sync-intro-screen');
  if (!intro) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sessionKey = 'sync_engine_intro_seen';
  let pageReady = document.readyState === 'complete';
  let minimumTimeElapsed = false;
  let closed = false;

  function closeIntro() {
    if (closed) return;
    closed = true;
    sessionStorage.setItem(sessionKey, '1');
    intro.classList.add('is-leaving');
    window.setTimeout(() => intro.remove(), reducedMotion ? 0 : 520);
  }

  if (sessionStorage.getItem(sessionKey)) {
    intro.remove();
    return;
  }

  function maybeClose() {
    if (pageReady && minimumTimeElapsed) closeIntro();
  }

  window.addEventListener('load', () => {
    pageReady = true;
    maybeClose();
  }, { once: true });

  window.setTimeout(() => {
    minimumTimeElapsed = true;
    maybeClose();
  }, reducedMotion ? 450 : 1850);

  window.setTimeout(closeIntro, reducedMotion ? 900 : 2600);
})();
