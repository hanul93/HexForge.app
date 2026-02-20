// HexForge JS Template - pdb (Portable PDB).js
// Purpose: Microsoft Portable PDB — .NET Debug Symbols (ECMA-335 based)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Executable / Debug
// Reference: https://github.com/dotnet/runtime/blob/main/docs/design/specs/PortablePdb-Metadata.md

var fileSize = await hf.fileSize;

hf.template.begin("Portable PDB (.NET Debug Symbols)");
hf.template.setFormat("portable-pdb", "Portable PDB", [".pdb"]);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function ri(buf, off, sz) { return sz === 2 ? u16(buf, off) : u32(buf, off); }

function fmtGUID(buf, off) {
    var d1 = u32(buf, off), d2 = u16(buf, off + 4), d3 = u16(buf, off + 6);
    var h = function(v, n) { return v.toString(16).toUpperCase().padStart(n, "0"); };
    var d4 = "";
    for (var i = 0; i < 8; i++) d4 += h(buf[off + 8 + i], 2);
    return "{" + h(d1, 8) + "-" + h(d2, 4) + "-" + h(d3, 4) + "-" + d4.slice(0, 4) + "-" + d4.slice(4) + "}";
}

function zstr(buf, off) {
    var s = "";
    while (off < buf.length && buf[off] !== 0) s += String.fromCharCode(buf[off++]);
    return s;
}

function hexOf(arr) {
    var s = "";
    for (var i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, "0");
    return s;
}

function mkBR(data, off) {
    var r = { d: data, o: off || 0 };
    r.left = function() { return r.d.length - r.o; };
    r.rb = function() { return r.d[r.o++]; };
    r.rn = function(n) { var s = r.d.slice(r.o, r.o + n); r.o += n; return s; };
    r.rcu = function() {
        var b = r.rb();
        if ((b & 0x80) === 0) return b;
        if ((b & 0xC0) === 0x80) return ((b & 0x3F) << 8) | r.rb();
        var b1 = r.rb(), b2 = r.rb(), b3 = r.rb();
        return ((b & 0x1F) << 24) | (b1 << 16) | (b2 << 8) | b3;
    };
    r.rci = function() {
        var peek = r.d[r.o], raw;
        if ((peek & 0x80) === 0) { raw = r.rcu(); return (raw & 1) ? (raw >> 1) - 0x40 : (raw >> 1); }
        if ((peek & 0xC0) === 0x80) { raw = r.rcu(); return (raw & 1) ? (raw >> 1) - 0x2000 : (raw >> 1); }
        raw = r.rcu(); return (raw & 1) ? (raw >> 1) - 0x10000000 : (raw >> 1);
    };
    return r;
}

// Known GUIDs
var LANGS = {
    "{3F5162F8-07C6-11D3-9053-00C04FA302A1}": "C#",
    "{3A12D0B8-C26C-11D0-B442-00A0244A1DD2}": "C/C++",
    "{AF046CD1-D0E1-11D2-977C-00A0C9B4D50C}": "VB.NET",
    "{AB4F38C9-B6E6-43BA-BE3B-58080B2CCCE3}": "F#",
};
var HASHES = {
    "{FF1816EC-AA5E-4D10-87F7-6F4963833460}": "SHA-1",
    "{8829D00F-11B8-4213-878B-770E8597AC16}": "SHA-256",
    "{0139CB5E-8762-43A2-9B27-3B258C499FCC}": "SHA-384",
    "{0ED92FA1-A0B9-4A45-8CFB-1D43924B1F89}": "SHA-512",
};
var CDI_K = {
    "{CC110556-A091-4D38-9FEC-25AB9A351A6A}": "StateMachineHoistedLocalScopes",
    "{7E4D4708-096E-4C5C-AEDA-CB10BA6A740D}": "EmbeddedSource",
    "{0CF4B558-A96B-4F38-A2E4-D51F8C41B388}": "SourceLink",
    "{B4BFCC93-A41E-4229-BD2E-26879B3C8279}": "CompilationOptions",
    "{6DA9A61E-F8C7-4874-BE62-68BC5630DF71}": "DefaultNamespace",
};
function gn(g) { var x = g.toUpperCase(); return LANGS[x] || HASHES[x] || CDI_K[x] || null; }

var TN = {
    0x00: "Module", 0x01: "TypeRef", 0x02: "TypeDef", 0x04: "Field",
    0x06: "MethodDef", 0x08: "Param", 0x09: "InterfaceImpl",
    0x0A: "MemberRef", 0x0B: "Constant", 0x0C: "CustomAttribute",
    0x0D: "FieldMarshal", 0x0E: "DeclSecurity", 0x11: "StandAloneSig",
    0x12: "EventMap", 0x14: "Event", 0x15: "PropertyMap",
    0x17: "Property", 0x18: "MethodSemantics", 0x19: "MethodImpl",
    0x1A: "ModuleRef", 0x1B: "TypeSpec", 0x1C: "ImplMap",
    0x1D: "FieldRVA", 0x20: "Assembly", 0x23: "AssemblyRef",
    0x26: "File", 0x27: "ExportedType", 0x28: "ManifestResource",
    0x29: "NestedClass", 0x2A: "GenericParam", 0x2B: "MethodSpec",
    0x2C: "GenericParamConstraint",
    0x30: "Document", 0x31: "MethodDebugInformation",
    0x32: "LocalScope", 0x33: "LocalVariable",
    0x34: "LocalConstant", 0x35: "ImportScope",
    0x36: "StateMachineMethod", 0x37: "CustomDebugInformation",
};

var CDI_TBLS = [
    0x06, 0x04, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x00,
    0x0E, 0x17, 0x14, 0x11, 0x1A, 0x1B, 0x20, 0x23,
    0x26, 0x27, 0x28, 0x2A, 0x2C, 0x2B,
    0x30, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
];

// Verify magic
var mag = await hf.read(0, 4);
if (mag[0] !== 0x42 || mag[1] !== 0x53 || mag[2] !== 0x4A || mag[3] !== 0x42) {
    hf.error("Invalid Portable PDB (expected BSJB signature)");
    await hf.template.end();
    throw new Error("Not a valid Portable PDB");
}

hf.log("Portable PDB (ECMA-335 Metadata) format detected");

// ══════════════════════════════════════════════
// Metadata Root Header
// ══════════════════════════════════════════════
hf.template.seek(0);
hf.template.beginStruct("MetadataRoot");
await hf.template.addField("Signature", "u32", { color: "#2196F3" });
var majorVer = await hf.template.addField("MajorVersion", "u16");
var minorVer = await hf.template.addField("MinorVersion", "u16");
await hf.template.addField("Reserved", "u32");
var verStrLen = await hf.template.addField("VersionStringLength", "u32");

var verPadLen = (verStrLen + 3) & ~3;
var verBuf = await hf.read(16, verStrLen);
var versionStr = zstr(verBuf, 0);
await hf.template.addField("VersionString", "string:" + verPadLen, { color: "#03A9F4" });

await hf.template.addField("Flags", "u16");
var streamCount = await hf.template.addField("NumberOfStreams", "u16", { color: "#FF9800" });
hf.template.endStruct();

hf.log("  Version: " + majorVer + "." + minorVer + ", \"" + versionStr + "\", Streams: " + streamCount);

// ──────────────────────────────────────────────
// Stream Directory
// ──────────────────────────────────────────────
var stDir = {};
var sdStart = 16 + verPadLen + 4;
var sdLen = Math.min(streamCount * 48, fileSize - sdStart);
var sdBuf = await hf.read(sdStart, sdLen);
var sp = 0;

hf.template.beginStruct("StreamDirectory");
for (var si = 0; si < streamCount; si++) {
    var sOff = u32(sdBuf, sp);
    var sSz = u32(sdBuf, sp + 4);
    sp += 8;
    var ns = sp;
    while (sdBuf[sp] !== 0) sp++;
    var sNm = zstr(sdBuf, ns);
    sp = ((sp + 1) + 3) & ~3;
    var nfLen = sp - ns;
    var safe = sNm.replace(/#/g, "x");
    await hf.template.addField("Off_" + safe, "u32", { color: "#4CAF50" });
    await hf.template.addField("Size_" + safe, "u32", { color: "#F44336" });
    await hf.template.addField("Name_" + safe, "string:" + nfLen, { color: "#E040FB" });
    stDir[sNm] = { offset: sOff, size: sSz };
    hf.log("  " + sNm.padEnd(12) + " off=0x" + sOff.toString(16).padStart(4, "0") + " size=" + sSz + "B");
}
hf.template.endStruct();

// ──────────────────────────────────────────────
// Load streams
// ──────────────────────────────────────────────
async function ldSt(name) {
    var s = stDir[name];
    if (!s || s.size === 0) return new Uint8Array(0);
    var raw = await hf.read(s.offset, s.size);
    return new Uint8Array(raw);
}

var strHeap = await ldSt("#Strings");
var guidHeap = await ldSt("#GUID");
var blobHeap = await ldSt("#Blob");
var pdbRaw = await ldSt("#Pdb");
var tildeRaw = await ldSt("#~");

// Heap accessors
function gs(i) { return (i === 0 || i >= strHeap.length) ? "" : zstr(strHeap, i); }
function gb(i) {
    if (i === 0 || i >= blobHeap.length) return new Uint8Array(0);
    var r = mkBR(blobHeap, i);
    return new Uint8Array(r.rn(r.rcu()));
}
function gg(i) {
    if (i === 0) return "{00000000-0000-0000-0000-000000000000}";
    var o = (i - 1) * 16;
    return (o + 16 <= guidHeap.length) ? fmtGUID(guidHeap, o) : "{00000000-0000-0000-0000-000000000000}";
}

// ══════════════════════════════════════════════
// #Pdb Stream — full struct marking
// ══════════════════════════════════════════════
var pdbId = new Uint8Array(0);
var entryPt = 0;
var tsRows = {};

if (pdbRaw.length >= 32) {
    hf.template.seek(stDir["#Pdb"].offset);
    hf.template.beginStruct("PdbStream");
    await hf.template.addField("PdbId", "bytes:20", { color: "#E040FB" });
    entryPt = await hf.template.addField("EntryPoint", "u32", { color: "#FFC107" });
    await hf.template.addField("RefTableBits", "bytes:8", { color: "#9E9E9E" });

    pdbId = pdbRaw.slice(0, 20);
    var rLo = u32(pdbRaw, 24), rHi = u32(pdbRaw, 28);
    var po = 32, rList = [];
    for (var i = 0; i < 32; i++) {
        if (rLo & (1 << i)) {
            var rc = u32(pdbRaw, po); tsRows[i] = rc;
            rList.push({ id: i, nm: TN[i] || ("T" + i), rc: rc });
            await hf.template.addField("Rows_" + (TN[i] || "T" + i), "u32", { color: "#4CAF50" });
            po += 4;
        }
    }
    for (var i = 32; i < 64; i++) {
        if (rHi & (1 << (i - 32))) {
            var rc = u32(pdbRaw, po); tsRows[i] = rc;
            rList.push({ id: i, nm: TN[i] || ("T" + i), rc: rc });
            await hf.template.addField("Rows_" + (TN[i] || "T" + i), "u32", { color: "#4CAF50" });
            po += 4;
        }
    }
    hf.template.endStruct();

    hf.log("\n-- #Pdb Stream --");
    hf.log("  PDB ID: " + hexOf(pdbId));
    hf.log("  Entry Point: 0x" + entryPt.toString(16).padStart(8, "0"));
    hf.log("  Type System Tables (" + rList.length + "):");
    for (var x = 0; x < rList.length; x++) {
        var t = rList[x];
        hf.log("    [0x" + t.id.toString(16).padStart(2, "0") + "] " + t.nm.padEnd(25) + " " + t.rc + " rows");
    }
}

// ══════════════════════════════════════════════
// #~ Stream Header — full struct marking
// ══════════════════════════════════════════════
var hs = 0, siSz = 2, giSz = 2, biSz = 2;
var dRows = {};
var tDataOff = 0;

if (tildeRaw.length >= 24) {
    hf.template.seek(stDir["#~"].offset);
    hf.template.beginStruct("TildeHeader");
    await hf.template.addField("Reserved", "u32");
    var tmaj = await hf.template.addField("MajorVersion", "u8");
    var tmin = await hf.template.addField("MinorVersion", "u8");
    hs = await hf.template.addField("HeapSizes", "u8", { color: "#FF9800" });
    await hf.template.addField("Reserved2", "u8");
    await hf.template.addField("ValidTables", "bytes:8", { color: "#03A9F4" });
    await hf.template.addField("SortedTables", "bytes:8", { color: "#9E9E9E" });

    siSz = (hs & 1) ? 4 : 2;
    giSz = (hs & 2) ? 4 : 2;
    biSz = (hs & 4) ? 4 : 2;

    var vL = u32(tildeRaw, 8), vH = u32(tildeRaw, 12);
    var to = 24, dList = [];
    for (var i = 0; i < 32; i++) {
        if (vL & (1 << i)) {
            var r = u32(tildeRaw, to); dRows[i] = r;
            dList.push({ id: i, nm: TN[i] || ("T" + i), rc: r });
            await hf.template.addField("Rows_" + (TN[i] || "T" + i), "u32", { color: "#F44336" });
            to += 4;
        }
    }
    for (var i = 32; i < 64; i++) {
        if (vH & (1 << (i - 32))) {
            var r = u32(tildeRaw, to); dRows[i] = r;
            dList.push({ id: i, nm: TN[i] || ("T" + i), rc: r });
            await hf.template.addField("Rows_" + (TN[i] || "T" + i), "u32", { color: "#F44336" });
            to += 4;
        }
    }
    tDataOff = to;
    hf.template.endStruct();

    hf.log("\n-- #~ Stream --");
    hf.log("  Version: " + tmaj + "." + tmin +
           "  HeapSizes: 0x" + hs.toString(16).padStart(2, "0") +
           " (Str=" + siSz + "B Guid=" + giSz + "B Blob=" + biSz + "B)");
    hf.log("  Debug Tables (" + dList.length + "):");
    for (var x = 0; x < dList.length; x++) {
        var t = dList[x];
        hf.log("    [0x" + t.id.toString(16).padStart(2, "0") + "] " + t.nm.padEnd(30) + " " + t.rc + " rows");
    }
}

// ──────────────────────────────────────────────
// Index helpers
// ──────────────────────────────────────────────
var aR = {};
for (var k in tsRows) aR[k] = tsRows[k];
for (var k in dRows) aR[k] = dRows[k];
function tiSz(tid) { return (aR[tid] || 0) > 0xFFFF ? 4 : 2; }
function ciSz(bits, tbls) {
    var mx = 0;
    for (var i = 0; i < tbls.length; i++) { if (tbls[i] != null) mx = Math.max(mx, aR[tbls[i]] || 0); }
    return mx < (1 << (16 - bits)) ? 2 : 4;
}

// ══════════════════════════════════════════════
// Parse Debug Tables — ALL rows marked
// ══════════════════════════════════════════════
var td = tildeRaw, tp = tDataOff;
var docs = [], mdis = [], lscopes = [], lvars = [], lconsts = [], impscopes = [], sms = [], cdis = [];

var vvL = tildeRaw.length >= 12 ? u32(tildeRaw, 8) : 0;
var vvH = tildeRaw.length >= 16 ? u32(tildeRaw, 12) : 0;
function hasT(id) {
    return id < 32 ? !!(vvL & (1 << id)) : !!(vvH & (1 << (id - 32)));
}

// Document (0x30)
if (hasT(0x30) && dRows[0x30] > 0) {
    var n = dRows[0x30], rsz = biSz * 2 + giSz * 2;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("DocumentTable");
    for (var i = 0; i < n; i++) {
        var nB = ri(td, tp, biSz); tp += biSz;
        var haG = ri(td, tp, giSz); tp += giSz;
        var haB = ri(td, tp, biSz); tp += biSz;
        var laG = ri(td, tp, giSz); tp += giSz;
        await hf.template.addField("Doc_" + (i + 1), "bytes:" + rsz, { color: "#03A9F4" });
        docs.push({ nB: nB, haG: haG, haB: haB, laG: laG });
    }
    hf.template.endStruct();
}

// MethodDebugInformation (0x31)
if (hasT(0x31) && dRows[0x31] > 0) {
    var n = dRows[0x31], dSz = tiSz(0x30), rsz = dSz + biSz;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("MethodDebugInfoTable");
    for (var i = 0; i < n; i++) {
        var dI = ri(td, tp, dSz); tp += dSz;
        var spB = ri(td, tp, biSz); tp += biSz;
        await hf.template.addField("MDI_" + (i + 1), "bytes:" + rsz, { color: "#FFC107" });
        mdis.push({ dI: dI, spB: spB });
    }
    hf.template.endStruct();
}

// LocalScope (0x32)
if (hasT(0x32) && dRows[0x32] > 0) {
    var n = dRows[0x32];
    var mS = tiSz(0x06), iS = tiSz(0x35), vS = tiSz(0x33), cS = tiSz(0x34);
    var rsz = mS + iS + vS + cS + 8;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("LocalScopeTable");
    for (var i = 0; i < n; i++) {
        var mt = ri(td, tp, mS); tp += mS;
        var im = ri(td, tp, iS); tp += iS;
        var vl = ri(td, tp, vS); tp += vS;
        var cl = ri(td, tp, cS); tp += cS;
        var so = u32(td, tp); tp += 4;
        var ln = u32(td, tp); tp += 4;
        await hf.template.addField("Scope_" + (i + 1), "bytes:" + rsz, { color: "#4CAF50" });
        lscopes.push({ mt: mt, im: im, vl: vl, cl: cl, so: so, ln: ln });
    }
    hf.template.endStruct();
}

// LocalVariable (0x33)
if (hasT(0x33) && dRows[0x33] > 0) {
    var n = dRows[0x33], rsz = 4 + siSz;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("LocalVariableTable");
    for (var i = 0; i < n; i++) {
        var at = u16(td, tp); tp += 2;
        var ix = u16(td, tp); tp += 2;
        var nm = ri(td, tp, siSz); tp += siSz;
        await hf.template.addField("Var_" + (i + 1), "bytes:" + rsz, { color: "#F44336" });
        lvars.push({ at: at, ix: ix, nm: nm });
    }
    hf.template.endStruct();
}

// LocalConstant (0x34)
if (hasT(0x34) && dRows[0x34] > 0) {
    var n = dRows[0x34], rsz = siSz + biSz;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("LocalConstantTable");
    for (var i = 0; i < n; i++) {
        var nm = ri(td, tp, siSz); tp += siSz;
        var sg = ri(td, tp, biSz); tp += biSz;
        await hf.template.addField("Const_" + (i + 1), "bytes:" + rsz, { color: "#7C4DFF" });
        lconsts.push({ nm: nm, sg: sg });
    }
    hf.template.endStruct();
}

// ImportScope (0x35)
if (hasT(0x35) && dRows[0x35] > 0) {
    var n = dRows[0x35], pS = tiSz(0x35), rsz = pS + biSz;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("ImportScopeTable");
    for (var i = 0; i < n; i++) {
        var pa = ri(td, tp, pS); tp += pS;
        var ib = ri(td, tp, biSz); tp += biSz;
        await hf.template.addField("ImpScope_" + (i + 1), "bytes:" + rsz, { color: "#CDDC39" });
        impscopes.push({ pa: pa, ib: ib });
    }
    hf.template.endStruct();
}

// StateMachineMethod (0x36)
if (hasT(0x36) && dRows[0x36] > 0) {
    var n = dRows[0x36], mS = tiSz(0x06), rsz = mS * 2;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("StateMachineTable");
    for (var i = 0; i < n; i++) {
        var mn = ri(td, tp, mS); tp += mS;
        var ko = ri(td, tp, mS); tp += mS;
        await hf.template.addField("SM_" + (i + 1), "bytes:" + rsz, { color: "#CE93D8" });
        sms.push({ mn: mn, ko: ko });
    }
    hf.template.endStruct();
}

// CustomDebugInformation (0x37)
if (hasT(0x37) && dRows[0x37] > 0) {
    var n = dRows[0x37], pS = ciSz(5, CDI_TBLS), rsz = pS + giSz + biSz;
    hf.template.seek(stDir["#~"].offset + tp);
    hf.template.beginStruct("CustomDebugInfoTable");
    for (var i = 0; i < n; i++) {
        var pa = ri(td, tp, pS); tp += pS;
        var kG = ri(td, tp, giSz); tp += giSz;
        var vB = ri(td, tp, biSz); tp += biSz;
        await hf.template.addField("CDI_" + (i + 1), "bytes:" + rsz, { color: "#00BCD4" });
        cdis.push({ pa: pa, kG: kG, vB: vB });
    }
    hf.template.endStruct();
}

// ══════════════════════════════════════════════
// Mark heap regions as struct blocks
// ══════════════════════════════════════════════

// #Strings Heap
if (stDir["#Strings"] && stDir["#Strings"].size > 0) {
    var st = stDir["#Strings"];
    hf.template.seek(st.offset);
    hf.template.beginStruct("StringsHeap");
    // Parse individual null-terminated strings
    var sOff = 0;
    var sCount = 0;
    while (sOff < st.size) {
        var sStart = sOff;
        while (sOff < st.size && strHeap[sOff] !== 0) sOff++;
        sOff++; // skip null terminator
        var entryLen = sOff - sStart;
        if (entryLen > 0) {
            var sv = zstr(strHeap, sStart);
            var label = sv.length > 0 ? sv : "(empty)";
            if (label.length > 30) label = label.slice(0, 27) + "...";
            await hf.template.addField("Str_" + sCount + "_" + label.replace(/[^a-zA-Z0-9_]/g, "_"), "bytes:" + entryLen, { color: "#00E676" });
            sCount++;
        }
    }
    hf.template.endStruct();
}

// #US Heap (User Strings)
if (stDir["#US"] && stDir["#US"].size > 0) {
    var us = stDir["#US"];
    hf.template.seek(us.offset);
    hf.template.beginStruct("USHeap");
    await hf.template.addField("UserStrings", "bytes:" + us.size, { color: "#FF6D00" });
    hf.template.endStruct();
}

// #GUID Heap
if (stDir["#GUID"] && stDir["#GUID"].size > 0) {
    var gu = stDir["#GUID"];
    hf.template.seek(gu.offset);
    hf.template.beginStruct("GUIDHeap");
    var gc = Math.floor(gu.size / 16);
    for (var i = 0; i < gc; i++) {
        var g = gg(i + 1);
        var kn = gn(g);
        var lbl = kn ? kn : "GUID_" + (i + 1);
        await hf.template.addField(lbl.replace(/[^a-zA-Z0-9_]/g, "_"), "bytes:16", { color: "#536DFE" });
    }
    // trailing bytes (if any)
    var rem = gu.size - gc * 16;
    if (rem > 0) await hf.template.addField("GuidPadding", "bytes:" + rem, { color: "#536DFE" });
    hf.template.endStruct();
}

// #Blob Heap — parse blob entries
if (stDir["#Blob"] && stDir["#Blob"].size > 0) {
    var bl = stDir["#Blob"];
    hf.template.seek(bl.offset);
    hf.template.beginStruct("BlobHeap");
    var bOff = 0;
    var bCount = 0;
    while (bOff < bl.size) {
        var bStart = bOff;
        // Read compressed length
        var b0 = blobHeap[bOff];
        var bLen = 0;
        if (bOff >= bl.size) break;
        if ((b0 & 0x80) === 0) { bLen = b0; bOff += 1; }
        else if ((b0 & 0xC0) === 0x80) { bLen = ((b0 & 0x3F) << 8) | blobHeap[bOff + 1]; bOff += 2; }
        else if ((b0 & 0xE0) === 0xC0) { bLen = ((b0 & 0x1F) << 24) | (blobHeap[bOff + 1] << 16) | (blobHeap[bOff + 2] << 8) | blobHeap[bOff + 3]; bOff += 4; }
        else { bOff++; continue; }
        bOff += bLen;
        if (bOff > bl.size) bOff = bl.size;
        var totalEntry = bOff - bStart;
        if (totalEntry > 0) {
            await hf.template.addField("Blob_" + bCount, "bytes:" + totalEntry, { color: "#FF3D00" });
            bCount++;
        }
    }
    hf.template.endStruct();
}

// ══════════════════════════════════════════════
// Decode helpers
// ══════════════════════════════════════════════
function decDocName(bi) {
    var blob = gb(bi);
    if (blob.length === 0) return "";
    var rd = mkBR(blob, 0);
    var sep = rd.rb();
    var separator = sep !== 0 ? String.fromCharCode(sep) : "";
    var parts = [];
    while (rd.left() > 0) {
        var pi = rd.rcu();
        if (pi === 0) { parts.push(""); continue; }
        var pb = gb(pi);
        var s = "";
        for (var j = 0; j < pb.length; j++) s += String.fromCharCode(pb[j]);
        parts.push(s);
    }
    return parts.join(separator);
}

function decSeqPts(bi, iDoc) {
    var blob = gb(bi);
    if (blob.length === 0) return [];
    var rd = mkBR(blob, 0), pts = [];
    try {
        rd.rcu();
        var cur = iDoc;
        if (iDoc === 0) cur = rd.rcu();
        var il = 0, sl = 0, sc = 0, first = true;
        while (rd.left() > 0) {
            var dIL = rd.rcu();
            if (dIL === 0 && rd.left() > 0 && pts.length > 0) { cur = rd.rcu(); continue; }
            il += dIL;
            var dL = rd.rcu();
            var dC = dL === 0 ? rd.rcu() : rd.rci();
            if (dL === 0 && dC === 0) { pts.push({ il: il, hidden: true }); }
            else {
                if (first) { sl = rd.rcu(); sc = rd.rcu(); first = false; }
                else { sl += rd.rci(); sc += rd.rci(); }
                pts.push({ il: il, sl: sl, sc: sc, el: sl + dL, ec: sc + dC, hidden: false });
            }
        }
    } catch (e) {}
    return pts;
}

// ══════════════════════════════════════════════
// Log decoded data
// ══════════════════════════════════════════════

// Documents
if (docs.length > 0) {
    hf.log("\n-- Document Table (" + docs.length + " entries) --");
    for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        var nm = decDocName(d.nB);
        var lg = gg(d.laG), algo = gg(d.haG);
        var lang = LANGS[lg.toUpperCase()] || lg;
        var ha = HASHES[algo.toUpperCase()] || algo;
        var hb = gb(d.haB);
        var short = nm.length > 80 ? "..." + nm.slice(-77) : nm;
        hf.log("  [" + (i + 1) + "] " + short);
        hf.log("       Lang: " + lang + "  Hash: " + ha);
        if (hb.length > 0) hf.log("       " + hexOf(hb));
    }
}

// MethodDebugInfo
if (mdis.length > 0) {
    var wsp = 0;
    for (var i = 0; i < mdis.length; i++) if (mdis[i].spB !== 0) wsp++;
    hf.log("\n-- MethodDebugInformation (" + mdis.length + ", " + wsp + " w/ seq pts) --");
    var sh = 0;
    for (var i = 0; i < mdis.length && sh < 30; i++) {
        var m = mdis[i];
        if (m.spB === 0 && m.dI === 0) continue;
        var dn = "";
        if (m.dI >= 1 && m.dI <= docs.length) {
            dn = decDocName(docs[m.dI - 1].nB);
            if (dn.length > 60) dn = "..." + dn.slice(-57);
        }
        hf.log("  [" + (i + 1) + "] Doc=[" + m.dI + "] " + dn);
        if (m.spB !== 0) {
            var sps = decSeqPts(m.spB, m.dI);
            for (var j = 0; j < Math.min(sps.length, 5); j++) {
                var p = sps[j];
                if (p.hidden) hf.log("       IL_" + p.il.toString(16).padStart(4, "0") + ": <hidden>");
                else hf.log("       IL_" + p.il.toString(16).padStart(4, "0") + ": (" + p.sl + "," + p.sc + ")-(" + p.el + "," + p.ec + ")");
            }
            if (sps.length > 5) hf.log("       ... +" + (sps.length - 5) + " more");
        }
        sh++;
    }
}

// LocalScope, LocalVariable, LocalConstant, ImportScope, StateMachine, CDI
if (lscopes.length > 0) {
    hf.log("\n-- LocalScope (" + lscopes.length + ") --");
    for (var i = 0; i < Math.min(lscopes.length, 30); i++) {
        var ls = lscopes[i];
        hf.log("  [" + (i + 1) + "] Method=" + ls.mt + " Import=" + ls.im +
               " Off=0x" + ls.so.toString(16).padStart(4, "0") + " Len=0x" + ls.ln.toString(16).padStart(4, "0"));
    }
    if (lscopes.length > 30) hf.log("  ... +" + (lscopes.length - 30));
}
if (lvars.length > 0) {
    hf.log("\n-- LocalVariable (" + lvars.length + ") --");
    for (var i = 0; i < Math.min(lvars.length, 40); i++)
        hf.log("  [" + (i + 1) + "] Idx=" + lvars[i].ix + " Name=\"" + gs(lvars[i].nm) + "\"");
}
if (lconsts.length > 0) {
    hf.log("\n-- LocalConstant (" + lconsts.length + ") --");
    for (var i = 0; i < Math.min(lconsts.length, 40); i++)
        hf.log("  [" + (i + 1) + "] Name=\"" + gs(lconsts[i].nm) + "\"");
}
if (impscopes.length > 0) {
    hf.log("\n-- ImportScope (" + impscopes.length + ") --");
    for (var i = 0; i < Math.min(impscopes.length, 20); i++)
        hf.log("  [" + (i + 1) + "] Parent=" + impscopes[i].pa + " Blob=0x" + impscopes[i].ib.toString(16).padStart(4, "0"));
}
if (sms.length > 0) {
    hf.log("\n-- StateMachineMethod (" + sms.length + ") --");
    for (var i = 0; i < Math.min(sms.length, 20); i++)
        hf.log("  [" + (i + 1) + "] MoveNext=" + sms[i].mn + " Kickoff=" + sms[i].ko);
}
if (cdis.length > 0) {
    hf.log("\n-- CustomDebugInformation (" + cdis.length + ") --");
    for (var i = 0; i < Math.min(cdis.length, 30); i++) {
        var c = cdis[i];
        var gS = gg(c.kG);
        var kN = gn(gS) || gS;
        hf.log("  [" + (i + 1) + "] Parent=0x" + c.pa.toString(16).padStart(8, "0") + " Kind=" + kN);
    }
}

// GUID Heap log
var gc = Math.floor(guidHeap.length / 16);
if (gc > 0) {
    hf.log("\n-- GUID Heap (" + gc + ") --");
    for (var i = 0; i < gc; i++) {
        var g = gg(i + 1);
        var kn = gn(g);
        hf.log("  [" + (i + 1) + "] " + g + (kn ? " = " + kn : ""));
    }
}

// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════
hf.log("\n==============================");
hf.log("Portable PDB Summary");
hf.log("==============================");
hf.log("  Format: " + versionStr);
hf.log("  PDB ID: " + hexOf(pdbId));
hf.log("  Entry Point: 0x" + entryPt.toString(16).padStart(8, "0"));
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
hf.log("  Streams: " + streamCount);
hf.log("  Documents: " + docs.length);
hf.log("  Methods: " + mdis.length);
hf.log("  Scopes: " + lscopes.length + "  Vars: " + lvars.length + "  Consts: " + lconsts.length);
hf.log("  Imports: " + impscopes.length + "  StateMachines: " + sms.length + "  CDI: " + cdis.length);

var tsc = 0, tst = 0;
for (var k in tsRows) { tsc++; tst += tsRows[k]; }
hf.log("  Type system tables: " + tsc + " (" + tst + " total rows)");

if (docs.length > 0) {
    var lgs = {};
    for (var i = 0; i < docs.length; i++) {
        var g = gg(docs[i].laG);
        var l = LANGS[g.toUpperCase()] || "Unknown";
        lgs[l] = (lgs[l] || 0) + 1;
    }
    var lp = [];
    for (var lk in lgs) lp.push(lk + ": " + lgs[lk]);
    hf.log("  Languages: " + lp.join(", "));
}

await hf.template.end();