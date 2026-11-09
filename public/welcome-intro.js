(function () {
  'use strict';

  const intro = document.getElementById('sync-intro-screen');
  if (!intro) return;

  const transition = document.getElementById('sync-energy-transition');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function triggerEnergy(kind) {
    if (!transition || reducedMotion) return;
    transition.dataset.kind = kind || 'navigation';
    transition.classList.remove('is-active');
    void transition.offsetWidth;
    transition.classList.add('is-active');
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-se-view], #btn-brand-logo')) triggerEnergy('navigation');
    if (event.target.closest('#send-btn')) triggerEnergy('send');
  });

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
