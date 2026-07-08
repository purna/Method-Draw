/**
 * Animation timeline integration for Method Draw.
 * Wires the SVG canvas to the animation timeline so each canvas item
 * can be added as a row with keyframes that capture properties.
 */
methodDraw.ready(function() {
window.methodDraw.timeline = (function() {
  var timeline;
  var timelineElements = {};
  var currentTime = 0;
  var isPlaying = false;
  var timelineDuration = 5000;
  var animationStartTime = 0;
  var animationFrameId = null;

/**
 * Default visible duration (ms) given to a row the first time an element
 * is added to the timeline - it will appear at the start keyframe and
 * disappear after the end keyframe unless the keyframes are dragged/added
 * to extend it.
 */
var DEFAULT_ROW_DURATION = 2000;

/**
 * Extract animatable properties from an SVG element
 */
function getElementProps(elem) {
  if (!elem) return null;

  var props = {
    tagName: elem.tagName,
    id: elem.id || '',
    x: parseFloat(elem.getAttribute('x') || 0),
    y: parseFloat(elem.getAttribute('y') || 0),
    cx: parseFloat(elem.getAttribute('cx') || 0),
    cy: parseFloat(elem.getAttribute('cy') || 0),
    width: parseFloat(elem.getAttribute('width') || 0),
    height: parseFloat(elem.getAttribute('height') || 0),
    fill: elem.getAttribute('fill') || '#000000',
    stroke: elem.getAttribute('stroke') || 'none',
    strokeWidth: parseFloat(elem.getAttribute('stroke-width') || 0),
    opacity: parseFloat(elem.getAttribute('opacity') || 1),
    rotation: 0,
    transform: elem.getAttribute('transform') || ''
  };

  // Rotation from transform
  try {
    props.rotation = svgedit.utilities.getRotationAngle(elem);
  } catch (e) {
    props.rotation = 0;
  }

  // Text-specific
  if (props.tagName === 'text' || props.tagName === 'tspan') {
    props.fontSize = elem.getAttribute('font-size') || '16';
    props.fontFamily = elem.getAttribute('font-family') || 'sans-serif';
    props.textContent = elem.textContent || '';
  }

  // Path-specific
  if (props.tagName === 'path') {
    props.d = elem.getAttribute('d') || '';
  }

  return props;
}

/**
 * Apply properties to an SVG element
 */
function applyElementProps(elem, props) {
  if (!elem || !props) return;

  if (props.x !== undefined) elem.setAttribute('x', props.x);
  if (props.y !== undefined) elem.setAttribute('y', props.y);
  if (props.cx !== undefined) elem.setAttribute('cx', props.cx);
  if (props.cy !== undefined) elem.setAttribute('cy', props.cy);
  if (props.fill !== undefined) elem.setAttribute('fill', props.fill);
  if (props.stroke !== undefined) elem.setAttribute('stroke', props.stroke);
  if (props.strokeWidth !== undefined) elem.setAttribute('stroke-width', props.strokeWidth);
  if (props.opacity !== undefined) elem.setAttribute('opacity', props.opacity);
  if (props.width !== undefined) elem.setAttribute('width', props.width);
  if (props.height !== undefined) elem.setAttribute('height', props.height);

  if (props.tagName === 'text' || props.tagName === 'tspan') {
    if (props.fontSize !== undefined) elem.setAttribute('font-size', props.fontSize);
    if (props.fontFamily !== undefined) elem.setAttribute('font-family', props.fontFamily);
    if (props.textContent !== undefined) elem.textContent = props.textContent;
  }

  if (props.tagName === 'path' && props.d !== undefined) {
    elem.setAttribute('d', props.d);
  }

  // Handle rotation
  if (props.rotation !== undefined && props.rotation !== 0) {
    window.methodDraw.canvas.setRotationAngle(props.rotation, true);
  }
}

/**
 * Interpolate between two property sets
 */
function lerpProps(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  var result = {};
  for (var key in a) {
    if (a.hasOwnProperty(key)) {
      if (typeof a[key] === 'number' && typeof b[key] === 'number') {
        result[key] = a[key] + (b[key] - a[key]) * t;
      } else {
        result[key] = t < 0.5 ? a[key] : b[key];
      }
    }
  }
  for (var key in b) {
    if (b.hasOwnProperty(key) && !result.hasOwnProperty(key)) {
      result[key] = b[key];
    }
  }
  return result;
}

/**
 * Find the surrounding keyframes for interpolation at a given time
 */
function getKeyframesAtTime(row, time) {
  if (!row || !row.keyframes || row.keyframes.length === 0) return null;

  var sorted = row.keyframes.slice().sort(function(a, b) { return a.val - b.val; });
  var prev = null;
  var next = null;

  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].val <= time) {
      prev = sorted[i];
    }
    if (sorted[i].val >= time && !next) {
      next = sorted[i];
    }
  }

  if (!prev && next) return { from: next, to: next, t: 0 };
  if (prev && !next) return { from: prev, to: prev, t: 0 };
  if (prev === next) return { from: prev, to: prev, t: 0 };

  var t = (time - prev.val) / (next.val - prev.val);
  return { from: prev, to: next, t: t };
}

/**
 * Update timeline rows from canvas state
 */
function applyTimeToRows(time) {
  // Use CSS animation-delay for seeking when paused/scrubbing
  var animatedElements = document.querySelectorAll('.animated-element');
  animatedElements.forEach(function(elem) {
    elem.style.animationDelay = -time + 'ms';
  });

  var svgcanvas = document.getElementById('svgcanvas');
  if (svgcanvas) {
    svgcanvas.classList.remove('svg-animation-running');
    svgcanvas.classList.add('svg-animation-paused');
  }
}

/**
 * Update outline list for rows
 */
function updateOutline(rows) {
  var outlineContainer = document.getElementById('outline-container');
  var outlineHeader = document.getElementById('outline-header');
  if (!outlineContainer || !outlineHeader) return;

  var options = timeline.getOptions();
  if (options) {
    outlineHeader.style.maxHeight = outlineHeader.style.minHeight = options.headerHeight + 'px';
  }

  outlineContainer.innerHTML = '';

  rows.forEach(function(row, index) {
    var div = document.createElement('div');
    div.classList.add('outline-node');
    var h = (row.style ? row.style.height : 0) || (options && options.rowsStyle ? options.rowsStyle.height : 0);
    div.style.maxHeight = div.style.minHeight = h + 'px';
    div.style.marginBottom = ((options && options.rowsStyle ? options.rowsStyle.marginBottom : 0) || 0) + 'px';
    div.innerText = row.title || 'Track ' + index;
    div.id = div.innerText;

    var existing = document.getElementById(div.innerText);
    if (existing) {
      var size = Number.parseInt(existing.style.maxHeight) + h;
      existing.style.maxHeight = existing.style.minHeight = size + 'px';
      return;
    }

    outlineContainer.appendChild(div);
  });
}

/**
 * Add a canvas element to the timeline
 */
function addToTimeline(elem) {
  if (!elem || !elem.parentNode) return;

  var model = timeline.getModel();
  if (!model) model = { rows: [] };

  // Ensure element has an ID
  var elemId = elem.id;
  if (!elemId) {
    elemId = 'elem_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    elem.id = elemId;
  }

  // If a row already exists for this element, add a new keyframe to it
  // rather than silently doing nothing.
  for (var i = 0; i < model.rows.length; i++) {
    if (model.rows[i].elementId === elemId) {
      var existingRow = model.rows[i];
      if (!existingRow.keyframes) existingRow.keyframes = [];
      existingRow.keyframes.push({
        val: currentTime,
        data: JSON.parse(JSON.stringify(getElementProps(elem)))
      });
      timeline.setModel(model);
      buildAndApplyAnimationCSS();
      updateOutline(model.rows);
      applyTimeToRows(currentTime);
      return;
    }
  }

  var title = elem.tagName + (elem.id ? ' (' + elem.id + ')' : '');
  var props = getElementProps(elem);
  var startTime = currentTime || 0;

  var row = {
    title: title,
    elementId: elemId,
    element: elem,
    baseProps: JSON.parse(JSON.stringify(props)),
    keyframes: [
      {
        val: startTime,
        data: JSON.parse(JSON.stringify(props))
      },
      {
        val: startTime + DEFAULT_ROW_DURATION,
        data: JSON.parse(JSON.stringify(props))
      }
    ]
  };

  model.rows.push(row);
  timeline.setModel(model);

  buildAndApplyAnimationCSS();
  timelineElements[elemId] = {
    elem: elem,
    row: row
  };

  updateOutline(model.rows);
  currentTime = timeline.getTime();
  applyTimeToRows(currentTime);
}

/**
 * Make all existing and future SVG elements draggable
 */
function setupDragDrop() {
  var svgcanvas = document.getElementById('svgcanvas');
  var timelinePanel = document.getElementById('timeline-panel');

  if (!svgcanvas || !timelinePanel) return;

  // Make all existing elements draggable
  var allElems = svgcanvas.querySelectorAll('*');
  allElems.forEach(function(el) {
    if (el.tagName !== 'svg' && el.tagName !== 'defs') {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', el.id || '');
        e.dataTransfer.effectAllowed = 'copy';
      });
    }
  });

  // Hook newly created elements
  var originalAddSvgElementFromJson = window.methodDraw.canvas.addSvgElementFromJson;
  window.methodDraw.canvas.addSvgElementFromJson = function(data) {
    var shape = originalAddSvgElementFromJson.apply(this, arguments);
    if (shape && shape.parentNode && shape.tagName !== 'svg') {
      shape.setAttribute('draggable', 'true');
      shape.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', shape.id || '');
        e.dataTransfer.effectAllowed = 'copy';
      });
    }
    return shape;
  };

  // Drop on timeline panel
  timelinePanel.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  timelinePanel.addEventListener('drop', function(e) {
    e.preventDefault();
    var elemId = e.dataTransfer.getData('text/plain');
    var elem = document.getElementById(elemId);
    if (elem) {
      addToTimeline(elem);
    }
  });
}

/**
 * Wire up the Add to Timeline menu item
 */
function setupAddButton() {
  var btn = document.getElementById('tool_add_to_timeline');
  if (!btn) return;

  btn.addEventListener('click', function() {
    var selected = window.methodDraw.canvas.getSelectedElems();
    if (selected && selected.length > 0) {
      selected.forEach(function(elem) {
        addToTimeline(elem);
      });
    }
  });

  // When an element is selected on the canvas, highlight its row in the timeline
  window.methodDraw.canvas.bind('selected', function(win, elems) {
    var model = timeline.getModel();
    if (!model || !model.rows) return;

    var selectedIds = elems.map(function(el) { return el ? el.id : null; }).filter(Boolean);

    model.rows.forEach(function(row) {
      var outlineNode = document.getElementById(row.title);
      if (outlineNode) {
        var isSelected = selectedIds.indexOf(row.elementId) !== -1;
        outlineNode.classList.toggle('selected', isSelected);
      }
    });

    btn.classList.toggle('disabled', !elems || elems.length === 0);
  });

  // When a canvas element's properties are changed, if there is a keyframe
  // selected for it, update the keyframe's data.
  window.methodDraw.canvas.bind('changed', function(win, elems) {
    var selectedKeyframes = timeline.getSelectedElements().filter(function(item) {
      return item.type === 'keyframe';
    });

    if (!selectedKeyframes.length) return;

    var model = timeline.getModel();
    var changed = false;
    selectedKeyframes.forEach(function(item) {
      if (item.row && item.row.element && elems.indexOf(item.row.element) !== -1) {
        item.keyframe.data = JSON.parse(JSON.stringify(getElementProps(item.row.element)));
        changed = true;
      }
    });

    if (changed) {
      buildAndApplyAnimationCSS();
    }
  });

  // Enable/disable based on selection
  window.methodDraw.canvas.bind('selected', function() {
    var selected = window.methodDraw.canvas.getSelectedElems();
    if (btn) {
      btn.classList.toggle('disabled', !selected || selected.length === 0);
    }
  });
}

/**
 * Wire up timeline events
 */
function wireTimelineEvents() {
  // Double click a row to jump to its element on canvas
  timeline.onDoubleClick(function(event) {
    if (event.target && event.target.type === 'keyframe' && event.target.row) {
      var row = event.target.row;
      if (row.element) {
        window.methodDraw.canvas.selectOnly([row.element]);
        // Scroll to element
        var bbox = svgedit.utilities.getBBox(row.element);
        if (bbox) {
          var workarea = document.getElementById('workarea');
          var zoom = window.methodDraw.canvas.getZoom();
          workarea.scrollLeft = (bbox.x - 50) * zoom;
          workarea.scrollTop = (bbox.y - 50) * zoom;
        }
      }
      return;
    }

    // Double-click on empty space within a row (not on an existing
    // keyframe) drops a new keyframe there, capturing the element's
    // current live properties.
    if (event.target && event.target.type === 'row' && event.target.row && event.point) {
      var targetRow = event.target.row;
      if (!targetRow.element) return;
      if (!targetRow.keyframes) targetRow.keyframes = [];
      targetRow.keyframes.push({
        val: event.point.val,
        data: JSON.parse(JSON.stringify(getElementProps(targetRow.element)))
      });
      timeline.redraw();
      buildAndApplyAnimationCSS();
      applyTimeToRows(currentTime);
    }
  });

  // Context menu on timeline to add keyframe
  timeline.onContextMenu(function(event) {
    if (event.args) event.args.preventDefault();

    event.elements.forEach(function(p) {
      if (p.type === 'row' && p.row) {
        if (!p.row.keyframes) p.row.keyframes = [];
        var prop = p.row.element ? getElementProps(p.row.element) : {};
        p.row.keyframes.push({
          val: event.point ? event.point.val : 0,
          data: JSON.parse(JSON.stringify(prop))
        });
      }
    });
    timeline.redraw();
    buildAndApplyAnimationCSS();
  });

  // When a keyframe or row is selected in the timeline, select the corresponding canvas element
  timeline.on(timelineModule.TimelineEvents.Selected, function(event) {
    var selected = event.selected;
    if (selected && selected.length > 0 && selected[0].row && selected[0].row.element) {
      var elemToSelect = selected[0].row.element;
      window.methodDraw.canvas.selectOnly([elemToSelect]);
    }
  });

  // Time changed - apply interpolation
  timeline.onTimeChanged(function() {
    currentTime = timeline.getTime();
    if (!isPlaying) {
      applyTimeToRows(currentTime);
    }
  });

  // Keyframe dragged along the timeline - keep the canvas object in sync
  // live, not just when the drag finishes.
  timeline.onDrag(function() {
    buildAndApplyAnimationCSS();
    applyTimeToRows(currentTime);
  });

  timeline.onDragFinished(function() {
    buildAndApplyAnimationCSS();
    applyTimeToRows(currentTime);
  });

  // Keep outline synced with scroll
  timeline.onScroll(function() {
    var outlineContainer = document.getElementById('outline-container');
    var outlineElement = document.getElementById('outline-scroll-container');
    if (outlineContainer && outlineElement) {
      var options = timeline.getOptions();
      if (options) {
        outlineContainer.style.minHeight = (timeline.scrollTop + timeline.getClientHeight()) + 'px';
        outlineElement.scrollTop = timeline.scrollTop;
      }
    }
  });
}

/**
 * Apply theme-aware colors to the timeline canvas so it adapts to the
 * editor's light/dark mode. The animation-timeline library draws its
 * background, header, row fills and labels onto a <canvas>, so these
 * colors cannot be controlled via CSS alone and must be passed as options.
 */
function isLightMode() {
  return document.body.classList.contains('inverted');
}

function applyTimelineTheme() {
  if (!timeline) return;
  var light = isLightMode();

  // In light mode the text should be black on a white background, and the
  // row holding an object should be an off-white (not grey). In dark mode we
  // keep the original dark palette.
  var theme = {
    // transparent so the CSS .scroll-container background (--z0) shows through
    fillColor: 'transparent',
    headerFillColor: light ? '#e9e9ec' : '#101011',
    labelsColor: light ? '#000000' : '#D5D5D5',
    tickColor: light ? '#9a9aa2' : '#D5D5D5',
    rowsStyle: {
      fillColor: light ? '#f4f4f5' : '#252526',
      keyframesStyle: {
        fillColor: light ? '#f59e0b' : 'DarkOrange',
        selectedFillColor: light ? '#2563eb' : 'red',
        strokeColor: light ? '#1f2937' : 'black',
        selectedStrokeColor: light ? '#1d4ed8' : 'black'
      },
      groupsStyle: {
        fillColor: light ? '#cbd5e1' : '#094771'
      }
    }
  };

  timeline.setOptions(theme);
  timeline.redraw();
}

/**
 * Initialize the timeline with an empty model
 */
function initTimeline() {
  var emptyModel = { rows: [] };
  timeline = new timelineModule.Timeline();
  timeline.initialize({
    id: 'timeline',
    headerHeight: 45,
    keyframesDraggable: true,
    groupsDraggable: true,
    timelineDraggable: true
  }, emptyModel);
  timeline.setOptions({ totalTime: timelineDuration });

  var svgcanvas = document.getElementById('svgcanvas');
  if (svgcanvas) {
      svgcanvas.classList.add('svg-animation-paused');
  }
  buildAndApplyAnimationCSS();
  applyTimeToRows(0);

  wireTimelineEvents();
  setupDragDrop();
  setupAddButton();
  updateOutline([]);
  setInteractionModeButtonState('selection');

  // Apply colors that match the current theme and keep them in sync when
  // the editor is switched between light and dark mode.
  applyTimelineTheme();
  if (window.MutationObserver) {
    var themeObserver = new MutationObserver(function() {
      applyTimelineTheme();
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  var loopBtn = document.getElementById('tool_timeline_loop');
  if (loopBtn) loopBtn.classList.add('active');

  var durationInput = document.getElementById('timeline_duration_input');
  if (durationInput) durationInput.value = timelineDuration;
}

/**
 * Generates CSS animations from the timeline model and injects them.
 */
function buildAndApplyAnimationCSS() {
  var model = timeline.getModel();
  if (!model || !model.rows) return;

  var css = '';
  var duration = timelineDuration;

  model.rows.forEach(function(row) {
    if (!row.elementId || !row.keyframes || row.keyframes.length < 1 || !row.baseProps) return;

    var elem = document.getElementById(row.elementId);
    if (!elem) return;

    elem.classList.add('animated-element');

    var animName = 'timeline-anim-' + row.elementId;
    var kfs = row.keyframes.slice().sort(function(a, b) { return a.val - b.val; });

    css += '@keyframes ' + animName + ' {\n';

    // Object is only visible for the span between its first and last
    // keyframe (default 2s when first added; drag the end keyframes to
    // extend/shrink that window).
    var startPct = (kfs[0].val / duration) * 100;
    var endPct = (kfs[kfs.length - 1].val / duration) * 100;
    var epsilon = 0.01;

    if (startPct > epsilon) {
      css += '  0% { visibility: hidden; }\n';
      css += '  ' + Math.max(0, startPct - epsilon).toFixed(2) + '% { visibility: hidden; }\n';
    }

    kfs.forEach(function(kf) {
      var pct = (kf.val / duration) * 100;
      css += '  ' + pct.toFixed(2) + '% {\n';
      css += '    visibility: visible;\n';

      var d = kf.data;
      var base = row.baseProps;
      var transform = '';

      // Position
      var dx = 0, dy = 0;
      if (d.tagName === 'circle' || d.tagName === 'ellipse') {
        dx = (d.cx || 0) - (base.cx || 0);
        dy = (d.cy || 0) - (base.cy || 0);
      } else {
        dx = (d.x || 0) - (base.x || 0);
        dy = (d.y || 0) - (base.y || 0);
      }
      transform += 'translate(' + dx + 'px, ' + dy + 'px) ';

      // Rotation
      if (d.rotation) {
        transform += 'rotate(' + d.rotation + 'deg) ';
      }

      // Scale
      var sx = (base.width && d.width) ? (d.width / base.width) : 1;
      var sy = (base.height && d.height) ? (d.height / base.height) : 1;

      if (sx !== 1 || sy !== 1) {
        transform += 'scale(' + sx + ', ' + sy + ') ';
      }

      if (transform) {
        css += '    transform: ' + transform.trim() + ';\n';
      }

      // Other properties
      if (d.fill !== undefined) css += '    fill: ' + d.fill + ';\n';
      if (d.stroke !== undefined) css += '    stroke: ' + d.stroke + ';\n';
      if (d.opacity !== undefined) css += '    opacity: ' + d.opacity + ';\n';
      if (d.strokeWidth !== undefined) css += '    stroke-width: ' + d.strokeWidth + ';\n';

      css += '  }\n';
    });

    if (endPct < 100 - epsilon) {
      css += '  ' + Math.min(100, endPct + epsilon).toFixed(2) + '% { visibility: hidden; }\n';
      css += '  100% { visibility: hidden; }\n';
    }

    css += '}\n\n';

    css += '#' + row.elementId + ' {\n';
    css += '  animation-name: ' + animName + ';\n';
    css += '  animation-duration: ' + duration + 'ms;\n';
    css += '  animation-fill-mode: forwards;\n';
    css += '  animation-timing-function: linear;\n';
    css += '}\n\n';
  });

  css += '#svgcanvas.svg-animation-paused .animated-element {\n  animation-play-state: paused;\n}\n';
  css += '#svgcanvas.svg-animation-running .animated-element {\n  animation-play-state: running;\n}\n';

  var styleEl = document.getElementById('timeline-animations');
  if (styleEl) {
    styleEl.textContent = css;
  }
}

/**
 * Playback controls
 */
function onPlayClick() {
  if (isPlaying) return;
  isPlaying = true;
  buildAndApplyAnimationCSS();

  var svgcanvas = document.getElementById('svgcanvas');
  if (!svgcanvas) return;

  var currentTime = timeline.getTime();
  var animatedElements = document.querySelectorAll('.animated-element');
  animatedElements.forEach(function(elem) {
    elem.style.animationDelay = -currentTime + 'ms';
  });

  svgcanvas.classList.remove('svg-animation-paused');
  svgcanvas.classList.add('svg-animation-running');
  timeline.setOptions({ timelineDraggable: false });

  animationStartTime = performance.now() - currentTime;
  function updatePlayhead(now) {
    if (!isPlaying) return;
    var elapsedTime = now - animationStartTime;
    var loopButton = document.getElementById('tool_timeline_loop');
    if (elapsedTime >= timelineDuration) {
      if (loopButton && loopButton.classList.contains('active')) {
        elapsedTime = 0;
        animationStartTime = now;
      } else {
        onPauseClick();
        timeline.setTime(timelineDuration);
        return;
      }
    }
    timeline.setTime(elapsedTime);
    animationFrameId = requestAnimationFrame(updatePlayhead);
  }
  animationFrameId = requestAnimationFrame(updatePlayhead);
}

function onPauseClick() {
  isPlaying = false;
  var svgcanvas = document.getElementById('svgcanvas');
  if (svgcanvas) {
    svgcanvas.classList.remove('svg-animation-running');
    svgcanvas.classList.add('svg-animation-paused');
  }

  timeline.setOptions({ timelineDraggable: true });
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  var currentTime = timeline.getTime();
  var animatedElements = document.querySelectorAll('.animated-element');
  animatedElements.forEach(function(elem) {
    elem.style.animationDelay = -currentTime + 'ms';
  });
}

function setTimelineDuration(val) {
  timelineDuration = parseInt(val, 10);
  if (isNaN(timelineDuration) || timelineDuration <= 0) return;
  if (timeline) {
    timeline.setOptions({ totalTime: timelineDuration });
    buildAndApplyAnimationCSS();
  }
  var input = document.getElementById('timeline_duration_input');
  if (input && parseInt(input.value, 10) !== timelineDuration) {
    input.value = timelineDuration;
  }
}

function toggleLoop(btn) {
  btn.classList.toggle('active');
}

/**
 * Timeline toolbar interaction-mode buttons
 */
var interactionModeButtons = {
  selection: 'tool_timeline_select',
  pan: 'tool_timeline_pan',
  nonInteractivePan: 'tool_timeline_pan_static',
  zoom: 'tool_timeline_zoom',
  none: 'tool_timeline_none'
};

function setInteractionModeButtonState(mode) {
  Object.keys(interactionModeButtons).forEach(function(key) {
    var btn = document.getElementById(interactionModeButtons[key]);
    if (btn) btn.classList.toggle('active', key === mode);
  });
}

function selectMode() {
  if (!timeline) return;
  timeline.setInteractionMode(timelineModule.TimelineInteractionMode.Selection);
  setInteractionModeButtonState('selection');
}

function panMode(interactive) {
  if (!timeline) return;
  timeline.setInteractionMode(
    interactive
      ? timelineModule.TimelineInteractionMode.Pan
      : timelineModule.TimelineInteractionMode.NonInteractivePan
  );
  setInteractionModeButtonState(interactive ? 'pan' : 'nonInteractivePan');
}

function zoomMode() {
  if (!timeline) return;
  timeline.setInteractionMode(timelineModule.TimelineInteractionMode.Zoom);
  setInteractionModeButtonState('zoom');
}

function noneMode() {
  if (!timeline) return;
  timeline.setInteractionMode(timelineModule.TimelineInteractionMode.None);
  setInteractionModeButtonState('none');
}

/**
 * Collapse/restore the timeline panel to just its toolbar.
 */
function toggleTimelinePanel() {
  var panel = document.getElementById('timeline-panel');
  var btn = document.getElementById('tool_timeline_collapse');
  if (!panel) return;
  var minimized = panel.classList.toggle('minimized');
  if (btn) btn.textContent = minimized ? 'keyboard_arrow_up' : 'keyboard_arrow_down';
}

/**
 * Toolbar "+" button.
 * If canvas elements are selected, add them to the timeline as new tracks
 * (same as the "Add to Timeline" menu item). Otherwise, add a fresh
 * keyframe at the current playhead position to any row that has a
 * selected keyframe, capturing that element's live properties.
 */
function addKeyframe() {
  if (!timeline) return;

  var canvasSelected = window.methodDraw.canvas.getSelectedElems().filter(Boolean);
  if (canvasSelected.length) {
    canvasSelected.forEach(function(elem) {
      addToTimeline(elem);
    });
    return;
  }

  var selectedEls = timeline.getSelectedElements();
  if (!selectedEls.length) return;

  var model = timeline.getModel();
  if (!model || !model.rows) return;

  var rows = {};
  selectedEls.forEach(function(p) {
    if (p.row && p.row.elementId) rows[p.row.elementId] = p.row;
  });

  var changed = false;
  Object.keys(rows).forEach(function(id) {
    var row = rows[id];
    if (!row.element) return;
    if (!row.keyframes) row.keyframes = [];
    row.keyframes.push({
      val: currentTime,
      data: JSON.parse(JSON.stringify(getElementProps(row.element)))
    });
    changed = true;
  });

  if (changed) {
    timeline.setModel(model);
    buildAndApplyAnimationCSS();
    updateOutline(model.rows);
  }
}

/**
 * Toolbar "x" button - removes whichever keyframe(s) are currently
 * selected on the timeline.
 */
function removeKeyframe() {
  if (!timeline) return;

  var selectedEls = timeline.getSelectedElements();
  if (!selectedEls.length) return;

  var model = timeline.getModel();
  if (!model || !model.rows) return;

  selectedEls.forEach(function(p) {
    var row = p.row;
    var kf = p.keyframe;
    if (!row || !row.keyframes || !kf) return;
    var idx = row.keyframes.indexOf(kf);
    if (idx === -1) {
      idx = row.keyframes.findIndex(function(k) { return k.val === kf.val; });
    }
    if (idx !== -1) row.keyframes.splice(idx, 1);
  });

  timeline.setModel(model);
  buildAndApplyAnimationCSS();
  currentTime = timeline.getTime();
  applyTimeToRows(currentTime);
}

/**
 * The outline panel scroll container uses overflow:hidden (it's kept in
 * sync programmatically via the timeline's onScroll handler), so it needs
 * wheel events forwarded manually into the timeline's own scroll position.
 */
function outlineMouseWheel(e) {
  if (!timeline) return;
  e.preventDefault();
  timeline.scrollTop = timeline.scrollTop + e.deltaY;
}

// Keyboard shortcut A to select all keyframes
document.addEventListener('keydown', function(args) {
  if (args.which === 65 && timeline && timeline._controlKeyPressed(args)) {
    timeline.selectAllKeyframes();
    args.preventDefault();
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  // Wait a tick for the canvas to be ready
  setTimeout(initTimeline, 100);
});

window.toggleTimelinePanel = toggleTimelinePanel;
window.selectMode = selectMode;
window.panMode = panMode;
window.zoomMode = zoomMode;
window.noneMode = noneMode;
window.onPlayClick = onPlayClick;
window.onPauseClick = onPauseClick;
window.toggleLoop = toggleLoop;
window.setTimelineDuration = setTimelineDuration;
window.addKeyframe = addKeyframe;
window.removeKeyframe = removeKeyframe;
window.outlineMouseWheel = outlineMouseWheel;

  return {
    init: initTimeline,
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
    outlineMouseWheel: outlineMouseWheel
  };
})();
});
