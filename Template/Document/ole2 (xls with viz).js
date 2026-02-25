// HexForge JS Template - ole2 (xls).js
// OLE2 Compound Binary Format — Microsoft Excel .xls (BIFF8) parser
// Author: Kei Choi (hanul93@gmail.com)
// Based on [MS-CFB] and [MS-XLS] / BIFF8 specifications
// Reference: xls-biff8-structure-viz.html
// ID Bytes: D0 CF 11 E0 A1 B1 1A E1

var fileSize = await hf.fileSize;

await hf.template.begin("OLE2 (XLS)");
hf.template.setFormat("ole2-xls", "OLE2 Compound Binary (XLS/BIFF8)", [".xls", ".xlt", ".xla"]);

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
function f64FromBuf(buf, off) {
    var dv = new DataView(new Uint8Array(buf.slice(off, off + 8)).buffer);
    return dv.getFloat64(0, true);
}

var ENDOFCHAIN = 0xFFFFFFFE;
var FREESECT   = 0xFFFFFFFF;
var FATSECT    = 0xFFFFFFFD;
var DIFSECT    = 0xFFFFFFFC;

// BIFF record type names
var BIFF_NAMES = {
    0x0809: "BOF", 0x000A: "EOF", 0x0042: "CODEPAGE", 0x0022: "DATEMODE",
    0x0031: "FONT", 0x041E: "FORMAT", 0x00E0: "XF", 0x0085: "BOUNDSHEET",
    0x00FC: "SST", 0x00FF: "EXTSST", 0x01AE: "SUPBOOK", 0x0017: "EXTERNSHEET",
    0x0018: "NAME", 0x0208: "ROW", 0x00FD: "LABELSST", 0x027E: "RK",
    0x00BD: "MULRK", 0x00BE: "MULBLANK", 0x0201: "BLANK", 0x0203: "NUMBER",
    0x0006: "FORMULA", 0x0207: "STRING", 0x00D7: "DBCELL", 0x0200: "DIMENSIONS",
    0x000C: "CALCCOUNT", 0x000D: "CALCMODE", 0x000F: "REFMODE", 0x0010: "DELTA",
    0x0011: "ITERATION", 0x003D: "WINDOW1", 0x003E: "WINDOW2", 0x0055: "DEFCOLWIDTH",
    0x007D: "COLINFO", 0x0225: "DEFAULTROWHEIGHT", 0x0081: "WSBOOL",
    0x0862: "SHEETLAYOUT", 0x0867: "SHEETPROTECTION", 0x0868: "RANGEPROTECTION",
    0x00E5: "MERGEDCELLS", 0x01B8: "HYPERLINK", 0x004D: "PLS",
    0x0023: "EXTERNNAME", 0x013D: "TABID", 0x01C1: "RECALCID",
    0x0086: "WRITEPROTECT", 0x00DD: "SCENPROTECT"
};

// BOF substream types
var BOF_TYPES = { 0x0005: "Workbook", 0x0010: "Worksheet", 0x0020: "Chart", 0x0040: "Macro", 0x0100: "Workspace" };

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
await hf.template.addField("Signature", "bytes:8", { color: "#16a34a" });
await hf.template.addField("CLSID", "bytes:16", { color: "#64748b" });
var minorVer = await hf.template.addField("MinorVersion", "u16", { color: "#16a34a" });
var majorVer = await hf.template.addField("MajorVersion", "u16", { color: "#16a34a" });
await hf.template.addField("ByteOrder", "u16", { color: "#16a34a" });
var sectorShift = await hf.template.addField("SectorShift", "u16", { color: "#16a34a" });
var miniSectorShift = await hf.template.addField("MiniSectorShift", "u16", { color: "#16a34a" });
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
            color: entry.objType === 5 ? "#fbbf24" : entry.objType === 1 ? "#f97316" : "#16a34a"
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
var rootEntry = null, workbookEntry = null;
var summaryEntry = null, docSummaryEntry = null;
var streamEntries = [], storageEntries = [];

for (var di = 0; di < dirEntries.length; di++) {
    var e = dirEntries[di]; var n = e.name;
    if (e.objType === 5) rootEntry = e;
    else if (e.objType === 1) storageEntries.push(e);
    if (e.objType === 2) streamEntries.push(e);
    if (n === "Workbook" || n === "Book") workbookEntry = e;
    else if (n.indexOf("SummaryInformation") >= 0 && n.indexOf("Document") < 0) summaryEntry = e;
    else if (n.indexOf("DocumentSummaryInformation") >= 0) docSummaryEntry = e;
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
// Layer 2: BIFF8 Record Stream (Workbook)
// ══════════════════════════════════════════════
var hasBIFF = false;
var biffVersion = 0, biffBuild = 0, biffYear = 0;
var codepage = 0, dateMode = 0;
var boundSheets = [];  // { name, grbit, dt, lbPlyPos, visibility, sheetType }
var sstStrings = [];
var sstTotal = 0, sstUnique = 0;
var globalRecords = [];  // { type, name, size, offset }
var fontRecords = [];
var formatRecords = [];
var xfCount = 0;
var nameRecords = [];  // DEFINEDNAME / NAME records
var supbookCount = 0;

// Record stats
var recTypeCounts = {};

if (workbookEntry && workbookEntry.streamSize > 0) {
    var wbData = await readStreamData(workbookEntry.startSec, workbookEntry.streamSize);
    var pos = 0;
    var globalsDone = false;

    // Template fields for Workbook stream
    var wbOffset = sectorOffset(workbookEntry.startSec);
    hf.template.seek(wbOffset);
    hf.template.beginStruct("Workbook_Stream");

    while (pos + 4 <= wbData.length) {
        var recType = u16(wbData, pos);
        var recSize = u16(wbData, pos + 2);
        if (pos + 4 + recSize > wbData.length) break;

        var recName = BIFF_NAMES[recType] || fmtHex(recType, 4);
        recTypeCounts[recName] = (recTypeCounts[recName] || 0) + 1;

        if (!globalsDone) {
            globalRecords.push({ type: recType, name: recName, size: recSize, offset: pos });
        }

        if (recType === 0x0809 && pos === 0) {
            // BOF record
            hasBIFF = true;
            biffVersion = u16(wbData, pos + 4);
            var bofType = u16(wbData, pos + 6);
            if (recSize >= 8) biffBuild = u16(wbData, pos + 8);
            if (recSize >= 10) biffYear = u16(wbData, pos + 10);

            hf.template.beginStruct("BOF_Workbook");
            await hf.template.addField("RecordType", "u16", { color: "#22d3ee" });
            await hf.template.addField("RecordSize", "u16", { color: "#22d3ee" });
            await hf.template.addField("BIFFVersion", "u16", { color: "#16a34a" });
            await hf.template.addField("SubstreamType", "u16", { color: "#16a34a" });
            if (recSize >= 8) await hf.template.addField("BuildID", "u16", { color: "#64748b" });
            if (recSize >= 10) await hf.template.addField("BuildYear", "u16", { color: "#64748b" });
            if (recSize >= 16) {
                await hf.template.addField("FileHistoryFlags", "u32", { color: "#64748b" });
                await hf.template.addField("LowestBIFFVersion", "u32", { color: "#64748b" });
            }
            hf.template.endStruct();

            hf.log("BIFF: version=" + fmtHex(biffVersion, 4) + " type=" + (BOF_TYPES[bofType] || fmtHex(bofType, 4)) + " build=" + biffBuild + " year=" + biffYear);
        }
        else if (recType === 0x0042) {
            // CODEPAGE
            codepage = u16(wbData, pos + 4);
        }
        else if (recType === 0x0022) {
            // DATEMODE
            dateMode = u16(wbData, pos + 4);
        }
        else if (recType === 0x0031 && !globalsDone) {
            // FONT
            var fontHeight = u16(wbData, pos + 4);
            var fontFlags = u16(wbData, pos + 6);
            // font name is at variable offset
            var fnLen = wbData[pos + 18];
            var fnFlag = wbData[pos + 19]; // 0=compressed, 1=unicode
            var fontName = "";
            if (fnFlag === 0) {
                for (var fi = 0; fi < fnLen; fi++) fontName += String.fromCharCode(wbData[pos + 20 + fi]);
            } else {
                for (var fi = 0; fi < fnLen; fi++) fontName += String.fromCharCode(u16(wbData, pos + 20 + fi * 2));
            }
            fontRecords.push({ height: fontHeight / 20, name: fontName, bold: (fontFlags & 0x0001) ? true : false });
        }
        else if (recType === 0x041E && !globalsDone) {
            // FORMAT
            var fmtIdx = u16(wbData, pos + 4);
            var fmtStrLen = u16(wbData, pos + 6);
            var fmtFlag = wbData[pos + 8];
            var fmtStr = "";
            if (fmtFlag === 0) {
                for (var fi = 0; fi < Math.min(fmtStrLen, 40); fi++) fmtStr += String.fromCharCode(wbData[pos + 9 + fi]);
            } else {
                for (var fi = 0; fi < Math.min(fmtStrLen, 40); fi++) fmtStr += String.fromCharCode(u16(wbData, pos + 9 + fi * 2));
            }
            formatRecords.push({ idx: fmtIdx, str: fmtStr });
        }
        else if (recType === 0x00E0 && !globalsDone) {
            // XF
            xfCount++;
        }
        else if (recType === 0x0085 && !globalsDone) {
            // BOUNDSHEET
            var lbPlyPos = u32(wbData, pos + 4);
            var grbit = wbData[pos + 8];
            var dt = wbData[pos + 9];
            var shNameLen = wbData[pos + 10];
            var shNameFlag = wbData[pos + 11];
            var shName = "";
            if (shNameFlag === 0) {
                for (var si = 0; si < shNameLen; si++) shName += String.fromCharCode(wbData[pos + 12 + si]);
            } else {
                for (var si = 0; si < shNameLen; si++) shName += String.fromCharCode(u16(wbData, pos + 12 + si * 2));
            }
            var vis = grbit === 0 ? "visible" : (grbit === 1 ? "hidden" : "very hidden");
            var shType = dt === 0x00 ? "Worksheet" : (dt === 0x01 ? "Macro" : (dt === 0x02 ? "Chart" : (dt === 0x06 ? "VB Module" : "type " + fmtHex(dt, 2))));
            boundSheets.push({ name: shName, grbit: grbit, dt: dt, lbPlyPos: lbPlyPos, visibility: vis, sheetType: shType });
            hf.log("  BOUNDSHEET: \"" + shName + "\" " + vis + " (" + shType + ") -> offset " + lbPlyPos);
        }
        else if (recType === 0x0018 && !globalsDone) {
            // NAME / DEFINEDNAME
            var nameGrbit = u16(wbData, pos + 4);
            var nameShortcut = wbData[pos + 6];
            var nameLen = wbData[pos + 7];
            var nameFmlaSize = u16(wbData, pos + 8);
            var nameItab = u16(wbData, pos + 12);
            var nameStr = "";
            var nameOff = pos + 18;
            var nameFlag = (nameLen > 0 && nameOff < pos + 4 + recSize) ? wbData[nameOff] : 0;
            nameOff++;
            if (nameFlag === 0) {
                for (var ni = 0; ni < nameLen && nameOff + ni < pos + 4 + recSize; ni++) nameStr += String.fromCharCode(wbData[nameOff + ni]);
            } else {
                for (var ni = 0; ni < nameLen && nameOff + ni * 2 + 1 < pos + 4 + recSize; ni++) nameStr += String.fromCharCode(u16(wbData, nameOff + ni * 2));
            }
            // Built-in names: 0x00=Consolidate_Area, 0x01=Auto_Open, 0x06=Auto_Close, etc.
            var builtInNames = { 0x01: "Auto_Open", 0x02: "Auto_Close", 0x06: "Print_Area" };
            if (nameLen === 1 && nameStr.charCodeAt(0) < 0x20) {
                var builtIn = builtInNames[nameStr.charCodeAt(0)];
                if (builtIn) nameStr = builtIn;
                else nameStr = "BuiltIn_" + fmtHex(nameStr.charCodeAt(0), 2);
            }
            var isHidden = (nameGrbit & 0x0001) ? true : false;
            nameRecords.push({ name: nameStr, hidden: isHidden, itab: nameItab, fmlaSize: nameFmlaSize });
        }
        else if (recType === 0x01AE && !globalsDone) {
            // SUPBOOK
            supbookCount++;
        }
        else if (recType === 0x00FC && !globalsDone) {
            // SST — Shared String Table
            sstTotal = u32(wbData, pos + 4);
            sstUnique = u32(wbData, pos + 8);
            // Parse first few strings
            var sstOff = pos + 12;
            for (var si = 0; si < Math.min(sstUnique, 20); si++) {
                if (sstOff + 3 > pos + 4 + recSize) break;
                var strLen = u16(wbData, sstOff);
                var strFlags = wbData[sstOff + 2];
                var isUnicode = (strFlags & 0x01) ? true : false;
                var hasRichText = (strFlags & 0x08) ? true : false;
                var hasExtended = (strFlags & 0x04) ? true : false;
                var strOff = sstOff + 3;
                var rtRuns = 0, extBytes = 0;
                if (hasRichText) { rtRuns = u16(wbData, strOff); strOff += 2; }
                if (hasExtended) { extBytes = u32(wbData, strOff); strOff += 4; }
                var str = "";
                if (isUnicode) {
                    for (var ci = 0; ci < Math.min(strLen, 50); ci++) {
                        if (strOff + ci * 2 + 1 >= wbData.length) break;
                        str += String.fromCharCode(u16(wbData, strOff + ci * 2));
                    }
                    sstOff = strOff + strLen * 2 + rtRuns * 4 + extBytes;
                } else {
                    for (var ci = 0; ci < Math.min(strLen, 50); ci++) {
                        if (strOff + ci >= wbData.length) break;
                        str += String.fromCharCode(wbData[strOff + ci]);
                    }
                    sstOff = strOff + strLen + rtRuns * 4 + extBytes;
                }
                sstStrings.push(str);
            }
            hf.log("SST: " + sstTotal + " total / " + sstUnique + " unique strings");
        }
        else if (recType === 0x000A && !globalsDone) {
            globalsDone = true;
        }

        pos += 4 + recSize;
    }

    hf.template.endStruct(); // Workbook_Stream
}

// ── Parse Sheet Substreams ───────────────────
var sheetData = [];  // per-sheet info: { recCounts, formulaHits, cellCount, rowRange, colRange }

if (hasBIFF && workbookEntry) {
    var wbData2 = await readStreamData(workbookEntry.startSec, workbookEntry.streamSize);

    for (var si = 0; si < boundSheets.length; si++) {
        var sheet = boundSheets[si];
        var pos = sheet.lbPlyPos;
        var info = { recCounts: {}, formulaHits: [], cellCount: 0, rowMin: 65536, rowMax: 0, colMin: 256, colMax: 0, recTotal: 0 };

        // Scan records in this substream
        var sheetDone = false;
        while (pos + 4 <= wbData2.length && !sheetDone) {
            var recType = u16(wbData2, pos);
            var recSize = u16(wbData2, pos + 2);
            if (pos + 4 + recSize > wbData2.length) break;
            var recName = BIFF_NAMES[recType] || fmtHex(recType, 4);
            info.recCounts[recName] = (info.recCounts[recName] || 0) + 1;
            info.recTotal++;

            // Track cell references
            if (recType === 0x00FD || recType === 0x027E || recType === 0x0203 ||
                recType === 0x0006 || recType === 0x0201) {
                // All these have row(u16) col(u16) at data[0..3]
                if (recSize >= 4) {
                    var r = u16(wbData2, pos + 4);
                    var c = u16(wbData2, pos + 6);
                    info.cellCount++;
                    if (r < info.rowMin) info.rowMin = r;
                    if (r > info.rowMax) info.rowMax = r;
                    if (c < info.colMin) info.colMin = c;
                    if (c > info.colMax) info.colMax = c;
                }
            }
            else if (recType === 0x00BD) {
                // MULRK: row(u16) colFirst(u16) ... colLast(u16)
                if (recSize >= 6) {
                    var r = u16(wbData2, pos + 4);
                    var cFirst = u16(wbData2, pos + 6);
                    var cLast = u16(wbData2, pos + 4 + recSize - 2);
                    info.cellCount += (cLast - cFirst + 1);
                    if (r < info.rowMin) info.rowMin = r;
                    if (r > info.rowMax) info.rowMax = r;
                    if (cFirst < info.colMin) info.colMin = cFirst;
                    if (cLast > info.colMax) info.colMax = cLast;
                }
            }

            // Detect suspicious FORMULA content in macro sheets
            if (recType === 0x0006 && sheet.dt === 0x01) {
                // FORMULA record in a macro sheet — check for XLM functions
                // Formula data starts at pos+4+20 (after row, col, xf, result, flags, chn)
                if (recSize > 20) {
                    var fmlaBytes = [];
                    for (var fb = 0; fb < Math.min(recSize - 20, 200); fb++) fmlaBytes.push(wbData2[pos + 24 + fb]);
                    // Check for tFunc/tFuncVar tokens referencing dangerous functions
                    // We'll scan raw bytes for common XLM function indices
                    var rawStr = "";
                    for (var fb = 0; fb < fmlaBytes.length; fb++) {
                        var ch = fmlaBytes[fb];
                        if (ch >= 0x20 && ch < 0x7F) rawStr += String.fromCharCode(ch);
                    }
                    var xlmKeywords = ["EXEC", "RUN", "CALL", "REGISTER", "HALT", "RETURN",
                        "ALERT", "FOPEN", "FWRITE", "FCLOSE", "FORMULA.FILL",
                        "SET.VALUE", "SET.NAME", "GET.CELL", "GET.WORKSPACE", "GET.WORKBOOK",
                        "CHAR", "CONCATENATE", "NOW", "FILES", "DIRECTORY"];
                    var rl = rawStr.toLowerCase();
                    for (var ki = 0; ki < xlmKeywords.length; ki++) {
                        if (rl.indexOf(xlmKeywords[ki].toLowerCase()) >= 0) {
                            if (info.formulaHits.indexOf(xlmKeywords[ki]) < 0) info.formulaHits.push(xlmKeywords[ki]);
                        }
                    }
                }
            }

            if (recType === 0x000A) sheetDone = true;
            pos += 4 + recSize;
        }

        if (info.rowMin > info.rowMax) { info.rowMin = 0; info.rowMax = 0; }
        if (info.colMin > info.colMax) { info.colMin = 0; info.colMax = 0; }
        sheetData.push(info);
    }
}

// ── Detect XLM / suspicious patterns ─────────
var xlmIndicators = [];
var xlmSuspicious = [];
var hasAutoOpen = false;
var hasVeryHidden = false;
var hasMacroSheet = false;

for (var si = 0; si < boundSheets.length; si++) {
    var sh = boundSheets[si];
    if (sh.dt === 0x01) {
        hasMacroSheet = true;
        xlmIndicators.push("Macro sheet: \"" + sh.name + "\"");
        if (sh.grbit === 2) { hasVeryHidden = true; xlmIndicators.push("Sheet is VERY HIDDEN"); }
        else if (sh.grbit === 1) xlmIndicators.push("Sheet is hidden");
    }
}
for (var ni = 0; ni < nameRecords.length; ni++) {
    var nm = nameRecords[ni];
    if (nm.name === "Auto_Open" || nm.name === "Auto_Close") {
        hasAutoOpen = true;
        xlmIndicators.push("Defined Name: " + nm.name);
    }
}
for (var si = 0; si < sheetData.length; si++) {
    if (boundSheets[si].dt === 0x01) {
        for (var hi = 0; hi < sheetData[si].formulaHits.length; hi++) {
            if (xlmSuspicious.indexOf(sheetData[si].formulaHits[hi]) < 0) xlmSuspicious.push(sheetData[si].formulaHits[hi]);
        }
    }
}

if (xlmIndicators.length > 0) {
    hf.warn("-- XLM Macros Detected --");
    for (var xi = 0; xi < xlmIndicators.length; xi++) hf.warn("  " + xlmIndicators[xi]);
    if (xlmSuspicious.length > 0) hf.warn("  Suspicious: " + xlmSuspicious.join(", "));
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

function _biffRec(typeHex, color, name, detail) {
    var rgb = _hexRgb(color);
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;font-size:11px;font-family:var(--font-mono);' +
        'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.04);border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.12)">' +
        '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.15);color:' + color + ';font-weight:600">' + typeHex + '</span>' +
        '<span style="color:' + color + ';font-weight:600;flex:1">' + name + '</span>' +
        '<span style="color:var(--color-text-muted);font-size:10px">' + detail + '</span></div>';
}

function _renderView() {
    // ═══ LEFT: Sector Map ═══
    var mapHtml = '<div style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;text-align:center;flex-shrink:0;margin-bottom:2px">Sectors</div>';
    var sectors = [
        { name: "OLE2", color: "#16a34a", grow: 16 },
        { name: "FAT", color: "#f97316", grow: 8 },
        { name: "DIR", color: "#fbbf24", grow: 6 }
    ];
    // Globals portion
    sectors.push({ name: "Globals", color: "#22d3ee", grow: 20 });
    // Sheet blocks
    for (var si = 0; si < Math.min(boundSheets.length, 4); si++) {
        var sh = boundSheets[si];
        var shColor = sh.dt === 0x01 ? "#ef4444" : (si === 0 ? "#3b82f6" : "#a855f7");
        var shGrow = Math.max(6, Math.min(20, (sheetData[si] ? sheetData[si].cellCount : 5) / 10));
        sectors.push({ name: sh.name.substring(0, 5), color: shColor, grow: shGrow });
    }

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

    // ── Card 1: OLE2 Container + Directory ──
    var hC = _cardHdr("\u25A3", "#16a34a", "OLE2 Container + Directory",
        "Compound Binary File \xB7 Sector size " + sectorSize + "B", "D0 CF 11 E0", "0:512");

    // Directory tree
    hC += '<div style="margin-top:10px;font-size:11px;font-family:var(--font-mono);display:flex;flex-direction:column;gap:2px">';
    var DIR_ICONS = { 5: "\uD83D\uDCC1", 1: "\uD83D\uDCC1", 2: "\uD83D\uDCC4" };
    var maxDir = Math.min(dirEntries.length, 8);
    for (var di = 0; di < maxDir; di++) {
        var e = dirEntries[di];
        var ec = (e.name === "Workbook" || e.name === "Book") ? "#22d3ee" :
                 e.objType === 5 ? "#16a34a" : e.objType === 1 ? "#f97316" : "#94a3b8";
        var er = _hexRgb(ec);
        var isStorage = (e.objType === 1 || e.objType === 5);
        var indent = (e.objType === 5) ? 0 : 16;
        var typeTag = isStorage ? "Storage" : fmtSz(e.streamSize);
        var extra = (e.name === "Workbook" || e.name === "Book") ? ' \u2190 BIFF8 records' : '';
        hC += '<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;padding-left:' + (6 + indent) + 'px;border-radius:4px;' +
            'background:rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.04);border:1px solid rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.1)">' +
            '<span style="font-size:11px">' + (DIR_ICONS[e.objType] || "\uD83D\uDCC4") + '</span>' +
            '<span style="color:' + ec + ';font-weight:' + (isStorage ? '700' : '400') + ';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e.name + '</span>' +
            '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(' + er[0] + ',' + er[1] + ',' + er[2] + ',0.1);color:' + ec + ';flex-shrink:0">' + typeTag + extra + '</span></div>';
    }
    if (dirEntries.length > 8) hC += '<div style="font-size:10px;color:var(--color-text-muted);text-align:center;padding:3px">+' + (dirEntries.length - 8) + ' more...</div>';
    hC += '</div>';
    hC += '<div style="margin-top:6px;font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">XLS stores everything (macros included) inside the Workbook stream as BIFF records \u2014 no separate VBA storage like DOC.</div>';
    cards += _card("#16a34a", hC);

    cards += _arrow("Root Entry \u2192 Workbook stream \u2192 Sequential BIFF records", "#16a34a", "#22d3ee");

    // ── BIFF record format explanation ──
    var fmtC = '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);margin-bottom:6px">Every BIFF record follows the same layout:</div>';
    fmtC += '<div style="display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px">';
    fmtC += '<div style="padding:4px 10px;border-radius:4px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.2);color:#22d3ee">Type <span style="color:var(--color-text-muted)">2B</span></div>';
    fmtC += '<div style="padding:4px 10px;border-radius:4px;background:rgba(20,184,166,0.12);border:1px solid rgba(20,184,166,0.2);color:#14b8a6">Size <span style="color:var(--color-text-muted)">2B</span></div>';
    fmtC += '<div style="padding:4px 10px;border-radius:4px;background:rgba(100,116,139,0.08);border:1px solid rgba(100,116,139,0.15);color:var(--color-text-muted);flex:1;text-align:center">Data <span style="color:var(--color-text-muted)">0\u20138224 B</span></div>';
    fmtC += '</div>';
    cards += '<div style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:8px;padding:10px;margin-bottom:6px">' + fmtC + '</div>';

    // ── Card 2: Workbook Globals Substream ──
    var bofTypeName = hasBIFF ? (biffVersion === 0x0600 ? "BIFF8" : "BIFF" + fmtHex(biffVersion, 4)) : "?";
    var gC = _cardHdr("\u2699", "#22d3ee", "Workbook Globals Substream",
        "BOF (type 0x0005 = Workbook) \u2192 EOF", bofTypeName, null);

    // Global records as BIFF rec items
    gC += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">';
    gC += _biffRec("0x0809", "#22d3ee", "BOF", "BIFF8 \xB7 vers " + fmtHex(biffVersion, 4) + " \xB7 type 0x0005 (Workbook)");

    if (codepage) {
        var cpName = codepage === 0x04B0 ? "UTF-16LE" : (codepage === 0x04E4 ? "cp1252" : fmtHex(codepage, 4));
        gC += _biffRec("0x0042", "#94a3b8", "CODEPAGE", cpName + " (" + fmtHex(codepage, 4) + ")");
    }
    if (dateMode !== undefined) gC += _biffRec("0x0022", "#94a3b8", "DATEMODE", (dateMode === 0 ? "1900" : "1904") + " date system");
    if (fontRecords.length > 0) gC += _biffRec("0x0031", "#94a3b8", "FONT", "\xD7" + fontRecords.length + " (" + fontRecords.map(function(f) { return f.name + " " + f.height + "pt"; }).slice(0, 3).join(", ") + (fontRecords.length > 3 ? " ..." : "") + ")");
    if (formatRecords.length > 0) gC += _biffRec("0x041E", "#94a3b8", "FORMAT", "\xD7" + formatRecords.length + " (" + formatRecords.map(function(f) { return f.str; }).slice(0, 2).join(", ") + " ...)");
    if (xfCount > 0) gC += _biffRec("0x00E0", "#94a3b8", "XF", "\xD7" + xfCount + " extended format records");

    // BOUNDSHEET records — key records
    for (var si = 0; si < boundSheets.length; si++) {
        var sh = boundSheets[si];
        var shColor = sh.dt === 0x01 ? "#ef4444" : (sh.grbit > 0 ? "#f97316" : "#3b82f6");
        var visBadge = sh.grbit === 0 ? "visible" : (sh.grbit === 1 ? "hidden" : "\u26A0 VERY HIDDEN");
        var typeInfo = sh.sheetType !== "Worksheet" ? " \xB7 type: " + sh.sheetType : "";
        var shRgb = _hexRgb(shColor);
        gC += '<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;font-size:11px;font-family:var(--font-mono);' +
            'background:rgba(' + shRgb[0] + ',' + shRgb[1] + ',' + shRgb[2] + ',0.04);border:1px solid rgba(' + shRgb[0] + ',' + shRgb[1] + ',' + shRgb[2] + ',0.15)">' +
            '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(' + shRgb[0] + ',' + shRgb[1] + ',' + shRgb[2] + ',0.15);color:' + shColor + ';font-weight:600">0x0085</span>' +
            '<span style="color:' + shColor + ';font-weight:600;flex:1">BOUNDSHEET</span>' +
            '<span style="color:' + shColor + '">"' + sh.name + '"</span>' +
            '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(' + shRgb[0] + ',' + shRgb[1] + ',' + shRgb[2] + ',0.1);color:' + shColor + '">' + visBadge + typeInfo + '</span></div>';
    }

    if (sstUnique > 0) gC += _biffRec("0x00FC", "#14b8a6", "SST \u2014 Shared String Table", sstUnique + " unique strings");
    if (supbookCount > 0) gC += _biffRec("0x01AE", "#f97316", "SUPBOOK", "Self-reference (internal)");
    gC += _biffRec("0x000A", "#22d3ee", "EOF", "End of Workbook Globals");
    gC += '</div>';

    // BOUNDSHEET detail
    gC += '<div style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(34,211,238,0.03);border:1px solid rgba(34,211,238,0.1)">';
    gC += '<div style="font-size:9px;font-family:var(--font-mono);color:rgba(34,211,238,0.6);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">BOUNDSHEET Record Structure (0x0085)</div>';
    gC += '<div style="display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;flex-wrap:wrap">';
    gC += '<div style="padding:3px 8px;border-radius:4px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);color:#3b82f6">lbPlyPos <span style="color:var(--color-text-muted)">4B</span><br/><span style="font-size:8px;color:var(--color-text-muted)">offset to BOF</span></div>';
    gC += '<div style="padding:3px 8px;border-radius:4px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);color:#fbbf24">grbit <span style="color:var(--color-text-muted)">2B</span><br/><span style="font-size:8px;color:var(--color-text-muted)">visibility</span></div>';
    gC += '<div style="padding:3px 8px;border-radius:4px;background:rgba(100,116,139,0.08);border:1px solid rgba(100,116,139,0.15);color:var(--color-text-muted)">dt <span style="color:var(--color-text-muted)">1B</span><br/><span style="font-size:8px">sheet type</span></div>';
    gC += '<div style="padding:3px 8px;border-radius:4px;background:rgba(100,116,139,0.08);border:1px solid rgba(100,116,139,0.15);color:var(--color-text-muted);flex:1;text-align:center">stName<br/><span style="font-size:8px">sheet name</span></div>';
    gC += '</div>';
    gC += '<div style="margin-top:6px;font-size:9px;font-family:var(--font-mono);color:#f97316">grbit: 0x00=visible \xB7 0x01=hidden \xB7 <span style="color:#ef4444;font-weight:700">0x02=VERY HIDDEN</span> (only unhideable via VBA)</div>';
    gC += '</div>';
    cards += _card("#22d3ee", gC);

    cards += _arrow("BOUNDSHEET.lbPlyPos \u2192 Sheet substream BOF", "#22d3ee", "#3b82f6");

    // ── Card 3+4: Sheet substreams (side by side) ──
    cards += '<div style="display:flex;flex-wrap:wrap;gap:8px">';

    // Normal sheets
    for (var si = 0; si < Math.min(boundSheets.length, 4); si++) {
        var sh = boundSheets[si];
        if (sh.dt === 0x01) continue; // macro sheets shown separately
        var sd = sheetData[si] || { recCounts: {}, cellCount: 0, rowMin: 0, rowMax: 0, colMin: 0, colMax: 0, recTotal: 0 };
        var shColor = si === 0 ? "#3b82f6" : "#a855f7";
        var bofTypeName2 = sh.dt === 0x02 ? "Chart" : "Worksheet";

        var sC = _cardHdr("\u25A6", shColor, sh.name + " Substream",
            "BOF (type " + fmtHex(sh.dt === 0x02 ? 0x0020 : 0x0010, 4) + " = " + bofTypeName2 + ") \u2192 EOF", null, null);
        sC += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:2px">';
        sC += _biffRec("0x0809", shColor, "BOF", bofTypeName2);
        if (sd.recCounts["ROW"]) sC += _biffRec("0x0208", "#94a3b8", "ROW", "\xD7" + sd.recCounts["ROW"] + " row blocks");
        if (sd.recCounts["LABELSST"]) sC += _biffRec("0x00FD", "#14b8a6", "LABELSST", "SST index \u2192 string");
        if (sd.recCounts["RK"]) sC += _biffRec("0x027E", "#16a34a", "RK", "\xD7" + sd.recCounts["RK"] + " encoded numbers");
        if (sd.recCounts["MULRK"]) sC += _biffRec("0x00BD", "#16a34a", "MULRK", "\xD7" + sd.recCounts["MULRK"] + " multiple RK");
        if (sd.recCounts["NUMBER"]) sC += _biffRec("0x0203", "#16a34a", "NUMBER", "\xD7" + sd.recCounts["NUMBER"] + " IEEE 754");
        if (sd.recCounts["FORMULA"]) sC += _biffRec("0x0006", "#fbbf24", "FORMULA", "\xD7" + sd.recCounts["FORMULA"]);
        sC += _biffRec("0x000A", shColor, "EOF", "");
        sC += '</div>';

        // Cell stats
        if (sd.cellCount > 0) {
            sC += '<div style="margin-top:8px;padding:6px;border-radius:6px;background:rgba(100,116,139,0.04);border:1px solid rgba(100,116,139,0.1);font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted)">';
            sC += sd.cellCount + ' cells \xB7 rows ' + sd.rowMin + '\u2013' + sd.rowMax + ' \xB7 cols ' + sd.colMin + '\u2013' + sd.colMax;
            sC += '</div>';
        }
        cards += '<div style="flex:1 1 200px;min-width:200px">' + _card(shColor, sC) + '</div>';
    }

    // SST card
    if (sstUnique > 0) {
        var sstC = _cardHdr("\u25C8", "#14b8a6", "SST \u2014 Shared String Table",
            sstUnique + " unique strings \xB7 Deduplicated pool", "0x00FC", null);
        sstC += '<div style="margin-top:8px;font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);margin-bottom:6px">All text cells reference SST by index via LABELSST records.</div>';
        sstC += '<div style="display:flex;flex-direction:column;gap:2px">';
        for (var si = 0; si < Math.min(sstStrings.length, 6); si++) {
            var stRgb = _hexRgb("#14b8a6");
            sstC += '<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;background:rgba(' + stRgb[0] + ',' + stRgb[1] + ',' + stRgb[2] + ',0.04);border:1px solid rgba(' + stRgb[0] + ',' + stRgb[1] + ',' + stRgb[2] + ',0.1);font-size:10px;font-family:var(--font-mono)">' +
                '<span style="color:var(--color-text-muted);width:24px">[' + si + ']</span>' +
                '<span style="color:#5eead4">"' + sstStrings[si].substring(0, 40) + (sstStrings[si].length > 40 ? '...' : '') + '"</span></div>';
        }
        if (sstUnique > 6) sstC += '<div style="font-size:10px;color:var(--color-text-muted);text-align:center;padding:3px">\u2026 ' + (sstUnique - 6) + ' more strings</div>';
        sstC += '</div>';
        cards += '<div style="flex:1 1 200px;min-width:200px">' + _card("#14b8a6", sstC) + '</div>';
    }

    cards += '</div>'; // close flex wrapper

    // ── Card 5: XLM Macro Sheet (if present) ──
    if (hasMacroSheet) {
        cards += _arrow("BOUNDSHEET \u2192 Macro sheet substream", "#3b82f6", "#ef4444");

        for (var si = 0; si < boundSheets.length; si++) {
            var sh = boundSheets[si];
            if (sh.dt !== 0x01) continue;
            var sd = sheetData[si] || { recCounts: {}, formulaHits: [], cellCount: 0, recTotal: 0, rowMin: 0, rowMax: 0, colMin: 0, colMax: 0 };
            var visBadge = sh.grbit === 2 ? "\u26A0 VERY HIDDEN" : (sh.grbit === 1 ? "HIDDEN" : "\u26A0 MACROS");

            var mC = _cardHdr("\u2699", "#ef4444", "XLM 4.0 Macro Sheet \u2014 \"" + sh.name + "\"",
                "FORMULA records containing XLM macro functions", visBadge, null);

            // XLM != VBA info box
            mC += '<div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(251,191,36,0.04);border:1px solid rgba(251,191,36,0.1)">';
            mC += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:12px;color:#fbbf24">\u26A0</span><span style="font-size:10px;font-weight:700;color:#fbbf24">XLM \u2260 VBA</span></div>';
            mC += '<div style="font-size:10px;color:var(--color-text-muted)">XLM 4.0 macros are stored as FORMULA records in cell data \u2014 not as VBA source code. Each cell contains one macro function, executed top-to-bottom like a script.</div>';
            mC += '</div>';

            // Sheet records
            mC += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:2px">';
            mC += _biffRec("0x0809", "#ef4444", "BOF", "Macro sheet");
            if (sd.recCounts["FORMULA"]) mC += _biffRec("0x0006", "#fbbf24", "FORMULA", "\xD7" + sd.recCounts["FORMULA"] + " XLM macro cells");
            if (sd.recCounts["LABELSST"]) mC += _biffRec("0x00FD", "#14b8a6", "LABELSST", "\xD7" + sd.recCounts["LABELSST"]);
            mC += _biffRec("0x000A", "#ef4444", "EOF", "");
            mC += '</div>';

            // Auto-open mechanism
            if (hasAutoOpen) {
                mC += '<div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.1)">';
                mC += '<div style="font-size:9px;font-family:var(--font-mono);color:rgba(239,68,68,0.6);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Auto-Execute Mechanism</div>';
                mC += '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:10px;font-family:var(--font-mono)">';
                var aeRgb = _hexRgb("#ef4444");
                mC += '<div style="padding:4px 8px;border-radius:6px;background:rgba(' + aeRgb[0] + ',' + aeRgb[1] + ',' + aeRgb[2] + ',0.06);border:1px solid rgba(' + aeRgb[0] + ',' + aeRgb[1] + ',' + aeRgb[2] + ',0.12);color:#fca5a5">Defined Name<br/><span style="color:#ef4444;font-weight:700">Auto_Open</span></div>';
                mC += '<span style="color:var(--color-text-muted)">\u2192</span>';
                var orRgb = _hexRgb("#f97316");
                mC += '<div style="padding:4px 8px;border-radius:6px;background:rgba(' + orRgb[0] + ',' + orRgb[1] + ',' + orRgb[2] + ',0.06);border:1px solid rgba(' + orRgb[0] + ',' + orRgb[1] + ',' + orRgb[2] + ',0.12);color:#fdba74">Points to<br/><span style="color:#f97316;font-weight:700">' + sh.name + '!$A$1</span></div>';
                mC += '<span style="color:var(--color-text-muted)">\u2192</span>';
                var ylRgb = _hexRgb("#fbbf24");
                mC += '<div style="padding:4px 8px;border-radius:6px;background:rgba(' + ylRgb[0] + ',' + ylRgb[1] + ',' + ylRgb[2] + ',0.06);border:1px solid rgba(' + ylRgb[0] + ',' + ylRgb[1] + ',' + ylRgb[2] + ',0.12);color:#fde68a">Executes cells<br/><span style="color:#fbbf24;font-weight:700">sequentially</span></div>';
                mC += '</div></div>';
            }

            // Detection flags
            if (xlmSuspicious.length > 0) {
                mC += '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px">';
                for (var xi = 0; xi < xlmSuspicious.length; xi++) {
                    var kw = xlmSuspicious[xi];
                    var kwColor = (kw === "EXEC" || kw === "RUN" || kw === "CALL" || kw === "REGISTER") ? "#ef4444" : "#f97316";
                    var kwRgb = _hexRgb(kwColor);
                    mC += '<div style="display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:4px;background:rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.05);border:1px solid rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.15)">' +
                        '<span style="font-size:10px;color:' + kwColor + '">\u26A0</span>' +
                        '<span style="font-size:10px;font-family:var(--font-mono);color:' + kwColor + ';font-weight:700">' + kw + '</span></div>';
                }
                mC += '</div>';
            }

            cards += _card("#ef4444", mC);
        }
    }

    // ═══ RIGHT: Insight Panel ═══
    var _st = function(t) { return '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">' + t + '</div>'; };
    var _dv = '<div style="height:1px;background:var(--color-border);margin:12px 0"></div>';
    var ins = "";

    // Workbook Summary
    ins += '<div style="padding:4px 0">' + _st("Workbook Summary") + '<div style="display:flex;flex-direction:column;gap:6px">';
    var excelVer = biffVersion === 0x0600 ? "Excel 97-2003 (.xls)" : "BIFF " + fmtHex(biffVersion, 4);
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(22,163,74,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#16a34a;flex-shrink:0">\u25CE</div>' +
        '<div><div style="font-size:12px;color:#4ade80;font-weight:600">' + excelVer + '</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">BIFF8 \xB7 OLE2 v' + majorVer + '</div></div></div>';
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#3b82f6;flex-shrink:0">\u25A6</div>' +
        '<div><div style="font-size:12px;color:#93c5fd;font-weight:600">' + boundSheets.length + ' Sheet' + (boundSheets.length !== 1 ? 's' : '') + '</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">';
    var visCount = 0, hidCount = 0, vhidCount = 0;
    for (var si = 0; si < boundSheets.length; si++) {
        if (boundSheets[si].grbit === 0) visCount++;
        else if (boundSheets[si].grbit === 1) hidCount++;
        else vhidCount++;
    }
    ins += visCount + ' visible';
    if (hidCount > 0) ins += ' + ' + hidCount + ' hidden';
    if (vhidCount > 0) ins += ' + ' + vhidCount + ' very hidden';
    ins += '</div></div></div>';

    if (hasMacroSheet) {
        ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#ef4444;flex-shrink:0">\u26A0</div>' +
            '<div><div style="font-size:12px;color:#f87171;font-weight:600">XLM 4.0 Macros</div>' +
            '<div style="color:var(--color-text-muted);font-size:10px">Hidden macro sheet detected</div></div></div>';
    }
    ins += '</div></div>' + _dv;

    // BIFF Record Stats
    ins += '<div style="padding:4px 0">' + _st("BIFF Record Stats") + '<div style="display:flex;flex-direction:column;gap:5px">';
    var statTypes = [
        { name: "FORMULA", color: "#3b82f6", c2: "#1d4ed8" },
        { name: "RK", color: "#16a34a", c2: "#15803d" },
        { name: "MULRK", color: "#16a34a", c2: "#15803d" },
        { name: "LABELSST", color: "#14b8a6", c2: "#0d9488" },
        { name: "ROW", color: "#94a3b8", c2: "#475569" }
    ];
    var maxRecCount = 1;
    for (var ti = 0; ti < statTypes.length; ti++) {
        var cnt = recTypeCounts[statTypes[ti].name] || 0;
        if (cnt > maxRecCount) maxRecCount = cnt;
    }
    for (var ti = 0; ti < statTypes.length; ti++) {
        var st = statTypes[ti];
        var cnt = recTypeCounts[st.name] || 0;
        if (cnt === 0) continue;
        var pct = Math.max(5, Math.min(100, cnt / maxRecCount * 100));
        ins += '<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:' + st.color + ';font-family:var(--font-mono)">' + st.name + '</span>' +
            '<span style="color:var(--color-text-muted);font-family:var(--font-mono)">' + cnt + '</span></div>' +
            '<div style="height:5px;border-radius:3px;background:linear-gradient(90deg,' + st.color + ',' + st.c2 + ');width:' + pct.toFixed(0) + '%"></div></div>';
    }
    ins += '</div></div>' + _dv;

    // Threat Assessment (if macros present)
    if (hasMacroSheet) {
        ins += '<div style="padding:4px 0">' + _st("Threat Assessment") + '<div style="display:flex;flex-direction:column;gap:3px">';
        var threats = [
            { n: "XLM Macro Risk", v: "HIGH", color: "#ef4444" },
            { n: "Auto_Open", v: hasAutoOpen ? "YES" : "NO", color: hasAutoOpen ? "#ef4444" : "#16a34a" },
            { n: "Hidden Sheet", v: hasVeryHidden ? "VERY HIDDEN" : (boundSheets.some(function(s) { return s.grbit === 1 && s.dt === 0x01; }) ? "HIDDEN" : "NO"), color: hasVeryHidden ? "#ef4444" : "#16a34a" }
        ];
        for (var ti = 0; ti < threats.length; ti++) {
            var t = threats[ti];
            var tRgb = _hexRgb(t.color);
            ins += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:4px;' +
                'background:rgba(' + tRgb[0] + ',' + tRgb[1] + ',' + tRgb[2] + ',0.06);border:1px solid rgba(' + tRgb[0] + ',' + tRgb[1] + ',' + tRgb[2] + ',0.15)">' +
                '<span style="font-size:10px;color:' + t.color + '">' + t.n + '</span>' +
                '<span style="font-size:9px;font-family:var(--font-mono);color:' + t.color + ';font-weight:700">' + t.v + '</span></div>';
        }
        // Suspicious functions
        for (var xi = 0; xi < xlmSuspicious.length; xi++) {
            var kw = xlmSuspicious[xi];
            var kwColor = (kw === "EXEC" || kw === "RUN" || kw === "CALL") ? "#ef4444" : "#f97316";
            var kwRgb = _hexRgb(kwColor);
            ins += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:4px;' +
                'background:rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.06);border:1px solid rgba(' + kwRgb[0] + ',' + kwRgb[1] + ',' + kwRgb[2] + ',0.15)">' +
                '<span style="font-size:10px;color:' + kwColor + '">' + kw + '()</span>' +
                '<span style="font-size:9px;font-family:var(--font-mono);color:' + kwColor + ';font-weight:700">DETECTED</span></div>';
        }
        ins += '</div></div>' + _dv;
    }

    // File Composition
    ins += '<div style="padding:4px 0">' + _st("File Composition");
    var comp = [];
    if (workbookEntry) comp.push({ l: "Workbook", s: workbookEntry.streamSize, c: "#22d3ee", c2: "#0891b2" });
    comp.push({ l: "Header+FAT+Dir", s: 512 + numFATSectors * sectorSize + dirChain.length * sectorSize, c: "#f97316", c2: "#c2410c" });
    for (var di = 0; di < dirEntries.length; di++) {
        var e = dirEntries[di];
        if (e.objType === 2 && e.name !== "Workbook" && e.name !== "Book" && e.streamSize > 0) {
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
