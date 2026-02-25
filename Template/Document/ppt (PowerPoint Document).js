// HexForge JS Template - PowerPointDocument.js
// Purpose: MS-PPT PowerPoint Document Stream (Record Tree)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Document
// Reference: [MS-PPT] https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-ppt

var fileSize = await hf.fileSize;

hf.template.begin("PowerPoint Document Stream (MS-PPT)");
hf.template.setFormat("ppt_doc", "PPT Document Stream", [".ppt", ".pot", ".pps"]);

// ──────────────────────────────────────────────
// Validate: first record must have valid header
// ──────────────────────────────────────────────
if (fileSize < 8) {
    hf.error("Not a PowerPoint Document stream (too small)");
    await hf.template.end();
    throw new Error("Invalid PPT stream");
}

function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function i32(buf, off) { return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); }
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n, "0"); }
function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
}

var firstBuf = await hf.read(0, 8);
var firstType = u16(firstBuf, 2);
// DocumentContainer = 0x03E8, or could start with other valid records
if (firstType !== 0x03E8 && firstType !== 0x1011 && firstType !== 0x0FF5 &&
    firstType !== 0x0FBA && firstType !== 0x1772) {
    // Relaxed check: PPT streams can vary
}

// ──────────────────────────────────────────────
// Record Types — [MS-PPT] §2.13.24 RecordType
// ──────────────────────────────────────────────
var REC = {
    // Document
    0x03E8:"DocumentContainer",0x03E9:"DocumentAtom",0x03EA:"EndDocumentAtom",
    0x03EB:"SlideShowSlideInfoAtom",
    // Slide
    0x03EE:"MainMasterContainer",0x03EF:"MainMasterAtom",
    0x03F0:"SlideContainer",0x03F1:"SlideAtom",0x03F2:"SlideGroup",
    0x03F3:"SlidePersistAtom",0x03F4:"NotesAtom",0x03F8:"Environment",
    0x03F9:"SlidePersistAtom",0x03FA:"SSSlideLayoutAtom",
    0x03FB:"MasterTextPropAtom",0x03FF:"SlideViewInfoInstance",
    // Text
    0x0F9F:"TextHeaderAtom",0x0FA0:"TextCharsAtom",0x0FA1:"StyleTextPropAtom",
    0x0FA2:"MasterTextPropAtom",0x0FA3:"TxMasterStyleAtom",
    0x0FA4:"TxCFStyleAtom",0x0FA6:"TxPFStyleAtom",
    0x0FA8:"TextBytesAtom",0x0FA9:"TxSIStyleAtom",
    0x0FAA:"TextSpecInfoAtom",0x0FAF:"TextRulerAtom",
    0x0FB5:"TextBookmarkAtom",0x0FB7:"FontEntityAtom",
    0x0FBA:"UserEditAtom",0x0FBB:"FontEmbeddedData",
    0x0FC8:"SrKinsoku",0x0FCD:"ExOleObjAtom",
    0x0FD0:"ExHyperlinkAtom",0x0FD7:"ExHyperlink",
    0x0FD8:"TextSpecInfoDefaultAtom",
    0x0FD9:"HeadersFootersContainer",0x0FDA:"HeadersFootersAtom",
    0x0FE4:"RoundTripTheme12Atom",0x0FE7:"TxMasterStyle9Atom",
    0x0FEE:"ExMediaAtom",
    // Lists
    0x0FF0:"SlideListWithTextContainer",0x0FF1:"AnimationInfoContainer",
    0x0FF2:"AnimationInfoAtom",0x0FF5:"InteractiveInfoAtom",
    0x0FF8:"MasterListWithTextContainer",
    0x0FFC:"NotesMasterContainer",0x1004:"NotesListWithTextContainer",
    // Persist/Edit
    0x1772:"PersistDirectoryAtom",
    // Drawing
    0x040B:"DrawingGroup",0x040C:"PPDrawing",0x040D:"PPDrawingGroup",
    // OLE / External
    0x07D5:"FontCollection",0x07D6:"ExObjList",0x07D7:"ExObjListAtom",
    0x07D0:"DocInfoListContainer",0x07E0:"ColorSchemeAtom",
    0x07F0:"SchemeListElement",
    // Shapes / Placeholders
    0x0F00:"OEPlaceholderAtom",0x0F01:"GPointAtom",
    0x0F02:"GRatioAtom",0x0F03:"GScalingAtom",
    // View
    0x0F22:"ViewInfoAtom",0x0F25:"SSDocInfoAtom",
    0x0F2E:"NormalViewSetInfoContainer",0x0F2F:"NormalViewSetInfoAtom",
    // Program tags
    0x0BC1:"DocInfoListContainer2",0x0BD0:"ProgBinaryTag",
    0x0BD1:"BinaryTagDataBlob",0x0BDD:"ProgTags",
    // Notes
    0x0408:"NotesContainer",0x0410:"HandoutContainer",
    // Other containers
    0x0401:"TextCharsAtom_alt",0x0407:"SlideViewInfo",
    0x0422:"CString",
    0x100D:"SoundCollAtom",0x1014:"SSlideLayoutAtom",
    0x1018:"VBAInfoAtom",0x1019:"VBAInfoContainer",
    0x138A:"NormalViewSetInfoContainer2",0x138B:"NormalViewSetInfoAtom2",
    0x1388:"ViewInfoContainer",
    0x2AFB:"SlideShowSlideInfoAtom2",0x2B00:"HashCodeAtom",
    0x2B01:"BuildListContainer",0x2B02:"BuildAtom",
    // Escher (Drawing)
    0xF000:"EscherDggContainer",0xF001:"EscherBStoreContainer",
    0xF002:"EscherDgContainer",0xF003:"EscherSpgrContainer",
    0xF004:"EscherSpContainer",0xF005:"EscherSolverContainer",
    0xF006:"EscherDggRecord",0xF007:"EscherBSERecord",
    0xF008:"EscherDgRecord",0xF009:"EscherSpgrRecord",
    0xF00A:"EscherSpRecord",0xF00B:"EscherOPTRecord",
    0xF00D:"EscherClientTextbox",0xF010:"EscherClientAnchor",
    0xF011:"EscherClientData",0xF117:"EscherTertiaryOPT",
    0xF118:"EscherDummyRecord",0xF119:"EscherSplitMenuColors",
    0xF11A:"EscherChildAnchor",0xF11E:"EscherDeletedPspl",
    0xF122:"EscherRegroupRecord",
};

// Text type names for TextHeaderAtom
var TEXT_TYPES = {
    0:"Title",1:"Body",2:"Notes",3:"NotUsed",4:"Other",
    5:"CenterBody",6:"CenterTitle",7:"HalfBody",8:"QuarterBody"
};

// ──────────────────────────────────────────────
// Colors — Material Design
// ──────────────────────────────────────────────
var CLR = {
    DOC:     "#2196F3",  // Blue — Document
    SLIDE:   "#FF9800",  // Orange — Slides
    MASTER:  "#9C27B0",  // Purple — Masters
    TEXT:    "#4CAF50",  // Green — Text atoms
    DRAW:    "#3F51B5",  // Indigo — Drawing/Escher
    FONT:    "#E91E63",  // Pink — Fonts
    EDIT:    "#00BCD4",  // Cyan — UserEdit/Persist
    ENV:     "#795548",  // Brown — Environment
    ANIM:    "#FF5722",  // Deep Orange — Animation
    HDR:     "#009688",  // Teal — Headers/Footers
    VIEW:    "#673AB7",  // Deep Purple — View
    SCHEME:  "#CDDC39",  // Lime — Color schemes
    ESCHER:  "#607D8B",  // Blue Grey — Escher records
    GREY:    "#9E9E9E",
};

function recColor(rt) {
    if (rt === 0x03E8 || rt === 0x03E9 || rt === 0x03EA) return CLR.DOC;
    if (rt === 0x03F0 || rt === 0x03F1 || rt === 0x03F3) return CLR.SLIDE;
    if (rt === 0x03EE || rt === 0x03EF || rt === 0x03FA) return CLR.MASTER;
    if (rt >= 0x0F9F && rt <= 0x0FB9) return CLR.TEXT;
    if (rt === 0x0422 || rt === 0x0401) return CLR.TEXT;
    if (rt === 0x040B || rt === 0x040C || rt === 0x040D) return CLR.DRAW;
    if (rt === 0x07D5 || rt === 0x0FB7 || rt === 0x0FBB) return CLR.FONT;
    if (rt === 0x0FBA || rt === 0x1772) return CLR.EDIT;
    if (rt === 0x03F8) return CLR.ENV;
    if (rt === 0x0FF1 || rt === 0x0FF2 || rt === 0x2AFB || rt === 0x2B00 || rt === 0x2B01 || rt === 0x2B02) return CLR.ANIM;
    if (rt === 0x0FD9 || rt === 0x0FDA) return CLR.HDR;
    if (rt >= 0x0F22 && rt <= 0x0F2F) return CLR.VIEW;
    if (rt === 0x138A || rt === 0x138B || rt === 0x1388) return CLR.VIEW;
    if (rt === 0x07E0 || rt === 0x07F0) return CLR.SCHEME;
    if (rt >= 0xF000 && rt <= 0xF200) return CLR.ESCHER;
    if (rt === 0x0FF0 || rt === 0x0FF5 || rt === 0x0FF8 || rt === 0x0FFC || rt === 0x1004) return CLR.SLIDE;
    if (rt === 0x0408 || rt === 0x0410) return CLR.SLIDE;
    return CLR.GREY;
}

// ──────────────────────────────────────────────
// Recursive record parser
// ──────────────────────────────────────────────
var totalRecords = 0;
var typeCounts = {};
var slideCount = 0;
var masterCount = 0;
var noteCount = 0;
var textFragments = [];
var fontNames = [];
var userEdits = [];

// Max depth for template emission (avoid huge nesting)
var MAX_TEMPLATE_DEPTH = 4;

async function parseRecords(start, length, depth) {
    var pos = start;
    var end = start + length;

    while (pos + 8 <= end) {
        var hdrBuf = await hf.read(pos, 8);
        var recVerInst = u16(hdrBuf, 0);
        var recType = u16(hdrBuf, 2);
        var recLen = u32(hdrBuf, 4);

        var recVer = recVerInst & 0x0F;
        var recInstance = (recVerInst >> 4) & 0x0FFF;
        var isContainer = (recVer === 0x0F);

        if (pos + 8 + recLen > end) break; // truncated

        totalRecords++;
        typeCounts[recType] = (typeCounts[recType] || 0) + 1;

        var name = REC[recType] || ("Record_" + fmtHex(recType, 4));
        var color = recColor(recType);
        var detail = "";

        // Deep parse key atoms
        if (!isContainer && recLen > 0 && recLen <= 4096) {
            var dataBuf = await hf.read(pos + 8, Math.min(recLen, 512));

            if (recType === 0x03E9 && recLen >= 40) { // DocumentAtom
                var slideW = u32(dataBuf, 0);
                var slideH = u32(dataBuf, 4);
                var noteW = u32(dataBuf, 8);
                var noteH = u32(dataBuf, 12);
                detail = "slide=" + slideW + "×" + slideH +
                    " (" + (slideW / 576).toFixed(1) + "\" × " + (slideH / 576).toFixed(1) + "\")";
            }
            else if (recType === 0x03EF && recLen >= 24) { // MainMasterAtom
                masterCount++;
            }
            else if (recType === 0x03F1 && recLen >= 8) { // SlideAtom
                var geom = u32(dataBuf, 0);
                detail = "layout=" + geom;
            }
            else if (recType === 0x0F9F && recLen >= 4) { // TextHeaderAtom
                var textType = u32(dataBuf, 0);
                detail = TEXT_TYPES[textType] || ("type=" + textType);
            }
            else if (recType === 0x0FA0) { // TextCharsAtom (UTF-16LE)
                var text = "";
                var maxChars = Math.min(recLen / 2, 60);
                for (var ci = 0; ci < maxChars; ci++)
                    text += String.fromCharCode(u16(dataBuf, ci * 2));
                text = text.replace(/[\r\n\v]/g, "↵");
                if (text.length > 50) text = text.substring(0, 50) + "...";
                detail = '"' + text + '"';
                textFragments.push(text);
            }
            else if (recType === 0x0FA8) { // TextBytesAtom (ASCII)
                var text = "";
                var maxB = Math.min(recLen, 60);
                for (var bi = 0; bi < maxB; bi++)
                    text += String.fromCharCode(dataBuf[bi]);
                text = text.replace(/[\r\n\v]/g, "↵");
                if (text.length > 50) text = text.substring(0, 50) + "...";
                detail = '"' + text + '"';
                textFragments.push(text);
            }
            else if (recType === 0x0401) { // TextCharsAtom (alternate type)
                var text = "";
                var maxChars = Math.min(recLen / 2, 60);
                for (var ci = 0; ci < maxChars; ci++)
                    text += String.fromCharCode(u16(dataBuf, ci * 2));
                text = text.replace(/[\r\n\v]/g, "↵");
                if (text.length > 50) text = text.substring(0, 50) + "...";
                detail = '"' + text + '"';
                textFragments.push(text);
            }
            else if (recType === 0x0FB7 && recLen >= 64) { // FontEntityAtom
                var fname = "";
                for (var fi = 0; fi < 32; fi++) {
                    var ch = u16(dataBuf, fi * 2);
                    if (ch === 0) break;
                    fname += String.fromCharCode(ch);
                }
                fontNames.push(fname);
                detail = '"' + fname + '"';
            }
            else if (recType === 0x0FBA && recLen >= 20) { // UserEditAtom
                var lastSlideIdRef = u32(dataBuf, 0);
                var version = u16(dataBuf, 4);
                var offsetLastEdit = u32(dataBuf, 8);
                var offsetPersistDir = u32(dataBuf, 12);
                var docPersistIdRef = u32(dataBuf, 16);
                userEdits.push({ lastEdit: offsetLastEdit, persistDir: offsetPersistDir });
                detail = "lastEdit=" + fmtHex(offsetLastEdit, 8) +
                    " persist=" + fmtHex(offsetPersistDir, 8);
            }
            else if (recType === 0x1772) { // PersistDirectoryAtom
                var nEntries = Math.floor(recLen / 8);
                detail = "~" + nEntries + " persist entries";
            }
            else if (recType === 0x0FDA && recLen >= 4) { // HeadersFootersAtom
                var hfFlags = u16(dataBuf, 0);
                var parts = [];
                if (hfFlags & 0x01) parts.push("DateTime");
                if (hfFlags & 0x02) parts.push("SlideNumber");
                if (hfFlags & 0x04) parts.push("Header");
                if (hfFlags & 0x08) parts.push("Footer");
                detail = parts.join("+") || "none";
            }
            else if (recType === 0x07E0 && recLen === 32) { // ColorSchemeAtom
                detail = "instance=" + recInstance;
            }
            else if (recType === 0xF00A && recLen >= 8) { // EscherSpRecord
                var spid = u32(dataBuf, 0);
                var grfPersist = u32(dataBuf, 4);
                var isGroup = (grfPersist & 0x01) !== 0;
                var isChild = (grfPersist & 0x02) !== 0;
                detail = "spid=" + spid + (isGroup ? " GROUP" : "") + (isChild ? " CHILD" : "");
            }
        }
        // Container details
        if (recType === 0x03F0) slideCount++;
        if (recType === 0x0408) noteCount++;

        // Emit template
        if (depth <= MAX_TEMPLATE_DEPTH) {
            hf.template.seek(pos);

            var typeLabel = fmtHex(recType, 4) + " " + name;
            var containerLabel = isContainer ? "▼" : "●";
            var sizeLabel = fmtSize(recLen);
            var headerDisplay = containerLabel + " " + typeLabel + " (" + sizeLabel + ")";
            if (recInstance > 0) headerDisplay += " i=" + recInstance;
            if (detail) headerDisplay += " — " + detail;

            if (isContainer) {
                hf.template.beginStruct(name);
                await hf.template.addField("RecordHeader", "bytes:8", { color: color, display: headerDisplay });

                if (recLen > 0) {
                    await parseRecords(pos + 8, recLen, depth + 1);
                }

                hf.template.endStruct();
            } else {
                hf.template.beginStruct(name);
                await hf.template.addField("RecordHeader", "bytes:8", { color: color, display: headerDisplay });
                if (recLen > 0) {
                    await hf.template.addField("Data", "bytes:" + recLen, { color: color,
                        display: detail || (recLen + " bytes") });
                }
                hf.template.endStruct();
            }
        }

        pos += 8 + recLen;
    }
}

await parseRecords(0, fileSize, 0);

// ──────────────────────────────────────────────
// Log summary
// ──────────────────────────────────────────────
hf.log("PowerPoint Document Stream (MS-PPT)");
hf.log("  Stream size: " + fmtSize(fileSize));
hf.log("  Total records: " + totalRecords);
hf.log("  Slide containers: " + slideCount);
hf.log("  Master containers: " + masterCount);
hf.log("  Notes containers: " + noteCount);

if (fontNames.length > 0) {
    hf.log("\n  Fonts (" + fontNames.length + "):");
    for (var fi = 0; fi < fontNames.length; fi++)
        hf.log('    [' + fi + '] "' + fontNames[fi] + '"');
}

if (textFragments.length > 0) {
    hf.log("\n  Text content (" + textFragments.length + " fragments):");
    for (var ti = 0; ti < Math.min(textFragments.length, 30); ti++) {
        var t = textFragments[ti];
        if (t.length > 60) t = t.substring(0, 60) + "...";
        hf.log('    [' + ti + '] "' + t + '"');
    }
    if (textFragments.length > 30) hf.log("    ... and " + (textFragments.length - 30) + " more");
}

if (userEdits.length > 0) {
    hf.log("\n  User Edits (" + userEdits.length + "):");
    for (var ui = 0; ui < userEdits.length; ui++)
        hf.log("    [" + ui + "] lastEdit=" + fmtHex(userEdits[ui].lastEdit, 8) +
            " persist=" + fmtHex(userEdits[ui].persistDir, 8));
}

// Record type statistics
var typeKeys = Object.keys(typeCounts).sort(function(a, b) { return Number(a) - Number(b); });
hf.log("\n  Record types (" + typeKeys.length + " unique):");
for (var ki = 0; ki < typeKeys.length; ki++) {
    var rt = Number(typeKeys[ki]);
    var cnt = typeCounts[rt];
    var name = REC[rt] || ("Unknown_" + fmtHex(rt, 4));
    hf.log("    " + fmtHex(rt, 4) + " " + name + ": " + cnt);
}

await hf.template.end();