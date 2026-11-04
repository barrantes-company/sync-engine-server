(function () {
  'use strict';

  const SAMPLE_LIMIT = 24;
  const samples = [];
  const root = document.querySelector('[data-telemetry-globe-dashboard]');
  if (!root) return;

  const status = root.querySelector('[data-telemetry-status]');
  const sparkline = document.getElementById('sparkline-1');
  const miniSparkline = document.getElementById('telemetry-mini-sparkline');
  const secondarySparkline = document.getElementById('sparkline-2');
  const quotaSparkline = document.getElementById('sparkline-3');
  const nodesLayer = root.querySelector('[data-globe-nodes]');
  const linksLayer = root.querySelector('[data-globe-links]');
  const latencyValue = root.querySelector('[data-telemetry-latency]');

  function svgElement(name, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function renderSparkline() {
    const values = samples.length ? samples : [0];
    drawPolyline(sparkline, values, 120, 38);
  }

  function drawPolyline(svg, values, width, height) {
    if (!svg || values.length < 2) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    svg.replaceChildren(svgElement('polyline', { points, fill: 'none', stroke: 'var(--brand)', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function measureLatency() {
    const started = performance.now();
    return fetch('/api/status', { cache: 'no-store', mode: 'no-cors' })
      .then(() => Math.max(0, Math.round(performance.now() - started)))
      .then((latency) => {
        samples.push(latency);
        if (samples.length > SAMPLE_LIMIT) samples.shift();
        latencyValue.textContent = `${latency}ms`;
        status.classList.remove('is-offline');
        status.querySelector('[data-telemetry-label]').textContent = `ONLINE • ${latency}ms`;
        renderSparkline();
        drawPolyline(miniSparkline, samples, 44, 14);
      })
      .catch(() => {
        status.classList.add('is-offline');
        status.querySelector('[data-telemetry-label]').textContent = 'OFFLINE';
        latencyValue.textContent = '—';
      });
  }

  function buildGlobe() {
    const count = 26;
    const radius = 44;
    const projectionScale = 1.72;
    const points = Array.from({ length: count }, (_, index) => {
      const y = 1 - ((index + 0.5) / count) * 2;
      const planar = Math.sqrt(1 - y * y);
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      return { x: Math.cos(theta) * planar * radius, y: y * radius, z: Math.sin(theta) * planar * radius };
    });
    points.forEach((point, index) => {
      point.screenX = 115 + point.x * projectionScale;
      point.screenY = 115 + point.y * projectionScale;
      point.opacity = (point.z + radius) / (radius * 2);
      const node = svgElement('circle', { cx: point.screenX.toFixed(2), cy: point.screenY.toFixed(2), r: index % 5 === 0 ? 2.5 : 1.8, class: 'globe-node', opacity: (.35 + point.opacity * .65).toFixed(2) });
      nodesLayer.appendChild(node);
    });
    points.forEach((point, first) => points.slice(first + 1).forEach((other) => {
      const distance = Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z);
      if (distance < 34) linksLayer.appendChild(svgElement('line', { x1: point.screenX.toFixed(2), y1: point.screenY.toFixed(2), x2: other.screenX.toFixed(2), y2: other.screenY.toFixed(2), class: 'globe-link', opacity: (.18 + ((point.opacity + other.opacity) / 4)).toFixed(2) }));
    }));
  }

  buildGlobe();
  renderSparkline();
  drawPolyline(secondarySparkline, [45, 52, 48, 65, 59, 70, 62, 80], 120, 38);
  drawPolyline(quotaSparkline, [30, 42, 38, 55, 60, 58, 72, 85], 120, 38);
  measureLatency();
  window.setInterval(measureLatency, 5000);
})();
