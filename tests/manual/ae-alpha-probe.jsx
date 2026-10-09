/* Run from File > Scripts > Run Script File in AE. Uses only temporary test items. */
(function () {
    var original = app.project.activeItem, source = null, scan = null, solids = [], message = "";
    try {
        if (!app.project) { throw new Error("Open a project first."); }
        var input = new File(File($.fileName).parent.parent.parent.fsName + "/SpriteSheetBuilder.jsx");
        input.encoding = "UTF-8";
        if (!input.open("r")) { throw new Error("Cannot read SpriteSheetBuilder.jsx"); }
        var code = input.read(); input.close();
        var body = code.split("// CORE_BEGIN:")[1].split("// CORE_END")[0];
        eval(body.substring(body.indexOf("var Core")));
        source = app.project.items.addComp("__SSB_AlphaProbe_Source__", 64, 64, 1, 1, 25);
        var faint = source.layers.addSolid([1, 1, 1], "faint", 64, 64, 1, 1); solids.push(faint.source);
        faint.property("ADBE Transform Group").property("ADBE Opacity").setValue(0.5);
        var visible = source.layers.addSolid([1, 1, 1], "visible", 4, 6, 1, 1); solids.push(visible.source);
        visible.property("ADBE Transform Group").property("ADBE Position").setValue([12, 16]);
        visible.property("ADBE Transform Group").property("ADBE Opacity").setValue(2);
        scan = app.project.items.addComp("__SSB_AlphaProbe_Scan__", 64, 64, 1, 1, 25);
        var layer = scan.layers.add(source); layer.name = "__SSB_Source__";
        var effects = layer.property("ADBE Effect Parade");
        var shift = effects.addProperty("ADBE Shift Channels");
        shift.property(1).setValue(9);
        shift.property(2).setValue(1); shift.property(3).setValue(1); shift.property(4).setValue(1);
        effects.addProperty("ADBE Threshold2").property(1).setValue(0.01);
        var probe = scan.layers.addText("").property("ADBE Text Properties").property("ADBE Text Document");
        probe.expression = Core.nativeExpression(64, 64, 0, true);
        var result = probe.valueAtTime(0, false).text;
        if (probe.expressionError) { throw new Error(probe.expressionError); }
        if (result !== "10,13,14,19") { throw new Error("Expected 10,13,14,19; got " + result); }
        message = "PASS: AE " + app.version + " / " + app.project.bitsPerChannel + " bpc\nAlpha threshold and bounds: " + result;
    } catch (e) { message = "FAIL: " + e.toString(); }
    finally {
        try { if (scan) { scan.remove(); } } catch (e1) { message += "\nCleanup: " + e1; }
        try { if (source) { source.remove(); } } catch (e2) { message += "\nCleanup: " + e2; }
        for (var i = 0; i < solids.length; i++) { try { solids[i].remove(); } catch (e3) { message += "\nCleanup: " + e3; } }
        if (original instanceof CompItem && isValid(original)) { original.openInViewer(); }
    }
    alert(message);
}());
