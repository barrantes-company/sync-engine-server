(function () {
  'use strict';

  const root = document.querySelector('[data-telemetry-globe-dashboard]');
  if (!root) return;

  const nodesLayer = root.querySelector('[data-globe-nodes]');
  const linksLayer = root.querySelector('[data-globe-links]');

  function svgElement(name, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
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
})();
