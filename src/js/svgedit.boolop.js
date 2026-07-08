(function (root, factory) {
    root.svgedit = root.svgedit || {};
    root.svgedit.boolop = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    var EPS = 1e-9;
    function Vertex(x, y) {
        this.x = x; this.y = y; this.next = null; this.prev = null;
        this.neighbour = null; this.alpha = 0; this.intersection = false;
        this.entry = false; this.visited = false;
    }
    function signedArea(poly) {
        var a = 0;
        for (var i = 0, n = poly.length; i < n; i++) {
            var p = poly[i], q = poly[(i + 1) % n];
            a += p[0] * q[1] - q[0] * p[1];
        }
        return a / 2;
    }
    function area(poly) { return Math.abs(signedArea(poly)); }
    function pointInPolygon(pt, poly) {
        var x = pt[0], y = pt[1], inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    function buildList(poly) {
        var head = null, prev = null;
        for (var i = 0; i < poly.length; i++) {
            var v = new Vertex(poly[i][0], poly[i][1]);
            if (!head) head = v; else { prev.next = v; v.prev = prev; }
            prev = v;
        }
        prev.next = head; head.prev = prev;
        return head;
    }
    function ringFromList(head) {
        var ring = [], v = head;
        do { if (!v.intersection) ring.push([v.x, v.y]); v = v.next; } while (v !== head);
        return ring;
    }
    function insertIntersection(listHead, start, end, alpha, point) {
        var v = new Vertex(point[0], point[1]);
        v.intersection = true; v.alpha = alpha;
        var cur = start;
        while (cur.next !== listHead && cur.next !== end && cur.next.alpha < alpha) cur = cur.next;
        v.next = cur.next; v.prev = cur; cur.next.prev = v; cur.next = v;
        return v;
    }
    function findIntersections(subjHead, clipHead) {
        var s = subjHead;
        do {
            var sNext = s.next, dx1 = sNext.x - s.x, dy1 = sNext.y - s.y, c = clipHead;
            do {
                var cNext = c.next, dx2 = cNext.x - c.x, dy2 = cNext.y - c.y;
                var denom = dy1 * dx2 - dx1 * dy2;
                if (Math.abs(denom) > EPS) {
                    var a = ((c.y - s.y) * dx2 - (c.x - s.x) * dy2) / denom;
                    var b = ((c.y - s.y) * dx1 - (c.x - s.x) * dy1) / denom;
                    if (a > EPS && a < 1 - EPS && b > EPS && b < 1 - EPS) {
                        var px = s.x + a * dx1, py = s.y + a * dy1;
                        var sv = insertIntersection(subjHead, s, sNext, a, [px, py]);
                        var cv = insertIntersection(clipHead, c, cNext, b, [px, py]);
                        sv.neighbour = cv; cv.neighbour = sv;
                    }
                }
                c = cNext;
            } while (c !== clipHead);
            s = sNext;
        } while (s !== subjHead);
    }
    function markEntryExit(subjHead, clipHead) {
        var inside = pointInPolygon([clipHead.x, clipHead.y], ringFromList(subjHead));
        var c = clipHead;
        do {
            if (c.intersection) { c.entry = !inside; inside = !inside; }
            c = c.next;
        } while (c !== clipHead);
        var s = subjHead;
        do { if (s.intersection) s.entry = !s.neighbour.entry; s = s.next; } while (s !== subjHead);
    }
    function trace(subjHead) {
        var results = [], start = subjHead;
        do {
            if (start.intersection && !start.visited) {
                var ring = [], v = start;
                do {
                    v.visited = true; v.neighbour.visited = true;
                    if (v.entry) { do { ring.push([v.x, v.y]); v = v.next; } while (!v.intersection); }
                    else { do { ring.push([v.x, v.y]); v = v.prev; } while (!v.intersection); }
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
        do { if (v.intersection) v.entry = !v.entry; v = v.next; } while (v !== head);
    }
    function clipOperation(subjPoly, clipPoly, invertSubj, invertClip) {
        var subjHead = buildList(subjPoly), clipHead = buildList(clipPoly);
        findIntersections(subjHead, clipHead);
        markEntryExit(subjHead, clipHead);
        if (invertSubj) invertEntryExit(subjHead);
        if (invertClip) invertEntryExit(clipHead);
        return trace(subjHead);
    }
    function totalArea(rings) {
        var sum = 0;
        for (var i = 0; i < rings.length; i++) sum += signedArea(rings[i]);
        return Math.abs(sum);
    }
    function run(op, subj, clip) {
        var s = subj.slice(); if (signedArea(s) < 0) s.reverse();
        var c = clip.slice(); if (signedArea(c) < 0) c.reverse();
        var intersect = clipOperation(s, c, false, false);
        if (intersect.length === 0) {
            var cInS = pointInPolygon(c[0], s), sInC = pointInPolygon(s[0], c);
            if (cInS) {
                switch (op) {
                    case 'union': return [s];
                    case 'intersect': return [c];
                    case 'subtract': return [s, c.slice().reverse()];
                    case 'exclude': return [s, c.slice().reverse()];
                }
            } else if (sInC) {
                switch (op) {
                    case 'union': return [c];
                    case 'intersect': return [s];
                    case 'subtract': return [];
                    case 'exclude': return [c, s.slice().reverse()];
                }
            } else {
                switch (op) {
                    case 'union': return [s, c];
                    case 'intersect': return [];
                    case 'subtract': return [s];
                    case 'exclude': return [s, c];
                }
            }
        }
        if (op === 'intersect') return intersect;
        if (op === 'union') return clipOperation(s, c, true, true);
        if (op === 'subtract') return clipOperation(s, c, false, true);
        if (op === 'exclude') {
            var ab = clipOperation(s, c, false, true).map(function (r) { return signedArea(r) < 0 ? r.slice().reverse() : r; });
            var ba = clipOperation(c, s, false, true).map(function (r) { return signedArea(r) < 0 ? r.slice().reverse() : r; });
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
        _internal: { signedArea: signedArea, area: area, totalArea: totalArea, pointInPolygon: pointInPolygon }
    };
});