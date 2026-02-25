// HexForge JS Template - MicrosoftPDB.js
// Purpose: Microsoft PDB (Program Database) — MSF-based Debug Symbols
// Category: Executable / Debug
// Reference: https://llvm.org/docs/PDB/MsfFile.html
//            https://github.com/microsoft/microsoft-pdb

var fileSize = await hf.fileSize;

hf.template.begin("PDB (Program Database)");
hf.template.setFormat("pdb-msf", "Microsoft PDB", [".pdb"]);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function i32(buf, off) { return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); }

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

// Read data scattered across multiple pages/blocks
async function readPages(pageList, pgSize, totalBytes) {
    var result = new Uint8Array(totalBytes);
    var written = 0;
    for (var i = 0; i < pageList.length && written < totalBytes; i++) {
        var toRead = Math.min(pgSize, totalBytes - written);
        var chunk = await hf.read(pageList[i] * pgSize, toRead);
        result.set(new Uint8Array(chunk), written);
        written += toRead;
    }
    return result;
}

// ──────────────────────────────────────────────
// Detect format version
// ──────────────────────────────────────────────
var MAGIC_V7 = "Microsoft C/C++ MSF 7.00\r\n\x1ADS\x00\x00\x00";
var MAGIC_V2 = "Microsoft C/C++ program database 2.00\r\n\x1AJG\x00\x00";

var mag32 = await hf.read(0, 32);
var magStr32 = "";
for (var i = 0; i < 32; i++) magStr32 += String.fromCharCode(mag32[i]);
var isV7 = (magStr32 === MAGIC_V7);

var isV2 = false;
if (!isV7) {
    var mag44 = await hf.read(0, 44);
    var magStr44 = "";
    for (var i = 0; i < 44; i++) magStr44 += String.fromCharCode(mag44[i]);
    isV2 = (magStr44 === MAGIC_V2);
}

if (!isV7 && !isV2) {
    hf.error("Invalid PDB magic signature");
    await hf.template.end();
    throw new Error("Not a valid PDB file");
}

// ══════════════════════════════════════════════
// PDB v2.0 (JG / Small MSF)
// ══════════════════════════════════════════════
if (isV2) {
    hf.log("PDB v2.00 (JG / Small MSF) format detected");

    hf.template.seek(0);
    hf.template.beginStruct("MSF_Header_V2");
    await hf.template.addField("Magic", "string:44", { color: "#2196F3" });
    var v2PgSz = await hf.template.addField("PageSize", "u32", { color: "#FF9800" });
    var v2Fpm = await hf.template.addField("FreePageMap", "u16");
    var v2NumPg = await hf.template.addField("TotalPages", "u16", { color: "#FFC107" });
    var v2StSz = await hf.template.addField("StreamTableBytes", "u32", { color: "#F44336" });
    await hf.template.addField("Reserved", "u32");

    var v2StPgCount = Math.ceil(v2StSz / v2PgSz);
    var v2StPgList = [];
    for (var i = 0; i < v2StPgCount; i++) {
        var pn = await hf.template.addField("StPage_" + i, "u16", { color: "#4CAF50" });
        v2StPgList.push(pn);
    }
    hf.template.endStruct();

    hf.log("  Page size: " + v2PgSz + "B, Pages: " + v2NumPg + ", StreamTable: " + v2StSz + "B");

    // Read stream table
    var v2St = await readPages(v2StPgList, v2PgSz, v2StSz);
    var v2Off = 0;
    var v2NumSt = u16(v2St, v2Off); v2Off += 2;
    v2Off += 2; // reserved

    var v2Sizes = [];
    for (var i = 0; i < v2NumSt && v2Off + 8 <= v2St.length; i++) {
        var cb = i32(v2St, v2Off);
        v2Sizes.push(cb === -1 ? 0 : cb);
        v2Off += 8; // size + reserved
    }

    var v2PageLists = [];
    for (var i = 0; i < v2NumSt; i++) {
        var sz = v2Sizes[i];
        var nPg = sz > 0 ? Math.ceil(sz / v2PgSz) : 0;
        var pg = [];
        for (var j = 0; j < nPg && v2Off + 2 <= v2St.length; j++) {
            pg.push(u16(v2St, v2Off)); v2Off += 2;
        }
        v2PageLists.push(pg);
    }

    hf.log("  Streams: " + v2NumSt);
    for (var i = 0; i < Math.min(v2NumSt, 20); i++) {
        if (v2Sizes[i] > 0 || i <= 3)
            hf.log("    Stream " + i + ": " + v2Sizes[i] + "B");
    }

    // Stream 1: PDB Info
    if (v2NumSt > 1 && v2Sizes[1] >= 12) {
        var pd = await readPages(v2PageLists[1], v2PgSz, v2Sizes[1]);
        hf.template.seek(v2PageLists[1][0] * v2PgSz);
        hf.template.beginStruct("PDB_Info_V2");
        await hf.template.addField("Version", "u32", { color: "#03A9F4" });
        await hf.template.addField("Signature", "u32", { color: "#9E9E9E" });
        await hf.template.addField("Age", "u32", { color: "#FFC107" });
        hf.template.endStruct();
        hf.log("\n-- PDB Info (NB10) --");
        hf.log("  Version: " + u32(pd, 0) + ", Sig: 0x" + u32(pd, 4).toString(16).toUpperCase() + ", Age: " + u32(pd, 8));
    }

    hf.log("\n==============================");
    hf.log("PDB v2.0 (JG) Summary");
    hf.log("==============================");
    hf.log("  Page size: " + v2PgSz + "B, Pages: " + v2NumPg + ", Streams: " + v2NumSt);
    hf.log("  File size: " + fileSize.toLocaleString() + " bytes");

    await hf.template.end();
    throw new Error("__PDB_V2_DONE__");
}

// ══════════════════════════════════════════════
// PDB v7.0 (DS / Big MSF)
// ══════════════════════════════════════════════
hf.log("PDB v7.00 (DS / Big MSF) format detected");

// ── MSF SuperBlock ──
hf.template.seek(0);
hf.template.beginStruct("MSF_SuperBlock");
await hf.template.addField("FileMagic", "string:32", { color: "#2196F3" });
var blockSize = await hf.template.addField("BlockSize", "u32", { color: "#FF9800" });
var freeBlockMap = await hf.template.addField("FreeBlockMapBlock", "u32");
var numBlocks = await hf.template.addField("NumBlocks", "u32", { color: "#FFC107" });
var numDirBytes = await hf.template.addField("NumDirectoryBytes", "u32", { color: "#F44336" });
await hf.template.addField("Unknown", "u32");
var blockMapAddr = await hf.template.addField("BlockMapAddr", "u32", { color: "#4CAF50" });
hf.template.endStruct();

// Pad rest of superblock page
var superBlockUsed = 32 + 4 * 6; // 56 bytes
if (blockSize > superBlockUsed) {
    hf.template.beginStruct("SuperBlockPadding");
    await hf.template.addField("Padding", "bytes:" + (blockSize - superBlockUsed), { color: "#9E9E9E" });
    hf.template.endStruct();
}

hf.log("  Block size: " + blockSize + "B, Blocks: " + numBlocks);
hf.log("  File size: " + fileSize + " bytes (expected " + (numBlocks * blockSize) + ")");
hf.log("  Directory: " + numDirBytes + "B, BlockMap at block " + blockMapAddr);

// ── FreeBlockMap pages (blocks 1 and 2 typically) ──
// Mark FPM blocks
if (freeBlockMap > 0 && freeBlockMap * blockSize < fileSize) {
    hf.template.seek(freeBlockMap * blockSize);
    hf.template.beginStruct("FreeBlockMap");
    await hf.template.addField("FPM_Data", "bytes:" + Math.min(blockSize, fileSize - freeBlockMap * blockSize), { color: "#795548" });
    hf.template.endStruct();
}

// ── Block Map ──
var numDirBlocks = Math.ceil(numDirBytes / blockSize);
var bmOff = blockMapAddr * blockSize;

hf.template.seek(bmOff);
hf.template.beginStruct("BlockMap");
var dirBlocks = [];
for (var i = 0; i < numDirBlocks; i++) {
    var blk = await hf.template.addField("DirBlock_" + i, "u32", { color: "#4CAF50" });
    dirBlocks.push(blk);
}
// Pad rest of block map page
var bmUsed = numDirBlocks * 4;
if (blockSize > bmUsed) {
    await hf.template.addField("BlockMapPad", "bytes:" + (blockSize - bmUsed), { color: "#9E9E9E" });
}
hf.template.endStruct();

hf.log("  Directory blocks: [" + dirBlocks.join(", ") + "]");

// ── Read & Parse Stream Directory ──
var dirData = await readPages(dirBlocks, blockSize, numDirBytes);
var dOff = 0;

var numStreams = u32(dirData, dOff); dOff += 4;
hf.log("  Streams: " + numStreams);

var stSizes = [];
for (var i = 0; i < numStreams; i++) {
    var sz = i32(dirData, dOff); dOff += 4;
    stSizes.push(sz === -1 ? 0 : sz);
}

var stBlocks = [];
for (var i = 0; i < numStreams; i++) {
    var sz = stSizes[i];
    var nB = sz > 0 ? Math.ceil(sz / blockSize) : 0;
    var bl = [];
    for (var j = 0; j < nB; j++) {
        bl.push(u32(dirData, dOff)); dOff += 4;
    }
    stBlocks.push(bl);
}

// Mark directory pages as structs
for (var di = 0; di < dirBlocks.length; di++) {
    var pgOff = dirBlocks[di] * blockSize;
    var pgSz = Math.min(blockSize, numDirBytes - di * blockSize);
    if (pgSz <= 0) break;
    hf.template.seek(pgOff);
    hf.template.beginStruct("StreamDirectory_Page" + di);
    await hf.template.addField("DirData_" + di, "bytes:" + pgSz, { color: "#00BCD4" });
    if (pgSz < blockSize) {
        await hf.template.addField("DirPad_" + di, "bytes:" + (blockSize - pgSz), { color: "#9E9E9E" });
    }
    hf.template.endStruct();
}

// Log stream listing
var SNAMES = { 0: "OldDirectory", 1: "PDB Info", 2: "TPI", 3: "DBI", 4: "IPI" };
for (var i = 0; i < Math.min(numStreams, 30); i++) {
    var nm = SNAMES[i] || ("Stream_" + i);
    if (stSizes[i] > 0 || i <= 4) {
        var bstr = stBlocks[i].length > 0 ?
            " blk=[" + stBlocks[i].slice(0, 5).join(",") + (stBlocks[i].length > 5 ? ",..." : "") + "]" : "";
        hf.log("  " + i + ": " + nm + " " + stSizes[i] + "B" + bstr);
    }
}
if (numStreams > 30) hf.log("  ... +" + (numStreams - 30) + " more streams");

// Read stream helper
async function rdSt(idx) {
    if (idx >= numStreams || stSizes[idx] <= 0) return null;
    return await readPages(stBlocks[idx], blockSize, stSizes[idx]);
}

// Helper: mark stream blocks in template
async function markStreamBlocks(idx, label, color) {
    if (idx >= numStreams || stSizes[idx] <= 0) return;
    var sz = stSizes[idx];
    var bl = stBlocks[idx];
    for (var i = 0; i < bl.length; i++) {
        var pgOff = bl[i] * blockSize;
        var pgSz = Math.min(blockSize, sz - i * blockSize);
        if (pgSz <= 0) break;
        hf.template.seek(pgOff);
        hf.template.beginStruct(label + "_Block" + i);
        await hf.template.addField(label + "_" + i, "bytes:" + pgSz, { color: color });
        if (pgSz < blockSize) {
            await hf.template.addField(label + "_Pad" + i, "bytes:" + (blockSize - pgSz), { color: "#9E9E9E" });
        }
        hf.template.endStruct();
    }
}

// ══════════════════════════════════════════════
// Stream 1: PDB Info Stream
// ══════════════════════════════════════════════
var pdbGUID = "", pdbAge = 0, pdbSig = 0;

if (numStreams > 1 && stSizes[1] >= 28) {
    var pd = await rdSt(1);
    if (pd) {
        var pdbVer = u32(pd, 0);
        pdbSig = u32(pd, 4);
        pdbAge = u32(pd, 8);
        pdbGUID = fmtGUID(pd, 12);

        // Mark first block with parsed fields
        hf.template.seek(stBlocks[1][0] * blockSize);
        hf.template.beginStruct("PDB_InfoStream");

        var pdbVerMap = {
            19941610: "VC2", 19950623: "VC4", 19950814: "VC41",
            19960307: "VC50", 19970604: "VC56", 19980914: "VC60",
            19990604: "VC70Dep", 20000404: "VC70", 20030901: "VC80",
            20091201: "VC110", 20140508: "VC140"
        };

        await hf.template.addField("Version", "u32", { color: "#03A9F4", enumMap: pdbVerMap });
        await hf.template.addField("Signature", "u32", { color: "#9E9E9E" });
        await hf.template.addField("Age", "u32", { color: "#FFC107" });
        await hf.template.addField("GUID", "bytes:16", { color: "#E040FB" });

        // Named stream map
        if (pd.length > 28) {
            var nsBufSz = u32(pd, 28);
            await hf.template.addField("NamedStreamBufSize", "u32");
            if (nsBufSz > 0) {
                await hf.template.addField("NamedStreamStrings", "bytes:" + nsBufSz, { color: "#CDDC39" });
            }
            // Rest of stream 1 data
            var remain = stSizes[1] - 32 - nsBufSz;
            if (remain > 0) {
                await hf.template.addField("NamedStreamHashMap", "bytes:" + remain, { color: "#CDDC39" });
            }
        }
        hf.template.endStruct();

        // Mark remaining blocks
        if (stBlocks[1].length > 1) {
            for (var bi = 1; bi < stBlocks[1].length; bi++) {
                var pgOff = stBlocks[1][bi] * blockSize;
                var pgSz = Math.min(blockSize, stSizes[1] - bi * blockSize);
                if (pgSz > 0) {
                    hf.template.seek(pgOff);
                    hf.template.beginStruct("PDBInfo_Block" + bi);
                    await hf.template.addField("PDBInfo_" + bi, "bytes:" + pgSz, { color: "#03A9F4" });
                    hf.template.endStruct();
                }
            }
        }

        var verName = pdbVerMap[pdbVer] || ("Unknown(" + pdbVer + ")");
        hf.log("\n-- PDB Info Stream --");
        hf.log("  Version: " + verName + " (" + pdbVer + ")");
        hf.log("  Signature: 0x" + pdbSig.toString(16).toUpperCase());
        hf.log("  Age: " + pdbAge);
        hf.log("  GUID: " + pdbGUID);

        // Parse named stream map
        if (pd.length > 32) {
            var nsBufSz = u32(pd, 28);
            if (nsBufSz > 0 && 32 + nsBufSz + 8 <= pd.length) {
                var nsBuf = pd.slice(32, 32 + nsBufSz);
                var mOff = 32 + nsBufSz;
                if (mOff + 8 <= pd.length) {
                    var htSz = u32(pd, mOff), htCap = u32(pd, mOff + 4);
                    mOff += 8;
                    hf.log("  Named streams (hash: " + htSz + "/" + htCap + "):");
                    if (mOff + 4 <= pd.length) {
                        var presW = u32(pd, mOff); mOff += 4;
                        var presBits = [];
                        for (var i = 0; i < presW; i++) { presBits.push(u32(pd, mOff)); mOff += 4; }
                        if (mOff + 4 <= pd.length) {
                            var delW = u32(pd, mOff); mOff += 4 + delW * 4;
                            for (var w = 0; w < presW; w++) {
                                for (var bit = 0; bit < 32; bit++) {
                                    if (presBits[w] & (1 << bit)) {
                                        if (mOff + 8 <= pd.length) {
                                            var kOff = u32(pd, mOff); mOff += 4;
                                            var val = u32(pd, mOff); mOff += 4;
                                            var nm = zstr(nsBuf, kOff);
                                            if (nm) hf.log("    \"" + nm + "\" -> Stream " + val);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Feature codes
            var featNames = {
                20091201: "VC110", 20140508: "VC140",
                0x4D544F4E: "NoTypeMerge", 0x494E494D: "MinimalDebugInfo"
            };
            var feats = [];
            var sOff = pd.length - 4;
            while (sOff > 28 + nsBufSz) {
                var code = u32(pd, sOff);
                if (featNames[code]) { feats.unshift(featNames[code] + " (0x" + code.toString(16).toUpperCase() + ")"); sOff -= 4; }
                else break;
            }
            if (feats.length > 0) {
                hf.log("  Features: " + feats.join(", "));
            }
        }
    }
}

// ══════════════════════════════════════════════
// Stream 2: TPI (Type Information)
// ══════════════════════════════════════════════
if (numStreams > 2 && stSizes[2] >= 56) {
    var td = await rdSt(2);
    if (td) {
        hf.template.seek(stBlocks[2][0] * blockSize);
        hf.template.beginStruct("TPI_Stream");

        var tpiVerMap = { 19950410: "V40", 19951122: "V41", 19961031: "V50", 19990903: "V70", 20040203: "V80" };
        var tpiVer = await hf.template.addField("Version", "u32", { color: "#03A9F4", enumMap: tpiVerMap });
        await hf.template.addField("HeaderSize", "u32");
        var tiBegin = await hf.template.addField("TypeIndexBegin", "u32", { color: "#FFC107" });
        var tiEnd = await hf.template.addField("TypeIndexEnd", "u32", { color: "#FFC107" });
        var tiBytes = await hf.template.addField("TypeRecordBytes", "u32", { color: "#F44336" });
        await hf.template.addField("HashStreamIndex", "u16");
        await hf.template.addField("HashAuxStreamIndex", "u16");
        await hf.template.addField("HashKeySize", "u32");
        await hf.template.addField("NumHashBuckets", "u32");
        await hf.template.addField("HashValueBufOff", "i32");
        await hf.template.addField("HashValueBufLen", "u32");
        await hf.template.addField("IndexOffBufOff", "i32");
        await hf.template.addField("IndexOffBufLen", "u32");
        await hf.template.addField("HashAdjBufOff", "i32");
        await hf.template.addField("HashAdjBufLen", "u32");
        hf.template.endStruct();

        // Mark remaining TPI blocks
        await markStreamBlocks(2, "TPI", "#03A9F4");

        hf.log("\n-- TPI Stream (Type Info) --");
        hf.log("  Version: " + (tpiVerMap[tpiVer] || tpiVer));
        hf.log("  Types: 0x" + tiBegin.toString(16) + " - 0x" + tiEnd.toString(16) + " (" + (tiEnd - tiBegin) + " types)");
        hf.log("  Record data: " + tiBytes + "B");
    }
}

// ══════════════════════════════════════════════
// Stream 3: DBI (Debug Information)
// ══════════════════════════════════════════════
if (numStreams > 3 && stSizes[3] >= 64) {
    var dd = await rdSt(3);
    if (dd) {
        hf.template.seek(stBlocks[3][0] * blockSize);
        hf.template.beginStruct("DBI_Stream");

        var dbiVerMap = { 930803: "VC41", 19960307: "V50", 19970606: "V60", 19990903: "V70", 20091201: "V110" };
        var machMap = {
            0x0000: "Unknown", 0x014C: "x86", 0x01C0: "ARM", 0x01C4: "ARM_NT",
            0x0200: "IA64", 0x8664: "x64", 0xAA64: "ARM64"
        };

        await hf.template.addField("VersionSignature", "i32");
        var dbiVer = await hf.template.addField("VersionHeader", "u32", { color: "#03A9F4", enumMap: dbiVerMap });
        var dbiAge = await hf.template.addField("Age", "u32", { color: "#FFC107" });
        var gsStream = await hf.template.addField("GlobalStreamIndex", "u16", { color: "#4CAF50" });
        await hf.template.addField("BuildNumber", "u16");
        var psStream = await hf.template.addField("PublicStreamIndex", "u16", { color: "#4CAF50" });
        await hf.template.addField("PdbDllVersion", "u16");
        var symStream = await hf.template.addField("SymRecordStream", "u16", { color: "#4CAF50" });
        await hf.template.addField("PdbDllRbld", "u16");
        var modInfoSz = await hf.template.addField("ModInfoSize", "i32", { color: "#F44336" });
        var secContribSz = await hf.template.addField("SecContribSize", "i32");
        var secMapSz = await hf.template.addField("SecMapSize", "i32");
        var srcInfoSz = await hf.template.addField("SourceInfoSize", "i32");
        var tsMapSz = await hf.template.addField("TypeServerMapSize", "i32");
        await hf.template.addField("MFCTypeServerIndex", "u32");
        var optDbgSz = await hf.template.addField("OptDbgHeaderSize", "i32");
        var ecSz = await hf.template.addField("ECSubstreamSize", "i32");
        var dbiFlags = await hf.template.addField("Flags", "u16");
        var machine = await hf.template.addField("Machine", "u16", { color: "#E040FB", enumMap: machMap });
        await hf.template.addField("Padding", "u32");
        hf.template.endStruct();

        // Mark remaining DBI blocks
        await markStreamBlocks(3, "DBI", "#FF5722");

        hf.log("\n-- DBI Stream (Debug Info) --");
        hf.log("  Version: " + (dbiVerMap[dbiVer] || dbiVer) + ", Machine: " + (machMap[machine] || ("0x" + machine.toString(16))));
        hf.log("  Age: " + dbiAge + ", Global=" + gsStream + " Public=" + psStream + " SymRec=" + symStream);
        hf.log("  ModInfo=" + modInfoSz + "B SecContrib=" + secContribSz + "B SecMap=" + secMapSz + "B");
        hf.log("  SrcInfo=" + srcInfoSz + "B OptDbg=" + optDbgSz + "B EC=" + ecSz + "B");

        // Parse Module Info
        var mOff = 64, mIdx = 0;
        var MAX_MODS = 100;
        hf.log("\n-- Module Info --");
        while (mOff < 64 + modInfoSz && mIdx < MAX_MODS) {
            if (mOff + 64 > dd.length) break;
            var scSec = u16(dd, mOff + 4);
            var scOff = u32(dd, mOff + 8);
            var scSize = u32(dd, mOff + 12);
            var modStrm = u16(dd, mOff + 34);
            var symByt = u32(dd, mOff + 36);
            var c13Byt = u32(dd, mOff + 44);
            var srcCnt = u16(dd, mOff + 48);

            var nmOff = mOff + 64;
            var nmEnd = nmOff;
            while (nmEnd < dd.length && dd[nmEnd] !== 0) nmEnd++;
            var modName = zstr(dd, mOff + 64);
            var objOff = nmEnd + 1;
            var objEnd = objOff;
            while (objEnd < dd.length && dd[objEnd] !== 0) objEnd++;
            var objName = zstr(dd, objOff);

            mOff = (objEnd + 1 + 3) & ~3;

            if (mIdx < 30) {
                var shortMod = modName.length > 65 ? "..." + modName.slice(-62) : modName;
                hf.log("  [" + mIdx + "] " + shortMod);
                if (objName && objName !== modName)
                    hf.log("       obj: " + (objName.length > 65 ? "..." + objName.slice(-62) : objName));
                hf.log("       sec=" + scSec + " off=0x" + scOff.toString(16) + " sz=" + scSize +
                       " stream=" + modStrm + " sym=" + symByt + "B c13=" + c13Byt + "B src=" + srcCnt);
            }
            mIdx++;
        }
        if (mIdx >= MAX_MODS) hf.log("  ... (truncated at " + MAX_MODS + " modules)");
        hf.log("  Total modules: " + mIdx);

        // Section Contributions
        if (secContribSz > 4) {
            var scStart = 64 + modInfoSz;
            if (scStart + 4 <= dd.length) {
                var scVer = u32(dd, scStart);
                var ver60 = (0xeffe0000 + 19970605) >>> 0;
                var verV2 = (0xeffe0000 + 20140516) >>> 0;
                var scVerStr = scVer === ver60 ? "Ver60" : scVer === verV2 ? "V2" : ("0x" + scVer.toString(16));
                var entrySz = scVer === verV2 ? 32 : 28;
                var nEntries = Math.floor((secContribSz - 4) / entrySz);
                hf.log("\n-- Section Contributions --");
                hf.log("  Version: " + scVerStr + ", Entries: " + nEntries + " (" + entrySz + "B each)");
            }
        }

        // Section Map
        if (secMapSz >= 4) {
            var smStart = 64 + modInfoSz + secContribSz;
            if (smStart + 4 <= dd.length) {
                var smCount = u16(dd, smStart);
                var smLog = u16(dd, smStart + 2);
                hf.log("\n-- Section Map --");
                hf.log("  Segments: " + smCount + ", Logical: " + smLog);
                var seOff = smStart + 4;
                for (var i = 0; i < Math.min(smCount, 20); i++) {
                    if (seOff + 20 > dd.length) break;
                    var fl = u16(dd, seOff);
                    var fr = u16(dd, seOff + 6);
                    var sl = u32(dd, seOff + 16);
                    var rwx = (fl & 1 ? "R" : "-") + (fl & 2 ? "W" : "-") + (fl & 4 ? "X" : "-");
                    hf.log("    Sec " + i + ": frame=" + fr + " len=0x" + sl.toString(16) + " " + rwx);
                    seOff += 20;
                }
            }
        }

        // Optional Debug Header
        if (optDbgSz >= 2) {
            var optStart = 64 + modInfoSz + secContribSz + secMapSz + srcInfoSz + tsMapSz + ecSz;
            if (optStart + optDbgSz <= dd.length) {
                var dbgNames = ["FPO", "Exception", "Fixup", "OmapToSrc", "OmapFromSrc",
                    "SectionHdr", "TokenRidMap", "Xdata", "Pdata", "NewFPO", "OrigSecHdr"];
                hf.log("\n-- Optional Debug Header --");
                var nEnt = Math.floor(optDbgSz / 2);
                for (var i = 0; i < nEnt; i++) {
                    var sIdx = u16(dd, optStart + i * 2);
                    var nm = dbgNames[i] || ("Entry_" + i);
                    if (sIdx !== 0xFFFF) hf.log("    " + nm + " -> Stream " + sIdx);
                }
            }
        }
    }
}

// ══════════════════════════════════════════════
// Stream 4: IPI (ID Information)
// ══════════════════════════════════════════════
if (numStreams > 4 && stSizes[4] >= 56) {
    var id = await rdSt(4);
    if (id) {
        hf.template.seek(stBlocks[4][0] * blockSize);
        hf.template.beginStruct("IPI_Stream");

        var ipiVerMap = { 19950410: "V40", 19951122: "V41", 19961031: "V50", 19990903: "V70", 20040203: "V80" };
        await hf.template.addField("Version", "u32", { color: "#03A9F4", enumMap: ipiVerMap });
        await hf.template.addField("HeaderSize", "u32");
        var iiBegin = await hf.template.addField("IdIndexBegin", "u32", { color: "#FFC107" });
        var iiEnd = await hf.template.addField("IdIndexEnd", "u32", { color: "#FFC107" });
        var iiBytes = await hf.template.addField("IdRecordBytes", "u32", { color: "#F44336" });
        await hf.template.addField("HashStreamIndex", "u16");
        await hf.template.addField("HashAuxStreamIndex", "u16");
        await hf.template.addField("HashKeySize", "u32");
        await hf.template.addField("NumHashBuckets", "u32");
        await hf.template.addField("HashValueBufOff", "i32");
        await hf.template.addField("HashValueBufLen", "u32");
        await hf.template.addField("IndexOffBufOff", "i32");
        await hf.template.addField("IndexOffBufLen", "u32");
        await hf.template.addField("HashAdjBufOff", "i32");
        await hf.template.addField("HashAdjBufLen", "u32");
        hf.template.endStruct();

        await markStreamBlocks(4, "IPI", "#7C4DFF");

        hf.log("\n-- IPI Stream (ID Info) --");
        hf.log("  IDs: 0x" + iiBegin.toString(16) + " - 0x" + iiEnd.toString(16) + " (" + (iiEnd - iiBegin) + " ids)");
        hf.log("  Record data: " + iiBytes + "B");
    }
}

// ══════════════════════════════════════════════
// Mark ALL remaining stream blocks + free blocks
// ══════════════════════════════════════════════

// Track which blocks are already marked (by the parsed structs above)
var markedBlocks = {};
markedBlocks[0] = true; // SuperBlock
if (freeBlockMap > 0) markedBlocks[freeBlockMap] = true; // FPM
markedBlocks[blockMapAddr] = true; // BlockMap page
for (var i = 0; i < dirBlocks.length; i++) markedBlocks[dirBlocks[i]] = true;
// Streams 1-4 were marked in detail above
for (var si = 0; si <= 4; si++) {
    if (si < numStreams) {
        for (var bi = 0; bi < stBlocks[si].length; bi++) markedBlocks[stBlocks[si][bi]] = true;
    }
}

// Classify streams for coloring
var streamCategory = {}; // streamIdx -> {label, color}
// From DBI: Global, Public, SymRecord
if (numStreams > 3 && stSizes[3] >= 64) {
    var dd2 = await rdSt(3);
    if (dd2) {
        var gs2 = u16(dd2, 12), ps2 = u16(dd2, 16), sr2 = u16(dd2, 20);
        if (gs2 < numStreams) streamCategory[gs2] = { label: "GlobalSym", color: "#FF6D00" };
        if (ps2 < numStreams) streamCategory[ps2] = { label: "PublicSym", color: "#FF6D00" };
        if (sr2 < numStreams) streamCategory[sr2] = { label: "SymRec", color: "#FF3D00" };

        // Module streams
        var mOff2 = 64, mIdx2 = 0;
        var modInfoSz2 = i32(dd2, 24);
        while (mOff2 < 64 + modInfoSz2 && mOff2 + 64 < dd2.length) {
            var ms = u16(dd2, mOff2 + 34);
            if (ms !== 0xFFFF && ms < numStreams) {
                streamCategory[ms] = { label: "Mod" + mIdx2, color: "#8BC34A" };
            }
            var ne = mOff2 + 64;
            while (ne < dd2.length && dd2[ne] !== 0) ne++;
            ne++;
            while (ne < dd2.length && dd2[ne] !== 0) ne++;
            mOff2 = (ne + 1 + 3) & ~3;
            mIdx2++;
        }

        // OptionalDbgHeader streams
        var secContribSz2 = i32(dd2, 28);
        var secMapSz2 = i32(dd2, 32);
        var srcInfoSz2 = i32(dd2, 36);
        var tsMapSz2 = i32(dd2, 40);
        var optDbgSz2 = i32(dd2, 48);
        var ecSz2 = i32(dd2, 52);
        var optStart2 = 64 + modInfoSz2 + secContribSz2 + secMapSz2 + srcInfoSz2 + tsMapSz2 + ecSz2;
        if (optDbgSz2 >= 2 && optStart2 + optDbgSz2 <= dd2.length) {
            var dbgN2 = ["FPO","Exception","Fixup","OmapToSrc","OmapFromSrc","SecHdr","TokenRid","Xdata","Pdata","NewFPO","OrigSecHdr"];
            for (var i = 0; i < Math.floor(optDbgSz2 / 2); i++) {
                var ds = u16(dd2, optStart2 + i * 2);
                if (ds !== 0xFFFF && ds < numStreams) {
                    streamCategory[ds] = { label: dbgN2[i] || ("Dbg" + i), color: "#795548" };
                }
            }
        }
    }
}

// Named streams from PDB Info
if (numStreams > 1 && stSizes[1] >= 32) {
    var pd2 = await rdSt(1);
    if (pd2 && pd2.length > 32) {
        var nsBS = u32(pd2, 28);
        if (nsBS > 0 && 32 + nsBS + 8 <= pd2.length) {
            var nsB = pd2.slice(32, 32 + nsBS);
            var mO = 32 + nsBS;
            if (mO + 8 <= pd2.length) {
                var htS = u32(pd2, mO); mO += 8;
                if (mO + 4 <= pd2.length) {
                    var pW = u32(pd2, mO); mO += 4;
                    var pBits = [];
                    for (var i = 0; i < pW; i++) { pBits.push(u32(pd2, mO)); mO += 4; }
                    if (mO + 4 <= pd2.length) {
                        var dW = u32(pd2, mO); mO += 4 + dW * 4;
                        for (var w = 0; w < pW; w++) {
                            for (var bit = 0; bit < 32; bit++) {
                                if (pBits[w] & (1 << bit)) {
                                    if (mO + 8 <= pd2.length) {
                                        var kO = u32(pd2, mO); mO += 4;
                                        var vl = u32(pd2, mO); mO += 4;
                                        var nm = zstr(nsB, kO);
                                        if (vl < numStreams && !streamCategory[vl]) {
                                            var short = nm.length > 15 ? nm.slice(0, 12) + "..." : nm;
                                            streamCategory[vl] = { label: "Named_" + short.replace(/[^a-zA-Z0-9]/g, "_"), color: "#009688" };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// Mark all unmarked stream blocks
var colors = ["#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#00BCD4", "#009688", "#8BC34A", "#CDDC39", "#FF9800", "#FF5722"];
for (var si = 0; si < numStreams; si++) {
    if (stSizes[si] <= 0) continue;
    // Check if any block of this stream is unmarked
    var hasUnmarked = false;
    for (var bi = 0; bi < stBlocks[si].length; bi++) {
        if (!markedBlocks[stBlocks[si][bi]]) { hasUnmarked = true; break; }
    }
    if (!hasUnmarked) continue;

    var cat = streamCategory[si];
    var label = cat ? cat.label : ("St" + si);
    var color = cat ? cat.color : colors[si % colors.length];

    for (var bi = 0; bi < stBlocks[si].length; bi++) {
        var blkNum = stBlocks[si][bi];
        if (markedBlocks[blkNum]) continue;
        markedBlocks[blkNum] = true;
        var pgOff = blkNum * blockSize;
        var pgSz = Math.min(blockSize, stSizes[si] - bi * blockSize);
        if (pgSz <= 0) break;
        hf.template.seek(pgOff);
        hf.template.beginStruct(label + "_Blk" + bi);
        await hf.template.addField(label + "_" + bi, "bytes:" + pgSz, { color: color });
        if (pgSz < blockSize) {
            await hf.template.addField(label + "_Pad" + bi, "bytes:" + (blockSize - pgSz), { color: "#9E9E9E" });
        }
        hf.template.endStruct();
    }
}

// Mark FPM block 2 (alternate FPM)
if (!markedBlocks[2] && 2 < numBlocks) {
    hf.template.seek(2 * blockSize);
    hf.template.beginStruct("FPM2");
    await hf.template.addField("FPM2_Data", "bytes:" + blockSize, { color: "#795548" });
    hf.template.endStruct();
    markedBlocks[2] = true;
}

// Mark any truly free/unused blocks
for (var b = 0; b < numBlocks; b++) {
    if (!markedBlocks[b]) {
        hf.template.seek(b * blockSize);
        hf.template.beginStruct("FreeBlock_" + b);
        await hf.template.addField("Free_" + b, "bytes:" + blockSize, { color: "#616161" });
        hf.template.endStruct();
    }
}

// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════
hf.log("\n==============================");
hf.log("PDB Summary");
hf.log("==============================");
hf.log("  Format: MSF v7.00 (DS)");
hf.log("  Block size: " + blockSize + "B");
hf.log("  Total blocks: " + numBlocks);
hf.log("  Total streams: " + numStreams);
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
hf.log("  GUID: " + pdbGUID);
hf.log("  Age: " + pdbAge);

var nonEmpty = 0, totalStBytes = 0;
for (var i = 0; i < numStreams; i++) {
    if (stSizes[i] > 0) { nonEmpty++; totalStBytes += stSizes[i]; }
}
hf.log("  Non-empty streams: " + nonEmpty);
hf.log("  Total stream data: " + totalStBytes.toLocaleString() + "B");

await hf.template.end();
