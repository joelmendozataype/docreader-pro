import '@testing-library/jest-dom/vitest';

// jsdom no implementa scrollIntoView (lo usan el índice y el lector)
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
