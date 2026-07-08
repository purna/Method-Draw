/**
 * Boolean path operations: Union, Subtract, Intersect, Exclude.
 *
 * Reference implementation used by the tool unit tests. It is intentionally
 * kept OUTSIDE the application (js/) so it can be validated in isolation before
 * being integrated. To integrate, move this logic into js/booleanPath.js and
 * expose it as `svgedit.boolop`.
 *
 * The algorithm is Greiner-Hormann polygon clipping (non-degenerate cases).
 * Polygons are arrays of [x, y] points. Multi-polygon input is supported by
 * passing an array of rings; the result is also an array of rings.
 *
 * Works in the browser (attaches to window.svgedit.boolop) and in Node
 * (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.svgedit = root.svgedit || {};
    root.svgedit.boolop = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;

  function Vertex(x, y) {
    this.x = x;
    this.y = y;
    this.next = null;
    this.prev = null;
    this.neighbour = null;
    this.alpha = 0;
    this.intersection = false;
    this.entry = false; // true => entry point, false => exit point
    this.visited = false;
  }

  function signedArea(poly) {
    var a = 0;
    for (var i = 0, n = poly.length; i < n; i++) {
      var p = poly[i];
      var q = poly[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function area(poly) {
    return Math.abs(signedArea(poly));
  }

  function pointInPolygon(pt, poly) {
    var x = pt[0], y = pt[1];
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1];
      var xj = poly[j][0], yj = poly[j][1];
      var intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function buildList(poly) {
    var head = null, prev = null;
    for (var i = 0; i < poly.length; i++) {
      var v = new Vertex(poly[i][0], poly[i][1]);
      if (!head) head = v;
      else { prev.next = v; v.prev = prev; }
      prev = v;
    }
    prev.next = head;
    head.prev = prev;
    return head;
  }

  function ringFromList(head) {
    var ring = [];
    var v = head;
    do {
      if (!v.intersection) ring.push([v.x, v.y]);
      v = v.next;
    } while (v !== head);
    return ring;
  }

  function insertIntersection(listHead, start, end, alpha, point) {
    var v = new Vertex(point[0], point[1]);
    v.intersection = true;
    v.alpha = alpha;
    var cur = start;
    while (cur.next !== listHead && cur.next !== end &&
           cur.next.alpha < alpha) {
      cur = cur.next;
    }
    v.next = cur.next;
    v.prev = cur;
    cur.next.prev = v;
    cur.next = v;
    return v;
  }

  function findIntersections(subjHead, clipHead) {
    var s = subjHead;
    do {
      var sNext = s.next;
      var dx1 = sNext.x - s.x;
      var dy1 = sNext.y - s.y;
      var c = clipHead;
      do {
        var cNext = c.next;
        var dx2 = cNext.x - c.x;
        var dy2 = cNext.y - c.y;
        var denom = dy1 * dx2 - dx1 * dy2;
        if (Math.abs(denom) > EPS) {
          var a = ((c.y - s.y) * dx2 - (c.x - s.x) * dy2) / denom;
          var b = ((c.y - s.y) * dx1 - (c.x - s.x) * dy1) / denom;
          if (a > EPS && a < 1 - EPS && b > EPS && b < 1 - EPS) {
            var px = s.x + a * dx1;
            var py = s.y + a * dy1;
            var sv = insertIntersection(subjHead, s, sNext, a, [px, py]);
            var cv = insertIntersection(clipHead, c, cNext, b, [px, py]);
            sv.neighbour = cv;
            cv.neighbour = sv;
          }
        }
        c = cNext;
      } while (c !== clipHead);
      s = sNext;
    } while (s !== subjHead);
  }

  function markEntryExit(subjHead, clipHead) {
    // Determine whether the first clip vertex lies inside the subject polygon.
    var inside = pointInPolygon([clipHead.x, clipHead.y], ringFromList(subjHead));
    var c = clipHead;
    do {
      if (c.intersection) {
        c.entry = !inside; // first intersection: entry if starting outside
        inside = !inside;
      }
      c = c.next;
    } while (c !== clipHead);

    // Subject intersections take the opposite status of their clip neighbour.
    var s = subjHead;
    do {
      if (s.intersection) {
        s.entry = !s.neighbour.entry;
      }
      s = s.next;
    } while (s !== subjHead);
  }

  function trace(subjHead) {
    var results = [];
    var start = subjHead;
    do {
      if (start.intersection && !start.visited) {
        var ring = [];
        var v = start;
        do {
          v.visited = true;
          v.neighbour.visited = true;
          if (v.entry) {
            do {
              ring.push([v.x, v.y]);
              v = v.next;
            } while (!v.intersection);
          } else {
            do {
              ring.push([v.x, v.y]);
              v = v.prev;
            } while (!v.intersection);
          }
          v = v.neighbour;
        } while (!v.visited);
        if (ring.length >= 3) results.push(ring);
      }
      start = start.next;
    } while (start !== subjHead);
    return results;
  }

  function invertEntryExit(head) {
    var v = head;
    do {
      if (v.intersection) v.entry = !v.entry;
      v = v.next;
    } while (v !== head);
  }

  // invertSubj/invertClip select which boolean op comes out of the trace:
  //   AND (intersect):      invertSubj=false, invertClip=false
  //   OR  (union):          invertSubj=true,  invertClip=true
  //   A-B (subject-clip):   invertSubj=false, invertClip=true
  //   B-A (clip-subject):   invertSubj=true,  invertClip=false
  function clipOperation(subjPoly, clipPoly, invertSubj, invertClip) {
    var subjHead = buildList(subjPoly);
    var clipHead = buildList(clipPoly);
    findIntersections(subjHead, clipHead);
    markEntryExit(subjHead, clipHead);
    if (invertSubj) invertEntryExit(subjHead);
    if (invertClip) invertEntryExit(clipHead);
    return trace(subjHead);
  }

  function totalArea(rings) {
    // Sum SIGNED area, not abs(area) per ring. A hole is represented as a
    // ring with reversed (opposite) orientation to its enclosing ring, so
    // its signed area is negative and correctly subtracts from the total.
    var sum = 0;
    for (var i = 0; i < rings.length; i++) sum += signedArea(rings[i]);
    return Math.abs(sum);
  }

  // Each op works on a single subject ring and a single clip ring.
  function run(op, subj, clip) {
    // Ensure subject is counter-clockwise (positive area) for predictable tracing.
    var s = subj.slice();
    if (signedArea(s) < 0) s.reverse();
    var c = clip.slice();
    if (signedArea(c) < 0) c.reverse();

    var intersect = clipOperation(s, c, false, false);

    if (intersect.length === 0) {
      // No edge crossings found. This is NOT necessarily "disjoint" - the
      // classic Greiner-Hormann trace only finds edge crossings, so a
      // polygon fully nested inside another (no edges cross) looks
      // identical to two polygons that never touch. Disambiguate with a
      // point-in-polygon test before falling back to the disjoint case.
      var cInS = pointInPolygon(c[0], s);
      var sInC = pointInPolygon(s[0], c);

      if (cInS) { // clip fully inside subject
        switch (op) {
          case 'union': return [s];
          case 'intersect': return [c];
          case 'subtract': return [s, c.slice().reverse()]; // s with a c-shaped hole
          case 'exclude': return [s, c.slice().reverse()];  // A-B only; B-A is empty
        }
      } else if (sInC) { // subject fully inside clip
        switch (op) {
          case 'union': return [c];
          case 'intersect': return [s];
          case 'subtract': return []; // s is entirely removed
          case 'exclude': return [c, s.slice().reverse()]; // B-A only; A-B is empty
        }
      } else { // genuinely disjoint
        switch (op) {
          case 'union': return [s, c];
          case 'intersect': return [];
          case 'subtract': return [s];
          case 'exclude': return [s, c];
        }
      }
    }

    if (op === 'intersect') {
      return intersect;
    }
    if (op === 'union') {
      // Inverting BOTH lists' entry/exit flags flips the trace from
      // "boundary of the overlap" to "outer boundary of the combined shape".
      return clipOperation(s, c, true, true);
    }
    if (op === 'subtract') {
      // A - B: invert only the clip list's flags.
      return clipOperation(s, c, false, true);
    }
    if (op === 'exclude') {
      // XOR = (A-B) u (B-A). These two pieces never overlap each other, so
      // they can simply be concatenated as separate rings rather than run
      // through a second union pass. Swapping which polygon is "subject"
      // between the two calls can flip winding direction, so normalize
      // both to positive (solid, non-hole) orientation before combining.
      var ab = clipOperation(s, c, false, true).map(function (r) {
        return signedArea(r) < 0 ? r.slice().reverse() : r;
      });
      var ba = clipOperation(c, s, false, true).map(function (r) {
        return signedArea(r) < 0 ? r.slice().reverse() : r;
      });
      return ab.concat(ba);
    }
    throw new Error('Unknown boolean op: ' + op);
  }

  function opMulti(op, subjectRings, clipRings) {
    var out = [];
    for (var i = 0; i < subjectRings.length; i++) {
      var acc = [subjectRings[i]];
      for (var j = 0; j < clipRings.length; j++) {
        var next = [];
        for (var k = 0; k < acc.length; k++) {
          var res = run(op, acc[k], clipRings[j]);
          for (var r = 0; r < res.length; r++) next.push(res[r]);
        }
        acc = next;
      }
      for (var m = 0; m < acc.length; m++) out.push(acc[m]);
    }
    return out;
  }

  return {
    union: function (subject, clip) { return opMulti('union', subject, clip); },
    subtract: function (subject, clip) { return opMulti('subtract', subject, clip); },
    intersect: function (subject, clip) { return opMulti('intersect', subject, clip); },
    exclude: function (subject, clip) { return opMulti('exclude', subject, clip); },
    _internal: {
      signedArea: signedArea,
      area: area,
      totalArea: totalArea,
      pointInPolygon: pointInPolygon
    }
  };
});
