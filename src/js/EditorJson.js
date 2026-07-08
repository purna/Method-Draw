MD.EditorJson = function () {
    // Add JSON import/export handlers
    $('#tool_import_json').on('click', function () {
        $('#tool_import_json_input').trigger('click');
    });

    $('#tool_import_json_input').on('change', function () {
        if (!this.files.length) return;
        const file = this.files[0];
        const reader = new FileReader();
        reader.onloadend = function (e) {
            try {
                const json = JSON.parse(e.target.result);
                if (json.source && typeof json.source === 'string') {
                    editor.openPrep(function (ok) {
                        if (!ok) return;
                        editor.import.loadSvgString(json.source);
                    });
                } else {
                    $.alert("Invalid JSON file: 'source' property not found or not a string.");
                }
            } catch (err) {
                $.alert("Error reading JSON file: " + err.message);
            }
        };
        reader.readAsText(file);
        // Reset input to allow re-opening same file
        $(this).val('');
    });

    function exportJson() {
        editor.menu.flash($('#file_menu'));
        const svg_string = svgCanvas.getSvgString();
        // basic check for empty canvas
        if (!svg_string || svg_string.length < 500) {
            $.alert("Nothing to export");
            return;
        }
        const json_string = JSON.stringify({ source: svg_string }, null, 2);
        const blob = new Blob([json_string], { type: "application/json;charset=utf-8" });
        saveAs(blob, (svgCanvas.getDocumentTitle() || 'drawing') + '.json');
    };

    this.exportJson = exportJson;
}