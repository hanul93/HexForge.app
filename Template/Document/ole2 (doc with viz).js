// HexForge JS Template - ole2 (doc).js
// OLE2 Compound Binary Format — Microsoft Word .doc parser
// Author: Kei Choi (hanul93@gmail.com)
// Based on [MS-CFB] and [MS-DOC] specifications
// Reference: doc-ole2-structure-viz.html
// ID Bytes: D0 CF 11 E0 A1 B1 1A E1

var fileSize = await hf.fileSize;

await hf.template.begin("OLE2 (DOC)");
hf.template.setFormat("ole2-doc", "OLE2 Compound Binary (DOC)", [".doc", ".dot", ".wbk"]);

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

// ── OLE2 Header (512 bytes) ──────────────────
hf.template.beginStruct("OLE2_Header");
await hf.template.addField("Signature", "bytes:8", { color: "#2563eb" });
await hf.template.addField("CLSID", "bytes:16", { color: "#64748b" });
var minorVer = await hf.template.addField("MinorVersion", "u16", { color: "#2563eb" });
var majorVer = await hf.template.addField("MajorVersion", "u16", { color: "#2563eb" });
await hf.template.addField("ByteOrder", "u16", { color: "#2563eb" });
var sectorShift = await hf.template.addField("SectorShift", "u16", { color: "#2563eb" });
var miniSectorShift = await hf.template.addField("MiniSectorShift", "u16", { color: "#2563eb" });
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

// ── Sector offset helper ─────────────────────
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
hf.log("FAT entries: " + fat.length);

// ── Chain / Stream readers ───────────────────
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

// Template fields for directory
if (dirChain.length > 0) {
    hf.template.seek(sectorOffset(dirChain[0]));
    hf.template.beginStruct("Directory_Entries");
    var dirShowCount = Math.min(dirEntries.length, 20);
    for (var di = 0; di < dirShowCount; di++) {
        var entry = dirEntries[di];
        hf.template.beginStruct("Entry_" + di + "_" + entry.name);
        await hf.template.addField("Name", "bytes:64", {
            color: entry.objType === 5 ? "#fbbf24" : entry.objType === 1 ? "#f97316" : "#10b981"
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
var rootEntry = null, wordDocEntry = null, tableEntry = null;
var summaryEntry = null, macrosEntry = null, vbaStorageEntry = null;
var streamEntries = [], storageEntries = [];

for (var di = 0; di < dirEntries.length; di++) {
    var e = dirEntries[di]; var n = e.name;
    if (e.objType === 5) rootEntry = e;
    else if (e.objType === 1) storageEntries.push(e);
    if (e.objType === 2) streamEntries.push(e);
    if (n === "WordDocument") wordDocEntry = e;
    else if (n === "1Table" || n === "0Table") tableEntry = e;
    else if (n.indexOf("SummaryInformation") >= 0) summaryEntry = e;
    else if (n === "Macros" || n === "_VBA_PROJECT_CUR") macrosEntry = e;
    else if (n === "VBA") vbaStorageEntry = e;
}

hf.log("-- Directory Tree --");
if (rootEntry) hf.log("Root Entry (start: " + rootEntry.startSec + ")");
for (var di = 0; di < dirEntries.length; di++) {
    var e = dirEntries[di];
    if (e.objType === 5) continue;
    var types = { 1: "Storage", 2: "Stream" };
    hf.log("  " + (types[e.objType] || "?") + " \"" + e.name + "\" (" + e.streamSize + " B)");
}

// ══════════════════════════════════════════════
// Layer 2: WordDocument Stream — FIB
// ══════════════════════════════════════════════
var hasFIB = false;
var wIdent = 0, nFib = 0, lid = 0;
var fDot = 0, fComplex = 0, fEncrypted = 0, fWhichTblStm = 0, fHasPic = 0;
var cbMac = 0, ccpText = 0, ccpFtn = 0, ccpHdd = 0, ccpAtn = 0;
var fibVersionName = "";
var fcLcbValues = {};
var cbRgFcLcb = 0;

if (wordDocEntry && wordDocEntry.streamSize >= 68) {
    var fibData = await readStreamData(wordDocEntry.startSec, Math.min(wordDocEntry.streamSize, 4096));
    wIdent = u16(fibData, 0);
    nFib = u16(fibData, 2);

    if (wIdent === 0xA5EC) {
        hasFIB = true;

        lid = u16(fibData, 6);
        var flagsA = u16(fibData, 10);
        fDot = (flagsA & 0x0001) ? 1 : 0;
        fComplex = (flagsA & 0x0004) ? 1 : 0;
        fHasPic = (flagsA & 0x0008) ? 1 : 0;
        fEncrypted = (flagsA & 0x0100) ? 1 : 0;
        fWhichTblStm = (flagsA & 0x0200) ? 1 : 0;

        var NFIB_NAMES = { 0x0065: "Word 6.0", 0x006C: "Word 95", 0x00C1: "Word 97/2000/2002/2003", 0x00D9: "Word 2007", 0x0101: "Word 2010/2013" };
        fibVersionName = NFIB_NAMES[nFib] || ("nFib " + fmtHex(nFib, 4));

        // Seek to WordDocument stream for template fields
        var wdOffset = sectorOffset(wordDocEntry.startSec);
        hf.template.seek(wdOffset);
        hf.template.beginStruct("FIB");

        // FibBase (32 bytes)
        hf.template.beginStruct("FibBase");
        await hf.template.addField("wIdent", "u16", { color: "#10b981" });
        await hf.template.addField("nFib", "u16", { color: "#10b981" });
        await hf.template.addField("unused", "u16", { color: "#64748b" });
        await hf.template.addField("lid", "u16", { color: "#22d3ee" });
        await hf.template.addField("pnNext", "u16", { color: "#64748b" });
        await hf.template.addField("flags_A", "u16", { color: "#f59e0b" });
        await hf.template.addField("nFibBack", "u16", { color: "#64748b" });
        await hf.template.addField("lKey", "u32", { color: "#64748b" });
        await hf.template.addField("envr", "u8", { color: "#64748b" });
        await hf.template.addField("flags_B", "u8", { color: "#f59e0b" });
        await hf.template.addField("reserved", "bytes:6", { color: "#64748b" });
        hf.template.endStruct();

        // FibRgW97
        var csw = u16(fibData, 32);
        hf.template.beginStruct("FibRgW97");
        await hf.template.addField("csw", "u16", { color: "#10b981" });
        var rgwCount = Math.min(csw, 14);
        for (var i = 0; i < rgwCount; i++) await hf.template.addField("rgw_" + i, "u16");
        hf.template.endStruct();

        // FibRgLw97
        var fibRgLwOff = 34 + csw * 2;
        var cslw = u16(fibData, fibRgLwOff);
        hf.template.beginStruct("FibRgLw97");
        await hf.template.addField("cslw", "u16", { color: "#10b981" });
        var rgLwNames = ["cbMac", "lProductCreated", "lProductRevised", "ccpText", "ccpFtn",
            "ccpHdd", "ccpMcr_Atn", "ccpAtn", "ccpEdn", "ccpTxbx",
            "ccpHdrTxbx"];
        var rgLwCount = Math.min(cslw, 22);
        for (var i = 0; i < rgLwCount; i++) {
            var fname = (i < rgLwNames.length) ? rgLwNames[i] : "rgLw_" + i;
            var v = await hf.template.addField(fname, "u32", { color: "#10b981" });
            if (fname === "cbMac") cbMac = v;
            if (fname === "ccpText") ccpText = v;
            if (fname === "ccpFtn") ccpFtn = v;
            if (fname === "ccpHdd") ccpHdd = v;
            if (fname === "ccpAtn") ccpAtn = v;
        }
        hf.template.endStruct();

        // FibRgFcLcb
        var fibRgFcLcbOff = fibRgLwOff + 2 + cslw * 4;
        if (fibRgFcLcbOff + 2 <= fibData.length) {
            cbRgFcLcb = u16(fibData, fibRgFcLcbOff);
            hf.template.beginStruct("FibRgFcLcb");
            await hf.template.addField("cbRgFcLcb", "u16", { color: "#3b82f6" });
            var fcLcbNames = [
                "fcStshfOrig", "lcbStshfOrig", "fcStshf", "lcbStshf",
                "fcPlcffndRef", "lcbPlcffndRef", "fcPlcffndTxt", "lcbPlcffndTxt",
                "fcPlcfandRef", "lcbPlcfandRef", "fcPlcfandTxt", "lcbPlcfandTxt",
                "fcPlcfSed", "lcbPlcfSed", "fcPlcPad", "lcbPlcPad",
                "fcPlcfPhe", "lcbPlcfPhe", "fcSttbfGlsy", "lcbSttbfGlsy",
                "fcPlcfGlsy", "lcbPlcfGlsy", "fcPlcfHdd", "lcbPlcfHdd",
                "fcPlcfBteChpx", "lcbPlcfBteChpx", "fcPlcfBtePapx", "lcbPlcfBtePapx",
                "fcPlcfSea", "lcbPlcfSea", "fcSttbfFfn", "lcbSttbfFfn",
                "fcPlcfFldMom", "lcbPlcfFldMom", "fcPlcfFldHdr", "lcbPlcfFldHdr",
                "fcPlcfFldFtn", "lcbPlcfFldFtn", "fcPlcfFldAtn", "lcbPlcfFldAtn",
                "fcPlcfFldMcr", "lcbPlcfFldMcr", "fcSttbfBkmk", "lcbSttbfBkmk",
                "fcPlcfBkf", "lcbPlcfBkf", "fcPlcfBkl", "lcbPlcfBkl",
                "fcCmds", "lcbCmds",
                "fcUnused1", "lcbUnused1", "fcSttbfMcr", "lcbSttbfMcr",
                "fcPrDrvr", "lcbPrDrvr", "fcPrEnvPort", "lcbPrEnvPort",
                "fcPrEnvLand", "lcbPrEnvLand", "fcWss", "lcbWss",
                "fcDop", "lcbDop", "fcSttbfAssoc", "lcbSttbfAssoc",
                "fcClx", "lcbClx"
            ];
            var pairCount = Math.min(cbRgFcLcb, fcLcbNames.length);
            for (var i = 0; i < pairCount; i++) {
                var fname = fcLcbNames[i] || "fcLcb_" + i;
                var color = fname.indexOf("Cmds") >= 0 ? "#a855f7" :
                            fname.indexOf("Clx") >= 0 ? "#94a3b8" :
                            fname.indexOf("BteChpx") >= 0 || fname.indexOf("BtePapx") >= 0 ? "#3b82f6" :
                            fname.indexOf("Stshf") >= 0 && fname.indexOf("Orig") < 0 ? "#3b82f6" : "#10b981";
                var v = await hf.template.addField(fname, "u32", { color: color });
                fcLcbValues[fname] = v;
            }
            hf.template.endStruct();
        }
        hf.template.endStruct(); // FIB
    }

    hf.log("FIB: wIdent=" + fmtHex(wIdent, 4) + " nFib=" + fmtHex(nFib, 4) + " (" + fibVersionName + ")");
    hf.log("  Table Stream: " + (fWhichTblStm ? "1Table" : "0Table"));
    hf.log("  ccpText=" + ccpText + " ccpFtn=" + ccpFtn + " ccpHdd=" + ccpHdd);
    if (fEncrypted) hf.warn("Document is ENCRYPTED!");
}

// ══════════════════════════════════════════════
// Layer 3: VBA Macro Detection
// ══════════════════════════════════════════════
var vbaIndicators = [];
var vbaModules = [];
var suspiciousFound = [];

for (var di = 0; di < dirEntries.length; di++) {
    var n = dirEntries[di].name;
    if (n === "Macros" || n === "_VBA_PROJECT_CUR") vbaIndicators.push(n);
    if (n === "VBA") vbaIndicators.push("VBA storage");
    if (n === "_VBA_PROJECT") vbaIndicators.push("_VBA_PROJECT stream");
    if (n === "dir" && dirEntries[di].objType === 2) vbaIndicators.push("VBA dir stream");
    if (n === "ThisDocument" || n === "Module1" || n === "Module2" || n === "Module3") vbaModules.push(n);
}

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
            for (var bi = 0; bi < modData.length; bi++) {
                rawStr += (modData[bi] >= 0x20 && modData[bi] < 0x7F) ? String.fromCharCode(modData[bi]) : "";
            }
            var keywords = ["AutoOpen", "Auto_Open", "AutoExec", "AutoClose",
                "Document_Open", "Document_Close", "Shell", "WScript",
                "powershell", "cmd.exe", "CreateObject", "XMLHTTP"];
            var rl = rawStr.toLowerCase();
            for (var ki = 0; ki < keywords.length; ki++) {
                if (rl.indexOf(keywords[ki].toLowerCase()) >= 0) suspiciousFound.push(keywords[ki]);
            }
        }
    }
    if (suspiciousFound.length > 0) hf.warn("  Suspicious: " + suspiciousFound.join(", "));
}

// ══════════════════════════════════════════════
// Structure View Visualization
// ══════════════════════════════════════════════
function _hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function _renderFields(fields, cols) {
    var style = cols
        ? "display:grid;grid-template-columns:repeat(" + cols + ",1fr);gap:2px 12px"
        : "display:flex;flex-direction:column;gap:1px";
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

function _renderView() {
    // ═══ LEFT: Sector Map ═══
    var mapHtml = '<div style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;text-align:center;flex-shrink:0;margin-bottom:2px">Sectors</div>';
    var sectors = [
        { name: "HDR", color: "#2563eb", grow: 20 },
        { name: "DIFAT", color: "#a855f7", grow: 6 },
        { name: "FAT", color: "#f97316", grow: 10 },
        { name: "DIR", color: "#fbbf24", grow: 8 },
        { name: "mFAT", color: "#22d3ee", grow: 6 }
    ];
    // Add stream blocks
    if (wordDocEntry) sectors.push({ name: "Word", color: "#10b981", grow: Math.max(8, Math.min(40, wordDocEntry.streamSize / 1024)) });
    if (tableEntry) sectors.push({ name: "Table", color: "#3b82f6", grow: Math.max(5, Math.min(20, tableEntry.streamSize / 1024)) });
    if (vbaIndicators.length > 0) sectors.push({ name: "VBA", color: "#ef4444", grow: 15 });

    for (var si = 0; si < sectors.length; si++) {
        var s = sectors[si];
        var rgb = _hexRgb(s.color);
        mapHtml += '<div style="flex:' + s.grow + ' 0 0px;min-height:14px;border-radius:2px;' +
            'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.18);' +
            'border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.35);' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:7px;font-family:var(--font-mono);color:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.8);line-height:1" ' +
            'title="' + s.name + '">' + (s.grow >= 6 ? s.name : "") + '</div>';
    }

    // ═══ CENTER: Node Cards ═══
    var cards = "";

    // ── Card 1: OLE2 Header ──
    var hC = _cardHdr("\u25A3", "#2563eb", "OLE2 Header",
        "Sector 0 \xB7 512 bytes", "D0 CF 11 E0 A1 B1 1A E1", "0:512");
    hC += '<div style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.1)">';
    hC += '<div style="font-size:9px;font-family:var(--font-mono);color:rgba(37,99,235,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">DIFAT (first 109 in header)</div>';
    hC += '<div style="display:flex;gap:3px;flex-wrap:wrap">';
    for (var di = 0; di < Math.min(difat.length, 4); di++) {
        hC += '<div style="padding:2px 5px;border-radius:3px;background:rgba(168,85,247,0.15);font-size:9px;font-family:var(--font-mono);color:#c084fc">Sec ' + difat[di] + ' \u2192 FAT</div>';
    }
    if (difat.length === 0) hC += '<div style="padding:2px 5px;border-radius:3px;background:rgba(100,116,139,0.1);font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">FREESECT</div>';
    hC += '</div></div>';
    hC += '<div style="margin-top:10px">' + _renderFields([
        { name: "Major Version", value: "v" + majorVer, color: "#93c5fd" },
        { name: "Sector Size", value: sectorSize + " (" + (sectorShift === 9 ? "2\u2079" : "2\xB9\xB2") + ")", color: "#93c5fd" },
        { name: "Mini Sector", value: miniSectorSize + " (2\u2076)", color: "#93c5fd" },
        { name: "Total FAT", value: numFATSectors + " sector" + (numFATSectors !== 1 ? "s" : ""), color: "#93c5fd" },
        { name: "Dir Start", value: "Sector " + firstDirSector, color: "#fbbf24" },
        { name: "MiniFAT Start", value: firstMiniFATSector === ENDOFCHAIN ? "None" : "Sector " + firstMiniFATSector, color: "#67e8f9" }
    ], 2) + '</div>';
    cards += _card("#2563eb", hC);

    cards += _arrow(null, "#2563eb", "#f97316");

    // ── Card 2+3: FAT + Directory (side by side) ──
    cards += '<div style="display:flex;flex-wrap:wrap;gap:8px">';

    // FAT card
    var fatC = _cardHdr("\u25A6", "#f97316", "FAT \u2014 File Allocation Table",
        fat.length + " entries \xB7 Sector chain map", null, null);
    fatC += '<div style="margin-top:10px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px">';
    var fatShowCount = Math.min(fat.length, 16);
    var FAT_COLORS = {};
    // Color FAT entries by stream ownership
    if (wordDocEntry) { var wc = readChain(wordDocEntry.startSec); for (var ci = 0; ci < wc.length; ci++) FAT_COLORS[wc[ci]] = { bg: "rgba(16,185,129,0.15)", bd: "rgba(16,185,129,0.25)", fg: "#6ee7b7" }; }
    if (tableEntry) { var tc = readChain(tableEntry.startSec); for (var ci = 0; ci < tc.length; ci++) FAT_COLORS[tc[ci]] = { bg: "rgba(59,130,246,0.15)", bd: "rgba(59,130,246,0.25)", fg: "#93c5fd" }; }
    var dc = readChain(firstDirSector); for (var ci = 0; ci < dc.length; ci++) FAT_COLORS[dc[ci]] = { bg: "rgba(251,191,36,0.2)", bd: "rgba(251,191,36,0.3)", fg: "#fde68a" };

    for (var fi = 0; fi < fatShowCount; fi++) {
        var fv = fat[fi];
        var fc = FAT_COLORS[fi];
        var cellBg = fc ? fc.bg : (fv === FATSECT ? "rgba(249,115,22,0.3)" : (fv >= ENDOFCHAIN ? "rgba(100,116,139,0.08)" : "rgba(100,116,139,0.05)"));
        var cellBd = fc ? fc.bd : (fv === FATSECT ? "rgba(249,115,22,0.4)" : "rgba(100,116,139,0.15)");
        var cellFg = fc ? fc.fg : (fv === FATSECT ? "#fb923c" : "var(--color-text-muted)");
        var cellTxt = fv === ENDOFCHAIN ? "END" : (fv === FREESECT ? "\u2014" : (fv === FATSECT ? "FAT" : (fv === DIFSECT ? "DIF" : "\u2192" + fv)));
        fatC += '<div style="aspect-ratio:1;border-radius:2px;display:flex;align-items:center;justify-content:center;' +
            'background:' + cellBg + ';border:1px solid ' + cellBd + ';font-size:7px;font-family:var(--font-mono);color:' + cellFg + '" ' +
            'title="Sec ' + fi + ': ' + (fv === ENDOFCHAIN ? "ENDOFCHAIN" : (fv === FREESECT ? "FREESECT" : fv)) + '">' + cellTxt + '</div>';
    }
    fatC += '</div>';
    fatC += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;font-size:8px;font-family:var(--font-mono)">';
    fatC += '<span style="display:flex;align-items:center;gap:2px"><span style="width:6px;height:6px;border-radius:1px;background:rgba(251,191,36,0.3)"></span><span style="color:var(--color-text-muted)">Dir</span></span>';
    if (wordDocEntry) fatC += '<span style="display:flex;align-items:center;gap:2px"><span style="width:6px;height:6px;border-radius:1px;background:rgba(16,185,129,0.25)"></span><span style="color:var(--color-text-muted)">WordDoc</span></span>';
    if (tableEntry) fatC += '<span style="display:flex;align-items:center;gap:2px"><span style="width:6px;height:6px;border-radius:1px;background:rgba(59,130,246,0.25)"></span><span style="color:var(--color-text-muted)">Table</span></span>';
    fatC += '</div>';
    cards += '<div style="flex:1 1 200px;min-width:200px">' + _card("#f97316", fatC) + '</div>';

    // Directory Entries card
    var dirC = _cardHdr("\u25C8", "#fbbf24", "Directory Entries",
        dirEntries.length + " entries \xB7 Red-Black Tree \xB7 128B each", null, null);
    dirC += '<div style="margin-top:10px;font-size:11px;font-family:var(--font-mono);display:flex;flex-direction:column;gap:3px">';

    var DIR_ICONS = { 5: "\uD83D\uDCC1", 1: "\uD83D\uDCC1", 2: "\uD83D\uDCC4" };
    var DIR_COLORS = { "Root Entry": "#fbbf24", "WordDocument": "#10b981", "1Table": "#3b82f6", "0Table": "#3b82f6", "Macros": "#ef4444", "VBA": "#ef4444", "_VBA_PROJECT_CUR": "#ef4444" };
    var maxDir = Math.min(dirEntries.length, 10);
    for (var di = 0; di < maxDir; di++) {
        var e = dirEntries[di];
        var ec = DIR_COLORS[e.name] || (e.objType === 1 ? "#f97316" : "#94a3b8");
        var er = _hexRgb(ec);
        var isStorage = (e.objType === 1 || e.objType === 5);
        var indent = (e.objType === 5) ? 0 : 16;
        var typeTag = isStorage ? "Storage" : (fmtSz(e.streamSize));
        dirC += '<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;padding-left:' + (6 + indent) + 'px;border-radius:4px;' +
            'background:rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.04);border:1px solid rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.1)">' +
            '<span style="font-size:11px">' + (DIR_ICONS[e.objType] || "\uD83D\uDCC4") + '</span>' +
            '<span style="color:' + ec + ';font-weight:' + (isStorage ? '700' : '400') + ';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e.name + '</span>' +
            '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.1);color:' + ec + ';flex-shrink:0">' + typeTag + '</span></div>';
    }
    if (dirEntries.length > 10) dirC += '<div style="font-size:10px;color:var(--color-text-muted);text-align:center;padding:3px">+' + (dirEntries.length - 10) + ' more...</div>';
    dirC += '</div>';
    cards += '<div style="flex:1 1 200px;min-width:200px">' + _card("#fbbf24", dirC) + '</div>';
    cards += '</div>';

    // ── Card 4: FIB ──
    if (hasFIB) {
        cards += _arrow("Root Entry \u2192 WordDocument stream", "#fbbf24", "#10b981");

        var fibC = _cardHdr("\u25B6", "#10b981", "FIB \u2014 File Information Block",
            "Start of WordDocument stream", "wIdent: 0xA5EC", null);

        // FibBase sub-card
        fibC += '<div style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.1)">';
        fibC += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:rgba(16,185,129,0.7);text-transform:uppercase;letter-spacing:0.05em;font-weight:700">FibBase (32 bytes)</span>' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">0x00 \u2013 0x1F</span></div>';
        var LID_NAMES = { 0x0409: "en-US", 0x0411: "ja-JP", 0x0412: "ko-KR", 0x0804: "zh-CN", 0x0407: "de-DE", 0x040C: "fr-FR" };
        fibC += _renderFields([
            { name: "wIdent", value: fmtHex(wIdent, 4), color: "#6ee7b7" },
            { name: "nFib", value: fmtHex(nFib, 4) + " (" + fibVersionName + ")", color: "#6ee7b7" },
            { name: "lid", value: fmtHex(lid, 4) + " (" + (LID_NAMES[lid] || "?") + ")", color: "#67e8f9" },
            { name: "fDot", value: fDot ? "1 (template)" : "0", color: "#6ee7b7" },
            { name: "fEncrypted", value: String(fEncrypted), color: fEncrypted ? "#f87171" : "#6ee7b7" },
            { name: "fWhichTblStm", value: fWhichTblStm + ' \u2192 "' + (fWhichTblStm ? "1Table" : "0Table") + '"', color: "#6ee7b7" }
        ], 2);
        fibC += '</div>';

        // FibRgW97
        fibC += '<div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.1)">';
        fibC += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:rgba(16,185,129,0.7);text-transform:uppercase;letter-spacing:0.05em;font-weight:700">FibRgW97 (28 bytes)</span>' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">14 uint16 values</span></div>';
        fibC += '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted)">Assorted word-size config flags (mostly reserved)</div>';
        fibC += '</div>';

        // FibRgLw97
        fibC += '<div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.1)">';
        fibC += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:rgba(16,185,129,0.7);text-transform:uppercase;letter-spacing:0.05em;font-weight:700">FibRgLw97 (88 bytes)</span>' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">22 uint32 values</span></div>';
        fibC += _renderFields([
            { name: "cbMac", value: cbMac.toLocaleString() + " (doc size)", color: "#6ee7b7" },
            { name: "ccpText", value: ccpText.toLocaleString() + " chars", color: "#6ee7b7" },
            { name: "ccpFtn", value: ccpFtn === 0 ? "0 (no footnotes)" : String(ccpFtn), color: "#6ee7b7" },
            { name: "ccpHdd", value: ccpHdd === 0 ? "0" : ccpHdd + " (header/footer)", color: "#6ee7b7" }
        ], 2);
        fibC += '</div>';

        // FibRgFcLcb — Stream Pointers
        fibC += '<div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15)">';
        fibC += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:rgba(59,130,246,0.7);text-transform:uppercase;letter-spacing:0.05em;font-weight:700">FibRgFcLcb97 \u2014 Stream Pointers</span>' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">' + (cbRgFcLcb / 2) + ' FC/LCB pairs</span></div>';
        fibC += '<div style="font-size:10px;color:var(--color-text-muted);margin-bottom:8px">Each pair points to a location (FC) and size (LCB) in the Table Stream:</div>';
        fibC += '<div style="display:flex;flex-direction:column;gap:4px">';

        var tblName = fWhichTblStm ? "1Table" : "0Table";
        var pointers = [
            { key: "fcStshf", label: "fcStshf", desc: "Styles", color: "#3b82f6" },
            { key: "fcPlcfBteChpx", label: "fcPlcfBteChpx", desc: "Char Props", color: "#3b82f6" },
            { key: "fcPlcfBtePapx", label: "fcPlcfBtePapx", desc: "Para Props", color: "#3b82f6" },
            { key: "fcCmds", label: "fcCmds", desc: "Macros!", color: "#a855f7" },
            { key: "fcClx", label: "fcClx", desc: "Piece Table", color: "#94a3b8" },
            { key: "fcDop", label: "fcDop", desc: "Doc Properties", color: "#3b82f6" }
        ];
        for (var pi = 0; pi < pointers.length; pi++) {
            var p = pointers[pi];
            var fcVal = fcLcbValues[p.key];
            var lcbKey = "lcb" + p.key.slice(2);
            var lcbVal = fcLcbValues[lcbKey];
            if (fcVal === undefined) continue;
            if (!lcbVal && p.key !== "fcCmds") continue;
            var pRgb = _hexRgb(p.color);
            fibC += '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;' +
                'background:rgba(' + pRgb[0] + ',' + pRgb[1] + ',' + pRgb[2] + ',0.05);border:1px solid rgba(' + pRgb[0] + ',' + pRgb[1] + ',' + pRgb[2] + ',0.1);font-size:10px;font-family:var(--font-mono)">' +
                '<span style="color:' + p.color + ';width:100px;flex-shrink:0">' + p.label + '</span>' +
                '<span style="color:var(--color-text-muted);display:flex;align-items:center;gap:2px">\u2192 ' + tblName + '</span>' +
                '<span style="color:' + p.color + ';flex:1;text-align:right">' + p.desc + ' (FC:' + fmtHex(fcVal, 4) + ' LCB:' + fmtHex(lcbVal || 0, 4) + ')</span></div>';
        }
        fibC += '</div></div>';
        cards += _card("#10b981", fibC);
    }

    // ── Card 5: VBA Macros ──
    if (vbaIndicators.length > 0) {
        cards += _arrow("Directory \u2192 Macros/VBA storage", "#10b981", "#ef4444");

        var vbaC = _cardHdr("\u2699", "#ef4444", "VBA Project \u2014 Macro Streams",
            "Compressed VBA source in module streams", (suspiciousFound.length > 0 ? "\u26A0 SUSPICIOUS" : "\u26A0 MACROS"), null);

        // Modules
        if (vbaModules.length > 0) {
            vbaC += '<div style="margin-top:10px;font-size:9px;font-family:var(--font-mono);color:rgba(239,68,68,0.6);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Modules (' + vbaModules.length + ')</div>';
            vbaC += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">';
            for (var mi = 0; mi < vbaModules.length; mi++) {
                vbaC += '<div style="padding:3px 8px;border-radius:4px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.15);font-size:11px;font-family:var(--font-mono);color:#fca5a5">' + vbaModules[mi] + '</div>';
            }
            vbaC += '</div>';
        }

        // Detection flags
        if (suspiciousFound.length > 0) {
            vbaC += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">';
            for (var si = 0; si < suspiciousFound.length; si++) {
                var kw = suspiciousFound[si];
                var kwColor = (kw === "AutoOpen" || kw === "Auto_Open" || kw === "Document_Open") ? "#ef4444" : "#f97316";
                var kwRgb = _hexRgb(kwColor);
                vbaC += '<div style="display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:4px;background:rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.05);border:1px solid rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.15)">' +
                    '<span style="font-size:10px;color:' + kwColor + '">\u26A0</span>' +
                    '<span style="font-size:10px;font-family:var(--font-mono);color:' + kwColor + ';font-weight:700">' + kw + '</span></div>';
            }
            vbaC += '</div>';
        }
        cards += _card("#ef4444", vbaC);
    }

    // ═══ RIGHT: Insight Panel ═══
    var _st = function(t) { return '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">' + t + '</div>'; };
    var _dv = '<div style="height:1px;background:var(--color-border);margin:12px 0"></div>';
    var ins = "";

    // Document Summary
    ins += '<div style="padding:4px 0">' + _st("Document Summary") + '<div style="display:flex;flex-direction:column;gap:6px">';
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(37,99,235,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#2563eb;flex-shrink:0">\u25CE</div>' +
        '<div><div style="font-size:12px;color:#60a5fa;font-weight:600">' + (hasFIB ? fibVersionName : "OLE2 v" + majorVer) + '</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">OLE2 v' + majorVer + ' \xB7 ' + sectorSize + '-byte sectors</div></div></div>';
    if (hasFIB && ccpText > 0) {
        ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(16,185,129,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#10b981;flex-shrink:0">\u25B7</div>' +
            '<div><div style="font-size:12px;color:#6ee7b7;font-weight:600">' + ccpText.toLocaleString() + ' characters</div>' +
            '<div style="color:var(--color-text-muted);font-size:10px">Main text' + (ccpHdd > 0 ? " + " + ccpHdd + " chars header" : "") + '</div></div></div>';
    }
    if (vbaIndicators.length > 0) {
        ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#ef4444;flex-shrink:0">\u26A0</div>' +
            '<div><div style="font-size:12px;color:#f87171;font-weight:600">VBA Macros Detected</div>' +
            '<div style="color:var(--color-text-muted);font-size:10px">' + vbaModules.length + ' modules in Macros/VBA</div></div></div>';
    }
    ins += '</div></div>' + _dv;

    // Container Stats
    ins += '<div style="padding:4px 0">' + _st("Container Stats") + '<div style="display:flex;flex-direction:column;gap:3px">';
    var stats = [
        { n: "Total Sectors", v: String(fat.length) },
        { n: "FAT Sectors", v: String(numFATSectors) },
        { n: "Dir Sectors", v: String(dirChain.length) },
        { n: "Storages", v: String(storageEntries.length) },
        { n: "Streams", v: String(streamEntries.length) }
    ];
    for (var si = 0; si < stats.length; si++) {
        ins += '<div style="display:flex;justify-content:space-between;font-size:11px;font-family:var(--font-mono);padding:1px 0">' +
            '<span style="color:var(--color-text-muted)">' + stats[si].n + '</span><span style="color:var(--color-text)">' + stats[si].v + '</span></div>';
    }
    ins += '</div></div>' + _dv;

    // Threat Assessment (if macros present)
    if (vbaIndicators.length > 0) {
        ins += '<div style="padding:4px 0">' + _st("Threat Assessment") + '<div style="display:flex;flex-direction:column;gap:3px">';
        var hasMacro = vbaIndicators.length > 0;
        var hasAutoExec = false;
        var hasShell = false;
        var hasObfuscation = false;
        for (var si = 0; si < suspiciousFound.length; si++) {
            var kw = suspiciousFound[si].toLowerCase();
            if (kw.indexOf("auto") >= 0 || kw.indexOf("document_") >= 0) hasAutoExec = true;
            if (kw === "shell" || kw === "wscript" || kw === "createobject") hasShell = true;
            if (kw === "powershell") hasObfuscation = true;
        }
        var threats = [
            { n: "Macro Risk", on: hasMacro, v: hasMacro ? "HIGH" : "NONE", color: "#ef4444" },
            { n: "Auto-Execute", on: hasAutoExec, v: hasAutoExec ? "YES" : "NO", color: hasAutoExec ? "#ef4444" : "#10b981" },
            { n: "Shell Execution", on: hasShell, v: hasShell ? "YES" : "NO", color: hasShell ? "#ef4444" : "#10b981" },
            { n: "Encrypted", on: fEncrypted, v: fEncrypted ? "YES" : "NO", color: fEncrypted ? "#f97316" : "#10b981" }
        ];
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
    if (wordDocEntry && wordDocEntry.streamSize > 0) comp.push({ l: "WordDocument", s: wordDocEntry.streamSize, c: "#10b981", c2: "#059669" });
    if (tableEntry && tableEntry.streamSize > 0) comp.push({ l: tableEntry.name, s: tableEntry.streamSize, c: "#3b82f6", c2: "#1d4ed8" });
    comp.push({ l: "Header+FAT+Dir", s: 512 + numFATSectors * sectorSize + dirChain.length * sectorSize, c: "#f97316", c2: "#c2410c" });

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
