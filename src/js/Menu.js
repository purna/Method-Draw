MD.Menu = function(){
  
  $('#tool_wireframe').on("click", editor.toggleWireframe);
  $('#tool_move_top').on("click", editor.moveToTopSelected);
  $('#tool_move_up').on("click", editor.moveUpSelected);
  $('#tool_move_bottom').on("click", editor.moveToBottomSelected);
  $('#tool_move_down').on("click", editor.moveDownSelected);
  $('#tool_topath').on("click", editor.convertToPath);
  $('#tool_group').on("click", editor.groupSelected);
  $('#tool_ungroup').on("click", editor.ungroupSelected);
  if (window.location.host === "editor.method.ac") {
    $('#modal_donate').show();
    $('#sponsors').show();
  }
  // top dropdown menus
  $('.menu_title')
    .on('mousedown', function() {
      $("#tools_shapelib").hide();
      var menu = $(this).parent();
      if (menu.hasClass('open')) {
        // clicking an already-open menu's title closes it
        $('#menu_bar').removeClass('active');
        menu.removeClass('open');
      } else {
        $('#menu_bar').addClass('active');
        $('.menu').removeClass('open');
        menu.addClass('open');
      }
    })
     .on('mouseover', function() {
        // Only switch between menus on hover while one is already open,
        // otherwise this fires before mousedown and immediately toggles the
        // menu closed, forcing the user to click multiple times.
        if (!$('#menu_bar').hasClass('active')) return;
        $('.menu').removeClass('open');
        $(this).parent().addClass('open');
      });
  
  function blink(el) {
    el.style.background = "#fff";
    setTimeout(()=> el.style.background = "#ddd", 50);
    setTimeout(()=> el.style.background = "#fff", 150);
    setTimeout(()=> el.style.background = "#ddd", 200);
    setTimeout(()=> el.style.background = "", 200);
    setTimeout(()=> $('#menu_bar').removeClass('active'), 250);
    return false;
  }

  function close(e){
    if (e.target.nodeName && e.target.nodeName.toLowerCase() === "input") return false;
    // Clicks inside a menu title (including child nodes like the logo SVG)
    // are handled by the menu title's own mousedown handler.
    if ($(e.target).closest('.menu_title').length) return false;
    if ($(e.target).closest('.menu_item').length) {
      if ($(e.target).closest('.menu_item').hasClass('disabled')) $('#menu_bar').removeClass('active');
      return false;
    }
    $('#menu_bar').removeClass('active');
  }

  function flash($menu){
    var menu_title = $menu.prev();
    menu_title.css({
      "background": "white",
      "color": "black"
    });
    setTimeout(function(){menu_title.removeAttr("style")}, 200);
  }

  // This puts the correct shortcuts in the menus
  if (!svgedit.browser.isMac()) {
   $('.shortcut').each(function(){
     var text = $(this).text();
     $(this).text(text.split("⌘").join("Ctrl+"))
   }); 
  }
  
  $('.menu_item').on('click', function(e){
    const action = this.getAttribute("data-action");
    if (action && editor[action]) {
      editor[action]();
      blink(this);
    }
  });

  $("body").on('mousedown', close);

  this.flash = flash;

}
