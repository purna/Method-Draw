# Animation Timeline — Implementation Plan

**Goal:** Save keyframe data per-property (After Effects style) and render the
animation on the canvas in real time, so that colour, transform, rotation,
scale, opacity, etc. can each animate independently with their own timing and
easing.

**Reference code:** `src/js/timeline.js`, `src/index.html`,
`src/js/lib/animation-timeline.js`.

---

## 1. Problem statement

The current timeline (`src/js/timeline.js`) already works, but stores
**full element snapshots** at each keyframe:

- `getElementProps()` captures x/y/width/height/fill/stroke/opacity/rotation/
  transform all at once (timeline.js:27).
- `addToTimeline()` pushes a keyframe whose `data` is that full snapshot
  (timeline.js:227, timeline.js:248).
- Playback is generated as a single CSS `@keyframes` block per element in
  `buildAndApplyAnimationCSS()` (timeline.js:580) and sought via
  `animation-delay` (timeline.js:673).

This snapshot model forces **every** property to interpolate together between
two keyframes. A colour change therefore also drags position/rotation along,
and there is no way to give colour a different curve or schedule than a
resize. The CSS route also cannot animate properties that CSS keyframes can't
express (path `d`, text content).

---

## 2. Design decision

Adopt the **After Effects–style per-property keyframe model**:

- Each canvas object is one timeline **row**.
- Expanding a row reveals **property sub-tracks** (groups):
  - Transform: `position`, `rotation`, `scale`
  - Appearance: `fill`, `stroke`, `stroke-width`, `opacity`
  - Text (if applicable): `font-size`, `text-content`
  - Path (if applicable): `d`
- Each property track holds its **own keyframes** and its **own easing**.
- A keyframe stores only the value of the single property it changes.

Why this over snapshots:

1. Colour / resize / rotation can animate on different schedules and curves.
2. Each keyframe is smaller and only records the property that changed — no
   spurious interpolation of untouched properties.
3. The external `animation-timeline.js` library **already supports `group`s**
   (`groupsStyle`, `groupsDraggable` referenced in timeline.js:522 and the
   library itself). A `group` is exactly an After Effects property sub-track,
   so the UI cost is low.
4. Enables per-property easing (linear now, bezier later).

### 2.1 Per-property tracks are data, not separate timelines

Crucial clarification: property sub-tracks are an **organisational** structure
inside a single row. Playback writes every active property back to the **one**
`row.element` that already lives on the canvas. We do **not** create separate
`<animate>` timelines or duplicate elements. One element on the canvas, many
property lanes, all driving that same node. This keeps the animation bound to
the real document elements (so selection, export, and the rest of the editor
keep working unchanged).

---

## 3. Playback method — inline SVG attribute values via `requestAnimationFrame`

**Decision: drive each canvas element directly from JavaScript on every
animation frame. Do NOT use generated CSS `@keyframes`.**

On each frame the engine:

1. reads the current playhead time `t` (ms),
2. for every row, computes each property's value at `t`
   (`getValueAtTime(propertyTrack, t)`),
3. applies the computed values straight to the live element:
   - `transform` (translate + rotate + scale composed together) via
     `setAttribute('transform', ...)`,
   - `fill` / `stroke` / `opacity` / `stroke-width` via `setAttribute(...)`,
   - `textContent` / path `d` when those tracks exist.

This replaces `buildAndApplyAnimationCSS()` (timeline.js:580) and the
`animation-delay` seeking in `applyTimeToRows()` (timeline.js:673).

### Why inline SVG values beat CSS `@keyframes` here

| Concern | CSS `@keyframes` (current) | JS rAF inline values (chosen) |
|---------|----------------------------|-------------------------------|
| Time model | Percentages frozen at generation | Pure milliseconds, read live |
| Changing animation length | Must regenerate every `@keyframes` and remap each `val`→`%` | Update one variable (`timelineDuration`); next frame is correct |
| Per-property easing | One `animation-timing-function` for the whole element | Independent easing per property track |
| Non-CSS properties (`path d`, text) | Not animatable | Fully supported by setting attributes |
| Scrubbing / seeking | Hacky: keep animation `running`, fake position with negative `animation-delay` | Instant: just compute and apply at `t` |
| Bound to canvas element | Yes (applied to `#elementId`) | Yes (applied to `row.element`) |

The only upside of CSS is compositor offloading, but SVG attribute changes
(position/fill/path) are not compositor-friendly anyway, and a drawing editor
preview is well within what rAF can handle.

### Time mapping and changing the duration

There is **no 0%–100% conversion to maintain**. Every keyframe stores an
absolute time `val` in milliseconds. Interpolation is:

```
t = playhead (ms)
progress = (t - from.val) / (to.val - from.val)   // clamped 0..1
value = lerp(from.value, to.value, easing(progress))
```

`timelineDuration` is just the loop/seek boundary. When the user changes the
timeline length (timeline.js:745 `setTimelineDuration`), we update the
variable; because keyframes are stored in ms and percentages are computed
nowhere, nothing else needs rebuilding. This is the central reason the rAF
approach is chosen over CSS for a length-editable timeline.

---

## 4. Target data model

```js
row = {
  title: 'rect (elem_123)',
  elementId: 'elem_123',
  element: <svgNode>,            // live reference to the canvas element
  baseProps: { x, y, width, height, fill, ... }, // rest state

  properties: {
    position: { keyframes: [{ val: 0,   x: 10, y: 20 },
                            { val: 1000, x: 200, y: 50 }],
                easing: 'linear' },
    rotation: { keyframes: [{ val: 0, value: 0 },
                            { val: 2000, value: 90 }],
                easing: 'linear' },
    scale:    { keyframes: [{ val: 0, sx: 1, sy: 1 }], easing: 'linear' },
    fill:     { keyframes: [{ val: 0, value: '#000000' },
                            { val: 1500, value: '#ff0000' }],
                easing: 'linear' },
    opacity:  { keyframes: [...], easing: 'linear' },
    // text only: fontSize, textContent
    // path only: d
  }
}
```

Property lists are derived per element type in a single helper
(`getAnimatableProperties(elem)`). All `val` fields are milliseconds.

---

## 5. Plan of action (phased)

### Phase 1 — Data model & property helpers
- Add `getAnimatableProperties(elem)` returning the ordered list of property
  ids valid for that element type (shape / text / path).
- Refactor keyframe storage in `addToTimeline()`, `addKeyframe()`,
  `removeKeyframe()`, and the timeline event handlers to write into
  `row.properties[prop].keyframes` instead of `row.keyframes[].data`.
- Keep `baseProps` for the element's at-rest state.
- Keep the old snapshot path temporarily behind a flag so behaviour is
  recoverable during development.

### Phase 2 — Timeline UI: expandable rows & property groups
- Add an expand/collapse control on each row header (timeline.js `updateOutline`
  / row rendering).
- Render each property as a library `group` sub-lane using the existing
  `groupsStyle`/`groupsDraggable` options (timeline.js:522).
- Colour-code groups so each property is visually distinct (reuse the
  theme helper `applyTimelineTheme`).
- Per-property "+ keyframe": clicking a property lane captures only that
  property's current live value.

### Phase 3 — Interpolation engine (inline values)
- Add `getValueAtTime(propertyTrack, t)`:
  - numeric props → `a + (b-a) * easedT`
  - colour props → interpolate RGB(A)
  - discrete props (`textContent`, `d` with mismatched point counts) → step
    (hold previous value until the next keyframe)
  - apply `easing` (linear default; bezier hook added in Phase 6)
- Add per-property `getKeyframesAtTime` (replaces the all-props version at
  timeline.js:129).
- Replace `buildAndApplyAnimationCSS()` (timeline.js:580) with
  `applyPropertiesAtTime(row, t)`:
  - compute each active property value
  - compose `transform` (translate + rotate + scale) once
  - `setAttribute` for `fill`/`stroke`/`opacity`/`stroke-width`
  - set `textContent` / path `d` when those tracks exist
- Remove the CSS `<style id="timeline-animations">` generation and the
  `animation-delay` seeking logic.

### Phase 4 — Realtime playback loop
- Unify play / pause / scrub on a single `requestAnimationFrame` loop
  (fold `onPlayClick`/`onPauseClick`/`updatePlayhead`, timeline.js:685/724
  into one driver).
- Each frame: `t = playhead`; for every row call `applyPropertiesAtTime(row, t)`.
- Scrubbing = set `t` and run the same function (no CSS class toggling).
- `setTimelineDuration` (timeline.js:745) only updates `timelineDuration`;
  no keyframe/percentage regeneration required.

### Phase 5 — Persistence
- Serialize `rows → properties → keyframes → easing` to JSON
  (`getModel()` already exists).
- Save/load alongside the SVG document so animations survive reload
  (hook into the existing DAO / file-save flow).
- Exclude live `element` references from serialization; re-bind by
  `elementId` on load.

### Phase 6 (later) — Easing & export
- Per-property easing dropdown / bezier handles in the property lane.
- Export module that generates CSS `@keyframes` or SMIL `<animate>` from the
  per-property tracks for use outside the editor.

---

## 6. Files touched

| File | Change |
|------|--------|
| `src/js/timeline.js` | Data model, groups UI, rAF interpolation engine, rAF playback, persistence |
| `src/index.html` | Property-lane UI controls, easing controls (as needed) |
| `src/css/animation-timeline.css` | Group / property-lane styling |
| `src/js/lib/animation-timeline.js` | Read-only; relies on existing `group` API (no edit expected) |

---

## 7. Risks & notes

- **Library group semantics:** confirm `animation-timeline.js` renders
  `group`s as stacked sub-lanes within a row (not just categorical dots).
  If it does not, property lanes will be rendered as nested rows instead.
- **Transform composition:** position/rotation/scale must be combined into a
  single `transform` attribute (already partially done at timeline.js:619);
  ensure rotation pivot is the element centre.
- **Path `d` interpolation:** only interpolate when point counts match;
  otherwise step. Full path morphing is a later enhancement.
- **Performance:** rAF applying attributes to many elements each frame is fine
  for typical drawings; revisit with CSS offloading only if profiling shows
  jank (unlikely, since SVG attribute animation isn't compositor-bound).
- **Removing CSS playback:** the old `buildAndApplyAnimationCSS` /
  `animation-delay` path is deleted in Phase 3. Keep the snapshot flag in
  Phase 1 until the rAF path is verified, then remove it.

---

## 8. Suggested first slice (recommended starting point)

Implement Phases 1–4 for the core properties (`position`, `rotation`, `scale`,
`fill`, `opacity`) with linear easing and the JS rAF engine, keeping the
snapshot path disabled behind a flag until the new path is verified. This
delivers realtime, duration-flexible, independent per-property animation
end-to-end before adding easing UI, persistence, and export.
