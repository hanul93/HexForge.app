// HexForge JS Template - WordDocument.js
// Purpose: MS-DOC WordDocument Stream (FIB - File Information Block)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Document
// ID Bytes: EC A5 (wIdent = 0xA5EC at offset 0)
// Reference: [MS-DOC] https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc

var fileSize = await hf.fileSize;

hf.template.begin("WordDocument Stream (MS-DOC FIB)");
hf.template.setFormat("doc_wd", "WordDocument Stream", [".doc", ".dot"]);

// ──────────────────────────────────────────────
// Validate wIdent signature
// ──────────────────────────────────────────────
if (fileSize < 34) {
    hf.error("Not a WordDocument stream (too small)");
    await hf.template.end();
    throw new Error("Invalid WordDocument stream");
}

var sig = await hf.read(0, 2);
if (sig[0] !== 0xEC || sig[1] !== 0xA5) {
    hf.error("Not a WordDocument stream (wIdent must be 0xA5EC)");
    await hf.template.end();
    throw new Error("Invalid WordDocument stream");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function i32(buf, off) { return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); }
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n, "0"); }
function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
}

// Language ID → name
var LANG_IDS = {
    0x0409: "English (US)", 0x0809: "English (UK)", 0x0412: "Korean",
    0x0411: "Japanese", 0x0804: "Chinese (Simplified)", 0x0404: "Chinese (Traditional)",
    0x0407: "German", 0x040C: "French", 0x0C0A: "Spanish", 0x0416: "Portuguese (Brazil)",
    0x0410: "Italian", 0x0413: "Dutch", 0x0419: "Russian", 0x041E: "Thai"
};

// nFib → Word version
var NFIB_VERSIONS = {
    0x00C1: "Word 97/2000/XP/2003", 0x00D9: "Word 2007", 0x0101: "Word 2010+",
    0x0104: "Word 2013+", 0x00C0: "Word 97 (empty)", 0x00C2: "Word 97 BiDi",
    0x00BF: "Word 97 (nFibBack)"
};

// Colors — Material Design
var CLR = {
    BASE:    "#2196F3",
    FLAGS:   "#E040FB",
    RGW:     "#4CAF50",
    RGLW:    "#FF9800",
    FCLCB:   "#F44336",
    CSWNEW:  "#00BCD4",
    TEXT:    "#FFAB40",
    GREY:    "#9E9E9E"
};

// ──────────────────────────────────────────────
// FibBase (32 bytes) — [MS-DOC] §2.5.2
// ──────────────────────────────────────────────
var baseBuf = await hf.read(0, 32);
var nFib = u16(baseBuf, 2);
var lid = u16(baseBuf, 6);
var pnNext = u16(baseBuf, 8);
var flagsAB = u16(baseBuf, 10);
var nFibBack = u16(baseBuf, 12);
var lKey = u32(baseBuf, 14);
var envr = baseBuf[18];
var flagsCD = baseBuf[19];

// Decode flags (byte 10-11)
var fDot = flagsAB & 1;
var fGlsy = (flagsAB >> 1) & 1;
var fComplex = (flagsAB >> 2) & 1;
var fHasPic = (flagsAB >> 3) & 1;
var cQuickSaves = (flagsAB >> 4) & 0xF;
var fEncrypted = (flagsAB >> 8) & 1;
var fWhichTblStm = (flagsAB >> 9) & 1;
var fReadOnlyRec = (flagsAB >> 10) & 1;
var fWriteResv = (flagsAB >> 11) & 1;
var fExtChar = (flagsAB >> 12) & 1;
var fLoadOverride = (flagsAB >> 13) & 1;
var fFarEast = (flagsAB >> 14) & 1;
var fObfuscated = (flagsAB >> 15) & 1;

// Decode flags byte 19
var fMac = flagsCD & 1;
var fEmptySpecial = (flagsCD >> 1) & 1;
var fLoadOverridePage = (flagsCD >> 2) & 1;

var versionStr = NFIB_VERSIONS[nFib] || ("Unknown (0x" + nFib.toString(16).toUpperCase() + ")");
var langStr = LANG_IDS[lid] || ("0x" + lid.toString(16).toUpperCase());
var tableStream = fWhichTblStm ? "1Table" : "0Table";

hf.template.seek(0);
hf.template.beginStruct("FibBase");
await hf.template.addField("wIdent", "u16", { color: CLR.BASE, display: "0xA5EC (Word Binary File)" });
await hf.template.addField("nFib", "u16", { color: CLR.BASE, display: fmtHex(nFib, 4) + " " + versionStr });
await hf.template.addField("unused", "u16", { color: CLR.GREY });
await hf.template.addField("lid", "u16", { color: CLR.BASE, display: langStr });
await hf.template.addField("pnNext", "u16", { color: CLR.BASE,
    display: pnNext === 0 ? "0 (no AutoText)" : pnNext + " (AutoText FIB at " + (pnNext * 512) + ")" });

// Flags word (2 bytes at offset 10)
var flagsDisplay =
    (fDot ? "DOT " : "") +
    (fGlsy ? "Glossary " : "") +
    (fComplex ? "Complex " : "") +
    (fHasPic ? "HasPic " : "") +
    "QSaves=" + cQuickSaves + " " +
    (fEncrypted ? "ENCRYPTED " : "") +
    "Table=" + tableStream + " " +
    (fReadOnlyRec ? "ReadOnly " : "") +
    (fFarEast ? "FarEast " : "") +
    (fObfuscated ? "Obfuscated " : "");
await hf.template.addField("Flags", "u16", { color: CLR.FLAGS, display: flagsDisplay.trim() });

await hf.template.addField("nFibBack", "u16", { color: CLR.BASE, display: fmtHex(nFibBack, 4) });
await hf.template.addField("lKey", "u32", { color: fEncrypted ? CLR.FLAGS : CLR.GREY,
    display: fEncrypted ? (fObfuscated ? "XOR verifier" : "EncryptionHeader size") : "0 (not encrypted)" });
await hf.template.addField("envr", "u8", { color: CLR.GREY });

var flags2Display =
    (fMac ? "Mac " : "") +
    (fEmptySpecial ? "EmptySpecial " : "") +
    (fLoadOverridePage ? "LoadOverridePage " : "");
await hf.template.addField("Flags2", "u8", { color: CLR.FLAGS,
    display: flags2Display.trim() || "0" });
await hf.template.addField("reserved3", "u16", { color: CLR.GREY });
await hf.template.addField("reserved4", "u16", { color: CLR.GREY });
await hf.template.addField("reserved5", "u32", { color: CLR.GREY });
await hf.template.addField("reserved6", "u32", { color: CLR.GREY });
hf.template.endStruct();

hf.log("MS-DOC WordDocument Stream");
hf.log("  Version: " + versionStr + " (nFib=" + fmtHex(nFib, 4) + ")");
hf.log("  Language: " + langStr);
hf.log("  Table stream: " + tableStream);
if (fEncrypted) hf.log("  ENCRYPTED" + (fObfuscated ? " (XOR obfuscation)" : ""));
if (fDot) hf.log("  Document template (.dot)");
if (fComplex) hf.log("  Incremental save (complex)");

var pos = 32;

// ──────────────────────────────────────────────
// csw + FibRgW97 — [MS-DOC] §2.5.3
// 14 × u16 = 28 bytes
// ──────────────────────────────────────────────
if (pos + 2 > fileSize) { await hf.template.end(); throw new Error("Truncated FIB"); }
var cswBuf = await hf.read(pos, 2);
var csw = u16(cswBuf, 0);

hf.template.seek(pos);
hf.template.beginStruct("FibRgW97");
await hf.template.addField("csw", "u16", { color: CLR.RGW, display: csw + " (count of u16 values)" });
pos += 2;

var rgwSize = csw * 2;
if (pos + rgwSize > fileSize) { hf.template.endStruct(); await hf.template.end(); throw new Error("Truncated FIB"); }

// FibRgW97: mostly reserved, field[13] = lidFE
var fibRgW_names = [
    "reserved1", "reserved2", "reserved3", "reserved4", "reserved5",
    "reserved6", "reserved7", "reserved8", "reserved9", "reserved10",
    "reserved11", "reserved12", "reserved13", "lidFE"
];

for (var i = 0; i < csw && i < 14; i++) {
    var fname = fibRgW_names[i] || ("field_" + i);
    if (fname === "lidFE") {
        var lidFEBuf = await hf.read(pos + i * 2, 2);
        var lidFE = u16(lidFEBuf, 0);
        var lidFEStr = LANG_IDS[lidFE] || fmtHex(lidFE, 4);
        await hf.template.addField(fname, "u16", { color: CLR.RGW, display: lidFEStr });
    } else {
        await hf.template.addField(fname, "u16", { color: CLR.GREY });
    }
}
// Skip extra if csw > 14
if (csw > 14) {
    var extraW = (csw - 14) * 2;
    await hf.template.addField("extraRgW", "bytes:" + extraW, { color: CLR.GREY });
}
pos += rgwSize;
hf.template.endStruct();

// ──────────────────────────────────────────────
// cslw + FibRgLw97 — [MS-DOC] §2.5.4
// 22 × u32 = 88 bytes
// ──────────────────────────────────────────────
if (pos + 2 > fileSize) { await hf.template.end(); throw new Error("Truncated FIB"); }
var cslwBuf = await hf.read(pos, 2);
var cslw = u16(cslwBuf, 0);

hf.template.seek(pos);
hf.template.beginStruct("FibRgLw97");
await hf.template.addField("cslw", "u16", { color: CLR.RGLW, display: cslw + " (count of u32 values)" });
pos += 2;

var rglwSize = cslw * 4;
if (pos + rglwSize > fileSize) { hf.template.endStruct(); await hf.template.end(); throw new Error("Truncated FIB"); }

var fibRgLw_names = [
    "cbMac", "reserved1", "reserved2", "ccpText", "ccpFtn",
    "ccpHdd", "reserved3", "ccpAtn", "ccpEdn", "ccpTxbx",
    "ccpHdrTxbx", "reserved4", "reserved5", "reserved6", "reserved7",
    "reserved8", "reserved9", "reserved10", "reserved11", "reserved12",
    "reserved13", "reserved14"
];

var ccpText = 0, ccpFtn = 0, ccpHdd = 0, ccpAtn = 0, ccpEdn = 0;
var ccpTxbx = 0, ccpHdrTxbx = 0, cbMac = 0;

for (var i = 0; i < cslw && i < 22; i++) {
    var fname = fibRgLw_names[i] || ("field_" + i);
    var important = ["cbMac", "ccpText", "ccpFtn", "ccpHdd", "ccpAtn", "ccpEdn", "ccpTxbx", "ccpHdrTxbx"];
    var color = important.indexOf(fname) >= 0 ? CLR.RGLW : CLR.GREY;
    var valBuf = await hf.read(pos + i * 4, 4);
    var val = i32(valBuf, 0);

    var display = undefined;
    if (fname === "cbMac") { cbMac = val; display = fmtSize(val) + " (stream logical size)"; }
    else if (fname === "ccpText") { ccpText = val; display = val + " chars (main document)"; }
    else if (fname === "ccpFtn") { ccpFtn = val; display = val + " chars (footnotes)"; }
    else if (fname === "ccpHdd") { ccpHdd = val; display = val + " chars (headers/footers)"; }
    else if (fname === "ccpAtn") { ccpAtn = val; display = val + " chars (comments)"; }
    else if (fname === "ccpEdn") { ccpEdn = val; display = val + " chars (endnotes)"; }
    else if (fname === "ccpTxbx") { ccpTxbx = val; display = val + " chars (textboxes)"; }
    else if (fname === "ccpHdrTxbx") { ccpHdrTxbx = val; display = val + " chars (header textboxes)"; }

    if (display) {
        await hf.template.addField(fname, "i32", { color: color, display: display });
    } else {
        await hf.template.addField(fname, "i32", { color: color });
    }
}
if (cslw > 22) {
    var extraLw = (cslw - 22) * 4;
    await hf.template.addField("extraRgLw", "bytes:" + extraLw, { color: CLR.GREY });
}
pos += rglwSize;
hf.template.endStruct();

hf.log("  cbMac: " + fmtSize(cbMac));
hf.log("  Text: " + ccpText + " chars");
if (ccpFtn > 0) hf.log("  Footnotes: " + ccpFtn + " chars");
if (ccpHdd > 0) hf.log("  Headers/Footers: " + ccpHdd + " chars");
if (ccpAtn > 0) hf.log("  Comments: " + ccpAtn + " chars");
if (ccpEdn > 0) hf.log("  Endnotes: " + ccpEdn + " chars");
if (ccpTxbx > 0) hf.log("  TextBoxes: " + ccpTxbx + " chars");

// ──────────────────────────────────────────────
// cbRgFcLcb + FibRgFcLcb — [MS-DOC] §2.5.5~2.5.11
// N × (fc:u32 + lcb:u32) = N × 8 bytes
// ──────────────────────────────────────────────
if (pos + 2 > fileSize) { await hf.template.end(); throw new Error("Truncated FIB"); }
var cbRgBuf = await hf.read(pos, 2);
var cbRgFcLcb = u16(cbRgBuf, 0);

// Determine which FibRgFcLcb version based on count
var fcLcbVersion = "FibRgFcLcb97";
if (cbRgFcLcb === 0x005D) fcLcbVersion = "FibRgFcLcb97 (93 pairs)";
else if (cbRgFcLcb === 0x006C) fcLcbVersion = "FibRgFcLcb2000 (108 pairs)";
else if (cbRgFcLcb === 0x0088) fcLcbVersion = "FibRgFcLcb2002 (136 pairs)";
else if (cbRgFcLcb === 0x00A4) fcLcbVersion = "FibRgFcLcb2003 (164 pairs)";
else if (cbRgFcLcb === 0x00B7) fcLcbVersion = "FibRgFcLcb2007 (183 pairs)";
else fcLcbVersion = "FibRgFcLcb (" + cbRgFcLcb + " pairs)";

hf.template.seek(pos);
hf.template.beginStruct("FibRgFcLcb");
await hf.template.addField("cbRgFcLcb", "u16", { color: CLR.FCLCB,
    display: cbRgFcLcb + " — " + fcLcbVersion });
pos += 2;

var fclcbSize = cbRgFcLcb * 8;
if (pos + fclcbSize > fileSize) {
    hf.warn("FibRgFcLcb truncated — file ends before all pairs");
    fclcbSize = fileSize - pos;
    cbRgFcLcb = Math.floor(fclcbSize / 8);
}

// FibRgFcLcb97 field names (fc/lcb pairs, first 93)
var fclcb97_names = [
    "StshfOrig", "Stshf", "PlcffndRef", "PlcffndTxt", "PlcfandRef",
    "PlcfandTxt", "PlcfSed", "PlcPad", "PlcfPhe", "SttbfGlsy",
    "PlcfGlsy", "PlcfHdd", "PlcfBteChpx", "PlcfBtePapx", "PlcfSea",
    "SttbfFfn", "PlcfFldMom", "PlcfFldHdr", "PlcfFldFtn", "PlcfFldAtn",
    "PlcfFldMcr", "SttbfBkmk", "PlcfBkf", "PlcfBkl", "Cmds",
    "unused1", "PlcMcr", "SttbfMcr", "PrDrvr", "PrEnvPort",
    "PrEnvLand", "Wss", "Dop", "SttbfAssoc", "Clx",
    "PlcfPgdFtn", "AutosaveSource", "GrpXstAtnOwners", "SttbfAtnBkmk", "unused2",
    "unused3", "PlcSpaMom", "PlcSpaHdr", "PlcfAtnBkf", "PlcfAtnBkl",
    "Pms", "FormFldSttbs", "PlcfendRef", "PlcfendTxt", "PlcfFldEdn",
    "unused6", "DggInfo", "SttbfRMark", "SttbCaption", "SttbAutoCaption",
    "Plcfwkb", "Plcfspl", "PlcftxbxTxt", "PlcfFldTxbx", "PlcfHdrtxbxTxt",
    "PlcffldHdrTxbx", "StwUser", "Sttbttmbd", "CookieData", "PgdMotherDocPre10",
    "BkdMotherDocPre10", "PgdFtnDocPre10", "BkdFtnDocPre10", "PgdEdnDocPre10", "BkdEdnDocPre10",
    "SttbfIntlFld", "RouteSlip", "SttbSavedBy", "SttbFnm", "PlfLst",
    "PlfLfo", "PlcfTxbxBkd", "PlcfTxbxHdrBkd", "DocUndoWord9", "RgbUse",
    "Usp", "Uskf", "PlcupcRgbUse", "PlcupcUsp", "SttbGlsyStyle",
    "Plgosl", "Plcocx", "PlcfBteLvc", "dwLowDateTime", "dwHighDateTime",
    "PlcfLvcPre10", "PlcfAsumy", "PlcfGram"
];

// Read all fc/lcb pairs — only show non-zero lcb ones in detail
var nonZeroEntries = [];
var allBuf = await hf.read(pos, fclcbSize);
for (var i = 0; i < cbRgFcLcb; i++) {
    var fc = u32(allBuf, i * 8);
    var lcb = u32(allBuf, i * 8 + 4);
    var name = (i < fclcb97_names.length) ? fclcb97_names[i] : ("field_" + i);
    if (lcb > 0) {
        nonZeroEntries.push({ idx: i, name: name, fc: fc, lcb: lcb });
    }
}

// Emit all pairs as structured fields
// For performance, emit in chunks — mark non-zero ones with color
for (var i = 0; i < cbRgFcLcb; i++) {
    var fc = u32(allBuf, i * 8);
    var lcb = u32(allBuf, i * 8 + 4);
    var name = (i < fclcb97_names.length) ? fclcb97_names[i] : ("field_" + i);
    var isActive = lcb > 0;
    var color = isActive ? CLR.FCLCB : CLR.GREY;

    hf.template.seek(pos + i * 8);
    if (isActive) {
        await hf.template.addField("fc" + name, "u32", { color: color,
            display: "fc=" + fmtHex(fc, 8) + " → Table Stream" });
        await hf.template.addField("lcb" + name, "u32", { color: color,
            display: "lcb=" + fmtSize(lcb) });
    } else {
        await hf.template.addField("fc" + name, "u32", { color: CLR.GREY });
        await hf.template.addField("lcb" + name, "u32", { color: CLR.GREY });
    }
}

pos += fclcbSize;
hf.template.endStruct();

hf.log("\n  FibRgFcLcb: " + fcLcbVersion);
hf.log("  Active entries (" + nonZeroEntries.length + "):");
for (var i = 0; i < nonZeroEntries.length && i < 30; i++) {
    var e = nonZeroEntries[i];
    hf.log("    [" + e.idx + "] " + e.name + ": fc=" + fmtHex(e.fc, 8) + " lcb=" + e.lcb);
}

// ──────────────────────────────────────────────
// cswNew + FibRgCswNew — [MS-DOC] §2.5.12
// ──────────────────────────────────────────────
if (pos + 2 <= fileSize) {
    var cswNewBuf = await hf.read(pos, 2);
    var cswNew = u16(cswNewBuf, 0);

    hf.template.seek(pos);
    hf.template.beginStruct("FibRgCswNew");
    await hf.template.addField("cswNew", "u16", { color: CLR.CSWNEW,
        display: cswNew + " (count of u16 values)" });
    pos += 2;

    if (cswNew > 0 && pos + cswNew * 2 <= fileSize) {
        var cswNewData = await hf.read(pos, cswNew * 2);
        var nFibNew = u16(cswNewData, 0);
        var nFibNewStr = NFIB_VERSIONS[nFibNew] || fmtHex(nFibNew, 4);
        await hf.template.addField("nFibNew", "u16", { color: CLR.CSWNEW,
            display: fmtHex(nFibNew, 4) + " " + nFibNewStr });

        if (cswNew > 1) {
            await hf.template.addField("cswNewExtra", "bytes:" + ((cswNew - 1) * 2), { color: CLR.GREY });
        }

        hf.log("  nFibNew: " + fmtHex(nFibNew, 4) + " " + nFibNewStr);
        pos += cswNew * 2;
    }

    hf.template.endStruct();
}

// ──────────────────────────────────────────────
// Remaining data — document text and other content
// ──────────────────────────────────────────────
var fibEnd = pos;

if (pos < fileSize) {
    var remainingSize = fileSize - pos;
    hf.template.seek(pos);
    hf.template.beginStruct("StreamData");

    // The text typically starts at a sector-aligned offset (often 0x400 or 0x800)
    // Try to identify text region
    if (ccpText > 0 && remainingSize > 0) {
        // Mark remaining as document data
        await hf.template.addField("DocumentData", "bytes:" + remainingSize, { color: CLR.TEXT });
    } else {
        await hf.template.addField("Remaining", "bytes:" + remainingSize, { color: CLR.GREY });
    }

    hf.template.endStruct();
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("WordDocument Stream Summary");
hf.log("==============================");
hf.log("  FIB size: " + fibEnd + " bytes");
hf.log("  Stream size: " + fileSize + " bytes");
hf.log("  Version: " + versionStr);
hf.log("  Language: " + langStr);
hf.log("  Table stream: " + tableStream);
hf.log("  Encrypted: " + (fEncrypted ? "yes" + (fObfuscated ? " (XOR)" : " (RC4/CryptoAPI)") : "no"));
hf.log("  Document type: " + (fDot ? "Template (.dot)" : "Document (.doc)"));
hf.log("  Text characters:");
hf.log("    Main:     " + ccpText);
if (ccpFtn) hf.log("    Footnote: " + ccpFtn);
if (ccpHdd) hf.log("    Header:   " + ccpHdd);
if (ccpAtn) hf.log("    Comment:  " + ccpAtn);
if (ccpEdn) hf.log("    Endnote:  " + ccpEdn);
if (ccpTxbx) hf.log("    TextBox:  " + ccpTxbx);
var totalCP = ccpText + ccpFtn + ccpHdd + ccpAtn + ccpEdn + ccpTxbx + ccpHdrTxbx;
hf.log("    Total:    " + totalCP);
hf.log("  FibRgFcLcb: " + cbRgFcLcb + " entries (" + nonZeroEntries.length + " active)");

await hf.template.end();