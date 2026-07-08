MD.Toolbar = function(){

  // tools left
  $("#tools_left .tool_button").on("click", function(){
    const mode = this.getAttribute("data-mode");
    if (mode === "shapes") { toggleShapesSubmenu(); return; }
    state.set("canvasMode", mode)
    if (mode === "shapelib") showShapeLib()
  });

  // Shapes submenu: a vertical flyout attached to the side of the Shapes button.
  var shapesMenu = document.getElementById("shapes_tool_menu");

  function toggleShapesSubmenu() {
    if (!shapesMenu) return;
    shapesMenu.style.display = (shapesMenu.style.display === "block") ? "none" : "block";
  }

  if (shapesMenu) {
    // Sub-items set their own modes (rect/ellipse/star/line). Keep the
    // submenu open so the user can switch shapes without clicking off.
    $(shapesMenu).find(".tool_button").on("click", function(e) {
      e.stopPropagation();
      const mode = this.getAttribute("data-mode");
      $("#shapes_tool_menu .tool_button").removeClass("current");
      $(this).addClass("current");
      state.set("canvasMode", mode);
    });

    // Hide the submenu only when the pointer truly leaves the button and
    // its submenu.
    var shapesBtn = document.getElementById("tool_shapes");
    shapesBtn.addEventListener("mouseleave", function(e) {
      if (!shapesMenu.contains(e.relatedTarget)) shapesMenu.style.display = "none";
    });
    shapesMenu.addEventListener("mouseleave", function(e) {
      if (!shapesBtn.contains(e.relatedTarget)) shapesMenu.style.display = "none";
    });
  }

  function showShapeLib(){
    $("#tools_shapelib").show();
  }

  function setMode(mode) {
    $(".tool_button").removeClass("current");
    $("#tool_" + mode).addClass("current");
    $("#workarea").attr("class", mode);
    svgCanvas.setMode(mode);
    // Refresh the context panel so tool-specific panels (e.g. star_panel)
    // appear when a shape tool is selected.
    if (editor.panel) editor.panel.updateContextPanel();
  }

  this.setMode = setMode;
}
