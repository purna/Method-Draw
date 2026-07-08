/**
 * Unit tests for the Union / Subtract / Intersect / Exclude boolean tools.
 *
 * This is a SEPARATE, self-contained test file. It does not touch the
 * application code in js/ and is meant to validate the reference
 * implementation (tests/booleanPath.js) before the tool is integrated.
 *
 * Run with Node:   node tests/boolean-tools.test.js
 * Run in browser:  open tests/index.html
 */
(function () {
  'use strict';

  var boolop = (typeof module !== 'undefined' && module.exports)
    ? require('./booleanPath.js')
    : (window.svgedit && window.svgedit.boolop);

  // --- Tiny test framework -------------------------------------------------
  var passed = 0, failed = 0;
  var failures = [];

  function describe(name, fn) { fn(); }
  function it(name, fn) {
    try {
      fn();
      passed++;
      if (typeof console !== 'undefined') console.log('  ok  - ' + name);
    } catch (e) {
      failed++;
      failures.push({ name: name, error: e });
      if (typeof console !== 'undefined') console.log('  FAIL- ' + name + '  ::  ' + e.message);
    }
  }

  function expect(actual) {
    return {
      toBe: function (expected) {
        if (actual !== expected) throw new Error('expected ' + expected + ' but got ' + actual);
      },
      toBeCloseTo: function (expected, digits) {
        var t = Math.pow(10, digits === undefined ? 6 : digits);
        if (Math.round(actual * t) !== Math.round(expected * t))
          throw new Error('expected ' + expected + ' (±1e-' + (digits || 6) + ') but got ' + actual);
      },
      toBeGreaterThan: function (expected) {
        if (!(actual > expected)) throw new Error('expected > ' + expected + ' but got ' + actual);
      },
      toBeLessThan: function (expected) {
        if (!(actual < expected)) throw new Error('expected < ' + expected + ' but got ' + actual);
      },
      toHaveLength: function (n) {
        if (actual.length !== n) throw new Error('expected length ' + n + ' but got ' + actual.length);
      }
    };
  }

  // --- Polygon helpers -----------------------------------------------------
  function square(cx, cy, size) {
    var h = size / 2;
    return [
      [cx - h, cy - h],
      [cx + h, cy - h],
      [cx + h, cy + h],
      [cx - h, cy + h]
    ];
  }
  function areaOf(rings) { return boolop._internal.totalArea(rings); }
  function countOf(rings) { return rings.length; }

  // --- Tests ---------------------------------------------------------------
  describe('Boolean path tools', function () {

    it('requires the reference implementation to be present', function () {
      expect(typeof boolop.union).toBe('function');
      expect(typeof boolop.subtract).toBe('function');
      expect(typeof boolop.intersect).toBe('function');
      expect(typeof boolop.exclude).toBe('function');
    });

    // NOTE: Squares are offset diagonally so their edges are never collinear.
    // The classic Greiner-Hormann algorithm requires non-degenerate (strictly
    // crossing, non-collinear) intersections; axis-aligned squares that share
    // an edge would be a degeneracy the reference impl does not handle.
    describe('Two overlapping squares (side 10, offset by (5,5))', function () {
      var A = square(0, 0, 10);   // area 100, spans [-5,5]^2
      var B = square(5, 5, 10);   // area 100, spans [0,10]^2, overlap = 5 x 5 = 25

      it('Union area = A + B - overlap (100+100-25 = 175)', function () {
        expect(areaOf(boolop.union([A], [B]))).toBeCloseTo(175);
      });
      it('Subtract area = A - overlap (100-25 = 75)', function () {
        expect(areaOf(boolop.subtract([A], [B]))).toBeCloseTo(75);
      });
      it('Intersect area = overlap (25)', function () {
        expect(areaOf(boolop.intersect([A], [B]))).toBeCloseTo(25);
      });
      it('Exclude area = A + B - 2*overlap (100+100-50 = 150)', function () {
        expect(areaOf(boolop.exclude([A], [B]))).toBeCloseTo(150);
      });
      it('Union produces a single ring', function () {
        expect(boolop.union([A], [B])).toHaveLength(1);
      });
      it('Intersect produces a single ring', function () {
        expect(boolop.intersect([A], [B])).toHaveLength(1);
      });
    });

    describe('Two disjoint squares (no overlap)', function () {
      var A = square(0, 0, 10);
      var B = square(100, 100, 10);

      it('Union area = 200', function () {
        expect(areaOf(boolop.union([A], [B]))).toBeCloseTo(200);
      });
      it('Intersect area = 0', function () {
        expect(areaOf(boolop.intersect([A], [B]))).toBeCloseTo(0);
      });
      it('Subtract area = 100 (subject unchanged)', function () {
        expect(areaOf(boolop.subtract([A], [B]))).toBeCloseTo(100);
      });
      it('Exclude area = 200', function () {
        expect(areaOf(boolop.exclude([A], [B]))).toBeCloseTo(200);
      });
    });

    describe('One square fully contained in another', function () {
      var big = square(0, 0, 20);    // area 400, spans [-10,10]^2
      var small = square(3, 3, 10);  // area 100, spans [-2,8]^2, fully inside

      it('Union area = 400 (outer only)', function () {
        expect(areaOf(boolop.union([big], [small]))).toBeCloseTo(400);
      });
      it('Intersect area = 100', function () {
        expect(areaOf(boolop.intersect([big], [small]))).toBeCloseTo(100);
      });
      it('Subtract (big - small) area = 300', function () {
        expect(areaOf(boolop.subtract([big], [small]))).toBeCloseTo(300);
      });
      it('Exclude (big xor small) area = 300', function () {
        expect(areaOf(boolop.exclude([big], [small]))).toBeCloseTo(300);
      });
    });

    describe('Subtract is order dependent (A - B != B - A)', function () {
      var A = square(0, 0, 10);
      var B = square(5, 5, 10);

      it('A - B area = 75', function () {
        expect(areaOf(boolop.subtract([A], [B]))).toBeCloseTo(75);
      });
      it('B - A area = 75', function () {
        expect(areaOf(boolop.subtract([B], [A]))).toBeCloseTo(75);
      });
    });

    describe('Edge cases', function () {
      it('Intersect of overlapping squares yields the overlap region', function () {
        var A = square(0, 0, 10);
        var B = square(5, 5, 10);
        expect(areaOf(boolop.intersect([A], [B]))).toBeCloseTo(25);
      });
      it('All operations return arrays of rings', function () {
        var A = square(0, 0, 10), B = square(3, 0, 10);
        expect(Array.isArray(boolop.union([A], [B]))).toBe(true);
        expect(Array.isArray(boolop.subtract([A], [B]))).toBe(true);
        expect(Array.isArray(boolop.intersect([A], [B]))).toBe(true);
        expect(Array.isArray(boolop.exclude([A], [B]))).toBe(true);
      });
    });
  });

  // --- Report --------------------------------------------------------------
  function report() {
    var total = passed + failed;
    if (typeof document !== 'undefined') {
      var el = document.getElementById('result');
      if (el) {
        el.textContent = passed + ' passed, ' + failed + ' failed, ' + total + ' total';
        el.className = failed === 0 ? 'pass' : 'fail';
      }
    }
    if (typeof console !== 'undefined') {
      console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + total + ' total');
    }
    if (failed > 0 && typeof process !== 'undefined') process.exit(1);
  }

  if (typeof module !== 'undefined' && require.main === module) {
    report();
  } else if (typeof window !== 'undefined') {
    window.addEventListener('load', report);
  }
})();
