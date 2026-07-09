/**
 * Shared easing engine for the Method Draw animation timeline.
 *
 * Mirrors the easing model demonstrated in test/timeline/index_v2.html:
 *   - named preset beziers (linear, ease, ease-in-out, easeOutBack, ...)
 *   - user-dragged custom beziers encoded as "custom:x1,y1,x2,y2"
 *   - piecewise gravity bounce presets (easeInBounce / easeOutBounce / easeInOutBounce)
 *
 * Exposed as window.methodDraw.easing so the timeline and the easing editor
 * share a single implementation. Plain ES5 to match the surrounding codebase.
 */
(function (global) {
  'use strict';

  /**
   * Named preset control points. Each entry is [x1, y1, x2, y2] for
   * cubic-bezier(), except the bounce presets which are marked "special"
   * and resolved by a gravity formula instead.
   */
  var PRESET_BEZIERS = {
    'linear': [0.00, 0.00, 1.00, 1.00],
    'ease': [0.25, 0.10, 0.25, 1.00],
    'ease-in': [0.42, 0.00, 1.00, 1.00],
    'ease-out': [0.00, 0.00, 0.58, 1.00],
    'ease-in-out': [0.42, 0.00, 0.58, 1.00],
    'easeInSine': [0.12, 0.00, 0.39, 0.00],
    'easeOutSine': [0.61, 1.00, 0.88, 1.00],
    'easeInOutSine': [0.37, 0.00, 0.63, 1.00],
    'easeInQuad': [0.11, 0.00, 0.50, 0.00],
    'easeOutQuad': [0.50, 1.00, 0.89, 1.00],
    'easeInOutQuad': [0.45, 0.00, 0.55, 1.00],
    'easeInCubic': [0.32, 0.00, 0.67, 0.00],
    'easeOutCubic': [0.33, 1.00, 0.67, 1.00],
    'easeInOutCubic': [0.65, 0.00, 0.35, 1.00],
    'easeInBack': [0.36, 0.00, 0.66, -0.56],
    'easeOutBack': [0.34, 1.56, 0.64, 1.00],
    'easeInOutBack': [0.68, -0.60, 0.32, 1.60],
    'easeInBounce': 'special',
    'easeOutBounce': 'special',
    'easeInOutBounce': 'special'
  };

  var BOUNCE_PRESETS = ['easeInBounce', 'easeOutBounce', 'easeInOutBounce'];

  // --- Piecewise mathematical bounce evaluators ------------------------------

  function easeOutBounceFn(x) {
    var n1 = 7.5625;
    var d1 = 2.75;
    if (x < 1 / d1) { return n1 * x * x; }
    else if (x < 2 / d1) { return n1 * (x -= 1.5 / d1) * x + 0.75; }
    else if (x < 2.5 / d1) { return n1 * (x -= 2.25 / d1) * x + 0.9375; }
    else { return n1 * (x -= 2.625 / d1) * x + 0.984375; }
  }

  function easeInBounceFn(x) { return 1 - easeOutBounceFn(1 - x); }

  function easeInOutBounceFn(x) {
    return x < 0.5 ? (1 - easeOutBounceFn(1 - 2 * x)) / 2 : (1 + easeOutBounceFn(2 * x - 1)) / 2;
  }

  // --- Cubic bezier solver (Newton-Raphson) -----------------------------------

  function cubicBezierEasing(x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
    function b(p1, p2) { return 3 * p2 - 6 * p1; }
    function c(p1) { return 3 * p1; }
    function calcX(t) { return ((a(x1, x2) * t + b(x1, x2)) * t + c(x1)) * t; }
    function calcY(t) { return ((a(y1, y2) * t + b(y1, y2)) * t + c(y1)) * t; }
    function calcDerivX(t) { return 3 * a(x1, x2) * t * t + 2 * b(x1, x2) * t + c(x1); }
    return function (x) {
      if (x === 0 || x === 1) return x;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var d = calcDerivX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= (calcX(t) - x) / d;
      }
      return calcY(t);
    };
  }

  // --- Public helpers ---------------------------------------------------------

  function isBounceKey(key) {
    return BOUNCE_PRESETS.indexOf(key) !== -1;
  }

  function getEasingFn(key) {
    if (!key) return cubicBezierEasing(0, 0, 1, 1);
    if (key === 'easeOutBounce') return easeOutBounceFn;
    if (key === 'easeInBounce') return easeInBounceFn;
    if (key === 'easeInOutBounce') return easeInOutBounceFn;
    if (PRESET_BEZIERS[key] && PRESET_BEZIERS[key] !== 'special') {
      var p = PRESET_BEZIERS[key];
      return cubicBezierEasing(p[0], p[1], p[2], p[3]);
    }
    if (typeof key === 'string' && key.indexOf('custom:') === 0) {
      var parts = key.slice(7).split(',').map(Number);
      if (parts.length === 4) return cubicBezierEasing(parts[0], parts[1], parts[2], parts[3]);
    }
    return cubicBezierEasing(0, 0, 1, 1);
  }

  function parseBezierString(key) {
    if (key && PRESET_BEZIERS[key] && PRESET_BEZIERS[key] !== 'special') return PRESET_BEZIERS[key].slice();
    if (key && typeof key === 'string' && key.indexOf('custom:') === 0) {
      var parts = key.slice(7).split(',').map(Number);
      if (parts.length === 4) return parts;
    }
    return [0.25, 0.1, 0.25, 1.0]; // fallback to ease
  }

  function matchingPresetName(x1, y1, x2, y2, currentKey) {
    if (isBounceKey(currentKey)) return currentKey;
    for (var name in PRESET_BEZIERS) {
      if (!PRESET_BEZIERS.hasOwnProperty(name)) continue;
      var p = PRESET_BEZIERS[name];
      if (p !== 'special' &&
          Math.abs(p[0] - x1) < 0.01 && Math.abs(p[1] - y1) < 0.01 &&
          Math.abs(p[2] - x2) < 0.01 && Math.abs(p[3] - y2) < 0.01) {
        return name;
      }
    }
    return 'Custom Curve';
  }

  function customEasingKey(x1, y1, x2, y2) {
    return 'custom:' + x1.toFixed(2) + ',' + y1.toFixed(2) + ',' + x2.toFixed(2) + ',' + y2.toFixed(2);
  }

  var easing = {
    PRESET_BEZIERS: PRESET_BEZIERS,
    BOUNCE_PRESETS: BOUNCE_PRESETS,
    isBounceKey: isBounceKey,
    getEasingFn: getEasingFn,
    parseBezierString: parseBezierString,
    matchingPresetName: matchingPresetName,
    customEasingKey: customEasingKey,
    cubicBezierEasing: cubicBezierEasing
  };

  global.methodDraw = global.methodDraw || {};
  global.methodDraw.easing = easing;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = easing;
  }
})(typeof window !== 'undefined' ? window : this);
