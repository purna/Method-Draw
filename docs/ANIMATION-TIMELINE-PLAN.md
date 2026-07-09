# Animation Timeline — Implementation Plan (v2)

**Goal:** Animate each canvas object with an **After Effects–style** model: one
**Animation Object** parent track whose lifetime is a draggable block, plus
**linked child property tracks** (colour, transform, rotation, scale, …) that
each carry their own keyframes with **per-keyframe easing**. Playback is driven
by JavaScript on every frame (`requestAnimationFrame`), applying computed values
straight to the live SVG element — no generated CSS `@keyframes`.

**Reference example:** `test/timeline/index_v2.html` (+ `animation-timeline.css`,
`animation-timeline.js`). This example is the canonical target for the new
behaviour and is the source of the data model, linking rules, easing engine,
overlay rendering, and easing-editor UI described below.

---

## 1. Problem with the current implementation

The current `src/js/timeline.js` stores a **full element snapshot** at each
keyframe and replays it as a single CSS `@keyframes` block per element:

- `getElementProps()` captures x/y/width/height/fill/stroke/opacity/rotation/
  transform all at once (timeline.js:65).
- `addToTimeline()` pushes a keyframe whose `data` is that full snapshot
  (timeline.js:287, timeline.js:529).
- Playback is the CSS block built in `buildAndApplyAnimationCSS()`
  (timeline.js:689), sought with negative `animation-delay`
  (timeline.js:216, `applyTimeToRows`).

That snapshot model forces **every** property to move together between two
keyframes, can't give colour a different curve than a resize, can't animate
non-CSS properties (path `d`, text content), and — crucially — is painful to
edit length/duration on (every `%` must be regenerated). The new example
abandons all of this.

---

## 2. Target architecture — "Animation Object + linked child tracks"

### 2.1 The parent row = the object's lifetime block

Each canvas element becomes **one parent row** that represents the object's
lifetime:

```js
objectRow = {
  title: 'Animation Object',
  objectType: 'rect',            // element kind, used to filter property defs
  elementId: 'elem_123',
  element: <svgNode>,            // live reference to the canvas element
  locked: false,
  style: { height: 34, fillColor: '#1d2b3f' },
  keyframes: [{ val: 0,    group: parentGroupMarker },
              { val: 2000, group: parentGroupMarker }]
};
```

The two keyframes carry a `group` marker (a `timelineModule` "group" element),
so the library renders them as a single **draggable block** (a start/end span).
Dragging that block is a *block move* and is how the whole object (and all its
child tracks) is shifted in time.

### 2.2 Linked child property tracks

Expanding the parent reveals **one child row per animatable property**. Each
child is a normal timeline row, but it is *linked* to the parent:

```js
colourRow = {
  title: 'Colour', propKey: 'colourFill', locked: false,
  style: { height: 26, fillColor: '#2a1f1c' },
  keyframes: [{ val: 0,    easing: 'linear' },
              { val: 2000, easing: 'linear' }]
};
```

`propKey` identifies which property the track drives. `PROPERTY_DEFS` (see 2.4)
describes every property: its `kind` (`color` / `number` / …), a `swatch` colour
for the sidebar dot, and the `from`/`to` endpoints used to map a normalised
eased value (0..1) back onto a concrete value.

### 2.3 Parent → child link sync

`objectRow` owns the object's timing. When its block is dragged, **every
non-locked child keyframe shifts by the same delta** (v2 `syncChildrenToParent`):

```js
function syncChildrenToParent(evt) {
  if (!evt.target || evt.target.row !== objectRow) return;
  var isBlockMove = evt.target.type === timelineModule.TimelineElementType.Group;
  var delta = objectRow.keyframes[0].val - lastKnownStart;
  lastKnownStart = objectRow.keyframes[0].val;
  if (!isBlockMove || !delta) return;
  childRows.forEach(function (row) {
    if (row.locked) return;
    row.keyframes.forEach(function (kf) { kf.val += delta; });
  });
  timeline.setModel(currentModel());
  timeline.redraw();
}
```

Locking a child track (or the parent) disables its drag and excludes it from
the sync, so individual properties can be kept in place while the rest move.
This is the structuring rule that replaces the old "expanded groups" idea from
the v1 plan: property lanes are **sibling rows linked to a parent**, not nested
library `group`s.

### 2.4 Property definitions

```js
var PROPERTY_DEFS = {
  colourFill: { label: 'Colour', kind: 'color',  swatch: '#c0392b', from: '#c0392b', to: '#2ea83a' },
  transform:  { label: 'Transition', kind: 'number', swatch: '#3a7bd5', from: 0, to: 40 },
  rotation:   { label: 'Rotation', kind: 'number', swatch: '#e8b33a', from: 0, to: 180 },
  scale:      { label: 'Scale',   kind: 'number', swatch: '#9b59b6', from: 1, to: 1.5 }
};
```

`add-property` filters `PROPERTY_DEFS` to those not already present and to those
whose `appliesTo` list includes `objectRow.objectType` (v1 introduced
`appliesTo`; v2 keeps the derivation simple and can be extended the same way).
Text elements additionally expose `fontSize` / `textContent`; path elements
expose `d`.

### 2.5 Key data model summary

| Concept | v1 plan (old) | v2 example (new) |
|---------|---------------|------------------|
| One object | snapshot row | **parent row** = lifetime block (group span) |
| Per-property | nested `group` sub-lane | **linked child row**, `propKey` |
| Timing edits | regenerate `%` | drag parent block → `syncChildrenToParent` |
| Easing | per-property only | **per-keyframe** `easing` |
| Playback | CSS `@keyframes` + `animation-delay` | rAF → `valueAt(propKey, ms)` → set attributes |
| Keyframe markers | library shape | **custom SVG overlay** (library shape = `None`) |

---

## 3. Easing engine (per-keyframe)

Each keyframe stores an `easing` string:

- a **preset name** (`linear`, `ease`, `ease-in-out`, `easeOutBack`, …),
- `custom:x1,y1,x2,y2` for user-dragged bezier handles,
- or a **bounce** preset (`easeInBounce` / `easeOutBounce` / `easeInOutBounce`)
  which uses a piecewise gravity formula instead of a bezier.

`src/js/easing.js` (new, extracted from the example) provides:

- `PRESET_BEZIERS` — the named preset control-point table.
- `cubicBezierEasing(x1,y1,x2,y2)` — Newton-Raphson solver returning `f(x)→y`.
- `easeOutBounceFn` / `easeInBounceFn` / `easeInOutBounceFn`.
- `getEasingFn(key)` — returns the `f(x)` function for any key above.
- `parseBezierString(key)` — control points for the editor.
- `matchingPresetName(...)` — reverse-lookup a preset name from handle coords.

Exposed as `window.methodDraw.easing` so the timeline and the easing editor
share one implementation.

---

## 4. Playback — rAF value-at-time driver

**Decision (unchanged from v1, now actually implemented): drive each canvas
element directly from JavaScript every frame. No generated CSS `@keyframes`.**

On each frame:

```js
function valueAt(propKey, ms) {
  var def = PROPERTY_DEFS[propKey];
  var row = childRows.find(function (r) { return r.propKey === propKey; });
  if (!row || row.keyframes.length < 2) return 0;            // normalised 0..1
  var kfs = row.keyframes.slice().sort(function (a, b) { return a.val - b.val; });
  if (ms <= kfs[0].val) return 0;
  if (ms >= kfs[kfs.length - 1].val) return 1;
  var k0, k1;
  for (var i = 0; i < kfs.length - 1; i++) {
    if (ms >= kfs[i].val && ms <= kfs[i + 1].val) { k0 = kfs[i]; k1 = kfs[i + 1]; break; }
  }
  var t = clamp01((ms - k0.val) / (k1.val - k0.val));
  return getEasingFn(k0.easing)(t);                          // per-keyframe easing
}

function applyTime(ms) {
  var fillT = valueAt('colourFill', ms), gapT = valueAt('transform', ms), rotT = valueAt('rotation', ms);
  // map normalised t back through PROPERTY_DEFS[prop].from/to, then setAttribute
  // fill / transform / opacity / width / d / textContent on row.element
}
```

A single `requestAnimationFrame` loop advances `timeline.setTime(t)`; the
library's `onTimeChanged` callback calls `applyTime` so **scrubbing, playing,
and dragging all share one code path**. `timelineDuration` is just the loop
boundary — changing it updates one variable; keyframes store absolute `val` ms
so nothing is regenerated (the central reason to prefer rAF over CSS).

---

## 5. Keyframe overlay & selection

The library's keyframe shape is set to `TimelineKeyframeShape.None` for child
rows, and we draw our **own diamond markers** in an absolutely-positioned SVG
overlay sized to `#timeline` (`renderKeyframeOverlay` in v2):

- position each diamond at `valToPx(kf.val) - scrollLeft + leftMargin`.
- selected keyframes render red, unselected orange.
- re-render on drag / scroll / selection so the overlay stays glued to the rows.

Selection of a single child keyframe opens the **floating ✎ button**
(positioned at that keyframe) which launches the easing editor. This overlay +
floating button pattern replaces the old library-shaped keyframes and gives us
full control of selection visuals without fighting the library's canvas.

---

## 6. Easing editor popover

`openEasingPopover` (v2) renders into `#easing-popover`:

- a **preset dropdown** with a thumbnail curve per preset and a **live motion-
  preview dot** that loops the easing inside each row (uses `getEasingFn`),
- a **big interactive bezier curve** SVG with two draggable handle points
  (`#h1`, `#h2`) that write `custom:x1,y1,x2,y2` to the keyframe live,
- a readout of the `cubic-bezier(...)` values or the selected preset name,
- bounce presets disable the handles (gravity formula, no handles).

Choosing a preset writes `kf.easing = presetKey` and refreshes the timeline.
The sidebar row also exposes a small `∿` button (`data-action="row-ease"`)
that opens the editor for the first keyframe of that track.

---

## 7. Plan of action (phased)

### Phase 1 — Easing engine + new data model
- Add `src/js/easing.js` (Section 3) and load it before `timeline.js` in
  `index.html`.
- Replace `getAnimatableProperties`/sub-row logic with `PROPERTY_DEFS`,
  `objectRow` (parent, group span) and linked `childRows` per property.
- `addToTimeline(elem)` builds ONLY the parent "Animation Object" row (the
  lifetime block). Child property tracks are **not** auto-created — the user
  adds them on demand via the `＋` "add property" popover (`openPropertyPopover`),
  which seeds start/end keyframes (`from`/`to`) from the element's live props
  with default `easing:'linear'`.
- Add `syncChildrenToParent` and wire `timeline.onDrag` / `onDragFinished`.

### Phase 2 — rAF playback driver
- Remove `buildAndApplyAnimationCSS` and `applyTimeToRows` (CSS path).
- Add `valueAt(propKey, ms)` + `applyTime(ms)` (Section 4) and drive them from
  `onTimeChanged`; fold play/pause/scrub into one rAF loop updating
  `timeline.setTime`.

### Phase 3 — Keyframe overlay + selection + floating easing button
- Set child keyframe shape to `None`; add `renderKeyframeOverlay` + selection
  handling; add the floating ✎ button and `positionEasingButton`.

### Phase 4 — Easing editor popover + add-property popover
- Port `openEasingPopover` / `openPropertyPopover` (Sections 5–6), the bezier
  curve editing, preset list with motion previews, and `matchingPresetName`.
- Lock / delete / expand-collapse controls in the custom sidebar.

### Keyframe capture  ✅ implemented
Two ways to add a keyframe:
- **Manual:** the timeline `+` button (`addKeyframe`) — if a child keyframe is
  selected it adds a sibling on that track; if a tracked element is selected it
  adds a keyframe at the playhead to every existing track; otherwise it adds the
  element to the timeline. Double-clicking a child lane also drops a keyframe.
- **Auto (on canvas edit):** `captureCanvasChanges` binds `canvas.bind('changed')`.
  When a tracked element is edited, its live values are recorded into any
  *existing* child tracks at the playhead (upserting a keyframe if one isn't
  already there). `applyTime` sets `suppressKeyframeCapture` so playback/scrub
  never feeds back into capture. Tracks the user hasn't added are left alone
  (per the add-on-demand rule), so auto-capture only fires once a track exists.

### Phase 5 — Persistence  ✅ implemented
- `serialize()` emits a plain JSON object (`version`, `timelineDuration`,
  `loopActive`, and per-object `parentKeyframes` + `childRows` with
  `keyframes:[{val, easing, value}]`). No live `element` references are stored.
- `loadFromData(json)` rebuilds the model and re-binds `element` by
  `elementId` from the live canvas; objects whose element is missing are skipped.
- The model is persisted **inside the SVG** as a base64-encoded JSON blob in a
  `<metadata id="methoddraw-animation">` child of `#svgcontent`
  (`injectMetadataNode` / `readMetadataFromDom`). `hookPersistence()` wraps
  `svgCanvas.svgCanvasToString` (inject → serialise → strip) and
  `svgCanvas.setSvgString` (read → `loadFromData`), so animations survive both
  SVG and `.json` saves and reloads with zero extra UI.

### Phase 6 — Export  ✅ implemented (API)
- `exportCSS()` → `generateCSSKeyframes()`: one `@keyframes` per object for the
  combined transform (linear) and one each for `fill`/`opacity` with per-step
  `animation-timing-function`. Bounce easings fall back to `linear`.
- `exportSMIL()` → `generateSMIL()`: additive `<animate>` (fill/opacity) and
  `<animateTransform type="rotate|scale|translate" additive="sum">` with
  `calcMode="spline"` + `keySplines` derived from each segment's easing. The
  returned element string is injected into the exported SVG.
- Exposed on `methodDraw.timeline.exportCSS()` / `exportSMIL()` /
  `exportAnimation()`. A timeline-toolbar **Export** button
  (`tool_timeline_export`, wired in `initTimeline`) downloads a standalone HTML
  file with the current SVG + generated CSS `@keyframes` (+ SMIL injected).

---

## 8. Files touched

| File | Change |
|------|--------|
| `docs/ANIMATION-TIMELINE-PLAN.md` | This plan |
| `src/js/easing.js` | **New** — shared easing engine (presets, bezier solver, bounce, helpers) |
| `src/js/timeline.js` | Parent/child model, link sync, rAF playback, overlay, easing editor |
| `src/index.html` | Load `easing.js` before `timeline.js`; add `#easing-popover`, `#property-popover`, floating button, sidebar action hooks |
| `src/css/animation-timeline.css` | Sidebar rows, popovers, curve editor, overlay/floating-button styles |

---

## 9. Risks & notes

- **Library group semantics:** confirm `groupsDraggable` + a `group`-flagged
  keyframe pair renders the parent as a single draggable block (v2 relies on
  exactly this — verified behaviour in the example).
- **Transform composition:** position/rotation/scale must compose into one
  `transform` attribute with the rotation pivot at the element centre
  (`svgedit.utilities.getRotationAngle` / `setRotationAngle` already exist).
- **Normalised vs absolute:** unlike the v2 demo (which maps a normalised
  0..1 eased value through `PROPERTY_DEFS[prop].from/to`), the implementation
  stores **concrete** keyframe values and `valueAt` returns the eased,
  interpolated concrete value directly. `PROPERTY_DEFS[prop].from/to` are now
  only used to *seed* the end keyframe when an element is first added.
- **Path `d` / text:** step (hold previous value) unless point counts match;
  full morphing is a later enhancement.
- **Performance:** rAF applying attributes to many elements each frame is fine
  for typical drawings; revisit only if profiling shows jank.
- **Removing CSS playback:** `buildAndApplyAnimationCSS` / `animation-delay`
  seeking is deleted in Phase 2. The old snapshot `keyframes[].data` field is
  dropped when the new model lands.

---

## 10. Status & remaining work

Phases 1–6 are implemented: easing engine, parent→child model, link sync, rAF
driver, keyframe overlay + floating easing button, easing/popover UI,
persistence (in-SVG `<metadata>`), and export (CSS + SMIL generators).

Remaining:
- A dedicated **Export animation** button/menu entry wiring `exportCSS()` /
  `exportSMIL()` to a download (UI only; logic is done).
- **Path `d` / text-content** tracks (step-hold for now).
- The playback `transform` is recomposed about the element's centre and
  overrides any pre-existing transform on the element during animation.
- Bounce easings export as `linear` in CSS (SMIL keeps the spline fallback).
