# Method Draw: Project Source of Truth

**Version:** 2.0
**Date:** 2026-07-08

## 0. Online & Distribution

- **Online Demo:** https://editor.method.ac
- **Donate:** https://method.ac/donate/
- **License:** MIT
- **Copyright:** Mark MacKay [mark@method.ac](mailto:mark@method.ac)

---

## 1. Project Overview

Method Draw is a web-based vector drawing application designed for simplicity, usability, and a focus on creative flow. It originated as a fork of the powerful open-source [SVG-Edit](https://github.com/SVG-Edit/svgedit) project. The primary motivation for the fork was to streamline the user experience by removing overly complex and less frequently used features, such as the full layer system, complex path segment manipulation, and obscure connector tools. This simplification allows Method Draw to be more approachable for designers, illustrators, and hobbyists who need a quick and intuitive tool for creating vector graphics.

### 1.1. Core Purpose

- Provide a simple, intuitive interface for creating and editing SVG vector graphics.
- Support basic shape creation (rectangles, ellipses, paths, polygons), text, and transformations.
- Include an animation timeline to create and preview keyframe-based animations.
- Allow exporting drawings as SVG files.

### 1.2. Core Philosophy & Goals

- **Simplicity over Complexity:** Prioritize a clean, uncluttered interface. Features should be intuitive and discoverable.
- **Focus on Core Vector Tools:** Excel at the fundamentals: creating and manipulating shapes, paths, and text.
- **Integrated Animation:** Provide a simple yet effective timeline for creating keyframe-based SVG animations, a feature not central to the original SVG-Edit.
- **Modern Web Standards:** Run entirely in the browser with no server-side dependencies for the core application logic.
- **Extensibility:** While simplified, the codebase should remain modular enough to allow for future feature additions.

### 1.3. Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES5/ES6)
- **JavaScript Libraries:**
  - **jQuery:** For DOM manipulation and event handling.
  - **jHotDraw:** For drawing tools and interactions (conceptual basis).
  - **animation-timeline.js:** For the interactive timeline UI.
- **Build System:** Gulp and npm for dependency management and building a distributable version.
- **Testing:** QUnit for unit and integration tests.
- **Development Server:** Simple Python HTTP server.

---

## 2. High-Level Architecture

The application is a Single Page Application (SPA) that runs entirely in the browser. Its architecture can be broken down into several key components:

1.  **The SVG Canvas (`canvas.js`):** This is the central component, responsible for managing the SVG document, handling element creation, selection, modification, and rendering. It maintains the state of the drawing.

2.  **The Editor UI (`index.html`, `editor/`):** This comprises all the visual controls, including the toolbar, menus, color pickers, and property panels. These components interact with the SVG Canvas to perform actions.

3.  **The Tool System (`method-draw.js`):** Manages the different drawing tools (select, path, shape, etc.). It handles mouse events on the canvas and translates them into drawing actions based on the currently selected tool.

4.  **The Animation Timeline (`timeline.js`):** A distinct module for creating animations. It manages keyframes, properties, and playback. It reads data from the canvas elements and generates animations. The implementation is planned to move from a CSS-based to a `requestAnimationFrame`-based engine for more control.

5.  **SVG-Edit Core Utilities (e.g., `svgutils.js`, `path.js`, `math.js`):** The foundational libraries inherited from the original SVG-Edit project. They provide a rich set of utilities for SVG manipulation, path mathematics, history management (undo/redo), and more.

6.  **Persistence and File Handling:** Logic for saving the current drawing (including animation data) and loading SVG files. This is handled by `js/dao.js` and `js/lib/filesaver.js`.

```
   +-----------------------------------------------------------------+
   |                           Browser                               |
   | +-------------------------------------------------------------+ |
   | |                     index.html (UI Shell)                   | |
   | |                                                             | |
   | | [Toolbar] [Menus] [Color Picker] [Property Panels]          | |
   | +-------------------------------------------------------------+ |
   |       ^   |               ^                           |         |
   |       |   v               |                           v         |
   | +-----|-------------------|---------------------------|-------+ |
   | |     |                   |                           |       | |
   | | js/method-draw.js <--> js/canvas.js <------------> js/timeline.js | |
   | | (UI Controller)     (Canvas & State Mgmt)      (Animation Logic)  | |
   | |     |                   |                           |       | |
   | |     |                   |                           |       | |
   | |     +-------------------v---------------------------+       | |
   | |                         |                                   | |
   | |     (Core Utilities: svgutils.js, path.js, math.js)         | |
   | |                         |                                   | |
   | +-------------------------------------------------------------+ |
   +-----------------------------------------------------------------+
```

---

## 3. File & Directory Structure

Below is a summary of the important files and directories within the `src` directory.

| Path                           | Description                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                   | The main entry point of the application. Contains the HTML structure for the editor, canvas, and all UI panels. Loads all CSS and JS.      |
| `css/`                         | Contains all stylesheets. `method-draw.css` is the main style file, and `animation-timeline.css` styles the animation panel.             |
| `editor/`                      | HTML partials for different UI components of the editor, such as the color picker, tool options, and main menu.                          |
| `font/`                        | Web fonts used in the application UI.                                                                                                    |
| `img/`                         | Image assets, icons, and cursors for the UI.                                                                                             |
| `js/`                          | The core application logic.                                                                                                              |
| `js/method-draw.js`            | The main application controller. Initializes the editor, manages tools, and handles UI interactions.      
                               |
| `js/canvas.js`                 | Manages the SVG canvas, element selection, transformations, and history (undo/redo).                                                     |
| `js/svgedit.js`                | A central file that aggregates core utilities from the original SVG-Edit project.                                                        |
| `js/svgutils.js`               | Contains core functions for creating and manipulating SVG elements in a cross-browser manner.                                            |
| `js/Rulers.js`                 | Manages the rulers, grid, and guides within the editor interface.                                                                        |
| `js/math.js`                   | Mathematical utilities for vector operations, matrix multiplication, and geometric calculations.                                   |
| `js/history.js`                | History management system implementing undo/redo functionality using the Command pattern.                                          |
| `js/path.js`                   | Path manipulation utilities for parsing, converting, and editing SVG path data.                                                    |
| `js/sanitize.js`               | Provides SVG sanitization to prevent XSS and remove non-standard or malicious content upon import.                                     |
| `js/booleanPath.js`            | Boolean path operations (union, subtract, intersect, exclude) using polygon clipping algorithms.                                 |
| `js/units.js`                  | Contains logic for parsing and converting between different SVG units (e.g., px, in, cm).                                                |
| `js/dao.js`                    | Handles Data Access Object logic for saving the SVG to a string and preparing it for download.                                           |
| `js/selectedChanged.js`        | Handles the logic that runs when the set of selected elements on the canvas changes.                                                     |
| `js/svgtransformlist.js`        | Utilities for parsing and manipulating SVG transform lists.                                                                          |


| `js/timeline.js`               | Manages the animation timeline, including keyframe creation, property interpolation, and playback logic.                                  |
| `js/lib/`                      | Third-party JavaScript libraries like jQuery, jscolor, and the animation timeline library.                                               |
| `js/lib/animation-timeline.js` | The standalone library used to render and manage the interactive timeline UI.                                                            |
| `js/lib/filesaver.js`          | A client-side library for saving files, enabling the "Save" functionality.                                                               |
| `js/lib/canvg.js`              | A JavaScript SVG parser and renderer. Used for converting SVG to a canvas element, often for export purposes.                            |
| `js/lib/jpicker.min.js`        | A color picker library used in the UI for selecting fill and stroke colors.                                                              |
| `js/lib/mousewheel.js`         | A jQuery plugin for handling mouse wheel events, used for zooming the canvas.                                                            |
| `locale/`                      | Language files for internationalization (i18n).                                                                                          |
| `test/`                        | QUnit tests for various parts of the application, especially for boolean path operations.                                                |
| `ANIMATION-TIMELINE-PLAN.md`   | A detailed technical plan for refactoring the animation timeline from a CSS-based to a JavaScript-based system.                          |

---

## 4. Core Modules Deep Dive

### 4.1. `js/method-draw.js` - Main Application Controller

- **Summary:** This file is the "brain" of the user interface. It orchestrates the application's startup, connects UI controls (like buttons and inputs) to the underlying canvas logic, and manages the overall state of the editor, such as the currently active tool.

- **Responsibilities:**
  - Initializes the entire application (`methodDraw.init`).
  - Sets up event listeners for UI elements (toolbar, menus, input fields).
  - Manages the state of the currently selected tool.
  - Acts as a mediator between the UI and the `svgCanvas` object.
  - Handles high-level actions like `save`, `export`, and `undo`/`redo`.
  - Updates context-sensitive tool option panels based on the selected tool or element.

- **Key Functions:**
  - `init()`: The main entry point. It calls other initialization functions, sets up the canvas, and binds all primary UI event handlers.
  - `setMode(mode)`: Changes the current drawing tool (e.g., 'select', 'path', 'rect').
  - `updateTool(tool)`: Updates the UI to reflect the currently selected tool and its options.
  - `leftPanel.click(...)`: Handles clicks on the main tool palette.

### 4.2. `js/canvas.js` - The SVG Canvas

- **Summary:** This module provides a high-level API for all operations related to the SVG document itself. It abstracts away the direct manipulation of the SVG DOM and provides a structured way to create, modify, and delete elements while maintaining a history for undo/redo functionality.

- **Responsibilities:**
  - Provides a high-level API for interacting with the SVG document.
  - Manages element selection, multi-selection, and the selection visual feedback (bounding box, resize handles).
  - Implements transformations: moving, scaling, rotating elements.
  - Manages the undo/redo stack (`UndoManager`).
  - Handles the creation of new SVG elements based on tool actions.
  - Contains the logic for boolean path operations (union, subtract, etc.).

- **Key Objects/Functions:**
  - `svgCanvas.addCommandToHistory(cmd)`: Pushes an action to the undo stack.
  - `svgCanvas.getSelectedElems()`: Returns the currently selected SVG elements.
  - `svgCanvas.addToSelection(elements)`: Adds one or more elements to the selection.
  - `svgCanvas.clearSelection()`: Deselects all elements.
  - `svgCanvas.moveSelectedElements(dx, dy)`: Moves the selected elements.
  - `svgCanvas.createLayer()`: (Note: Layers are a simplified concept here compared to full vector apps).

### 4.3. `js/svgedit.js` - SVG-Edit Core Utilities

- **Summary:** This is a conceptual grouping of several foundational utility files inherited from SVG-Edit (e.g., `svgutils.js`, `math.js`, `path.js`). It's a rich collection of stateless utility functions that handle the "hard parts" of SVG manipulation, such as path mathematics, matrix transformations, and browser compatibility quirks. It has no knowledge of the application's UI state.

- **Responsibilities:**
  - Provides a namespace (`svgedit`) for a wide range of utility functions.
  - **Path Utilities (`svgedit.path`):** Functions for parsing path data (`d` attribute), converting shapes to paths, and manipulating path segments.
  - **SVG Utilities (`svgedit.svg`):** Functions for creating and manipulating SVG elements in a cross-browser manner.
  - **Mathematical Utilities (`svgedit.math`):** Matrix multiplication, vector math, and geometric calculations.
  - **Browser Abstraction:** Handles inconsistencies between different browser implementations of SVG.
  - **Undo Management:** Contains the `UndoManager` class used by `canvas.js`.

- **Key Functions:**
  - `svgedit.path.pathAndImageToMatrix()`: Calculates transformation matrices.
  - `svgedit.transform.matrixMultiply()`: A core function for applying transformations.
  - `svgedit.utilities.getBBox(element)`: A reliable way to get the bounding box of an element, accounting for transformations.

### 4.4. `js/timeline.js` - Animation Timeline

- **Responsibilities:**
  - Renders and manages the animation timeline UI using `animation-timeline.js`.
  - Handles the creation, deletion, and modification of keyframes.
  - Associates canvas elements with timeline rows.
  - Contains the logic for interpolating property values between keyframes.
  - Manages playback (play, pause, scrub).

- **Current (Snapshot) Model:**
  - A keyframe stores a full snapshot of an element's properties (`x`, `y`, `fill`, `transform`, etc.).
  - Playback is generated by creating a CSS `@keyframes` block for each animated element.
  - Seeking is achieved by manipulating the `animation-delay` CSS property.
  - **Limitation:** This approach is not very performant, is difficult to extend to non-CSS properties (like path data), and offers limited control over easing.

- **Planned (Per-Property) Model (see `ANIMATION-TIMELINE-PLAN.md`):**
  - Each property (e.g., `fill`, `rotation`) will have its own track and keyframes.
  - Playback will be driven by a `requestAnimationFrame` loop, which calculates values in real-time and applies them directly to SVG element attributes.
  - This new model will allow for independent easing and timing for each property and support animating non-CSS properties like path data.
  - **Benefit:** This provides smoother animations, greater control, and is significantly more extensible and performant.

- **User Experience Requirements for Refactor:**
  - **Default Duration:** When an element is first added to the timeline, it must be given a default visible duration (e.g., 2 seconds), represented by a bar on the main row. This provides immediate visual feedback and a tangible range to work within.
  - **Dynamic Property Tracks:** To maintain a clean interface, the timeline should not show all animatable properties by default. Instead, when a user modifies a property (e.g., rotation, fill color) of an element on the canvas, a new sub-row for that specific property should dynamically appear under the element's main row. This "reveal on edit" behavior makes the tool more intuitive and less cluttered.

---

## 5. Data Models

### 5.1. Canvas Element State

The state of each element on the canvas is stored directly in its SVG attributes. The `svgCanvas` object provides an API to manipulate these attributes while maintaining the undo history.

**Example Rectangle Element:**
```xml
<rect id="svg_1" x="100" y="50" width="200" height="150"
      fill="#ff0000" stroke="#000000" stroke-width="2"
      transform="rotate(15 200 125)"
      opacity="0.8"
      data-anim='{"p":{"position":{"k":[]},"rotation":{"k":[]}}}' />
```
- `data-anim`: A custom attribute where animation data (from `timeline.js`) is stored as a JSON string. This allows animations to be saved within the SVG file itself.

### 5.2. Animation Timeline Row Data (Planned)

The new data model for an animated element (a "row" in the timeline) is designed to be structured per-property.

```javascript
const row = {
  title: 'rect (elem_123)',
  elementId: 'elem_123',
  element: <SVGElement>, // Live reference to the canvas element
  baseProps: { /* at-rest state of the element */ },

  properties: {
    position: {
      keyframes: [{ time: 0, value: { x: 10, y: 20 } }, { time: 1000, value: { x: 200, y: 50 } }],
      easing: 'linear'
    },
    rotation: {
      keyframes: [{ time: 0, value: 0 }, { time: 2000, value: 90 }],
      easing: 'linear'
    },
    fill: {
      keyframes: [{ time: 0, value: '#000000' }, { time: 1500, value: '#ff0000' }],
      easing: 'linear'
    }
    // ... other properties like scale, opacity, etc.
  }
}
```

- `time`: Time in milliseconds.
- `value`: The value of the property at that time.
- `easing`: The interpolation curve to use *after* this keyframe.

---

## 6. Build and Development Process

### 6.1. Development

To run a local development server, navigate to the `src` directory and use Python's built-in HTTP server.

**Python 2:**
```bash
cd src
python -m SimpleHTTPServer 8000
```

**Python 3:**
```bash
cd src
python -m http.server 8000
```

The application will be available at `http://localhost:8000`.

### 6.2. Build

The project uses `gulp` to create a production-ready build in the `dist` directory.

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Run the build:**
    ```bash
    gulp build
    ```

The `build` task concatenates and minifies CSS and JavaScript files, optimizes images, and prepares the project for deployment to a static file server.

---

## 7. Key Functionalities In-Depth

### 7.1. Drawing Tools
- **Select Tool:** Select, move, scale, and rotate objects.
- **Path Tool:** Create complex shapes with bezier curves.
- **Shape Tools:** Rectangle, Ellipse, Star, Polygon.
- **Text Tool:** Add and edit text directly on the canvas.
- **Zoom Tool:** Zoom in and out of the canvas.
- **Mechanism:** Mouse events (`mousedown`, `mousemove`, `mouseup`) on the SVG canvas are captured by `method-draw.js`. Based on the current `mode`, these events are delegated to the appropriate handler within `canvas.js`, which then creates or updates the SVG elements.

### 7.2. Selection and Transformation
- **Selection:** When an element is clicked with the Select tool, `canvas.js` adds it to a selection array. It then draws a "selector box" around the element's bounding box, complete with resize and rotation handles.
- **Transformation:** Dragging the element calls `moveSelectedElements`. Dragging a resize handle calls `transformSelectedElements`, applying a scale transformation. Dragging the rotation handle applies a rotation transformation. All transformations are done by calculating and applying a transformation matrix to the element's `transform` attribute.

### 7.3. Undo/Redo System
- **Core Idea:** Every action that modifies the canvas is encapsulated in a `Command` object. For example, `MoveElementCommand` stores the element that was moved and its `dx`/`dy` offset.
- **Execution:** When an element is moved, a `MoveElementCommand` is created and passed to `addCommandToHistory`. The command's `apply()` method is called, which performs the move.
- **Undo:** `svgCanvas.undo()` pops the last command from the `UndoManager` stack and calls its `unapply()` method, which reverses the action (e.g., moves the element back by `-dx`, `-dy`).
- **Redo:** `svgCanvas.redo()` pops from the redo stack and calls `apply()` again.

### 7.4. Styling
- **Fill and Stroke:** Apply solid colors or gradients (linear/radial) to shapes.
- **Opacity:** Control the transparency of elements.
- **Stroke Width:** Adjust the thickness of outlines.
- **Mechanism:** The UI panels in `index.html` (e.g., color picker) trigger events handled by `method-draw.js`. This then calls functions like `svgCanvas.changeSelectedAttribute('fill', '#RRGGBB')`, which modifies the attribute on the selected elements and creates an undoable `ChangeElementCommand`.

### 7.5. Boolean Operations
- **Union (Add):** Combine multiple shapes into one.
- **Subtract (Difference):** Cut one shape from another.
- **Intersection:** Keep only the overlapping area of shapes.
- **Exclusion:** Keep only the non-overlapping areas of shapes.
- **Underlying Library:** These operations are computationally complex. They are handled by converting the selected shapes into paths and using a polygon clipping library (based on the Martinez-Rueda algorithm) to calculate the resulting path data. The result is a new `<path>` element.

### 7.6. Animation
- **Timeline:** A panel for creating keyframe-based animations.
- **Playback Controls:** Play, pause, and scrub through the animation.
- **Property Animation:** Animate properties like position, rotation, scale, color, and opacity.

### 7.7. Saving and Loading
- **Saving:** The "Save" function serializes the entire `<svg>` element from the canvas into a string. This string, which includes all elements, styles, and the `data-anim` attributes, is then converted into a Blob and downloaded by the user as an `.svg` file.
- **Loading:** When an SVG file is opened, the file content is parsed into an XML document. The `<svg>` content is then injected into the application's canvas, and `method-draw.js` re-initializes the state from the loaded elements. The `timeline.js` module specifically looks for `data-anim` attributes to reconstruct the animation timeline.

---

## 8. Testing Strategy

- **Framework:** QUnit is used for testing. Test files are located in the `test/` directory.
- **Current Coverage:** The existing tests primarily focus on the boolean path operations, which are mathematically complex and prone to edge cases. There is also some coverage for core `svgedit.js` utility functions.
- **Areas for Improvement:**
  - **Transformation Logic:** Tests for rotation, scaling, and moving to verify matrix calculations.
  - **Tool Interaction:** End-to-end tests that simulate user actions (e.g., "click and drag to draw a rectangle") and verify the resulting SVG output.
  - **Animation Logic:** As the new animation engine is built, it needs comprehensive unit tests for interpolation, easing, and timeline state management.
  - **Undo/Redo:** Tests to ensure that every user action correctly creates a command and that undo/redo sequences result in the correct state.

---

## 9. Asset Inventory (CSS & JS)

This section provides a focused summary of every key CSS and JavaScript file in the project.

### 9.1. CSS Files

| File                           | Summary                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `css/method-draw.css`          | This is the main stylesheet for the entire application. It defines the layout, look, and feel of the toolbars, canvas, and panels. |
| `css/animation-timeline.css`   | This file contains styles specifically for the animation timeline panel, ensuring it is visually distinct and functional.          |

### 9.2. JavaScript Files

| File                           | Summary                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/method-draw.js`            | **Main Application Controller.** The central nervous system of the UI. It initializes the editor, handles UI events, and mediates between the user and the canvas.                                                                  |
| `js/canvas.js`                 | **SVG Canvas Manager.** Provides the high-level API for all drawing operations, managing element selection, transformations, and the undo/redo history.                                                                             |
| `js/svgedit.js`                | **SVG-Edit Core Aggregator.** A central file that aggregates and exposes core utilities inherited from the original SVG-Edit project, providing a unified `svgedit` namespace.                                                        |
| `js/svgutils.js`               | **Core SVG Utilities.** Contains a rich set of low-level, cross-browser functions for creating, inspecting, and manipulating SVG elements and their attributes.                                                                    |
| `js/Rulers.js`                 | **Rulers & Guides.** Manages the rulers, grid, and guides within the editor interface, providing visual alignment aids for the user.                                                                                                |
| `js/history.js`                | **History Management.** Implements the undo/redo stack using the Command pattern, storing reversible actions as command objects.                                                                                         |
| `js/path.js`                | **Path Operations.** Provides functions for parsing, converting, and manipulating SVG path data (`d` attributes), including conversion from shapes to paths.                                                              |
| `js/sanitize.js`               | **SVG Sanitization.** Provides functions to sanitize SVG input upon import, removing potentially malicious content (like scripts) and ensuring the SVG data is safe and compliant.                                                    |
| `js/booleanPath.js`                | **Boolean Path Operations.** Implements union, subtract, intersect, and exclude operations using polygon clipping algorithms (Martinez-Rueda) to calculate resulting path data.                                            |
| `js/units.js`                  | **Unit Conversion.** Contains utilities for parsing and converting between various SVG units (px, in, cm, em, etc.), essential for correct sizing and positioning.                                                              |
| `js/dao.js`                    | **Data Access Object.** Handles the logic for serializing the current SVG canvas content into a string and preparing it for download via `filesaver.js`.                                                                         |
| `js/selectedChanged.js`        | **Selection Event Handler.** Contains the logic that is executed whenever the current selection of elements on the canvas changes, updating UI panels and context-sensitive tools.                                                   |
| `js/svgtransformlist.js`                | **Transform List Utilities.** Provides functions for parsing and manipulating SVG transform lists, enabling complex transformation sequences to be applied to elements.                                                    |

| `js/timeline.js`               | **Animation Logic Controller.** Manages the animation feature, controlling the timeline UI, keyframe creation, and playback logic.                                                                                                  |
| `js/lib/animation-timeline.js` | **Timeline UI Library.** A third-party library that renders the interactive timeline UI.                                                                                                                                              |
| `js/lib/filesaver.js`          | **File Saving Library.** A client-side library that enables saving files (like the generated SVG) directly from the browser, working in tandem with `js/dao.js`.                                                                    |
| `js/lib/jquery.js`             | **DOM & Event Handling.** The core jQuery library, used extensively for DOM manipulation and event handling.                                                                                                                        |
| `js/lib/jscolor.js`            | **Color Picker UI.** A third-party library that provides the color picker widget.                                                                                                                                                     |
| `js/lib/pathseg.js`            | **SVGPathSeg Polyfill.** A polyfill for the now-removed native `SVGPathSeg` API, used for parsing and manipulating SVG path data (`d` attributes). This is crucial for path editing.  
                                                 |
| `js/lib/jquery.hotkeys.js`     | **Keyboard Shortcut Helper.** A jQuery plugin that simplifies the process of binding keyboard shortcuts (hotkeys) for application actions like 'Save' (Cmd+S) or 'Undo' (Cmd+Z).                                                      |
| `js/lib/jquery.bbq.js`         | **URL Hash/Fragment Manager.** A jQuery plugin for managing the browser's URL hash, enabling features like deep-linking or maintaining application state in the URL.                                                                  |
| `js/lib/canvg.js`              | **SVG to Canvas Renderer.** A library that parses and renders SVG content onto an HTML5 canvas. This is primarily used for raster image export functionality (e.g., saving as PNG).                                                  |
| `js/lib/rgbcolor.js`           | **Color Parsing Utility.** A utility for parsing various color string formats (hex, rgb, etc.) into a consistent object representation. It is a dependency for `canvg.js`.                                                          |
| `js/lib/stackblur.js`          | **Blur Effect Library.** A library for applying fast blur effects to canvas elements, used by `canvg.js` to render SVG blur filters.                                                                                                |
| `js/lib/jpicker.min.js`        | **Color Picker Widget.** A jQuery plugin that provides a more advanced color picker interface than the default, used for selecting fill and stroke colors.                                                                          |
| `js/lib/jquery-ui-1.8.17.custom.min.js` | **jQuery UI Widgets.** A specific build of the jQuery UI library providing widgets like sliders and dialogs, used for various interactive UI components.                                                                      |
| `js/lib/mousewheel.js`         | **Mouse Wheel Event Handler.** A jQuery plugin that normalizes `mousewheel` events across browsers, used to implement canvas zooming.                                                                                               |
| `js/lib/touch.js`              | **Touch Event Normalizer.** A small utility to normalize touch and mouse events, providing a consistent API for handling user input across both touch-enabled and traditional devices.                                                |

### 9.3. Test-related JavaScript Files

These files are part of the development and testing process and are not included in the production build.

| File                | Summary                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/boolean.js`   | **Boolean Operations Tests.** Contains QUnit tests specifically for the boolean path operations (union, subtract, intersection, etc.) to verify their correctness. |
| `test/test-api.js`  | **General API Tests.** Contains a suite of QUnit tests for various parts of the application's public and internal APIs.                                           |
| `test/lib/qunit.js` | **QUnit Library.** The QUnit testing framework itself, used to define and run the tests in the browser.                                                             |