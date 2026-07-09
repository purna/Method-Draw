/**
 * Animation timeline integration for Method Draw (v2 architecture).
 *
 * Each canvas element becomes one "Animation Object" parent track whose
 * lifetime is a draggable block, plus linked child property tracks
 * (colour / transform / rotation / scale / ...) that each carry their own
 * keyframes with per-keyframe easing. Playback is driven by JavaScript every
 * frame (requestAnimationFrame), applying computed values straight to the live
 * SVG element — no generated CSS @keyframes.
 *
 * Reference: test/timeline/index_v2.html
 */
methodDraw.ready(function () {
  window.methodDraw.timeline = (function () {
    var _timelineInstance;
    var objects = [];           // array of object records (parent + childRows)
    var currentTime = 0;
    var isPlaying = false;
    var timelineDuration = 5000;
    var animationFrameId = null;
    var loopActive = true;
    var selectedKeyframe = null; // { object, row, keyframe }
    var parentGroupMarker = { id: 'object-span' };

    var HEADER_HEIGHT = 45;
    var LEFT_MARGIN = 25;
    var DEFAULT_ROW_DURATION = 2000;

    // --- small math helpers --------------------------------------------------

    function clamp01(t) { return Math.max(0, Math.min(1, t)); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function isLightMode() {
      return document.body.classList.contains('inverted');
    }

    function hexToRgb(hex) {
      var h = (hex || '#000000').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHex(r, g, b) {
      function c(v) { var s = Math.round(v).toString(16); return s.length === 1 ? '0' + s : s; }
      return '#' + c(r) + c(g) + c(b);
    }

    function lerpColorHex(c0, c1, t) {
      var a = hexToRgb(c0), b = hexToRgb(c1);
      return rgbToHex(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
    }

    // --- property definitions ------------------------------------------------
    // Each property knows its label, swatch colour, which element types it
    // applies to, its kind (for interpolation), and how to read/write it on a
    // live SVG element.

    var ACCENT = '#3a7bd5';

    function getElementCenter(elem) {
      try {
        var bbox = svgedit.utilities.getBBox(elem);
        if (bbox) return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
      } catch (e) { /* ignore */ }
      return { x: 0, y: 0 };
    }

    function readProp(elem, propKey) {
      switch (propKey) {
        case 'colourFill': return elem.getAttribute('fill') || '#000000';
        case 'opacity': return parseFloat(elem.getAttribute('opacity') || '1');
        case 'rotation':
          try { return svgedit.utilities.getRotationAngle(elem) || 0; } catch (e) { return 0; }
        case 'position':
          return { x: parseFloat(elem.getAttribute('x') || 0), y: parseFloat(elem.getAttribute('y') || 0) };
        case 'scale': return 1;
        default: return null;
      }
    }

    var PROPERTY_DEFS = {
      colourFill: { label: 'Colour', kind: 'color', swatch: '#c0392b', appliesTo: ['rect', 'ellipse', 'circle', 'path', 'line', 'polygon', 'polyline', 'text', 'image'],
        seed: function (v) { return v && v !== 'none' ? v : ACCENT; } },
      position: { label: 'Position', kind: 'point', swatch: '#3a7bd5', appliesTo: ['rect', 'ellipse', 'circle', 'path', 'line', 'polygon', 'polyline', 'text', 'image'],
        seed: function (v) { return { x: (v ? v.x : 0) + 40, y: v ? v.y : 0 }; } },
      rotation: { label: 'Rotation', kind: 'number', swatch: '#e8b33a', appliesTo: ['rect', 'ellipse', 'circle', 'path', 'line', 'polygon', 'polyline', 'text', 'image'],
        seed: function (v) { return (v || 0) + 90; } },
      scale: { label: 'Scale', kind: 'number', swatch: '#9b59b6', appliesTo: ['rect', 'ellipse', 'circle', 'path', 'line', 'polygon', 'polyline', 'text', 'image'],
        seed: function (v) { return (v || 1) * 1.3; } },
      opacity: { label: 'Opacity', kind: 'number', swatch: '#7f8c8d', appliesTo: ['rect', 'ellipse', 'circle', 'path', 'line', 'polygon', 'polyline', 'text', 'image'],
        seed: function (v) { return v === undefined ? 0.3 : v; } }
    };

    function getAnimatablePropertyKeys(objectType) {
      return Object.keys(PROPERTY_DEFS).filter(function (key) {
        return PROPERTY_DEFS[key].appliesTo.indexOf(objectType) !== -1;
      });
    }

    // --- helpers -------------------------------------------------------------

    function findObject(elementId) {
      for (var i = 0; i < objects.length; i++) {
        if (objects[i].elementId === elementId) return objects[i];
      }
      return null;
    }

    function ensureElementId(elem) {
      var id = elem.id;
      if (!id) {
        id = 'elem_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        elem.id = id;
      }
      return id;
    }

    // --- flat model the library consumes ------------------------------------

    function currentModel() {
      var rows = [];
      objects.forEach(function (object) {
        rows.push(object.parentRow);
        if (object.expanded) {
          object.childRows.forEach(function (childRow) {
            childRow.style = childRow.style || {};
            childRow.style.keyframesStyle = { shape: timelineModule.TimelineKeyframeShape.None };
            rows.push(childRow);
          });
        }
      });
      return { rows: rows };
    }

    // Build the parent + child rows for a canvas element.

    function addToTimeline(elem) {
      if (!elem || !elem.parentNode) return;

      var elementId = ensureElementId(elem);
      if (findObject(elementId)) return; // already tracked

      var objectType = elem.nodeName.toLowerCase();
      var center = getElementCenter(elem);
      var object = {
        title: 'Animation Object',
        objectType: objectType,
        elementId: elementId,
        element: elem,
        locked: false,
        expanded: true,
        removed: false,
        center: center,
        childRows: [],
        _lastStart: 0
      };

      object.parentRow = {
        title: 'Animation Object',
        objectId: elementId,
        isParent: true,
        locked: false,
        elementId: elementId,
        element: elem,
        style: { height: 34 },
        keyframes: [
          { val: 0, group: parentGroupMarker },
          { val: DEFAULT_ROW_DURATION, group: parentGroupMarker }
        ]
      };

      // Child property tracks are NOT created automatically — the user adds
      // them on demand via the "add property" popover. Start with none.

      objects.push(object);
      object._lastStart = object.parentRow.keyframes[0].val;

      refreshAll();
    }

    // Parent -> child link sync: dragging the parent block shifts every
    // non-locked child keyframe by the same delta.

    function syncChildrenToParent(evt, object) {
      if (!object || !evt || !evt.target || evt.target.row !== object.parentRow) return;
      var isBlockMove = evt.target.type === timelineModule.TimelineElementType.Group;
      var newStart = object.parentRow.keyframes[0].val;
      var delta = newStart - object._lastStart;
      object._lastStart = newStart;
      if (!isBlockMove || !delta) return;
      if (object.locked) { object._lastStart = object.parentRow.keyframes[0].val; return; }
      object.childRows.forEach(function (childRow) {
        if (childRow.locked) return;
        childRow.keyframes.forEach(function (kf) { kf.val += delta; });
      });
      _timelineInstance.setModel(currentModel());
      _timelineInstance.redraw();
      renderKeyframeOverlay();
      applyTime(_timelineInstance.getTime());
    }

    // --- value at time -------------------------------------------------------

    function interpolateValue(k0, k1, t) {
      var eased = window.methodDraw.easing.getEasingFn(k0.easing)(t);
      var a = k0.value, b = k1.value;
      if (typeof a === 'string' || typeof b === 'string') {
        return lerpColorHex(a, b, eased);
      }
      if (a && typeof a === 'object' && b && typeof b === 'object') {
        return { x: lerp(a.x, b.x, eased), y: lerp(a.y, b.y, eased) };
      }
      return lerp(a, b, eased);
    }

    // Returns the concrete value of a single child track at time ms.

    function valueAt(childRow, ms) {
      var kfs = childRow.keyframes.slice().sort(function (a, b) { return a.val - b.val; });
      if (!kfs.length) return null;
      if (ms <= kfs[0].val) return kfs[0].value;
      if (ms >= kfs[kfs.length - 1].val) return kfs[kfs.length - 1].value;
      var k0 = kfs[0], k1 = kfs[1];
      for (var i = 0; i < kfs.length - 1; i++) {
        if (ms >= kfs[i].val && ms <= kfs[i + 1].val) { k0 = kfs[i]; k1 = kfs[i + 1]; break; }
      }
      var t = (k1.val === k0.val) ? 0 : clamp01((ms - k0.val) / (k1.val - k0.val));
      return interpolateValue(k0, k1, t);
    }

    // Compose and apply every child track's value to the live element.

    function applyTime(ms) {
      suppressKeyframeCapture = true;
      objects.forEach(function (object) {
        if (object.removed || !object.element || !object.element.parentNode) return;
        var state = { dx: 0, dy: 0, rot: 0, scale: 1, fill: null, opacity: null };
        var center = object.center || getElementCenter(object.element);
        object.childRows.forEach(function (childRow) {
          if (childRow.locked) return;
          var v = valueAt(childRow, ms);
          if (v === null || v === undefined) return;
          switch (childRow.propKey) {
            case 'colourFill': state.fill = v; break;
            case 'opacity': state.opacity = v; break;
            case 'rotation': state.rot = v; break;
            case 'scale': state.scale = v; break;
            case 'position':
              state.dx = (v.x || 0) - (object.element.getAttribute('x') ? parseFloat(object.element.getAttribute('x')) : 0);
              state.dy = (v.y || 0) - (object.element.getAttribute('y') ? parseFloat(object.element.getAttribute('y')) : 0);
              break;
          }
        });

        var elem = object.element;
        var hasTransform = state.dx || state.dy || state.rot || state.scale !== 1;
        if (hasTransform) {
          var transform = 'translate(' + state.dx + ',' + state.dy + ') ' +
            'translate(' + center.x + ',' + center.y + ') ' +
            'rotate(' + state.rot + ') ' +
            'scale(' + state.scale + ') ' +
            'translate(' + (-center.x) + ',' + (-center.y) + ')';
          elem.setAttribute('transform', transform);
        }
        if (state.fill !== null) elem.setAttribute('fill', state.fill);
        if (state.opacity !== null) elem.setAttribute('opacity', state.opacity);
      });
      suppressKeyframeCapture = false;
    }

    // --- keyframe capture (manual + auto on canvas change) -----------------

    var suppressKeyframeCapture = false;

    function valuesEqual(a, b) {
      if (a === b) return true;
      if (typeof a === 'object' && a && typeof b === 'object' && b) {
        return a.x === b.x && a.y === b.y;
      }
      return false;
    }

    // Return the keyframe at ~ms (within 1ms), else create a new one. The
    // caller is responsible for setting its value.
    function findOrCreateKeyframe(row, ms) {
      var near = null, best = Infinity;
      row.keyframes.forEach(function (kf) {
        var d = Math.abs(kf.val - ms);
        if (d < best) { best = d; near = kf; }
      });
      if (near && best <= 1) return near;
      var kf = { val: ms, easing: 'linear', value: null };
      row.keyframes.push(kf);
      return kf;
    }

    // Upsert a keyframe on a track at ms, capturing the element's live value.
    function addKeyframeToRow(object, row, ms) {
      if (row.locked || object.locked) return;
      var live = readProp(object.element, row.propKey);
      var kf = findOrCreateKeyframe(row, ms);
      kf.value = live;
      kf.easing = kf.easing || 'linear';
    }

    // Auto-keyframe: when a tracked element is edited on the canvas, record its
    // current values into any existing child tracks at the playhead. (Tracks
    // the user has not added are left alone, per the add-on-demand rule.)
    function captureCanvasChanges(elems) {
      if (suppressKeyframeCapture) return;
      var ms = currentTime;
      var changed = false;
      (elems || []).forEach(function (elem) {
        if (!elem) return;
        var obj = findObject(elem.id);
        if (!obj || obj.childRows.length === 0) return;
        obj.childRows.forEach(function (row) {
          if (row.locked) return;
          var live = readProp(elem, row.propKey);
          var atTime = valueAt(row, ms);
          if (valuesEqual(live, atTime)) return; // value already matches playhead
          addKeyframeToRow(obj, row, ms);
          changed = true;
        });
      });
      if (changed) refreshAll();
    }

    function removeObject(elementId) {
      for (var i = 0; i < objects.length; i++) {
        if (objects[i].elementId === elementId) {
          objects[i].removed = true;
          objects.splice(i, 1);
          break;
        }
      }
      refreshAll();
    }

    function removeChildRow(object, childRow) {
      var idx = object.childRows.indexOf(childRow);
      if (idx !== -1) object.childRows.splice(idx, 1);
      refreshAll();
    }

    // --- Phase 5: persistence -----------------------------------------------

    var META_ID = 'methoddraw-animation';

    // Serialise the animation model to a plain object (no live element refs).

    function serialize() {
      return {
        version: 1,
        timelineDuration: timelineDuration,
        loopActive: loopActive,
        objects: objects.map(function (obj) {
          if (obj.removed) return null;
          return {
            elementId: obj.elementId,
            objectType: obj.objectType,
            expanded: obj.expanded,
            locked: obj.locked,
            parentKeyframes: obj.parentRow.keyframes.map(function (kf) { return { val: kf.val }; }),
            childRows: obj.childRows.map(function (row) {
              return {
                propKey: row.propKey,
                locked: row.locked,
                keyframes: row.keyframes.map(function (kf) {
                  return { val: kf.val, easing: kf.easing, value: kf.value };
                })
              };
            })
          };
        }).filter(Boolean)
      };
    }

    // Rebuild the model from serialised data, re-binding elements by id.

    function loadFromData(data) {
      if (!data || !data.objects) return;
      objects = [];
      if (typeof data.timelineDuration === 'number') {
        timelineDuration = data.timelineDuration;
        var di = document.getElementById('timeline_duration_input');
        if (di) di.value = timelineDuration;
      }
      if (typeof data.loopActive === 'boolean') {
        loopActive = data.loopActive;
        var lb = document.getElementById('tool_timeline_loop');
        if (lb) lb.classList.toggle('active', loopActive);
      }
      data.objects.forEach(function (od) {
        var elem = document.getElementById(od.elementId);
        if (!elem) return; // element missing from document; skip
        var object = {
          title: 'Animation Object',
          objectType: od.objectType,
          elementId: od.elementId,
          element: elem,
          locked: !!od.locked,
          expanded: od.expanded !== false,
          removed: false,
          center: getElementCenter(elem),
          childRows: [],
          _lastStart: 0
        };
        object.parentRow = {
          title: 'Animation Object',
          objectId: od.elementId,
          isParent: true,
          locked: object.locked,
          elementId: od.elementId,
          element: elem,
        style: { height: 34 },
        keyframes: ((od.parentKeyframes && od.parentKeyframes.length) ? od.parentKeyframes : [{ val: 0 }, { val: DEFAULT_ROW_DURATION }])
            .map(function (k) { return { val: k.val, group: parentGroupMarker }; })
        };
        (od.childRows || []).forEach(function (cd) {
          var def = PROPERTY_DEFS[cd.propKey] || { label: cd.propKey, swatch: '#6b7280' };
          object.childRows.push({
            title: def.label,
            propKey: cd.propKey,
            objectId: object.elementId,
            parentId: object.elementId,
            locked: false,
            style: { height: 26 },
            keyframes: cd.keyframes.map(function (k) {
              return { val: k.val, easing: k.easing || 'linear', value: k.value };
            })
          });
        });
        objects.push(object);
        object._lastStart = object.parentRow.keyframes[0].val;
      });
      refreshAll();
    }

    function injectMetadataNode() {
      var root = document.getElementById('svgcontent');
      if (!root) return null;
      var existing = root.querySelector('metadata#' + META_ID);
      if (existing) existing.parentNode.removeChild(existing);
      var meta = document.createElementNS(SVG_NS, 'metadata');
      meta.setAttribute('id', META_ID);
      try {
        meta.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(serialize()))));
      } catch (e) { return null; }
      root.appendChild(meta);
      return meta;
    }

    function readMetadataFromDom() {
      var root = document.getElementById('svgcontent');
      if (!root) return null;
      var meta = root.querySelector('metadata#' + META_ID);
      if (!meta || !meta.textContent) return null;
      try {
        var data = JSON.parse(decodeURIComponent(escape(atob(meta.textContent))));
        meta.parentNode.removeChild(meta); // strip after reading
        return data;
      } catch (e) { return null; }
    }

    // Wrap the canvas serialiser so animation data rides along inside the SVG
    // <metadata> element, and re-bind on load.

    function hookPersistence() {
      var sc = window.methodDraw.canvas;
      if (!sc || !sc.svgCanvasToString || !sc.setSvgString) return;

      var origToString = sc.svgCanvasToString;
      sc.svgCanvasToString = function () {
        var node = injectMetadataNode();
        try {
          return origToString.apply(this, arguments);
        } finally {
          if (node && node.parentNode) node.parentNode.removeChild(node);
        }
      };

      var origSet = sc.setSvgString;
      sc.setSvgString = function (xmlString) {
        var res = origSet.apply(this, arguments);
        var data = readMetadataFromDom();
        if (data) loadFromData(data);
        return res;
      };
    }

    // --- Phase 6: export -----------------------------------------------------

    function easingToCSSTiming(easing) {
      var e = window.methodDraw.easing;
      if (e.isBounceKey(easing)) return 'linear';
      var p = e.parseBezierString(easing);
      return 'cubic-bezier(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + p[3] + ')';
    }

    // Generate CSS @keyframes for the current animation. Fill/opacity each get
    // their own rule (with per-step easing); transform properties are combined
    // into one rule (linear) since CSS cannot independently ease a shared
    // transform.

    function generateCSSKeyframes() {
      var css = '';
      objects.forEach(function (obj) {
        if (obj.removed || !obj.element) return;
        var center = obj.center || getElementCenter(obj.element);
        var transformProps = obj.childRows.filter(function (r) { return ['position', 'rotation', 'scale'].indexOf(r.propKey) !== -1 && !r.locked; });
        var otherProps = obj.childRows.filter(function (r) { return ['colourFill', 'opacity'].indexOf(r.propKey) !== -1 && !r.locked; });

        var times = {};
        obj.childRows.forEach(function (r) {
          if (r.locked) return;
          r.keyframes.forEach(function (kf) { times[Math.round((kf.val / timelineDuration) * 1000) / 10] = true; });
        });
        var pcts = Object.keys(times).map(Number).sort(function (a, b) { return a - b; });
        if (!pcts.length) return;

        // transform rule (combined, linear)
        if (transformProps.length) {
          var tname = 'md-anim-' + obj.elementId + '-t';
          css += '@keyframes ' + tname + ' {\n';
          pcts.forEach(function (pct) {
            var ms = (pct / 100) * timelineDuration;
            var dx = 0, dy = 0, rot = 0, scale = 1;
            transformProps.forEach(function (r) {
              var v = valueAt(r, ms);
              if (v === null || v === undefined) return;
              if (r.propKey === 'rotation') rot = v;
              else if (r.propKey === 'scale') scale = v;
              else if (r.propKey === 'position') {
                dx = (v.x || 0) - (obj.element.getAttribute('x') ? parseFloat(obj.element.getAttribute('x')) : 0);
                dy = (v.y || 0) - (obj.element.getAttribute('y') ? parseFloat(obj.element.getAttribute('y')) : 0);
              }
            });
            var transform = 'translate(' + dx + 'px,' + dy + 'px) translate(' + center.x + 'px,' + center.y + 'px) rotate(' + rot + 'deg) scale(' + scale + ') translate(' + (-center.x) + 'px,' + (-center.y) + 'px)';
            css += '  ' + pct + '% { transform: ' + transform + '; }\n';
          });
          css += '}\n';
          css += '#' + obj.elementId + ' { animation: ' + tname + ' ' + timelineDuration + 'ms linear' + (loopActive ? ' infinite' : '') + '; }\n\n';
        }

        // fill / opacity rules (per-step easing)
        otherProps.forEach(function (r) {
          var kfs = r.keyframes.slice().sort(function (a, b) { return a.val - b.val; });
          var name = 'md-anim-' + obj.elementId + '-' + r.propKey;
          css += '@keyframes ' + name + ' {\n';
          kfs.forEach(function (kf, i) {
            var pct = Math.round((kf.val / timelineDuration) * 1000) / 10;
            css += '  ' + pct + '% { ' + (r.propKey === 'colourFill' ? 'fill' : 'opacity') + ': ' + kf.value + ';';
            if (i < kfs.length - 1) css += ' animation-timing-function: ' + easingToCSSTiming(kf.easing) + ';';
            css += ' }\n';
          });
          css += '}\n';
          css += '#' + obj.elementId + ' { animation: ' + name + ' ' + timelineDuration + 'ms linear' + (loopActive ? ' infinite' : '') + '; }\n\n';
        });
      });
      return css;
    }

    // Generate SMIL <animate>/<animateTransform> elements (additive transforms
    // compose). Returns a string of elements to inject into the SVG.

    function generateSMIL() {
      var out = [];
      objects.forEach(function (obj) {
        if (obj.removed || !obj.element) return;
        var center = obj.center || getElementCenter(obj.element);
        obj.childRows.forEach(function (r) {
          if (r.locked || r.keyframes.length < 2) return;
          var kfs = r.keyframes.slice().sort(function (a, b) { return a.val - b.val; });
          // Normalise so keyTimes always span 0..1 (SMIL requires it).
          if (kfs[0].val > 0) kfs.unshift({ val: 0, value: kfs[0].value, easing: 'linear' });
          if (kfs[kfs.length - 1].val < timelineDuration) kfs.push({ val: timelineDuration, value: kfs[kfs.length - 1].value, easing: kfs[kfs.length - 1].easing });

          var keyTimes = kfs.map(function (k) { return (k.val / timelineDuration).toFixed(4); }).join(';');
          var splines = [];
          for (var i = 0; i < kfs.length - 1; i++) {
            var p = window.methodDraw.easing.parseBezierString(kfs[i].easing);
            splines.push(p[0] + ' ' + p[1] + ' ' + p[2] + ' ' + p[3]);
          }
          var base = 'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#' + obj.elementId + '" begin="0s" dur="' + timelineDuration + 'ms" fill="freeze" calcMode="spline" repeatCount="' + (loopActive ? 'indefinite' : '1') + '" keyTimes="' + keyTimes + '" keySplines="' + splines.join(';') + '"';
          if (r.propKey === 'colourFill') {
            out.push('<animate ' + base + ' attributeName="fill" values="' + kfs.map(function (k) { return k.value; }).join(';') + '"/>');
          } else if (r.propKey === 'opacity') {
            out.push('<animate ' + base + ' attributeName="opacity" values="' + kfs.map(function (k) { return k.value; }).join(';') + '"/>');
          } else if (r.propKey === 'rotation') {
            out.push('<animateTransform ' + base + ' attributeName="transform" type="rotate" additive="sum" values="' + kfs.map(function (k) { return k.value + ' ' + center.x + ' ' + center.y; }).join(';') + '"/>');
          } else if (r.propKey === 'scale') {
            out.push('<animateTransform ' + base + ' attributeName="transform" type="scale" additive="sum" values="' + kfs.map(function (k) { return k.value + ' ' + k.value; }).join(';') + '"/>');
          } else if (r.propKey === 'position') {
            var bx = obj.element.getAttribute('x') ? parseFloat(obj.element.getAttribute('x')) : 0;
            var by = obj.element.getAttribute('y') ? parseFloat(obj.element.getAttribute('y')) : 0;
            out.push('<animateTransform ' + base + ' attributeName="transform" type="translate" additive="sum" values="' + kfs.map(function (k) { return ((k.value.x || 0) - bx) + ' ' + ((k.value.y || 0) - by); }).join(';') + '"/>');
          }
        });
      });
      return out.join('\n');
    }

    // Build a standalone HTML file that contains the current SVG plus a <style>
    // block with the generated CSS @keyframes, and download it.

    function exportAnimation() {
      if (!window.methodDraw.canvas || !window.methodDraw.canvas.getSvgString) return;
      var svg = window.methodDraw.canvas.getSvgString();
      var css = generateCSSKeyframes();
      var smil = generateSMIL();
      var html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n'
        + '<title>Method Draw Animation</title>\n<style>\n'
        + css
        + '\nsvg { width: 100%; height: auto; background: #fff; }\n</style>\n</head>\n<body>\n'
        + svg.replace('>', '>\n' + smil + '\n', 1)
        + '\n</body>\n</html>\n';
      var blob = new Blob([html], { type: 'text/html' });
      if (window.saveAs) window.saveAs(blob, (window.methodDraw.canvas.getDocumentTitle ? window.methodDraw.canvas.getDocumentTitle() : 'drawing') + '-animation.html');
    }

    // --- custom keyframe overlay --------------------------------------------

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var overlaySvg = null;

    function ensureOverlay() {
      if (overlaySvg) return overlaySvg;
      overlaySvg = document.createElementNS(SVG_NS, 'svg');
      overlaySvg.setAttribute('class', 'timeline-keyframe-overlay');
      document.getElementById('timeline').appendChild(overlaySvg);
      return overlaySvg;
    }

    function computeRowLayout() {
      var y = HEADER_HEIGHT;
      var layout = [];
      objects.forEach(function (object) {
        layout.push({ object: object, row: object.parentRow, top: y, height: object.parentRow.style.height, center: y + object.parentRow.style.height / 2 });
        y += object.parentRow.style.height;
        if (object.expanded) {
          object.childRows.forEach(function (childRow) {
            layout.push({ object: object, row: childRow, top: y, height: childRow.style.height, center: y + childRow.style.height / 2 });
            y += childRow.style.height;
          });
        }
      });
      return layout;
    }

    function renderKeyframeOverlay() {
      var svg = ensureOverlay();
      if (svg.parentNode !== document.getElementById('timeline')) {
        document.getElementById('timeline').appendChild(svg);
      }
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      if (!_timelineInstance) return;

      computeRowLayout().forEach(function (entry) {
        if (entry.row.isParent) return;
        entry.row.keyframes.forEach(function (kf) {
          var x = Math.floor(_timelineInstance.valToPx(kf.val) - _timelineInstance.scrollLeft + LEFT_MARGIN);
          var y = Math.floor(entry.center);
          var selected = selectedKeyframe && selectedKeyframe.keyframe === kf;
          var el = document.createElementNS(SVG_NS, 'polygon');
          var r = selected ? 6 : 4.5;
          var points = x + ',' + (y - r) + ' ' + (x + r) + ',' + y + ' ' + x + ',' + (y + r) + ' ' + (x - r) + ',' + y;
          el.setAttribute('points', points);
          el.setAttribute('fill', selected ? '#ff4d4d' : '#ff9800');
          el.setAttribute('stroke', '#000000');
          el.setAttribute('stroke-width', '1');
          svg.appendChild(el);
        });
      });
    }

    // --- floating easing button ---------------------------------------------

    var easingBtn = document.getElementById('timeline-easing-edit-btn');
    var easingPopover = document.getElementById('timeline-easing-popover');
    var propPopover = document.getElementById('timeline-property-popover');

    function hideEasingUI() {
      if (easingBtn) easingBtn.style.display = 'none';
      if (easingPopover) easingPopover.style.display = 'none';
      selectedKeyframe = null;
    }

    function repositionFloatingUI() {
      if (selectedKeyframe && selectedKeyframe.row && !selectedKeyframe.row.isParent) {
        positionEasingButton(selectedKeyframe.object, selectedKeyframe.row, selectedKeyframe.keyframe);
      }
      if (easingPopover && easingPopover.style.display !== 'none' && selectedKeyframe) {
        positionPopoverNear(easingPopover, easingBtn);
      }
    }

    function positionEasingButton(object, row, kf) {
      if (!easingBtn) return;
      if (!row || row.isParent || row.locked || object.locked) { hideEasingUI(); return; }
      var layout = computeRowLayout().find(function (e) { return e.row === row; });
      if (!layout) { hideEasingUI(); return; }
      var timelineRect = document.getElementById('timeline').getBoundingClientRect();
      var x = _timelineInstance.valToPx(kf.val) - _timelineInstance.scrollLeft + LEFT_MARGIN;
      easingBtn.style.left = Math.round(timelineRect.left + x + 7) + 'px';
      easingBtn.style.top = Math.round(timelineRect.top + layout.center - 10) + 'px';
      easingBtn.style.display = 'flex';
    }

    // --- easing editor popover ----------------------------------------------

    var PAD = 15, W = 260, H = 140;
    var activeHandle = null;
    var curveCoords = [0, 0, 1, 1];
    var motionRafId = null;

    function mapX(t) { return PAD + t * (W - PAD * 2); }
    function mapY(v) { return PAD + (1 - (v + 0.2) / 1.4) * (H - PAD * 2); }
    function unmapX(px) { return (px - PAD) / (W - PAD * 2); }
    function unmapY(py) { return ((1 - (py - PAD) / (H - PAD * 2)) * 1.4) - 0.2; }

    function positionPopoverNear(popover, anchorEl) {
      if (!popover || !anchorEl) return;
      var rect = anchorEl.getBoundingClientRect();
      popover.style.display = 'block';
      var left = rect.right + 6;
      if (left + popover.offsetWidth > window.innerWidth) left = rect.left - popover.offsetWidth - 6;
      popover.style.left = Math.round(left) + 'px';
      popover.style.top = Math.round(Math.min(rect.top, window.innerHeight - popover.offsetHeight - 8)) + 'px';
    }

    function openEasingPopover(anchor) {
      if (!easingPopover || !selectedKeyframe) return;
      if (motionRafId) cancelAnimationFrame(motionRafId);
      var kf = selectedKeyframe.keyframe;
      var ease = window.methodDraw.easing;
      var activeEasing = kf.easing || 'linear';
      var isBounce = ease.isBounceKey(activeEasing);
      curveCoords = isBounce ? [0, 0, 1, 1] : ease.parseBezierString(activeEasing);

      var html = '<div class="popover-title">Select &amp; Customize Curve</div>'
        + '<div class="custom-select-container">'
        + '  <div class="custom-select-trigger" id="custom-sel-trigger"><span>Select Easing Preset</span><span>&#9660;</span></div>'
        + '  <div class="custom-select-options" id="custom-sel-options"></div>'
        + '</div>'
        + '<div class="curve-preview-wrap">'
        + '  <svg class="curve-big" id="popover-svg">'
        + '    <line x1="' + mapX(0) + '" y1="' + mapY(0) + '" x2="' + mapX(1) + '" y2="' + mapY(0) + '" class="curve-grid"/>'
        + '    <line x1="' + mapX(0) + '" y1="' + mapY(1) + '" x2="' + mapX(1) + '" y2="' + mapY(1) + '" class="curve-grid"/>'
        + '    <line x1="' + mapX(0) + '" y1="' + mapY(0) + '" x2="' + mapX(1) + '" y2="' + mapY(1) + '" class="curve-diagonal"/>'
        + '    <line id="line-h1" class="handle-line" x1="' + mapX(0) + '" y1="' + mapY(0) + '" x2="0" y2="0"/>'
        + '    <line id="line-h2" class="handle-line" x1="' + mapX(1) + '" y1="' + mapY(1) + '" x2="0" y2="0"/>'
        + '    <path id="curve-path" class="curve-path" d=""/>'
        + '    <circle id="h1" class="handle" r="6" cx="0" cy="0"/>'
        + '    <circle id="h2" class="handle" r="6" cx="0" cy="0"/>'
        + '  </svg>'
        + '</div>'
        + '<div class="bezier-readout" id="readout-label"></div>';

      easingPopover.innerHTML = html;
      var optionsDiv = document.getElementById('custom-sel-options');

      Object.keys(ease.PRESET_BEZIERS).forEach(function (key) {
        var isSelected = (activeEasing === key);
        var item = document.createElement('div');
        item.className = 'custom-option' + (isSelected ? ' selected' : '');
        item.setAttribute('data-value', key);

        var canvas = document.createElement('canvas');
        canvas.className = 'option-preview';
        canvas.width = 28; canvas.height = 28;

        var span = document.createElement('span');
        span.className = 'option-text';
        span.textContent = key;

        var motionBox = document.createElement('div');
        motionBox.className = 'motion-preview-box';
        var motionDot = document.createElement('div');
        motionDot.className = 'motion-preview-dot';
        motionBox.appendChild(motionDot);

        item.appendChild(canvas);
        item.appendChild(span);
        item.appendChild(motionBox);
        optionsDiv.appendChild(item);

        var ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#4b8ce8'; ctx.lineWidth = 1.8; ctx.beginPath();
        var easeFn = ease.getEasingFn(key);
        for (var i = 0; i <= 28; i++) {
          var t = i / 28; var cx = t * 28; var cy = 28 - (easeFn(t) * 28);
          if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      });

      updateVisuals(activeEasing);
      positionPopoverNear(easingPopover, anchor);

      var trigger = document.getElementById('custom-sel-trigger');
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        optionsDiv.classList.toggle('open');
      });

      optionsDiv.addEventListener('click', function (e) {
        var option = e.target.closest('.custom-option');
        if (!option) return;
        var presetKey = option.getAttribute('data-value');
        kf.easing = presetKey;
        var bounceNow = ease.isBounceKey(presetKey);
        curveCoords = bounceNow ? [0, 0, 1, 1] : ease.PRESET_BEZIERS[presetKey].slice();
        optionsDiv.querySelectorAll('.custom-option').forEach(function (o) { o.classList.remove('selected'); });
        option.classList.add('selected');
        updateVisuals(presetKey);
        refreshAll();
        optionsDiv.classList.remove('open');
      });

      var svg = document.getElementById('popover-svg');
      document.getElementById('h1').addEventListener('pointerdown', function (e) {
        if (ease.isBounceKey(kf.easing)) return;
        e.preventDefault(); activeHandle = 1;
      });
      document.getElementById('h2').addEventListener('pointerdown', function (e) {
        if (ease.isBounceKey(kf.easing)) return;
        e.preventDefault(); activeHandle = 2;
      });

      window.addEventListener('pointermove', function (e) {
        if (!activeHandle) return;
        var rect = svg.getBoundingClientRect();
        var nx = Math.max(0, Math.min(1, unmapX((e.clientX - rect.left) * (W / rect.width))));
        var ny = Math.max(-0.2, Math.min(1.2, unmapY((e.clientY - rect.top) * (H / rect.height))));
        if (activeHandle === 1) { curveCoords[0] = nx; curveCoords[1] = ny; }
        else { curveCoords[2] = nx; curveCoords[3] = ny; }
        kf.easing = ease.customEasingKey(curveCoords[0], curveCoords[1], curveCoords[2], curveCoords[3]);
        optionsDiv.querySelectorAll('.custom-option').forEach(function (o) { o.classList.remove('selected'); });
        updateVisuals(kf.easing);
        renderKeyframeOverlay();
        applyTime(_timelineInstance.getTime());
      });
      window.addEventListener('pointerup', function () { activeHandle = null; });

      function stepMotion() {
        if (!easingPopover.contains(optionsDiv)) return;
        var time = (performance.now() % 1200) / 1200;
        optionsDiv.querySelectorAll('.custom-option').forEach(function (opt) {
          var key = opt.getAttribute('data-value');
          var easeFn = ease.getEasingFn(key);
          var dot = opt.querySelector('.motion-preview-dot');
          if (dot) dot.style.left = (easeFn(time) * 16) + 'px';
        });
        motionRafId = requestAnimationFrame(stepMotion);
      }
      motionRafId = requestAnimationFrame(stepMotion);
    }

    function updateVisuals(activeEasing) {
      var svg = document.getElementById('popover-svg');
      if (!svg) return;
      var ease = window.methodDraw.easing;
      var isBounce = ease.isBounceKey(activeEasing);
      var h1 = svg.querySelector('#h1'), h2 = svg.querySelector('#h2');
      var l1 = svg.querySelector('#line-h1'), l2 = svg.querySelector('#line-h2');
      if (isBounce) { h1.classList.add('disabled'); h2.classList.add('disabled'); l1.classList.add('disabled'); l2.classList.add('disabled'); }
      else { h1.classList.remove('disabled'); h2.classList.remove('disabled'); l1.classList.remove('disabled'); l2.classList.remove('disabled'); }

      h1.setAttribute('cx', mapX(curveCoords[0])); h1.setAttribute('cy', mapY(curveCoords[1]));
      h2.setAttribute('cx', mapX(curveCoords[2])); h2.setAttribute('cy', mapY(curveCoords[3]));
      l1.setAttribute('x2', mapX(curveCoords[0])); l1.setAttribute('y2', mapY(curveCoords[1]));
      l2.setAttribute('x2', mapX(curveCoords[2])); l2.setAttribute('y2', mapY(curveCoords[3]));

      var d = '';
      var fn = ease.getEasingFn(activeEasing);
      for (var i = 0; i <= 50; i++) {
        var t = i / 50; d += (i === 0 ? 'M ' : 'L ') + mapX(t).toFixed(1) + ' ' + mapY(fn(t)).toFixed(1) + ' ';
      }
      svg.querySelector('#curve-path').setAttribute('d', d);

      var name = ease.matchingPresetName(curveCoords[0], curveCoords[1], curveCoords[2], curveCoords[3], activeEasing);
      document.getElementById('custom-sel-trigger').querySelector('span').textContent = name;
      document.getElementById('readout-label').textContent = isBounce
        ? name + ' formula (Gravity Simulation)'
        : 'cubic-bezier(' + curveCoords[0].toFixed(2) + ', ' + curveCoords[1].toFixed(2) + ', ' + curveCoords[2].toFixed(2) + ', ' + curveCoords[3].toFixed(2) + ')';
    }

    // --- add property popover -----------------------------------------------

    function openPropertyPopover(anchorEl, object) {
      if (!propPopover || !object) return;
      var existing = object.childRows.map(function (r) { return r.propKey; });
      var available = getAnimatablePropertyKeys(object.objectType).filter(function (k) {
        return existing.indexOf(k) === -1;
      });
      if (!available.length) { alert('All tracks are already active.'); return; }

      var html = '<div class="popover-title">Add Property Track</div><div class="property-list">';
      available.forEach(function (key) {
        var def = PROPERTY_DEFS[key];
        html += '<button type="button" class="property-item" data-key="' + key + '">'
          + '  <span class="dot" style="background:' + def.swatch + '"></span>'
          + '  <span>' + def.label + '</span>'
          + '</button>';
      });
      html += '</div>';

      propPopover.innerHTML = html;
      positionPopoverNear(propPopover, anchorEl);

      propPopover.querySelectorAll('.property-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = this.getAttribute('data-key');
          var def = PROPERTY_DEFS[key];
          var startVal = readProp(object.element, key);
          object.childRows.push({
            title: def.label, propKey: key, objectId: object.elementId, parentId: object.elementId,
            locked: false, style: { height: 26 },
            keyframes: [
              { val: 0, easing: 'linear', value: startVal },
              { val: DEFAULT_ROW_DURATION, easing: 'linear', value: def.seed(startVal) }
            ]
          });
          propPopover.style.display = 'none';
          refreshAll();
        });
      });
    }

    // --- custom sidebar (outline) -------------------------------------------

    function renderOutline() {
      var container = document.getElementById('outline-container');
      if (!container) return;
      var html = '';
      objects.forEach(function (object) {
        if (object.removed) return;
        html += '<div class="outline-row parent' + (object.expanded ? '' : ' collapsed') + (object.locked ? ' locked' : '') + '" data-object="' + object.elementId + '" style="height:' + object.parentRow.style.height + 'px">'
          + '<span class="toggle" data-action="toggle">&#9662;</span>'
          + '<span class="dot" style="background:#3a7bd5"></span>'
          + '<span class="row-title" data-action="toggle">Animation Object</span>'
          + '<span class="row-actions">'
          + '  <button type="button" class="icon-btn lock-btn' + (object.locked ? ' is-locked' : '') + '" data-action="lock-parent" title="Lock track"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 14h8V9H4v5zM6 9V4.5a2.5 2.5 0 015 0V9" fill="currentColor"/></svg></button>'
          + '  <button type="button" class="icon-btn add-btn" data-action="add-property" title="Add property track">&#65291;</button>'
          + '  <button type="button" class="icon-btn del-row-btn" data-action="delete-parent" title="Delete object">&#215;</button>'
          + '</span>'
          + '</div>';

        if (object.expanded) {
          object.childRows.forEach(function (row, idx) {
            var def = PROPERTY_DEFS[row.propKey] || { swatch: '#6b7280' };
            html += '<div class="outline-row child' + (row.locked || object.locked ? ' locked' : '') + '" data-object="' + object.elementId + '" data-row-index="' + idx + '" style="height:' + row.style.height + 'px">'
              + '<span class="elbow">&#9492;</span>'
              + '<span class="dot" style="background:' + def.swatch + '"></span>'
              + '<span class="row-title">' + row.title + '</span>'
              + '<span class="row-actions">'
              + '  <button type="button" class="icon-btn lock-btn' + (row.locked ? ' is-locked' : '') + '" data-action="lock-child" data-row-index="' + idx + '" title="Lock track"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 14h8V9H4v5zM6 9V4.5a2.5 2.5 0 012.5 0" fill="currentColor"/></svg></button>'
              + '  <button type="button" class="icon-btn row-ease-btn" data-action="row-ease" data-row-index="' + idx + '" title="Set curve">&#8767;</button>'
              + '  <button type="button" class="icon-btn del-btn" data-action="delete-child" data-row-index="' + idx + '" title="Delete track">&#215;</button>'
              + '</span>'
              + '</div>';
          });
        }
      });
      container.innerHTML = html;

      container.querySelectorAll('[data-action="toggle"]').forEach(function (el) {
        el.addEventListener('click', function () {
          var obj = findObject(el.closest('.outline-row').getAttribute('data-object'));
          if (obj) { obj.expanded = !obj.expanded; refreshAll(); }
        });
      });
      container.querySelector('[data-action="lock-parent"]') && container.querySelectorAll('[data-action="lock-parent"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var obj = findObject(btn.closest('.outline-row').getAttribute('data-object'));
          if (obj) { obj.locked = !obj.locked; hideEasingUI(); refreshAll(); }
        });
      });
      container.querySelectorAll('[data-action="delete-parent"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (confirm('Delete this Animation Object?')) {
            var obj = findObject(btn.closest('.outline-row').getAttribute('data-object'));
            if (obj) removeObject(obj.elementId);
          }
        });
      });
      container.querySelectorAll('[data-action="add-property"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var obj = findObject(btn.closest('.outline-row').getAttribute('data-object'));
          if (obj) openPropertyPopover(this, obj);
        });
      });
      container.querySelectorAll('[data-action="lock-child"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var obj = findObject(btn.closest('.outline-row').getAttribute('data-object'));
          var idx = parseInt(btn.getAttribute('data-row-index'), 10);
          if (obj && obj.childRows[idx]) { obj.childRows[idx].locked = !obj.childRows[idx].locked; refreshAll(); }
        });
      });
      container.querySelectorAll('[data-action="delete-child"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var obj = findObject(btn.closest('.outline-row').getAttribute('data-object'));
          var idx = parseInt(btn.getAttribute('data-row-index'), 10);
          if (obj && obj.childRows[idx]) removeChildRow(obj, obj.childRows[idx]);
        });
      });
      container.querySelectorAll('[data-action="row-ease"]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var obj = findObject(btn.closest('.outline-row').getAttribute('data-object'));
          var idx = parseInt(btn.getAttribute('data-row-index'), 10);
          var row = obj && obj.childRows[idx];
          if (!row || !row.keyframes.length || row.locked || obj.locked) return;
          selectedKeyframe = { object: obj, row: row, keyframe: row.keyframes[0] };
          openEasingPopover(btn);
        });
      });
    }

    function refreshAll() {
      if (!_timelineInstance) return;
      _timelineInstance.setModel(currentModel());
      _timelineInstance.redraw();
      renderOutline();
      renderKeyframeOverlay();
      applyTime(_timelineInstance.getTime());
    }

    // --- timeline events ----------------------------------------------------

    function wireTimelineEvents() {
      _timelineInstance.onDrag(function (evt) {
        objects.forEach(function (obj) { syncChildrenToParent(evt, obj); });
        renderKeyframeOverlay();
      });
      _timelineInstance.onDragFinished(function (evt) {
        objects.forEach(function (obj) { syncChildrenToParent(evt, obj); });
        renderKeyframeOverlay();
      });
      _timelineInstance.onScroll(function () { renderKeyframeOverlay(); repositionFloatingUI(); });
      _timelineInstance.onScrollFinished(function () { renderKeyframeOverlay(); repositionFloatingUI(); });

      _timelineInstance.onSelected(function (evt) {
        renderKeyframeOverlay();
        // evt.selected holds raw keyframe model objects (no .row); locate the
        // owning row by reference, exactly like the v2 example.
        var relevant = (evt.selected || []).map(function (kf) {
          for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];
            if (obj.parentRow.keyframes.indexOf(kf) !== -1) return null; // parent block, skip
            for (var j = 0; j < obj.childRows.length; j++) {
              if (obj.childRows[j].keyframes.indexOf(kf) !== -1) {
                return { object: obj, row: obj.childRows[j], keyframe: kf };
              }
            }
          }
          return null;
        }).filter(function (el) { return el && !el.row.locked && !el.object.locked; });

        if (relevant.length !== 1) { hideEasingUI(); return; }
        selectedKeyframe = relevant[0];
        // Move the playhead to the selected keyframe so the user can edit the
        // element's values "at" that keyframe (e.g. via auto-capture), exactly
        // like stepping to a keyframe in After Effects.
        _timelineInstance.setTime(selectedKeyframe.keyframe.val);
        positionEasingButton(selectedKeyframe.object, selectedKeyframe.row, selectedKeyframe.keyframe);
      });

      _timelineInstance.onTimeChanged(function (evt) {
        currentTime = _timelineInstance.getTime();
        if (!isPlaying) applyTime(currentTime);
        repositionFloatingUI();
      });

      _timelineInstance.onDoubleClick(function (event) {
        if (event.target && event.target.type === 'row' && event.target.row && event.point) {
          var row = event.target.row;
          var parentObj = objects.filter(function (o) { return o.childRows.indexOf(row) !== -1; })[0];
          if (!parentObj || row.isParent || row.locked || parentObj.locked) return;
          var val = event.point.val;
          var currentVal = readProp(parentObj.element, row.propKey);
          row.keyframes.push({ val: val, easing: 'linear', value: currentVal });
          refreshAll();
        }
      });

      if (easingBtn) easingBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (selectedKeyframe) openEasingPopover(easingBtn);
      });

      document.addEventListener('mousedown', function (e) {
        if (propPopover && propPopover.style.display !== 'none' &&
            !propPopover.contains(e.target) && !e.target.closest('[data-action="add-property"]')) {
          propPopover.style.display = 'none';
        }
        if (easingPopover && easingPopover.style.display !== 'none' &&
            !easingPopover.contains(e.target) && e.target !== easingBtn && !e.target.closest('[data-action="row-ease"]')) {
          hideEasingUI();
          if (motionRafId) cancelAnimationFrame(motionRafId);
        }
      });
    }

    // --- playback (rAF value-at-time driver) --------------------------------

    function tick() {
      if (!isPlaying) return;
      var elapsed = performance.now() - animationStartTime;
      var end = maxObjectEnd();
      if (elapsed >= end) {
        if (loopActive) { animationStartTime = performance.now(); _timelineInstance.setTime(0); animationFrameId = requestAnimationFrame(tick); }
        else { _timelineInstance.setTime(end); stop(); }
        return;
      }
      _timelineInstance.setTime(elapsed);
      animationFrameId = requestAnimationFrame(tick);
    }

    function maxObjectEnd() {
      var max = 0;
      objects.forEach(function (obj) {
        if (obj.removed) return;
        obj.parentRow.keyframes.forEach(function (kf) { if (kf.val > max) max = kf.val; });
      });
      return max || timelineDuration;
    }

    var animationStartTime = 0;

    function play() {
      if (isPlaying) return;
      isPlaying = true;
      var playBtn = document.getElementById('tool_timeline_play');
      var pauseBtn = document.getElementById('tool_timeline_pause');
      if (playBtn) playBtn.classList.add('active');
      if (pauseBtn) pauseBtn.classList.remove('active');
      animationStartTime = performance.now() - _timelineInstance.getTime();
      if (_timelineInstance.getTime() >= maxObjectEnd()) _timelineInstance.setTime(0);
      animationFrameId = requestAnimationFrame(tick);
    }

    function stop() {
      isPlaying = false;
      var playBtn = document.getElementById('tool_timeline_play');
      var pauseBtn = document.getElementById('tool_timeline_pause');
      if (playBtn) playBtn.classList.remove('active');
      if (pauseBtn) pauseBtn.classList.add('active');
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }

    function onPlayClick() {
      if (isPlaying) stop(); else play();
    }

    function onPauseClick() { stop(); }

    function toggleLoop(btn) {
      loopActive = !loopActive;
      if (btn) btn.classList.toggle('active', loopActive);
    }

    function setTimelineDuration(val) {
      timelineDuration = parseInt(val, 10);
      if (isNaN(timelineDuration) || timelineDuration <= 0) return;
      if (_timelineInstance) _timelineInstance.setOptions({ totalTime: timelineDuration, max: timelineDuration });
      var input = document.getElementById('timeline_duration_input');
      if (input && parseInt(input.value, 10) !== timelineDuration) input.value = timelineDuration;
    }

    function toggleTimelinePanel() {
      var panel = document.getElementById('timeline-panel');
      var btn = document.getElementById('tool_timeline_collapse');
      if (!panel) return;
      var minimized = panel.classList.toggle('minimized');
      if (btn) btn.textContent = minimized ? 'keyboard_arrow_up' : 'keyboard_arrow_down';
    }

    // --- toolbar / keyframe actions -----------------------------------------

    function addKeyframe() {
      if (!_timelineInstance) return;
      var ms = _timelineInstance.getTime();

      // A child keyframe is selected: add a sibling keyframe to its track.
      if (selectedKeyframe && !selectedKeyframe.row.isParent) {
        addKeyframeToRow(selectedKeyframe.object, selectedKeyframe.row, ms);
        refreshAll();
        return;
      }

      // A tracked element is selected: add a keyframe at the playhead to every
      // existing child track.
      var canvasSelected = window.methodDraw.canvas.getSelectedElems().filter(Boolean);
      var tracked = canvasSelected.map(function (elem) { return findObject(elem.id); }).filter(Boolean);
      if (tracked.length) {
        tracked.forEach(function (obj) {
          obj.childRows.forEach(function (row) { addKeyframeToRow(obj, row, ms); });
        });
        refreshAll();
        return;
      }

      // Nothing tracked is selected: add the element(s) to the timeline
      // (parent object only; tracks are added on demand).
      if (canvasSelected.length) {
        canvasSelected.forEach(function (elem) { addToTimeline(elem); });
      }
    }

    function removeKeyframe() {
      if (!_timelineInstance || !selectedKeyframe || selectedKeyframe.row.isParent) return;
      var row = selectedKeyframe.row;
      var kf = selectedKeyframe.keyframe;
      var idx = row.keyframes.indexOf(kf);
      if (idx !== -1) row.keyframes.splice(idx, 1);
      hideEasingUI();
      refreshAll();
    }

    function outlineMouseWheel(e) {
      if (!_timelineInstance) return;
      e.preventDefault();
      _timelineInstance.scrollTop = _timelineInstance.scrollTop + e.deltaY;
    }

    // --- interaction modes --------------------------------------------------

    function setInteractionModeButtonState(mode) {
      var buttons = {
        selection: 'tool_timeline_select',
        pan: 'tool_timeline_pan',
        nonInteractivePan: 'tool_timeline_pan_static',
        zoom: 'tool_timeline_zoom',
        none: 'tool_timeline_none'
      };
      Object.keys(buttons).forEach(function (key) {
        var btn = document.getElementById(buttons[key]);
        if (btn) btn.classList.toggle('active', key === mode);
      });
    }

    function selectMode() {
      if (!_timelineInstance) return;
      _timelineInstance.setInteractionMode(timelineModule.TimelineInteractionMode.Selection);
      setInteractionModeButtonState('selection');
    }
    function panMode(interactive) {
      if (!_timelineInstance) return;
      _timelineInstance.setInteractionMode(interactive ? timelineModule.TimelineInteractionMode.Pan : timelineModule.TimelineInteractionMode.NonInteractivePan);
      setInteractionModeButtonState(interactive ? 'pan' : 'nonInteractivePan');
    }
    function zoomMode() {
      if (!_timelineInstance) return;
      _timelineInstance.setInteractionMode(timelineModule.TimelineInteractionMode.Zoom);
      setInteractionModeButtonState('zoom');
    }
    function noneMode() {
      if (!_timelineInstance) return;
      _timelineInstance.setInteractionMode(timelineModule.TimelineInteractionMode.None);
      setInteractionModeButtonState('none');
    }

    // --- theme --------------------------------------------------------------

    function applyTimelineTheme() {
      if (!_timelineInstance) return;
      var light = isLightMode();
      _timelineInstance.setOptions({
        fillColor: 'transparent',
        headerFillColor: light ? '#e9e9ec' : '#101011',
        labelsColor: light ? '#000000' : '#D5D5D5',
        tickColor: light ? '#9a9aa2' : '#D5D5D5',
        rowsStyle: {
          fillColor: light ? '#f4f4f5' : '#252526',
          keyframesStyle: { fillColor: light ? '#f59e0b' : 'DarkOrange', selectedFillColor: light ? '#2563eb' : 'red', strokeColor: light ? '#1f2937' : 'black', selectedStrokeColor: light ? '#1d4ed8' : 'black' },
          groupsStyle: { fillColor: light ? '#cbd5e1' : '#094771' }
        }
      });
      _timelineInstance.redraw();
    }

    // --- init ---------------------------------------------------------------

    function initTimeline() {
      objects = [];
      _timelineInstance = new timelineModule.Timeline();
      _timelineInstance.initialize({
        id: 'timeline',
        headerHeight: HEADER_HEIGHT,
        leftMargin: LEFT_MARGIN,
        keyframesDraggable: true,
        groupsDraggable: true,
        timelineDraggable: true
      }, { rows: [] });
      _timelineInstance.setOptions({ min: 0, max: timelineDuration, totalTime: timelineDuration, leftMargin: LEFT_MARGIN });

      ensureOverlay();
      wireTimelineEvents();
      applyTimelineTheme();

      if (window.MutationObserver) {
        var themeObserver = new MutationObserver(function () { applyTimelineTheme(); });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }

      var loopBtn = document.getElementById('tool_timeline_loop');
      if (loopBtn) loopBtn.classList.add('active');
      var durationInput = document.getElementById('timeline_duration_input');
      if (durationInput) durationInput.value = timelineDuration;

      var addBtn = document.getElementById('tool_add_to_timeline');
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          var selected = window.methodDraw.canvas.getSelectedElems();
          if (selected && selected.length) selected.forEach(function (elem) { addToTimeline(elem); });
        });
      }

      window.methodDraw.canvas.bind('selected', function (win, elems) {
        // Highlight the matching timeline row when a canvas element is
        // selected. We deliberately do NOT call selectOnly here: doing so
        // would re-fire 'selected' and recurse.
        var selectedIds = (elems || []).map(function (el) { return el ? el.id : null; }).filter(Boolean);
        objects.forEach(function (obj) {
          if (selectedIds.indexOf(obj.elementId) !== -1) renderOutline();
        });
        if (addBtn) addBtn.classList.toggle('disabled', !elems || elems.length === 0);
      });

      window.methodDraw.canvas.bind('changed', function (win, elems) {
        captureCanvasChanges(elems);
      });

      var exportBtn = document.getElementById('tool_timeline_export');
      if (exportBtn) exportBtn.addEventListener('click', function () { exportAnimation(); });

      hookPersistence();
      refreshAll();
    }

    return {
      init: initTimeline,
      getInstance: function () { return _timelineInstance; },
      onPlayClick: onPlayClick,
      onPauseClick: onPauseClick,
      toggleLoop: toggleLoop,
      setTimelineDuration: setTimelineDuration,
      selectMode: selectMode,
      panMode: panMode,
      zoomMode: zoomMode,
      noneMode: noneMode,
      toggleTimelinePanel: toggleTimelinePanel,
      addKeyframe: addKeyframe,
      removeKeyframe: removeKeyframe,
      outlineMouseWheel: outlineMouseWheel,
      addToTimeline: addToTimeline,
      getObjects: function () { return objects; },
      serialize: serialize,
      loadFromData: loadFromData,
      exportCSS: generateCSSKeyframes,
      exportSMIL: generateSMIL,
      exportAnimation: exportAnimation
    };
  })();
});





