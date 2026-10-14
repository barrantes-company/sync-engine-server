/**
 * Vercel Speed Insights
 * Initializes speed insights tracking for the application
 */
(function() {
  // Initialize the Speed Insights queue
  window.si = window.si || function() {
    (window.siq = window.siq || []).push(arguments);
  };

  // Determine the script source based on environment
  var isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  var scriptSrc = isDev 
    ? 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js'
    : '/_vercel/speed-insights/script.js';

  // Check if script is already loaded
  if (document.querySelector('script[src*="speed-insights"]')) {
    return;
  }

  // Create and inject the script
  var script = document.createElement('script');
  script.src = scriptSrc;
  script.defer = true;
  script.setAttribute('data-endpoint', '/_vercel/speed-insights/vitals');
  
  script.onerror = function() {
    console.log('[Vercel Speed Insights] Failed to load script from ' + scriptSrc + '. Speed Insights will be enabled when deployed to Vercel.');
  };

  document.head.appendChild(script);
})();
