// HexForge JS Template - ole2 (ppt).js
// OLE2 Compound Binary Format — Microsoft PowerPoint .ppt parser
// Author: Kei Choi (hanul93@gmail.com)
// Based on [MS-CFB] and [MS-PPT] specifications
// Reference: ppt-structure-viz.html
// ID Bytes: D0 CF 11 E0 A1 B1 1A E1

var fileSize = await hf.fileSize;

await hf.template.begin("OLE2 (PPT)");
hf.template.setFormat("ole2-ppt", "OLE2 Compound Binary (PPT)", [".ppt", ".pps", ".pot"]);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function i32(buf, off) { return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); }
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n || 8, "0"); }
function fmtSz(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
    return n + " B";
}

var ENDOFCHAIN = 0xFFFFFFFE;
var FREESECT   = 0xFFFFFFFF;
var FATSECT    = 0xFFFFFFFD;
var DIFSECT    = 0xFFFFFFFC;

// PPT record type names
var PPT_NAMES = {
    0x03E8: "RT_Document", 0x03E9: "RT_DocumentAtom",
    0x03EE: "RT_Slide", 0x03EF: "RT_SlideAtom",
    0x03F3: "RT_SlidePersistAtom", 0x03FA: "RT_Notes",
    0x03FB: "RT_NotesAtom",
    0x040B: "RT_ExternalObjectList", 0x040C: "RT_ExObjListAtom",
    0x040E: "RT_Drawing",
    0x07D0: "RT_Environment", 0x07D5: "RT_FontCollection",
    0x07D6: "RT_FontEntityAtom",
    0x0FA0: "RT_TextHeaderAtom", 0x0FA1: "RT_TextCharsAtom",
    0x0FA8: "RT_TextBytesAtom",
    0x0FA6: "RT_StyleTextPropAtom", 0x0FAF: "RT_TxInteractiveInfoAtom",
    0x0FC1: "RT_SlideListWithText", 0x0FC3: "RT_InteractiveInfo",
    0x0FC4: "RT_InteractiveInfoAtom",
    0x0FD9: "RT_HeadersFooters", 0x0FDA: "RT_HeadersFootersAtom",
    0x0FF5: "RT_UserEditAtom", 0x0FF6: "RT_CurrentUserAtom",
    0x0FF7: "RT_DateTimeMCAtom",
    0x1388: "RT_ProgTags", 0x138A: "RT_ProgBinaryTag",
    0x138B: "RT_BinaryTagDataBlob",
    0x2AFB: "RT_CString",
    0xF000: "OfficeArtDggContainer", 0xF001: "OfficeArtBStoreContainer",
    0xF002: "OfficeArtDgContainer", 0xF003: "OfficeArtGroupShape",
    0xF004: "OfficeArtSpContainer", 0xF006: "OfficeArtFDGGBlock",
    0xF007: "OfficeArtFBSE", 0xF008: "OfficeArtFDG",
    0xF009: "OfficeArtFSPGR", 0xF00A: "OfficeArtFSP",
    0xF00B: "OfficeArtFOPT", 0xF00D: "OfficeArtClientTextbox",
    0xF010: "OfficeArtClientAnchor", 0xF011: "OfficeArtClientData",
    0xF01E: "OfficeArtBlipEMF", 0xF01F: "OfficeArtBlipWMF",
    0xF020: "OfficeArtBlipPICT",
    0xF01A: "OfficeArtBlipJPEG", 0xF01B: "OfficeArtBlipJPEG2",
    0xF01C: "OfficeArtBlipPNG", 0xF01D: "OfficeArtBlipDIB",
    0xF11E: "OfficeArtSplitMenuColors", 0xF122: "OfficeArtTertiaryFOPT"
};

// SlideAtom layout types
var LAYOUT_NAMES = {
    0x00: "Title", 0x01: "Body", 0x02: "TitleOnly", 0x07: "Blank",
    0x08: "TwoContent", 0x09: "TwoContentText", 0x0A: "TwoContentImage",
    0x0B: "TitleContent", 0x0C: "ContentTitle", 0x0D: "BigObject",
    0x0E: "ObjectText", 0x0F: "ObjectOnly"
};

// TextHeaderAtom type values
var TEXT_TYPES = { 0: "Title", 1: "Body", 2: "Notes", 3: "Unused", 4: "Other", 5: "CenterBody", 6: "CenterTitle", 7: "HalfBody", 8: "QuarterBody" };

// ──────────────────────────────────────────────
// Validate OLE2 Signature
// ──────────────────────────────────────────────
var sig = await hf.read(0, 8);
if (sig[0] !== 0xD0 || sig[1] !== 0xCF || sig[2] !== 0x11 || sig[3] !== 0xE0 ||
    sig[4] !== 0xA1 || sig[5] !== 0xB1 || sig[6] !== 0x1A || sig[7] !== 0xE1) {
    hf.error("Invalid OLE2 signature. Expected: D0 CF 11 E0 A1 B1 1A E1");
    await hf.template.end();
    throw new Error("Not an OLE2 file");
}

// ══════════════════════════════════════════════
// Layer 1: OLE2 Compound File Container
// ══════════════════════════════════════════════

hf.template.beginStruct("OLE2_Header");
await hf.template.addField("Signature", "bytes:8", { color: "#d97706" });
await hf.template.addField("CLSID", "bytes:16", { color: "#64748b" });
var minorVer = await hf.template.addField("MinorVersion", "u16", { color: "#d97706" });
var majorVer = await hf.template.addField("MajorVersion", "u16", { color: "#d97706" });
await hf.template.addField("ByteOrder", "u16", { color: "#d97706" });
var sectorShift = await hf.template.addField("SectorShift", "u16", { color: "#d97706" });
var miniSectorShift = await hf.template.addField("MiniSectorShift", "u16", { color: "#d97706" });
await hf.template.addField("Reserved", "bytes:6", { color: "#64748b" });
var numDirSectors = await hf.template.addField("NumberOfDirectorySectors", "u32", { color: "#fbbf24" });
var numFATSectors = await hf.template.addField("NumberOfFATSectors", "u32", { color: "#f97316" });
var firstDirSector = await hf.template.addField("FirstDirectorySectorLocation", "u32", { color: "#fbbf24" });
await hf.template.addField("TransactionSignatureNumber", "u32", { color: "#64748b" });
var miniStreamCutoff = await hf.template.addField("MiniStreamCutoffSize", "u32", { color: "#22d3ee" });
var firstMiniFATSector = await hf.template.addField("FirstMiniFATSectorLocation", "u32", { color: "#22d3ee" });
var numMiniFATSectors = await hf.template.addField("NumberOfMiniFATSectors", "u32", { color: "#22d3ee" });
var firstDIFATSector = await hf.template.addField("FirstDIFATSectorLocation", "u32", { color: "#a855f7" });
var numDIFATSectors = await hf.template.addField("NumberOfDIFATSectors", "u32", { color: "#a855f7" });
await hf.template.addArray("DIFAT", 109, async function(i) {
    await hf.template.addField("DIFAT_" + i, "u32", { color: "#a855f7" });
});
hf.template.endStruct();

var sectorSize = 1 << sectorShift;
var miniSectorSize = 1 << miniSectorShift;

hf.log("OLE2 v" + majorVer + " -- Sector: " + sectorSize + "B, MiniSector: " + miniSectorSize + "B");

function sectorOffset(secId) { return (secId + 1) * sectorSize; }

// ── Build DIFAT ──────────────────────────────
var headerBuf = await hf.read(0, 512);
var difat = [];
for (var i = 0; i < 109; i++) {
    var val = u32(headerBuf, 76 + i * 4);
    if (val < FREESECT - 3) difat.push(val);
}
var difatSec = firstDIFATSector;
while (difatSec !== ENDOFCHAIN && difatSec !== FREESECT) {
    var buf = await hf.read(sectorOffset(difatSec), sectorSize);
    for (var i = 0; i < (sectorSize / 4) - 1; i++) {
        var val = u32(buf, i * 4);
        if (val < FREESECT - 3) difat.push(val);
    }
    difatSec = u32(buf, sectorSize - 4);
}

// ── Build FAT ────────────────────────────────
var fat = [];
for (var fi = 0; fi < difat.length; fi++) {
    var buf = await hf.read(sectorOffset(difat[fi]), sectorSize);
    for (var i = 0; i < sectorSize / 4; i++) fat.push(u32(buf, i * 4));
}

function readChain(startSec) {
    var chain = [], sec = startSec, max = fat.length;
    while (sec !== ENDOFCHAIN && sec !== FREESECT && sec < max && chain.length < max) {
        chain.push(sec); sec = fat[sec];
    }
    return chain;
}
async function readStreamData(startSec, size) {
    var chain = readChain(startSec);
    var result = new Uint8Array(size);
    var written = 0;
    for (var ci = 0; ci < chain.length; ci++) {
        var toRead = Math.min(sectorSize, size - written);
        if (toRead <= 0) break;
        var buf = await hf.read(sectorOffset(chain[ci]), toRead);
        result.set(buf, written); written += toRead;
    }
    return result;
}

// ── Parse Directory Entries ──────────────────
var dirChain = readChain(firstDirSector);
var dirEntries = [];

for (var dci = 0; dci < dirChain.length; dci++) {
    var buf = await hf.read(sectorOffset(dirChain[dci]), sectorSize);
    var entriesPerSector = sectorSize / 128;
    for (var ei = 0; ei < entriesPerSector; ei++) {
        var off = ei * 128;
        var nameSize = u16(buf, off + 64);
        if (nameSize === 0) continue;
        var name = "";
        var nameBytes = Math.min(nameSize, 64) - 2;
        for (var j = 0; j < nameBytes; j += 2) {
            var ch = u16(buf, off + j);
            if (ch === 0) break;
            name += String.fromCharCode(ch);
        }
        var objType = buf[off + 66];
        var startSec = u32(buf, off + 116);
        var streamSize = u32(buf, off + 120);
        dirEntries.push({ name: name, objType: objType, startSec: startSec, streamSize: streamSize });
    }
}

if (dirChain.length > 0) {
    hf.template.seek(sectorOffset(dirChain[0]));
    hf.template.beginStruct("Directory_Entries");
    var dirShowCount = Math.min(dirEntries.length, 20);
    for (var di = 0; di < dirShowCount; di++) {
        var entry = dirEntries[di];
        hf.template.beginStruct("Entry_" + di + "_" + entry.name);
        await hf.template.addField("Name", "bytes:64", {
            color: entry.objType === 5 ? "#fbbf24" : entry.objType === 1 ? "#f97316" : "#d97706"
        });
        await hf.template.addField("NameSize", "u16");
        await hf.template.addField("ObjectType", "u8");
        await hf.template.addField("ColorFlag", "u8");
        await hf.template.addField("LeftSiblingID", "u32");
        await hf.template.addField("RightSiblingID", "u32");
        await hf.template.addField("ChildID", "u32");
        await hf.template.addField("CLSID", "bytes:16");
        await hf.template.addField("StateBits", "u32");
        await hf.template.addField("CreationTime", "bytes:8");
        await hf.template.addField("ModifiedTime", "bytes:8");
        await hf.template.addField("StartingSectorLocation", "u32", { color: "#3b82f6" });
        await hf.template.addField("StreamSize", "u32", { color: "#f97316" });
        await hf.template.addField("StreamSizeHigh", "u32");
        hf.template.endStruct();
    }
    hf.template.endStruct();
}

// ── Find important streams ───────────────────
var rootEntry = null, pptDocEntry = null, currentUserEntry = null, picturesEntry = null;
var macrosEntry = null, vbaStorageEntry = null, objectPoolEntry = null;
var streamEntries = [], storageEntries = [];

for (var di = 0; di < dirEntries.length; di++) {
    var e = dirEntries[di]; var n = e.name;
    if (e.objType === 5) rootEntry = e;
    else if (e.objType === 1) storageEntries.push(e);
    if (e.objType === 2) streamEntries.push(e);
    if (n === "PowerPoint Document") pptDocEntry = e;
    else if (n === "Current User") currentUserEntry = e;
    else if (n === "Pictures") picturesEntry = e;
    else if (n === "Macros" || n === "_VBA_PROJECT_CUR") macrosEntry = e;
    else if (n === "VBA") vbaStorageEntry = e;
    else if (n === "ObjectPool") objectPoolEntry = e;
}

hf.log("-- Directory Tree --");
for (var di = 0; di < dirEntries.length; di++) {
    var e = dirEntries[di];
    var types = { 5: "Root", 1: "Storage", 2: "Stream" };
    hf.log("  " + (types[e.objType] || "?") + " \"" + e.name + "\" (" + e.streamSize + " B)");
}

// ══════════════════════════════════════════════
// Layer 2: PowerPoint Document — Record Tree
// ══════════════════════════════════════════════
var hasPPT = false;
var slideCount = 0;
var slideLayouts = [];  // { layout, masterIdRef }
var textRuns = [];      // { type, text }
var containerCount = 0;
var atomCount = 0;
var drawingShapeCount = 0;
var exObjListFound = false;
var topRecords = [];    // top-level records: { type, name, ver, inst, len, offset }
var slidePersists = []; // { psrRef, slideId }
var documentAtom = null;  // { slideSizeX, slideSizeY, notesSizeX, notesSizeY }
var fontEntities = [];
var interactiveInfos = []; // ppaction:// etc.

if (pptDocEntry && pptDocEntry.streamSize > 0) {
    hasPPT = true;
    var pptData = await readStreamData(pptDocEntry.startSec, pptDocEntry.streamSize);

    // Template fields for PPT Document stream
    var pptOffset = sectorOffset(pptDocEntry.startSec);
    hf.template.seek(pptOffset);
    hf.template.beginStruct("PowerPoint_Document");

    // Parse PPT record tree (non-recursive, flat scan)
    var pos = 0;
    var maxRecs = 10000;
    var recCount = 0;

    while (pos + 8 <= pptData.length && recCount < maxRecs) {
        var recVerInst = u16(pptData, pos);
        var recVer = recVerInst & 0x0F;
        var recInst = (recVerInst >> 4) & 0x0FFF;
        var recType = u16(pptData, pos + 2);
        var recLen = u32(pptData, pos + 4);

        if (recLen > pptData.length - pos - 8) break;

        var recName = PPT_NAMES[recType] || fmtHex(recType, 4);
        var isContainer = (recVer === 0x0F);

        if (isContainer) containerCount++;
        else atomCount++;

        // Template field for first N records
        if (recCount < 30) {
            hf.template.beginStruct((isContainer ? "C_" : "A_") + recName);
            await hf.template.addField("VerInst", "u16", { color: isContainer ? "#d97706" : "#22d3ee" });
            await hf.template.addField("RecType", "u16", { color: isContainer ? "#d97706" : "#22d3ee" });
            await hf.template.addField("RecLen", "u32", { color: "#64748b" });
            hf.template.endStruct();
            if (recCount < 30 && !isContainer && recLen > 0) {
                hf.template.skip(recLen);
            }
        }

        // Collect top-level info
        if (recCount < 200) {
            topRecords.push({ type: recType, name: recName, ver: recVer, inst: recInst, len: recLen, offset: pos });
        }

        // Parse specific atoms
        if (recType === 0x03E9 && recLen >= 20) {
            // DocumentAtom
            documentAtom = {
                slideSizeX: i32(pptData, pos + 8),
                slideSizeY: i32(pptData, pos + 12),
                notesSizeX: i32(pptData, pos + 16),
                notesSizeY: i32(pptData, pos + 20)
            };
        }
        else if (recType === 0x03F3 && recLen >= 20) {
            // SlidePersistAtom
            var psrRef = u32(pptData, pos + 8);
            var slideFlags = u32(pptData, pos + 12);
            var numTexts = i32(pptData, pos + 16);
            var slideId = u32(pptData, pos + 20);
            slidePersists.push({ psrRef: psrRef, slideId: slideId, numTexts: numTexts });
            slideCount++;
        }
        else if (recType === 0x03EF && recLen >= 12) {
            // SlideAtom
            var layoutType = i32(pptData, pos + 8);
            var masterIdRef = i32(pptData, pos + 20);
            slideLayouts.push({ layout: layoutType, masterIdRef: masterIdRef });
        }
        else if (recType === 0x07D6 && recLen >= 4) {
            // FontEntityAtom — font name in Unicode
            var fontName = "";
            var fnMax = Math.min(recLen, 128);
            for (var fi = 0; fi < fnMax; fi += 2) {
                var ch = u16(pptData, pos + 8 + fi);
                if (ch === 0) break;
                fontName += String.fromCharCode(ch);
            }
            if (fontName.length > 0) fontEntities.push(fontName);
        }
        else if (recType === 0x0FA0 && recLen >= 4) {
            // TextHeaderAtom
            var txtType = u32(pptData, pos + 8);
            // Look ahead for TextCharsAtom or TextBytesAtom
            var nextPos = pos + 8 + recLen;
            if (nextPos + 8 <= pptData.length) {
                var nextType = u16(pptData, nextPos + 2);
                var nextLen = u32(pptData, nextPos + 4);
                var txt = "";
                if (nextType === 0x0FA1 && nextLen > 0) {
                    // TextCharsAtom (Unicode)
                    var maxChars = Math.min(nextLen / 2, 80);
                    for (var ci = 0; ci < maxChars; ci++) {
                        var ch = u16(pptData, nextPos + 8 + ci * 2);
                        if (ch === 0) break;
                        if (ch === 0x0D) txt += " ";
                        else if (ch >= 0x20) txt += String.fromCharCode(ch);
                    }
                } else if (nextType === 0x0FA8 && nextLen > 0) {
                    // TextBytesAtom (ASCII)
                    var maxChars = Math.min(nextLen, 80);
                    for (var ci = 0; ci < maxChars; ci++) {
                        var ch = pptData[nextPos + 8 + ci];
                        if (ch === 0) break;
                        if (ch === 0x0D) txt += " ";
                        else if (ch >= 0x20) txt += String.fromCharCode(ch);
                    }
                }
                if (txt.length > 0) {
                    textRuns.push({ type: TEXT_TYPES[txtType] || "?", text: txt });
                }
            }
        }
        else if (recType === 0xF00A) {
            // OfficeArtFSP — a shape
            drawingShapeCount++;
        }
        else if (recType === 0x040B) {
            exObjListFound = true;
        }
        else if (recType === 0x0FC4 && recLen >= 16) {
            // InteractiveInfoAtom
            // Fields: soundIdRef(4), exHyperlinkIdRef(4), action(1), oleVerb(1), jump(1), flags(1), hyperlinkType(1)
            var action = pptData[pos + 16];
            var actionNames = { 0: "none", 1: "MacroAction", 2: "RunProgram", 3: "Jump", 4: "Hyperlink", 5: "OLEAction", 6: "Media", 7: "Custom" };
            interactiveInfos.push({ action: action, actionName: actionNames[action] || "?" });
        }
        else if (recType === 0x2AFB && recLen > 0) {
            // RT_CString — potential ppaction:// URL
            var cstr = "";
            var maxC = Math.min(recLen / 2, 200);
            for (var ci = 0; ci < maxC; ci++) {
                var ch = u16(pptData, pos + 8 + ci * 2);
                if (ch === 0) break;
                cstr += String.fromCharCode(ch);
            }
            if (cstr.indexOf("ppaction://") >= 0 || cstr.indexOf("cmd") >= 0 || cstr.indexOf("powershell") >= 0 || cstr.indexOf("mshta") >= 0) {
                interactiveInfos.push({ action: 99, actionName: "ppaction", url: cstr });
            }
        }

        // Container: recurse into children, Atom: skip data
        if (isContainer) {
            pos += 8; // enter container
        } else {
            pos += 8 + recLen; // skip atom data
        }
        recCount++;
    }

    hf.template.endStruct();

    hf.log("PPT Document: " + containerCount + " containers, " + atomCount + " atoms");
    hf.log("Slides: " + slideCount + ", Shapes: " + drawingShapeCount + ", Text runs: " + textRuns.length);
    if (documentAtom) hf.log("Slide size: " + documentAtom.slideSizeX + " x " + documentAtom.slideSizeY + " EMU");
}

// ══════════════════════════════════════════════
// Layer 3: VBA Macro & Attack Vector Detection
// ══════════════════════════════════════════════
var vbaIndicators = [];
var vbaModules = [];
var suspiciousFound = [];
var hasPPAction = false;
var hasOLEObjects = false;
var ppactionURLs = [];

// VBA detection
for (var di = 0; di < dirEntries.length; di++) {
    var n = dirEntries[di].name;
    if (n === "Macros" || n === "_VBA_PROJECT_CUR") vbaIndicators.push(n);
    if (n === "VBA") vbaIndicators.push("VBA storage");
    if (n === "_VBA_PROJECT") vbaIndicators.push("_VBA_PROJECT stream");
    if (n === "dir" && dirEntries[di].objType === 2) vbaIndicators.push("VBA dir stream");
    if (n === "ThisDocument" || n === "Module1" || n === "Module2" || n === "Module3") vbaModules.push(n);
    if (n === "ObjectPool") { hasOLEObjects = true; }
}

// ppaction:// and interactive info detection
for (var ii = 0; ii < interactiveInfos.length; ii++) {
    var info = interactiveInfos[ii];
    if (info.action === 2) suspiciousFound.push("RunProgram action");
    if (info.action === 99 && info.url) {
        hasPPAction = true;
        ppactionURLs.push(info.url);
    }
}

// VBA module scanning
if (vbaIndicators.length > 0) {
    hf.warn("-- VBA Macros Detected --");
    for (var vi = 0; vi < vbaIndicators.length; vi++) hf.warn("  " + vbaIndicators[vi]);

    for (var mi = 0; mi < vbaModules.length; mi++) {
        var modEntry = null;
        for (var di = 0; di < dirEntries.length; di++) {
            if (dirEntries[di].name === vbaModules[mi] && dirEntries[di].objType === 2) { modEntry = dirEntries[di]; break; }
        }
        if (modEntry && modEntry.streamSize > 0) {
            var scanSize = Math.min(modEntry.streamSize, 512);
            var modData = await readStreamData(modEntry.startSec, scanSize);
            var rawStr = "";
            for (var bi = 0; bi < modData.length; bi++) rawStr += (modData[bi] >= 0x20 && modData[bi] < 0x7F) ? String.fromCharCode(modData[bi]) : "";
            var keywords = ["AutoOpen", "Auto_Open", "AutoExec", "AutoClose",
                "Document_Open", "Document_Close", "Shell", "WScript",
                "powershell", "cmd.exe", "CreateObject", "XMLHTTP", "mshta"];
            var rl = rawStr.toLowerCase();
            for (var ki = 0; ki < keywords.length; ki++) {
                if (rl.indexOf(keywords[ki].toLowerCase()) >= 0) suspiciousFound.push(keywords[ki]);
            }
        }
    }
    if (suspiciousFound.length > 0) hf.warn("  Suspicious: " + suspiciousFound.join(", "));
}
if (hasPPAction) hf.warn("ppaction:// URLs detected: " + ppactionURLs.length);
if (hasOLEObjects) hf.warn("ObjectPool storage found — embedded OLE objects");

// ══════════════════════════════════════════════
// Structure View Visualization
// ══════════════════════════════════════════════
function _hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function _renderFields(fields, cols) {
    var style = cols ? "display:grid;grid-template-columns:repeat(" + cols + ",1fr);gap:2px 12px" : "display:flex;flex-direction:column;gap:1px";
    var html = '<div style="' + style + '">';
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        html += '<div class="hf-field" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:2px 4px;border-radius:3px;cursor:pointer"' +
            (f.offset !== undefined ? ' data-hf-offset="' + f.offset + '"' : '') + '>' +
            '<span style="color:var(--color-text-muted);font-family:var(--font-mono)">' + f.name + '</span>' +
            '<span style="color:' + (f.color || 'var(--color-text)') + ';font-family:var(--font-mono)">' + f.value + '</span></div>';
    }
    return html + "</div>";
}
function _arrow(label, fromColor, toColor) {
    var fc = _hexRgb(fromColor), tc = _hexRgb(toColor);
    var html = '<div style="display:flex;flex-direction:column;align-items:center;margin:2px 0">' +
        '<div style="width:1px;height:14px;background:linear-gradient(180deg,rgba(' + fc[0] + ',' + fc[1] + ',' + fc[2] + ',0.4),rgba(' + tc[0] + ',' + tc[1] + ',' + tc[2] + ',0.4))"></div>';
    if (label) {
        html += '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);padding:1px 6px;border-radius:3px;background:var(--color-bg-panel);border:1px solid var(--color-border)">' + label + '</div>' +
            '<div style="width:1px;height:8px;background:rgba(' + tc[0] + ',' + tc[1] + ',' + tc[2] + ',0.4)"></div>';
    }
    return html + '<div style="font-size:9px;color:var(--color-text-muted);line-height:1">\u25BC</div></div>';
}
function _card(color, content) {
    var rgb = _hexRgb(color);
    return '<div class="hf-node" style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:10px;padding:12px;margin-bottom:0;' +
        'box-shadow:0 0 0 1px rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.1),0 0 12px rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.03)">' +
        content + '</div>';
}
function _cardHdr(icon, color, title, subtitle, badge, selectRange) {
    var rgb = _hexRgb(color);
    var html = '<div style="display:flex;align-items:center;gap:10px"' +
        (selectRange ? ' data-hf-select="' + selectRange + '"' : '') + '>';
    html += '<div style="width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.12);flex-shrink:0;font-size:14px;color:' + color + '">' + icon + '</div>';
    html += '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:var(--color-text)">' + title + '</div>' +
        '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted)">' + subtitle + '</div></div>';
    if (badge) {
        html += '<div style="padding:2px 8px;border-radius:4px;background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.15);' +
            'color:' + color + ';font-size:10px;font-weight:700;font-family:var(--font-mono);letter-spacing:0.05em;flex-shrink:0">' + badge + '</div>';
    }
    return html + '</div>';
}
function _recRow(typeHex, color, name, detail) {
    var rgb = _hexRgb(color);
    return '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;font-size:11px;font-family:var(--font-mono);' +
        'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.04);border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.1)">' +
        '<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.15);color:' + color + ';font-weight:600">' + typeHex + '</span>' +
        '<span style="color:' + color + ';font-weight:600;flex:1">' + name + '</span>' +
        '<span style="color:var(--color-text-muted);font-size:10px">' + detail + '</span></div>';
}

function _renderView() {
    // ═══ LEFT: Stream Map ═══
    var mapHtml = '<div style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;text-align:center;flex-shrink:0;margin-bottom:2px">Streams</div>';
    var sectors = [
        { name: "OLE2", color: "#d97706", grow: 14 }
    ];
    if (pptDocEntry) sectors.push({ name: "PPT", color: "#d97706", grow: Math.max(20, Math.min(50, pptDocEntry.streamSize / 2048)) });
    if (currentUserEntry) sectors.push({ name: "Cur", color: "#3b82f6", grow: 5 });
    if (picturesEntry && picturesEntry.streamSize > 0) sectors.push({ name: "Pics", color: "#a855f7", grow: Math.max(6, Math.min(20, picturesEntry.streamSize / 4096)) });
    if (vbaIndicators.length > 0) sectors.push({ name: "VBA", color: "#ef4444", grow: 12 });
    if (hasOLEObjects) sectors.push({ name: "OLE", color: "#f97316", grow: 8 });

    for (var si = 0; si < sectors.length; si++) {
        var s = sectors[si];
        var rgb = _hexRgb(s.color);
        mapHtml += '<div style="flex:' + s.grow + ' 0 0px;min-height:14px;border-radius:2px;' +
            'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.18);' +
            'border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.35);' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:7px;font-family:var(--font-mono);color:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.8);line-height:1" ' +
            'title="' + s.name + '">' + (s.grow >= 5 ? s.name : "") + '</div>';
    }

    // ═══ CENTER: Node Cards ═══
    var cards = "";

    // ── Card 1: OLE2 Container + Directory ──
    var hC = _cardHdr("\u25A3", "#d97706", "OLE2 Container + Directory",
        "Compound Binary File \xB7 D0 CF 11 E0", "D0 CF 11 E0", "0:512");

    hC += '<div style="margin-top:10px;font-size:11px;font-family:var(--font-mono);display:flex;flex-direction:column;gap:2px">';
    var DIR_ICONS = { 5: "\uD83D\uDCC1", 1: "\uD83D\uDCC1", 2: "\uD83D\uDCC4" };
    var maxDir = Math.min(dirEntries.length, 10);
    for (var di = 0; di < maxDir; di++) {
        var e = dirEntries[di];
        var ec = (e.name === "PowerPoint Document") ? "#d97706" :
                 (e.name === "Current User") ? "#3b82f6" :
                 (e.name === "Pictures") ? "#a855f7" :
                 (e.name === "Macros" || e.name === "VBA" || e.name === "_VBA_PROJECT_CUR") ? "#ef4444" :
                 (e.name === "ObjectPool") ? "#f97316" :
                 e.objType === 5 ? "#d97706" : e.objType === 1 ? "#f97316" : "#94a3b8";
        var er = _hexRgb(ec);
        var isStorage = (e.objType === 1 || e.objType === 5);
        var indent = (e.objType === 5) ? 0 : 16;
        var typeTag = isStorage ? "Storage" : fmtSz(e.streamSize);
        var extra = (e.name === "PowerPoint Document") ? ' \u2190 Record tree' :
                    (e.name === "ObjectPool") ? ' \u26A0 OLE objects' :
                    (e.name === "Macros" || e.name === "VBA") ? ' \u26A0' : '';
        hC += '<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;padding-left:' + (6 + indent) + 'px;border-radius:4px;' +
            'background:rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.04);border:1px solid rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.1)">' +
            '<span style="font-size:11px">' + (DIR_ICONS[e.objType] || "\uD83D\uDCC4") + '</span>' +
            '<span style="color:' + ec + ';font-weight:' + (isStorage ? '700' : '400') + ';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e.name + '</span>' +
            '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.1);color:' + ec + ';flex-shrink:0">' + typeTag + extra + '</span></div>';
    }
    hC += '</div>';
    cards += _card("#d97706", hC);

    cards += _arrow("Root Entry \u2192 PowerPoint Document \u2192 Recursive records", "#d97706", "#d97706");

    // ── Record format explanation ──
    var fmtC = '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);margin-bottom:6px">Every PPT record header (8 bytes):</div>';
    fmtC += '<div style="display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px">';
    fmtC += '<div style="padding:4px 8px;border-radius:4px;background:rgba(217,119,6,0.12);border:1px solid rgba(217,119,6,0.2);color:#d97706">recVer <span style="color:var(--color-text-muted)">4bit</span></div>';
    fmtC += '<div style="padding:4px 8px;border-radius:4px;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.2);color:#f97316">recInst <span style="color:var(--color-text-muted)">12bit</span></div>';
    fmtC += '<div style="padding:4px 8px;border-radius:4px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.2);color:#22d3ee">recType <span style="color:var(--color-text-muted)">2B</span></div>';
    fmtC += '<div style="padding:4px 8px;border-radius:4px;background:rgba(100,116,139,0.08);border:1px solid rgba(100,116,139,0.15);color:var(--color-text-muted);flex:1;text-align:center">recLen <span style="color:var(--color-text-muted)">4B</span></div>';
    fmtC += '</div>';
    fmtC += '<div style="margin-top:6px;font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">recVer=0xF \u2192 Container (holds child records) \xB7 recVer\u22600xF \u2192 Atom (holds data)</div>';
    cards += '<div style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:8px;padding:10px;margin-bottom:6px">' + fmtC + '</div>';

    // ── Card 2: Document Container (RT_Document) ──
    var dC = _cardHdr("\u25B6", "#d97706", "Document Container (RT_Document)",
        "recType: 0x03E8 \xB7 Top-level container", "Container 0xF", null);

    dC += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">';
    dC += _recRow("0x03E9", "#d97706", "DocumentAtom",
        documentAtom ? "slideSize: " + documentAtom.slideSizeX + "\xD7" + documentAtom.slideSizeY + " (EMU)" : "");
    dC += _recRow("0x0FC1", "#94a3b8", "SlideListWithText", "Container \xB7 text persist refs");
    if (slideCount > 0) dC += _recRow("0x03F3", "#3b82f6", "SlidePersistAtom", "\xD7" + slideCount + " (one per slide)");
    if (textRuns.length > 0) dC += _recRow("0x0FA0", "#14b8a6", "TextHeaderAtom + Text*Atom", slideCount + " slides, " + textRuns.length + " text runs");
    if (fontEntities.length > 0) dC += _recRow("0x07D0", "#a855f7", "Environment", "Fonts: " + fontEntities.slice(0, 3).join(", ") + (fontEntities.length > 3 ? " ..." : ""));
    if (exObjListFound) dC += _recRow("0x040B", "#f97316", "ExObjList", "\u26A0 External objects (OLE, media, hyperlinks)");
    dC += '</div>';
    cards += _card("#d97706", dC);

    cards += _arrow("SlidePersistAtom.psrRef \u2192 Slide Container", "#d97706", "#3b82f6");

    // ── Card 3+4: Slide Container + Slide Thumbnails (side by side) ──
    cards += '<div style="display:flex;flex-wrap:wrap;gap:8px">';

    // Slide Container detail
    var sC = _cardHdr("\u25A6", "#3b82f6", "Slide Container (RT_Slide)",
        "recType: 0x03EE \xB7 One per slide", null, null);
    sC += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:2px">';
    sC += _recRow("0x03EF", "#3b82f6", "SlideAtom", "layoutType, masterIdRef");
    sC += _recRow("0x040E", "#22d3ee", "PPDrawing", "Container \xB7 OfficeArt shapes");

    // Nested shape tree
    if (drawingShapeCount > 0) {
        sC += '<div style="border-left:1px dashed rgba(71,85,105,0.4);margin-left:10px;padding-left:12px;display:flex;flex-direction:column;gap:2px">';
        sC += _recRow("0xF004", "#22d3ee", "OfficeArtSpContainer", "\xD7" + drawingShapeCount + " shapes");
        sC += '<div style="border-left:1px dashed rgba(71,85,105,0.3);margin-left:10px;padding-left:12px;display:flex;flex-direction:column;gap:2px">';
        sC += '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);padding:2px 6px">OfficeArtSpAtom \u2014 shapeType, position</div>';
        sC += '<div style="font-size:10px;font-family:var(--font-mono);color:#14b8a6;padding:2px 6px">ClientTextBox \u2192 TextHeaderAtom + Text*Atom</div>';
        if (interactiveInfos.length > 0) sC += '<div style="font-size:10px;font-family:var(--font-mono);color:#f97316;padding:2px 6px">\u26A0 ClientData \u2192 InteractiveInfo</div>';
        sC += '</div></div>';
    }

    sC += _recRow("0x1388", "#a855f7", "ProgTags", "animation, build info");
    sC += '</div>';

    // SlideAtom layoutType mapping
    if (slideLayouts.length > 0) {
        sC += '<div style="margin-top:8px;padding:6px;border-radius:6px;background:rgba(59,130,246,0.03);border:1px solid rgba(59,130,246,0.1)">';
        sC += '<div style="font-size:9px;font-family:var(--font-mono);color:rgba(59,130,246,0.6);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">SlideAtom.layoutType Values</div>';
        sC += '<div style="display:flex;flex-wrap:wrap;gap:3px">';
        var layoutSet = {};
        for (var li = 0; li < slideLayouts.length; li++) {
            var lt = slideLayouts[li].layout;
            var ln = LAYOUT_NAMES[lt] || fmtHex(lt, 2);
            if (!layoutSet[ln]) {
                layoutSet[ln] = true;
                sC += '<span style="padding:1px 6px;border-radius:3px;background:rgba(59,130,246,0.08);font-size:8px;font-family:var(--font-mono);color:#93c5fd">' + fmtHex(lt, 2) + ' ' + ln + '</span>';
            }
        }
        sC += '</div></div>';
    }
    cards += '<div style="flex:1 1 200px;min-width:200px">' + _card("#3b82f6", sC) + '</div>';

    // Slide thumbnails + text content
    var tC = _cardHdr("\u25C8", "#a855f7", "Slide Content",
        slideCount + " slides \xB7 " + textRuns.length + " text runs", null, null);

    // Mini slide thumbnails
    if (slideCount > 0) {
        tC += '<div style="margin-top:8px;display:grid;grid-template-columns:repeat(' + Math.min(slideCount, 3) + ',1fr);gap:6px">';
        for (var si = 0; si < Math.min(slideCount, 6); si++) {
            var layout = si < slideLayouts.length ? slideLayouts[si].layout : -1;
            var lName = LAYOUT_NAMES[layout] || "Slide";
            tC += '<div><div style="aspect-ratio:16/10;border-radius:6px;background:var(--color-bg-secondary);border:1px solid var(--color-border);position:relative;overflow:hidden">';
            // Title bar
            if (layout === 0x00 || layout === 0x01 || layout === 0x02 || layout === 0x08 || layout === 0x0B) {
                tC += '<div style="position:absolute;top:' + (layout === 0x00 ? '30%' : '8%') + ';left:10%;right:10%;height:' + (layout === 0x00 ? '20%' : '12%') + ';border-radius:2px;background:rgba(217,119,6,0.15);border:1px dashed rgba(217,119,6,0.25)"></div>';
            }
            // Body bar
            if (layout === 0x01 || layout === 0x08 || layout === 0x0B) {
                tC += '<div style="position:absolute;top:26%;left:10%;' + (layout === 0x08 ? 'right:52%' : 'right:10%') + ';height:62%;border-radius:2px;background:rgba(100,116,139,0.1);border:1px dashed rgba(100,116,139,0.15)"></div>';
                if (layout === 0x08) {
                    tC += '<div style="position:absolute;top:26%;left:52%;right:10%;height:62%;border-radius:2px;background:rgba(59,130,246,0.08);border:1px dashed rgba(59,130,246,0.15)"></div>';
                }
            }
            tC += '<div style="position:absolute;bottom:2px;left:4px;font-size:7px;font-family:var(--font-mono);color:rgba(217,119,6,0.5)">' + (si + 1) + '</div>';
            tC += '</div><div style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted);text-align:center;margin-top:2px">' + lName + '</div></div>';
        }
        tC += '</div>';
    }

    // Text content preview
    if (textRuns.length > 0) {
        tC += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:2px">';
        for (var ti = 0; ti < Math.min(textRuns.length, 6); ti++) {
            var tr = textRuns[ti];
            var trColor = tr.type === "Title" ? "#fbbf24" : (tr.type === "Body" ? "#94a3b8" : "#14b8a6");
            var trRgb = _hexRgb(trColor);
            tC += '<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;background:rgba(' + trRgb[0] + ',' + trRgb[1] + ',' + trRgb[2] + ',0.04);border:1px solid rgba(' + trRgb[0] + ',' + trRgb[1] + ',' + trRgb[2] + ',0.1);font-size:10px;font-family:var(--font-mono)">' +
                '<span style="font-size:8px;padding:0 4px;border-radius:2px;background:rgba(' + trRgb[0] + ',' + trRgb[1] + ',' + trRgb[2] + ',0.12);color:' + trColor + ';flex-shrink:0">' + tr.type + '</span>' +
                '<span style="color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + tr.text.substring(0, 50) + '</span></div>';
        }
        if (textRuns.length > 6) tC += '<div style="font-size:10px;color:var(--color-text-muted);text-align:center;padding:3px">\u2026 ' + (textRuns.length - 6) + ' more text runs</div>';
        tC += '</div>';
    }
    cards += '<div style="flex:1 1 200px;min-width:200px">' + _card("#a855f7", tC) + '</div>';
    cards += '</div>'; // close flex wrapper

    // ── Card 5: Attack Vectors (if any) ──
    var hasThreats = vbaIndicators.length > 0 || hasPPAction || hasOLEObjects;
    if (hasThreats) {
        cards += _arrow("ExObjList + ObjectPool + InteractiveInfo", "#3b82f6", "#ef4444");

        cards += '<div style="display:flex;flex-wrap:wrap;gap:8px">';

        // OLE Objects
        if (hasOLEObjects) {
            var oleC = _cardHdr("\u25A3", "#f97316", "OLE Embedded Objects",
                "ObjectPool storage \xB7 Embedded files", "\u26A0 OLE", null);
            oleC += '<div style="margin-top:8px;padding:6px;border-radius:6px;background:rgba(249,115,22,0.04);border:1px solid rgba(249,115,22,0.1);font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted)">';
            oleC += 'ObjectPool storage contains embedded OLE objects. These can include executables, scripts, or other dangerous payloads disguised as familiar document icons.';
            oleC += '</div>';
            cards += '<div style="flex:1 1 160px;min-width:160px">' + _card("#f97316", oleC) + '</div>';
        }

        // ppaction://
        if (hasPPAction) {
            var ppC = _cardHdr("\u25B7", "#f97316", "ppaction:// Handler",
                "InteractiveInfoAtom \xB7 Click/hover action", "\u26A0", null);
            for (var pi = 0; pi < Math.min(ppactionURLs.length, 3); pi++) {
                ppC += '<div style="margin-top:6px;padding:6px;border-radius:6px;background:rgba(249,115,22,0.04);border:1px solid rgba(249,115,22,0.1);font-size:10px;font-family:var(--font-mono);color:#fdba74;word-break:break-all">' + ppactionURLs[pi].substring(0, 100) + '</div>';
            }
            ppC += '<div style="margin-top:6px;font-size:9px;color:#f97316">Triggers on click/hover. Can execute programs via protocol handler.</div>';
            cards += '<div style="flex:1 1 160px;min-width:160px">' + _card("#f97316", ppC) + '</div>';
        }

        // VBA Macro
        if (vbaIndicators.length > 0) {
            var vC = _cardHdr("\u2699", "#ef4444", "VBA Macro",
                "Macros/VBA storage", (suspiciousFound.length > 0 ? "\u26A0 SUSPICIOUS" : "\u26A0 MACROS"), null);
            if (vbaModules.length > 0) {
                vC += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">';
                for (var mi = 0; mi < vbaModules.length; mi++) {
                    vC += '<div style="padding:3px 8px;border-radius:4px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.15);font-size:11px;font-family:var(--font-mono);color:#fca5a5">' + vbaModules[mi] + '</div>';
                }
                vC += '</div>';
            }
            if (suspiciousFound.length > 0) {
                vC += '<div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px">';
                for (var si = 0; si < suspiciousFound.length; si++) {
                    var kwColor = (suspiciousFound[si].indexOf("Auto") >= 0 || suspiciousFound[si] === "Shell") ? "#ef4444" : "#f97316";
                    var kwRgb = _hexRgb(kwColor);
                    vC += '<div style="display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:4px;background:rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.05);border:1px solid rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.15)">' +
                        '<span style="font-size:10px;color:' + kwColor + '">\u26A0</span>' +
                        '<span style="font-size:10px;font-family:var(--font-mono);color:' + kwColor + ';font-weight:700">' + suspiciousFound[si] + '</span></div>';
                }
                vC += '</div>';
            }
            cards += '<div style="flex:1 1 160px;min-width:160px">' + _card("#ef4444", vC) + '</div>';
        }

        cards += '</div>'; // close flex wrapper
    }

    // ═══ RIGHT: Insight Panel ═══
    var _st = function(t) { return '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">' + t + '</div>'; };
    var _dv = '<div style="height:1px;background:var(--color-border);margin:12px 0"></div>';
    var ins = "";

    // Presentation Summary
    ins += '<div style="padding:4px 0">' + _st("Presentation Summary") + '<div style="display:flex;flex-direction:column;gap:6px">';
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(217,119,6,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#d97706;flex-shrink:0">\u25CE</div>' +
        '<div><div style="font-size:12px;color:#fbbf24;font-weight:600">PowerPoint 97-2003</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">OLE2 \xB7 PPT Binary Format</div></div></div>';
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#3b82f6;flex-shrink:0">\u25B7</div>' +
        '<div><div style="font-size:12px;color:#93c5fd;font-weight:600">' + slideCount + ' Slide' + (slideCount !== 1 ? 's' : '') + '</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">';
    if (documentAtom) ins += (documentAtom.slideSizeX / 914400).toFixed(1) + '" \xD7 ' + (documentAtom.slideSizeY / 914400).toFixed(1) + '" (EMU)';
    ins += '</div></div></div>';
    if (hasThreats) {
        var threatCount = (vbaIndicators.length > 0 ? 1 : 0) + (hasPPAction ? 1 : 0) + (hasOLEObjects ? 1 : 0);
        var threatNames = [];
        if (hasOLEObjects) threatNames.push("OLE");
        if (hasPPAction) threatNames.push("ppaction");
        if (vbaIndicators.length > 0) threatNames.push("VBA");
        ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#ef4444;flex-shrink:0">\u26A0</div>' +
            '<div><div style="font-size:12px;color:#f87171;font-weight:600">' + threatCount + ' Attack Vector' + (threatCount !== 1 ? 's' : '') + '</div>' +
            '<div style="color:var(--color-text-muted);font-size:10px">' + threatNames.join(" + ") + '</div></div></div>';
    }
    ins += '</div></div>' + _dv;

    // Record Stats
    ins += '<div style="padding:4px 0">' + _st("Record Stats") + '<div style="display:flex;flex-direction:column;gap:5px">';
    var maxStat = Math.max(containerCount, atomCount, drawingShapeCount, textRuns.length, 1);
    var recStats = [
        { name: "Containers", value: containerCount, color: "#d97706", c2: "#b45309" },
        { name: "Atoms", value: atomCount, color: "#06b6d4", c2: "#0891b2" },
        { name: "Shapes", value: drawingShapeCount, color: "#a855f7", c2: "#7c3aed" },
        { name: "Text Runs", value: textRuns.length, color: "#14b8a6", c2: "#0d9488" }
    ];
    for (var ri = 0; ri < recStats.length; ri++) {
        var rs = recStats[ri];
        if (rs.value === 0) continue;
        var pct = Math.max(5, Math.min(100, rs.value / maxStat * 100));
        ins += '<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:' + rs.color + ';font-family:var(--font-mono)">' + rs.name + '</span>' +
            '<span style="color:var(--color-text-muted);font-family:var(--font-mono)">' + rs.value + '</span></div>' +
            '<div style="height:5px;border-radius:3px;background:linear-gradient(90deg,' + rs.color + ',' + rs.c2 + ');width:' + pct.toFixed(0) + '%"></div></div>';
    }
    ins += '</div></div>' + _dv;

    // Threat Assessment (if threats)
    if (hasThreats) {
        ins += '<div style="padding:4px 0">' + _st("Threat Assessment") + '<div style="display:flex;flex-direction:column;gap:3px">';
        var threats = [];
        if (hasOLEObjects) threats.push({ n: "OLE Object", v: "EMBEDDED", color: "#ef4444" });
        if (hasPPAction) threats.push({ n: "ppaction://", v: "DETECTED", color: "#ef4444" });
        if (vbaIndicators.length > 0) threats.push({ n: "VBA Macro", v: suspiciousFound.length > 0 ? "AUTO_OPEN" : "PRESENT", color: "#ef4444" });
        for (var si = 0; si < suspiciousFound.length; si++) {
            var kw = suspiciousFound[si];
            if (kw === "Shell" || kw === "mshta" || kw === "powershell" || kw === "cmd.exe") {
                threats.push({ n: "LOLBin", v: kw, color: "#f97316" });
            }
        }
        for (var ti = 0; ti < threats.length; ti++) {
            var t = threats[ti];
            var tRgb = _hexRgb(t.color);
            ins += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:4px;' +
                'background:rgba(' + tRgb[0] + ',' + tRgb[1] + ',' + tRgb[2] + ',0.06);border:1px solid rgba(' + tRgb[0] + ',' + tRgb[1] + ',' + tRgb[2] + ',0.15)">' +
                '<span style="font-size:10px;color:' + t.color + '">' + t.n + '</span>' +
                '<span style="font-size:9px;font-family:var(--font-mono);color:' + t.color + ';font-weight:700">' + t.v + '</span></div>';
        }
        ins += '</div></div>' + _dv;
    }

    // File Composition
    ins += '<div style="padding:4px 0">' + _st("File Composition");
    var comp = [];
    if (pptDocEntry) comp.push({ l: "PPT Document", s: pptDocEntry.streamSize, c: "#d97706", c2: "#b45309" });
    if (picturesEntry && picturesEntry.streamSize > 0) comp.push({ l: "Pictures", s: picturesEntry.streamSize, c: "#a855f7", c2: "#7c3aed" });
    comp.push({ l: "Header+FAT+Dir", s: 512 + numFATSectors * sectorSize + dirChain.length * sectorSize, c: "#f97316", c2: "#c2410c" });
    for (var di = 0; di < dirEntries.length; di++) {
        var e = dirEntries[di];
        if (e.objType === 2 && e.name !== "PowerPoint Document" && e.name !== "Pictures" && e.streamSize > 512) {
            comp.push({ l: e.name.substring(0, 16), s: e.streamSize, c: "#94a3b8", c2: "#475569" });
        }
    }

    ins += '<div style="display:flex;flex-direction:column;gap:5px">';
    for (var ci = 0; ci < comp.length; ci++) {
        var it = comp[ci];
        var pct = (it.s / fileSize * 100);
        var pctS = pct >= 1 ? pct.toFixed(1) : pct.toFixed(2);
        ins += '<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:' + it.c + ';font-family:var(--font-mono)">' + it.l + '</span>' +
            '<span style="color:var(--color-text-muted);font-family:var(--font-mono)">' + fmtSz(it.s) + ' (' + pctS + '%)</span></div>' +
            '<div style="height:5px;border-radius:3px;background:linear-gradient(90deg,' + it.c + ',' + it.c2 + ');width:' + Math.max(3, Math.min(100, pct)).toFixed(0) + '%"></div></div>';
    }
    ins += '</div></div>';

    // ═══ Assemble 3-panel layout ═══
    return '<div style="display:flex;height:100%;user-select:none">' +
        '<div style="width:52px;flex-shrink:0;display:flex;flex-direction:column;gap:1.5px;padding:4px;background:var(--color-bg-secondary);border-right:1px solid var(--color-border);overflow-y:auto">' + mapHtml + '</div>' +
        '<div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start">' +
        '<div style="flex:1 1 200px;min-width:200px;display:flex;flex-direction:column;gap:6px">' + cards + '</div>' +
        '<div style="flex:0 0 210px;display:flex;flex-direction:column;gap:0;border-left:1px solid var(--color-border);padding-left:10px">' + ins + '</div></div></div>';
}

await hf.template.setView(_renderView());
await hf.template.end();
