// HexForge JS Template - Workbook.js
// Purpose: MS-XLS Workbook Stream (BIFF8 Record Chain)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Document
// ID Bytes: 09 08 (BOF record type 0x0809 at offset 0)
// Reference: [MS-XLS] https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls

var fileSize = await hf.fileSize;

hf.template.begin("Workbook Stream (XLS BIFF8)");
hf.template.setFormat("xls_wb", "XLS Workbook Stream", [".xls", ".xlt"]);

// ──────────────────────────────────────────────
// Validate first record is BOF
// ──────────────────────────────────────────────
if (fileSize < 4) {
    hf.error("Not a Workbook stream (too small)");
    await hf.template.end();
    throw new Error("Invalid Workbook stream");
}

var sigBuf = await hf.read(0, 4);
var firstRecType = sigBuf[0] | (sigBuf[1] << 8);
if (firstRecType !== 0x0809) {
    hf.error("Not a BIFF8 Workbook stream (first record must be BOF 0x0809, got 0x" +
        firstRecType.toString(16).toUpperCase().padStart(4, "0") + ")");
    await hf.template.end();
    throw new Error("Invalid Workbook stream");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n, "0"); }
function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
}

// BIFF8 Unicode string reader
function readXLUniStr(buf, off, lenBytes) {
    // lenBytes: 1 = byte length prefix, 2 = u16 length prefix
    var cch, flags, pos;
    if (lenBytes === 1) {
        cch = buf[off]; pos = off + 1;
    } else {
        cch = u16(buf, off); pos = off + 2;
    }
    flags = buf[pos]; pos++;
    var compressed = (flags & 0x01) === 0;
    var hasRichText = (flags & 0x08) !== 0;
    var hasExtData = (flags & 0x04) !== 0;
    var rtCount = 0, extSize = 0;
    if (hasRichText) { rtCount = u16(buf, pos); pos += 2; }
    if (hasExtData) { extSize = u32(buf, pos); pos += 4; }
    var str = "";
    if (compressed) {
        for (var i = 0; i < cch && pos + i < buf.length; i++)
            str += String.fromCharCode(buf[pos + i]);
        pos += cch;
    } else {
        for (var i = 0; i < cch && pos + i * 2 + 1 < buf.length; i++)
            str += String.fromCharCode(u16(buf, pos + i * 2));
        pos += cch * 2;
    }
    pos += rtCount * 4 + extSize;
    return { str: str, bytesRead: pos - off };
}

// ──────────────────────────────────────────────
// BIFF8 Record Types — [MS-XLS] §2.3
// ──────────────────────────────────────────────
var REC = {
    0x0006:"Formula",0x000A:"EOF",0x000C:"CalcCount",0x000D:"CalcMode",
    0x000E:"CalcPrecision",0x000F:"CalcRefMode",0x0010:"CalcDelta",
    0x0011:"CalcIter",0x0012:"Protect",0x0013:"Password",0x0014:"Header",
    0x0015:"Footer",0x0016:"ExternCount",0x0017:"ExternSheet",
    0x0018:"Lbl",0x0019:"WinProtect",0x001A:"VerticalPageBreaks",
    0x001B:"HorizontalPageBreaks",0x001C:"Note",0x001D:"Selection",
    0x001E:"Format_Old",0x0022:"Date1904",0x0026:"LeftMargin",
    0x0027:"RightMargin",0x0028:"TopMargin",0x0029:"BottomMargin",
    0x002A:"PrintRowCol",0x002B:"PrintGrid",0x002F:"FilePass",
    0x0031:"Font",0x0033:"PrintSize",0x003C:"Continue",0x003D:"Window1",
    0x003E:"Window2_Old",0x0040:"Backup",0x0041:"Pane",0x0042:"CodePage",
    0x004D:"Pls",0x0050:"DCon",0x0051:"DConRef",0x0052:"DConName",
    0x0055:"DefColWidth",0x005B:"FileLock",0x005C:"WriteAccess",
    0x005D:"Obj",0x005E:"Uncalced",0x005F:"CalcSaveRecalc",
    0x0060:"Template",0x0061:"Intl",0x0063:"ObjProtect",0x007D:"ColInfo",
    0x007F:"Imdata",0x0080:"Guts",0x0081:"WsBool",0x0082:"GridSet",
    0x0083:"HCenter",0x0084:"VCenter",0x0085:"BoundSheet8",
    0x0086:"WriteProtect",0x008C:"Country",0x008D:"HideObj",
    0x0090:"Sort",0x0092:"Palette",0x0097:"Sync",0x0098:"LPr",
    0x009B:"FilterMode",0x009C:"BuiltInFnGroupCount",
    0x009D:"AutoFilterInfo",0x009E:"AutoFilter",
    0x00A1:"SCENARIO",0x00AE:"ScenProtect",
    0x00B0:"SxView",0x00B1:"SxVD",0x00B2:"SXVI",
    0x00BC:"ShrFmla",0x00BD:"MulRk",0x00BE:"MulBlank",
    0x00C1:"Mms",0x00C5:"SXDI",0x00DA:"BookBool",
    0x00E0:"XF",0x00E1:"InterfaceHdr",0x00E2:"InterfaceEnd",
    0x00E3:"SXVS",0x00E5:"MergedCells",0x00EB:"MsodrawingGroup",
    0x00EC:"MsodrawingSelection",0x00ED:"Msodrawing",
    0x00EF:"PhoneticInfo",0x00F6:"SxDXF",
    0x00FC:"SST",0x00FD:"LabelSst",0x00FF:"ExtSST",
    0x013D:"TabId",0x0160:"UserSViewBegin",0x0161:"UserSViewEnd",
    0x01AF:"FeatHdr11",0x01B0:"Feature11",0x01B1:"Feature12",
    0x01B2:"List12",0x0200:"Dimensions",0x0201:"Blank",
    0x0203:"Number",0x0204:"Label",0x0205:"BoolErr",
    0x0207:"String",0x0208:"Row",0x020B:"Index",
    0x021B:"Array",0x0225:"DefaultRowHeight",0x0236:"Table",
    0x023E:"Window2",0x027E:"Rk",0x0293:"Style",
    0x041E:"Format",0x04BC:"ShrFmla2",
    0x0800:"HLink",0x0801:"HLinkTooltip",0x0809:"BOF",
    0x080A:"OleDbConn",0x0812:"ContinueFrt",
    0x0862:"SheetExt",0x0863:"BookExt",0x0864:"SXAddl",
    0x0867:"FeatHdr",0x0868:"Feat",0x0872:"ListObj",
    0x0898:"ForceFullCalculation",0x089B:"TableStyles",
    0x08A9:"HeaderFooter",
    0x1002:"Chart",0x1003:"Series",0x1006:"DataFormat",
    0x1007:"LineFormat",0x1014:"ChartFormat",0x1015:"Legend",
    0x1033:"Begin",0x1034:"End",
};

// BOF dt values
var BOF_DT = {
    0x0005: "Workbook Globals",
    0x0010: "Worksheet/Dialog",
    0x0020: "Chart",
    0x0040: "Macro Sheet",
    0x0100: "Workspace"
};

// CodePage values
var CODEPAGES = {
    367: "ASCII", 437: "IBM PC", 720: "Arabic", 737: "Greek",
    775: "Baltic", 850: "Latin I", 852: "Latin II", 855: "Cyrillic",
    857: "Turkish", 858: "Latin I + Euro", 860: "Portuguese",
    861: "Icelandic", 862: "Hebrew", 863: "French Canadian",
    864: "Arabic2", 865: "Nordic", 866: "Russian", 869: "Modern Greek",
    874: "Thai", 932: "Japanese Shift-JIS", 936: "Chinese GBK",
    949: "Korean", 950: "Chinese Big5",
    1200: "UTF-16LE", 1250: "Latin II (Windows)",
    1251: "Cyrillic (Windows)", 1252: "Latin I (Windows)",
    1253: "Greek (Windows)", 1254: "Turkish (Windows)",
    1255: "Hebrew (Windows)", 1256: "Arabic (Windows)",
    1257: "Baltic (Windows)", 1258: "Vietnamese (Windows)",
    10000: "Apple Roman", 65001: "UTF-8"
};

// ──────────────────────────────────────────────
// Colors — Material Design palette
// ──────────────────────────────────────────────
var CLR = {
    BOF:     "#2196F3",  // Blue  — BOF/EOF delimiters
    EOF:     "#2196F3",
    GLOBAL:  "#4CAF50",  // Green — Global settings
    SHEET:   "#FF9800",  // Orange — Sheet info
    FONT:    "#9C27B0",  // Purple — Font records
    XF:      "#E91E63",  // Pink — XF (cell format)
    FORMAT:  "#F44336",  // Red — Number formats
    STYLE:   "#795548",  // Brown — Style records
    SST:     "#00BCD4",  // Cyan — Shared Strings
    CELL:    "#FF5722",  // Deep Orange — Cell data
    ROW:     "#607D8B",  // Blue Grey — Row/Col info
    DRAW:    "#3F51B5",  // Indigo — Drawing
    CALC:    "#CDDC39",  // Lime — Calc settings
    PAGE:    "#009688",  // Teal — Page layout
    WINDOW:  "#673AB7",  // Deep Purple — Window settings
    CONT:    "#FFC107",  // Amber — Continue
    FRT:     "#8BC34A",  // Light Green — Future records
    LINK:    "#03A9F4",  // Light Blue — Hyperlinks
    GREY:    "#9E9E9E",  // Grey — Unknown/reserved
};

// Category coloring
function recColor(rt) {
    if (rt === 0x0809) return CLR.BOF;
    if (rt === 0x000A) return CLR.EOF;
    if (rt === 0x003C) return CLR.CONT;
    // Globals
    if ([0x000D,0x000E,0x000F,0x0010,0x0011,0x000C,0x005F,0x0022,0x00DA,
         0x0042,0x008C,0x008D,0x009C,0x00C1,0x00E1,0x00E2,0x005C,
         0x0040,0x012F,0x013D,0x002F,0x0012,0x0013,0x0019,0x005B,0x0086].indexOf(rt) >= 0)
        return CLR.GLOBAL;
    // Sheet info
    if (rt === 0x0085) return CLR.SHEET;
    // Fonts
    if (rt === 0x0031) return CLR.FONT;
    // XF
    if (rt === 0x00E0) return CLR.XF;
    // Format
    if (rt === 0x041E || rt === 0x001E) return CLR.FORMAT;
    // Style
    if (rt === 0x0293) return CLR.STYLE;
    // SST
    if (rt === 0x00FC || rt === 0x00FF) return CLR.SST;
    // Cell records
    if ([0x0006,0x0201,0x0203,0x0204,0x0205,0x0207,0x00FD,0x00BD,0x00BE,0x027E].indexOf(rt) >= 0)
        return CLR.CELL;
    // Row/Col
    if ([0x0208,0x007D,0x0055,0x0200,0x0225,0x020B,0x0080].indexOf(rt) >= 0)
        return CLR.ROW;
    // Drawing
    if ([0x00EB,0x00EC,0x00ED,0x005D].indexOf(rt) >= 0) return CLR.DRAW;
    // Calc
    if ([0x0898].indexOf(rt) >= 0) return CLR.CALC;
    // Page layout
    if ([0x0014,0x0015,0x0026,0x0027,0x0028,0x0029,0x002A,0x002B,
         0x001A,0x001B,0x0083,0x0084,0x00A1,0x0082,0x0081].indexOf(rt) >= 0)
        return CLR.PAGE;
    // Window
    if ([0x003D,0x023E,0x001D,0x0041].indexOf(rt) >= 0) return CLR.WINDOW;
    // HLink
    if ([0x0800,0x0801].indexOf(rt) >= 0) return CLR.LINK;
    // Future records (0x08xx)
    if (rt >= 0x0800 && rt !== 0x0809) return CLR.FRT;
    // User/Feature
    if ([0x0160,0x0161,0x01AF,0x01B0,0x01B1,0x01B2,0x0867,0x0868,0x0863,0x0862].indexOf(rt) >= 0)
        return CLR.FRT;
    // Chart (0x10xx)
    if (rt >= 0x1000) return CLR.DRAW;
    // MergedCells, Scenario etc
    if ([0x00E5,0x00AE,0x00B0].indexOf(rt) >= 0) return CLR.PAGE;
    return CLR.GREY;
}

// ──────────────────────────────────────────────
// Pass 1: Scan all records, collect metadata
// ──────────────────────────────────────────────
var pos = 0;
var records = [];
var substreams = [];  // { startOff, endOff, type, dtName }
var currentSubstream = null;
var sheets = [];      // BoundSheet8 data
var sstStrings = [];  // Shared string table
var fonts = [];
var xfRecords = [];
var codePage = 1252;
var date1904 = false;

while (pos + 4 <= fileSize) {
    var hdrBuf = await hf.read(pos, 4);
    var rt = u16(hdrBuf, 0);
    var sz = u16(hdrBuf, 2);

    if (pos + 4 + sz > fileSize) {
        records.push({ off: pos, rt: rt, sz: sz, truncated: true });
        break;
    }

    var dataBuf = sz > 0 ? await hf.read(pos + 4, Math.min(sz, 512)) : null;
    var rec = { off: pos, rt: rt, sz: sz, detail: null };

    // Deep parse key records
    if (rt === 0x0809 && sz >= 8) { // BOF
        var vers = u16(dataBuf, 0);
        var dt = u16(dataBuf, 2);
        var rupBuild = u16(dataBuf, 4);
        var rupYear = u16(dataBuf, 6);
        var dtName = BOF_DT[dt] || ("Unknown(0x" + dt.toString(16).toUpperCase() + ")");

        if (currentSubstream) currentSubstream.endOff = pos;
        currentSubstream = { startOff: pos, endOff: fileSize, type: dt, dtName: dtName };
        substreams.push(currentSubstream);

        var bfh = sz >= 12 ? u32(dataBuf, 8) : 0;
        var fWin = bfh & 1;
        var fRisc = (bfh >> 1) & 1;
        var fBeta = (bfh >> 2) & 1;
        var fWinAny = (bfh >> 3) & 1;
        var fMacAny = (bfh >> 4) & 1;
        var fBetaAny = (bfh >> 5) & 1;
        var verXLHigh = (bfh >> 8) & 0xFF;
        var verLowestBiff = (bfh >> 16) & 0xFF;

        rec.detail = "BIFF8 " + dtName +
            " (build " + rupBuild + ", " + rupYear + ")" +
            (fWin ? " Win" : "") + (fMacAny ? " Mac" : "");
    }
    else if (rt === 0x000A) { // EOF
        if (currentSubstream) currentSubstream.endOff = pos + 4;
        rec.detail = "End of " + (currentSubstream ? currentSubstream.dtName : "substream");
    }
    else if (rt === 0x0085 && sz >= 8) { // BoundSheet8
        var lbPlyPos = u32(dataBuf, 0);
        var hsState = dataBuf[4];
        var dt2 = dataBuf[5];
        var cch = dataBuf[6];
        var flags = dataBuf[7];
        var isComp = (flags & 0x01) === 0;
        var sname = "";
        if (isComp) {
            for (var i = 0; i < cch && 8 + i < dataBuf.length; i++)
                sname += String.fromCharCode(dataBuf[8 + i]);
        } else {
            for (var i = 0; i < cch && 8 + i * 2 + 1 < dataBuf.length; i++)
                sname += String.fromCharCode(u16(dataBuf, 8 + i * 2));
        }
        var stateStr = ["visible", "hidden", "veryHidden"][hsState] || ("state=" + hsState);
        var typeStr = { 0: "Worksheet", 1: "MacroSheet", 2: "Chart", 6: "VB Module" }[dt2] || ("type=" + dt2);
        sheets.push({ name: sname, pos: lbPlyPos, state: hsState, type: dt2 });
        rec.detail = '"' + sname + '" ' + typeStr + ' (' + stateStr + ') → ' + fmtHex(lbPlyPos, 8);
    }
    else if (rt === 0x0042 && sz >= 2) { // CodePage
        codePage = u16(dataBuf, 0);
        var cpName = CODEPAGES[codePage] || ("CP " + codePage);
        rec.detail = cpName + " (" + codePage + ")";
    }
    else if (rt === 0x0022 && sz >= 2) { // Date1904
        date1904 = u16(dataBuf, 0) !== 0;
        rec.detail = date1904 ? "1904 date system (Mac)" : "1900 date system (Windows)";
    }
    else if (rt === 0x003D && sz >= 18) { // Window1
        var dxWn = u16(dataBuf, 4);
        var dyWn = u16(dataBuf, 6);
        var grbit = u16(dataBuf, 8);
        var itabCur = u16(dataBuf, 10);
        var ctabSel = u16(dataBuf, 14);
        var wTabRatio = u16(dataBuf, 16);
        var hiddenWin = (grbit & 0x01) !== 0;
        var minimized = (grbit & 0x02) !== 0;
        rec.detail = dxWn + "×" + dyWn + " tab=" + itabCur + " sel=" + ctabSel +
            " ratio=" + wTabRatio + (hiddenWin ? " HIDDEN" : "") + (minimized ? " MIN" : "");
    }
    else if (rt === 0x0031 && sz >= 14) { // Font
        var dyHeight = u16(dataBuf, 0);
        var grbit = u16(dataBuf, 2);
        var icv = u16(dataBuf, 4);
        var bls = u16(dataBuf, 6);
        var cch = dataBuf[14];
        var nameRes = (sz > 15) ? readXLUniStr(dataBuf, 14, 1) : { str: "" };
        var bold = bls >= 700 ? " Bold" : "";
        var italic = (grbit & 0x02) ? " Italic" : "";
        var strike = (grbit & 0x08) ? " Strikeout" : "";
        fonts.push(nameRes.str);
        rec.detail = '"' + nameRes.str + '" ' + (dyHeight / 20) + 'pt' + bold + italic + strike;
    }
    else if (rt === 0x00E0 && sz >= 20) { // XF
        var ifnt = u16(dataBuf, 0);
        var ifmt = u16(dataBuf, 2);
        var flags = u16(dataBuf, 4);
        var fStyle = (flags >> 2) & 1;
        xfRecords.push({ font: ifnt, fmt: ifmt, style: fStyle });
        rec.detail = (fStyle ? "Style" : "Cell") + " XF font=" + ifnt + " fmt=" + ifmt;
    }
    else if (rt === 0x041E && sz >= 4) { // Format
        var ifmt = u16(dataBuf, 0);
        var fmtStr = sz > 4 ? readXLUniStr(dataBuf, 2, 2) : { str: "?" };
        rec.detail = "ifmt=" + ifmt + ' "' + fmtStr.str + '"';
    }
    else if (rt === 0x00FC && sz >= 8) { // SST
        var cstTotal = u32(dataBuf, 0);
        var cstUnique = u32(dataBuf, 4);
        // Parse strings (first few)
        var soff = 8;
        var maxParse = Math.min(cstUnique, 100);
        for (var si = 0; si < maxParse && soff + 3 < dataBuf.length; si++) {
            try {
                var sr = readXLUniStr(dataBuf, soff, 2);
                sstStrings.push(sr.str);
                soff += sr.bytesRead;
            } catch (e) { break; }
        }
        rec.detail = cstTotal + " refs, " + cstUnique + " unique strings";
    }
    else if (rt === 0x00FF && sz >= 2) { // ExtSST
        var dsst = u16(dataBuf, 0);
        rec.detail = "dsst=" + dsst + " (bucket size)";
    }
    else if (rt === 0x0200 && sz >= 14) { // Dimensions
        var rwMic = u32(dataBuf, 0);
        var rwMac = u32(dataBuf, 4);
        var colMic = u16(dataBuf, 8);
        var colMac = u16(dataBuf, 10);
        rec.detail = "rows " + rwMic + "-" + (rwMac - 1) + ", cols " + colMic + "-" + (colMac - 1);
    }
    else if (rt === 0x0208 && sz >= 16) { // Row
        var rw = u16(dataBuf, 0);
        var colMic = u16(dataBuf, 2);
        var colMac = u16(dataBuf, 4);
        var miyRw = u16(dataBuf, 6);
        rec.detail = "row " + rw + " cols " + colMic + "-" + (colMac - 1) + " h=" + (miyRw / 20).toFixed(1) + "pt";
    }
    else if (rt === 0x00FD && sz >= 10) { // LabelSst
        var rw = u16(dataBuf, 0);
        var col = u16(dataBuf, 2);
        var ixfe = u16(dataBuf, 4);
        var isst = u32(dataBuf, 6);
        var sval = isst < sstStrings.length ? sstStrings[isst] : ("sst[" + isst + "]");
        if (sval.length > 40) sval = sval.substring(0, 40) + "...";
        rec.detail = "R" + rw + "C" + col + ' "' + sval + '" xf=' + ixfe;
    }
    else if (rt === 0x0203 && sz >= 14) { // Number
        var rw = u16(dataBuf, 0);
        var col = u16(dataBuf, 2);
        var ixfe = u16(dataBuf, 4);
        // f64 at offset 6
        var dvBuf = new ArrayBuffer(8);
        var dvView = new Uint8Array(dvBuf);
        for (var bi = 0; bi < 8 && 6 + bi < dataBuf.length; bi++) dvView[bi] = dataBuf[6 + bi];
        var num = new DataView(dvBuf).getFloat64(0, true);
        rec.detail = "R" + rw + "C" + col + " = " + num + " xf=" + ixfe;
    }
    else if (rt === 0x027E && sz >= 10) { // Rk
        var rw = u16(dataBuf, 0);
        var col = u16(dataBuf, 2);
        var ixfe = u16(dataBuf, 4);
        var rkVal = u32(dataBuf, 6);
        var num;
        if (rkVal & 0x02) { // integer
            num = (rkVal >> 2);
            if (rkVal & 0x80000000) num = num - 0x40000000; // sign extend
        } else { // IEEE
            var dvBuf2 = new ArrayBuffer(8);
            var dvView2 = new DataView(dvBuf2);
            dvView2.setUint32(0, 0, true);
            dvView2.setUint32(4, rkVal & 0xFFFFFFFC, true);
            num = dvView2.getFloat64(0, true);
        }
        if (rkVal & 0x01) num /= 100;
        rec.detail = "R" + rw + "C" + col + " = " + num + " xf=" + ixfe;
    }
    else if (rt === 0x00BD && sz >= 6) { // MulRk
        var rw = u16(dataBuf, 0);
        var colFirst = u16(dataBuf, 2);
        var colLast = u16(dataBuf, sz - 2);
        var numCells = colLast - colFirst + 1;
        rec.detail = "R" + rw + " C" + colFirst + "-C" + colLast + " (" + numCells + " RK values)";
    }
    else if (rt === 0x0201 && sz >= 6) { // Blank
        var rw = u16(dataBuf, 0);
        var col = u16(dataBuf, 2);
        rec.detail = "R" + rw + "C" + col + " (empty)";
    }
    else if (rt === 0x0205 && sz >= 8) { // BoolErr
        var rw = u16(dataBuf, 0);
        var col = u16(dataBuf, 2);
        var bv = dataBuf[6];
        var fErr = dataBuf[7];
        if (fErr) {
            var errNames = { 0x00: "#NULL!", 0x07: "#DIV/0!", 0x0F: "#VALUE!",
                0x17: "#REF!", 0x1D: "#NAME?", 0x24: "#NUM!", 0x2A: "#N/A" };
            rec.detail = "R" + rw + "C" + col + " " + (errNames[bv] || "ERR");
        } else {
            rec.detail = "R" + rw + "C" + col + " = " + (bv ? "TRUE" : "FALSE");
        }
    }
    else if (rt === 0x0006 && sz >= 20) { // Formula
        var rw = u16(dataBuf, 0);
        var col = u16(dataBuf, 2);
        rec.detail = "R" + rw + "C" + col + " (formula, " + sz + " bytes)";
    }
    else if (rt === 0x007D && sz >= 12) { // ColInfo
        var colFirst = u16(dataBuf, 0);
        var colLast = u16(dataBuf, 2);
        var coldx = u16(dataBuf, 4);
        var ixfe = u16(dataBuf, 6);
        var grbit = u16(dataBuf, 8);
        var hidden = (grbit & 0x01) !== 0;
        rec.detail = "cols " + colFirst + "-" + colLast + " w=" + (coldx / 256).toFixed(1) +
            " xf=" + ixfe + (hidden ? " HIDDEN" : "");
    }
    else if (rt === 0x008C && sz >= 4) { // Country
        var iCtryDef = u16(dataBuf, 0);
        var iCtryWin = u16(dataBuf, 2);
        rec.detail = "default=" + iCtryDef + " windows=" + iCtryWin;
    }
    else if (rt === 0x023E && sz >= 18) { // Window2
        var grbit = u16(dataBuf, 0);
        var fShowFormulas = grbit & 1;
        var fShowGrid = (grbit >> 1) & 1;
        var fShowRowCol = (grbit >> 2) & 1;
        var fFrozen = (grbit >> 3) & 1;
        var fShowZeros = (grbit >> 4) & 1;
        var fSelected = (grbit >> 9) & 1;
        var fPageBreak = (grbit >> 11) & 1;
        rec.detail = (fFrozen ? "Frozen " : "") + (fShowGrid ? "Grid " : "NoGrid ") +
            (fSelected ? "SELECTED " : "") + (fPageBreak ? "PageBreak" : "Normal");
    }
    else if (rt === 0x0014 || rt === 0x0015) { // Header/Footer
        if (sz > 0) {
            var hfStr = readXLUniStr(dataBuf, 0, 2);
            var text = hfStr.str.length > 50 ? hfStr.str.substring(0, 50) + "..." : hfStr.str;
            rec.detail = '"' + text + '"';
        }
    }
    else if (rt === 0x0293 && sz >= 4) { // Style
        var ixfe = u16(dataBuf, 0);
        var fBuiltIn = (ixfe >> 12) & 1;
        ixfe = ixfe & 0xFFF;
        rec.detail = (fBuiltIn ? "Built-in" : "User") + " xf=" + ixfe;
    }
    else if (rt === 0x0012 && sz >= 2) { // Protect
        var fLock = u16(dataBuf, 0);
        rec.detail = fLock ? "PROTECTED" : "Unprotected";
    }
    else if (rt === 0x002F && sz >= 2) { // FilePass
        var wEncType = u16(dataBuf, 0);
        rec.detail = wEncType === 0 ? "XOR Obfuscation" :
            wEncType === 1 ? "RC4 Encryption" : "Encryption type " + wEncType;
    }
    else if (rt === 0x0800 && sz >= 32) { // HLink
        var rw1 = u16(dataBuf, 0);
        var rw2 = u16(dataBuf, 2);
        var col1 = u16(dataBuf, 4);
        var col2 = u16(dataBuf, 6);
        rec.detail = "R" + rw1 + "C" + col1 + (rw1 !== rw2 || col1 !== col2 ?
            ":R" + rw2 + "C" + col2 : "");
    }
    else if (rt === 0x00E5 && sz >= 2) { // MergedCells
        var cmcs = u16(dataBuf, 0);
        rec.detail = cmcs + " merged range(s)";
    }
    else if (rt === 0x0017 && sz >= 2) { // ExternSheet
        var cXTI = u16(dataBuf, 0);
        rec.detail = cXTI + " XTI entries";
    }
    else if (rt === 0x0018 && sz >= 4) { // Lbl (Name)
        var grbit = u16(dataBuf, 0);
        var fBuiltIn = grbit & 0x20;
        var chKey = dataBuf[2];
        var cch = dataBuf[3];
        rec.detail = (fBuiltIn ? "Built-in " : "") + "name (len=" + cch + ")";
    }

    records.push(rec);
    pos += 4 + sz;
}

// ──────────────────────────────────────────────
// Pass 2: Emit template structures
// ──────────────────────────────────────────────
var substreamIdx = 0;

for (var ri = 0; ri < records.length; ri++) {
    var rec = records[ri];
    var rt = rec.rt;
    var color = recColor(rt);
    var name = REC[rt] || ("Record_" + fmtHex(rt, 4));

    hf.template.seek(rec.off);

    // Start new substream group at BOF
    if (rt === 0x0809) {
        var ss = substreams[substreamIdx];
        if (substreamIdx > 0) {
            // Don't nest — just add a BOF
        }
        hf.template.beginStruct("Substream_" + substreamIdx + " [" + (ss ? ss.dtName : "?") + "]");
        substreamIdx++;
    }

    hf.template.beginStruct(name);

    // Record header: type + size
    var typeDisplay = fmtHex(rt, 4) + " " + name;
    await hf.template.addField("RecordType", "u16", { color: color, display: typeDisplay });
    await hf.template.addField("RecordSize", "u16", { color: color, display: rec.sz + " bytes" });

    // Record data
    if (rec.sz > 0) {
        var dataDisplay = rec.detail || (rec.sz + " bytes");
        if (rec.sz <= 256) {
            await hf.template.addField("Data", "bytes:" + rec.sz, { color: color, display: dataDisplay });
        } else {
            // Large records: show data with size info
            await hf.template.addField("Data", "bytes:" + rec.sz, { color: color,
                display: dataDisplay + " [" + fmtSize(rec.sz) + "]" });
        }
    }

    hf.template.endStruct();

    // End substream group at EOF
    if (rt === 0x000A) {
        hf.template.endStruct();
    }
}

// ──────────────────────────────────────────────
// Log summary
// ──────────────────────────────────────────────
hf.log("XLS Workbook Stream (BIFF8)");
hf.log("  Stream size: " + fmtSize(fileSize));
hf.log("  Total records: " + records.length);
hf.log("  Substreams: " + substreams.length);

for (var si = 0; si < substreams.length; si++) {
    var ss = substreams[si];
    hf.log("    [" + si + "] " + ss.dtName + " @ " + fmtHex(ss.startOff, 4) +
        " (" + fmtSize(ss.endOff - ss.startOff) + ")");
}

if (codePage) {
    var cpName = CODEPAGES[codePage] || ("CP " + codePage);
    hf.log("  CodePage: " + cpName);
}
hf.log("  Date system: " + (date1904 ? "1904 (Mac)" : "1900 (Windows)"));

// Sheets
hf.log("\n  Sheets (" + sheets.length + "):");
for (var si = 0; si < sheets.length; si++) {
    var s = sheets[si];
    var stateStr = ["visible", "hidden", "veryHidden"][s.state] || "?";
    var typeStr = { 0: "Worksheet", 1: "MacroSheet", 2: "Chart", 6: "VB Module" }[s.type] || "?";
    hf.log("    [" + si + '] "' + s.name + '" ' + typeStr + ' (' + stateStr + ')');
}

// Fonts
if (fonts.length > 0) {
    hf.log("\n  Fonts (" + fonts.length + "):");
    for (var fi = 0; fi < Math.min(fonts.length, 20); fi++)
        hf.log("    [" + fi + '] "' + fonts[fi] + '"');
}

// SST
if (sstStrings.length > 0) {
    hf.log("\n  Shared Strings (" + sstStrings.length + "):");
    for (var si = 0; si < Math.min(sstStrings.length, 30); si++) {
        var s = sstStrings[si];
        if (s.length > 60) s = s.substring(0, 60) + "...";
        hf.log("    [" + si + '] "' + s + '"');
    }
    if (sstStrings.length > 30) hf.log("    ... and " + (sstStrings.length - 30) + " more");
}

// Record type statistics
var typeCounts = {};
for (var ri = 0; ri < records.length; ri++) {
    var rt = records[ri].rt;
    typeCounts[rt] = (typeCounts[rt] || 0) + 1;
}
var typeKeys = Object.keys(typeCounts).sort(function(a, b) { return Number(a) - Number(b); });
hf.log("\n  Record types (" + typeKeys.length + " unique):");
for (var ki = 0; ki < typeKeys.length; ki++) {
    var rt = Number(typeKeys[ki]);
    var cnt = typeCounts[rt];
    var name = REC[rt] || ("Unknown_" + fmtHex(rt, 4));
    hf.log("    " + fmtHex(rt, 4) + " " + name + ": " + cnt);
}

// Coverage check
var totalParsed = 0;
for (var ri = 0; ri < records.length; ri++)
    totalParsed += 4 + records[ri].sz;
hf.log("\n  Coverage: " + totalParsed + "/" + fileSize + " bytes (" +
    (totalParsed * 100 / fileSize).toFixed(1) + "%)");

await hf.template.end();