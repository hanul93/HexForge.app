// HexForge JS Template - ALZ.js
// Purpose: ALZ Archive (ALZip by ESTsoft)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Archive
// ID Bytes: 41 4C 5A 01 0A 00 00 00 ("ALZ\x01\x0a\x00\x00\x00")
// Reference: kippler/unalz (https://github.com/kippler/unalz)

var fileSize = await hf.fileSize;

hf.template.begin("ALZ Archive");
hf.template.setFormat("alz", "ALZ Archive", [".alz"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
if (fileSize < 8) {
    hf.error("Not an ALZ file (file too small)");
    await hf.template.end();
    throw new Error("Not a valid ALZ");
}

var sig = await hf.read(0, 8);
if (sig[0] !== 0x41 || sig[1] !== 0x4C || sig[2] !== 0x5A || sig[3] !== 0x01 ||
    sig[4] !== 0x0A || sig[5] !== 0x00 || sig[6] !== 0x00 || sig[7] !== 0x00) {
    hf.error("Not an ALZ file (expected 'ALZ\\x01\\x0A\\x00\\x00\\x00')");
    await hf.template.end();
    throw new Error("Not a valid ALZ");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function u64(buf, off) {
    var lo = u32(buf, off), hi = u32(buf, off + 4);
    return hi * 0x100000000 + lo;
}
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n, "0"); }
function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(1) + " GB";
}
function dosDateTime(ts) {
    var time = ts & 0xFFFF;
    var date = (ts >> 16) & 0xFFFF;
    var y = ((date >> 9) & 0x7F) + 1980;
    var m = (date >> 5) & 0x0F;
    var d = date & 0x1F;
    var hh = (time >> 11) & 0x1F;
    var mm = (time >> 5) & 0x3F;
    var ss = (time & 0x1F) * 2;
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0") + " " +
           String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

var COMP_METHODS = { 0: "Store", 1: "Bzip2", 2: "Deflate" };

// fileDescriptor → size field byte length
//   0x10 → 1byte,  0x20 → 2byte,  0x40 → 4byte,  0x80 → 8byte
function sizeByteLen(desc) { return (desc & 0xF0) >> 4; }

// Read an N-byte little-endian unsigned integer
function readUintN(buf, off, n) {
    if (n === 1) return buf[off];
    if (n === 2) return u16(buf, off);
    if (n === 4) return u32(buf, off);
    if (n === 8) return u64(buf, off);
    return 0;
}

// Decode filename — ALZ uses EUC-KR/CP949 for Korean filenames
function decodeFilename(buf, off, len) {
    var s = "";
    for (var i = 0; i < len && off + i < buf.length; i++) {
        var c = buf[off + i];
        if (c === 0) break;
        if (c >= 0x20 && c < 0x7F) s += String.fromCharCode(c);
        else if (c >= 0x80) s += String.fromCharCode(c);
        else s += ".";
    }
    return s;
}

// ──────────────────────────────────────────────
// ALZ File Header (8 bytes)
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("ALZ_Header");
await hf.template.addField("Signature", "bytes:4", { color: "#2196F3" });
await hf.template.addField("Version", "bytes:4", { color: "#03A9F4" });
hf.template.endStruct();

hf.log("ALZ (알집) archive detected");

// ──────────────────────────────────────────────
// Parse entries — Signature-based loop
// Signatures (4 bytes each):
//   BLZ\x01 (0x015A4C42) — Local File Header
//   CLZ\x01 (0x015A4C43) — Central Directory
//   CLZ\x02 (0x025A4C43) — End of Central Directory
//   DLZ\x01 (0x015A4C44) — Split Volume
//   ELZ\x01 (0x015A4C45) — Encryption
// ──────────────────────────────────────────────
var pos = 8;
var entryCount = 0;
var fileCount = 0;
var dirCount = 0;
var totalPacked = 0;
var totalUnpacked = 0;
var alzEnd = 8;
var isEncrypted = false;
var isSplit = false;

while (pos + 4 <= fileSize && entryCount < 10000) {
    var marker = await hf.read(pos, 4);
    var m0 = marker[0], m1 = marker[1], m2 = marker[2], m3 = marker[3];

    // ── BLZ\x01 — Local File Header ──
    if (m0 === 0x42 && m1 === 0x4C && m2 === 0x5A && m3 === 0x01) {

        // Fixed header: sig(4) + _SAlzLocalFileHeaderHead(9) = 13 bytes
        //   fileNameLength  (SHORT = 2)
        //   fileAttribute   (BYTE  = 1)
        //   fileTimeDate    (UINT32= 4)
        //   fileDescriptor  (BYTE  = 1)  — size field len + encryption flag
        //   unknown2        (BYTE  = 1)
        if (pos + 13 > fileSize) break;
        var headBuf = await hf.read(pos, 13);

        var nameLen = u16(headBuf, 4);
        var fileAttr = headBuf[6];
        var timestamp = u32(headBuf, 7);
        var fileDesc = headBuf[11];
        var unknown2byte = headBuf[12];

        var isDir = (fileAttr & 0x10) !== 0;
        var isFileEncrypted = (fileDesc & 0x01) !== 0;
        var byteLen = sizeByteLen(fileDesc); // 1, 2, 4, or 8

        if (isFileEncrypted) isEncrypted = true;

        // Variable part (only when byteLen > 0):
        //   compressionMethod (BYTE  = 1)
        //   unknown           (BYTE  = 1)
        //   fileCRC           (UINT32= 4)
        //   compressedSize    (byteLen bytes)
        //   uncompressedSize  (byteLen bytes)
        var varLen = 0;
        var compMethod = 0, fileCRC = 0, compSize = 0, uncompSize = 0;

        if (byteLen > 0) {
            varLen = 1 + 1 + 4 + byteLen + byteLen;
            var varOff = pos + 13;
            if (varOff + varLen > fileSize) break;
            var varBuf = await hf.read(varOff, varLen);

            compMethod = varBuf[0];
            fileCRC = u32(varBuf, 2);
            compSize = readUintN(varBuf, 6, byteLen);
            uncompSize = readUintN(varBuf, 6 + byteLen, byteLen);
        }

        var fixedPlusVar = 13 + varLen;
        if (pos + fixedPlusVar + nameLen > fileSize) break;

        var hdrColor = isDir ? "#4CAF50" : "#F44336";

        // Emit structure
        hf.template.seek(pos);
        hf.template.beginStruct("BLZ_" + entryCount);

        // Signature (4)
        await hf.template.addField("Signature", "bytes:4", { color: hdrColor });

        // Fixed header fields
        await hf.template.addField("FileNameLength", "u16", { color: "#FF9800" });
        await hf.template.addField("FileAttribute", "u8", { color: "#E040FB",
            enumMap: { 0x00: "None", 0x01: "ReadOnly", 0x02: "Hidden", 0x10: "Directory", 0x20: "File" } });
        await hf.template.addField("FileTimeDate", "u32", { color: "#FFC107",
            display: dosDateTime(timestamp) });
        await hf.template.addField("FileDescriptor", "u8", { color: "#03A9F4",
            display: (isFileEncrypted ? "Encrypted | " : "") + "SizeBytes=" + byteLen });
        await hf.template.addField("Unknown", "u8", { color: "#9E9E9E" });

        // Variable fields (only if byteLen > 0)
        if (byteLen > 0) {
            await hf.template.addField("CompressionMethod", "u8", { color: "#7C4DFF",
                enumMap: COMP_METHODS });
            await hf.template.addField("CompUnknown", "u8", { color: "#9E9E9E" });
            await hf.template.addField("FileCRC", "u32", { color: "#795548" });

            // Compressed and uncompressed sizes — typed by byteLen
            if (byteLen === 1) {
                await hf.template.addField("CompressedSize", "u8", { color: "#F44336" });
                await hf.template.addField("UncompressedSize", "u8", { color: "#4CAF50" });
            } else if (byteLen === 2) {
                await hf.template.addField("CompressedSize", "u16", { color: "#F44336" });
                await hf.template.addField("UncompressedSize", "u16", { color: "#4CAF50" });
            } else if (byteLen === 4) {
                await hf.template.addField("CompressedSize", "u32", { color: "#F44336" });
                await hf.template.addField("UncompressedSize", "u32", { color: "#4CAF50" });
            } else if (byteLen === 8) {
                await hf.template.addField("CompressedSize", "u64", { color: "#F44336" });
                await hf.template.addField("UncompressedSize", "u64", { color: "#4CAF50" });
            }
        }

        // Filename
        if (nameLen > 0) {
            var fnameBuf = await hf.read(pos + fixedPlusVar, nameLen);
            var fileName = decodeFilename(fnameBuf, 0, nameLen);
            await hf.template.addField("FileName", "bytes:" + nameLen, { color: hdrColor,
                display: fileName });
        } else {
            var fileName = "(empty)";
        }

        pos = pos + fixedPlusVar + nameLen;

        // Encryption check header (12 bytes if encrypted)
        if (isFileEncrypted) {
            var encLen = 12;
            if (pos + encLen <= fileSize) {
                await hf.template.addField("EncryptionCheck", "bytes:" + encLen, { color: "#FF5722" });
                pos += encLen;
            }
        }

        // Compressed data
        if (compSize > 0 && !isDir) {
            var dataActual = Math.min(compSize, fileSize - pos);
            if (dataActual > 0) {
                await hf.template.addField("CompressedData", "bytes:" + dataActual, { color: "#FFAB40" });
                pos += dataActual;
            }
        }

        hf.template.endStruct();

        // Log entry
        if (isDir) {
            dirCount++;
            if (dirCount <= 20) hf.log("  D " + fileName);
        } else {
            fileCount++;
            totalPacked += compSize;
            totalUnpacked += uncompSize;
            var methodStr = COMP_METHODS[compMethod] || ("Method_" + compMethod);
            if (fileCount <= 30) {
                hf.log("  F " + fileName + " (" + fmtSize(uncompSize) + " -> " +
                       fmtSize(compSize) + " " + methodStr +
                       (isFileEncrypted ? " Encrypted" : "") + ")");
            }
        }

        alzEnd = pos;
        entryCount++;
        continue;
    }

    // ── CLZ\x01 — Central Directory Structure (12 bytes) ──
    if (m0 === 0x43 && m1 === 0x4C && m2 === 0x5A && m3 === 0x01) {
        // _SAlzCentralDirectoryStructureHead:
        //   signature  (4) — CLZ\x01
        //   dwUnknown  (4) — typically 0
        //   dwUnknown2 (4) — typically 0 or CRC
        var clzSize = Math.min(12, fileSize - pos);
        hf.template.seek(pos);
        hf.template.beginStruct("CLZ_CentralDirectory");
        await hf.template.addField("Signature", "bytes:4", { color: "#9E9E9E" });
        if (clzSize >= 12) {
            await hf.template.addField("Unknown1", "u32", { color: "#BDBDBD" });
            await hf.template.addField("Unknown2", "u32", { color: "#BDBDBD" });
        } else if (clzSize > 4) {
            await hf.template.addField("Data", "bytes:" + (clzSize - 4), { color: "#BDBDBD" });
        }
        hf.template.endStruct();
        hf.log("  Central Directory (CLZ\\x01)");
        pos += clzSize;
        alzEnd = pos;
        continue;
    }

    // ── CLZ\x02 — End of Central Directory (4 bytes) ──
    if (m0 === 0x43 && m1 === 0x4C && m2 === 0x5A && m3 === 0x02) {
        hf.template.seek(pos);
        hf.template.beginStruct("CLZ_EndOfArchive");
        await hf.template.addField("Signature", "bytes:4", { color: "#607D8B" });
        hf.template.endStruct();
        hf.log("  End of archive (CLZ\\x02)");
        pos += 4;
        alzEnd = pos;
        break;
    }

    // ── CLZ\x03 — End marker (sometimes embedded) ──
    if (m0 === 0x43 && m1 === 0x4C && m2 === 0x5A && m3 === 0x03) {
        hf.template.seek(pos);
        hf.template.beginStruct("CLZ_EndMarker");
        await hf.template.addField("Signature", "bytes:4", { color: "#607D8B" });
        hf.template.endStruct();
        hf.log("  End marker (CLZ\\x03)");
        pos += 4;
        alzEnd = pos;
        break;
    }

    // ── DLZ\x01 — Split Volume ──
    if (m0 === 0x44 && m1 === 0x4C && m2 === 0x5A && m3 === 0x01) {
        isSplit = true;
        hf.template.seek(pos);
        hf.template.beginStruct("DLZ_Split");
        await hf.template.addField("Signature", "bytes:4", { color: "#FF5722" });
        hf.template.endStruct();
        hf.log("  Split volume marker (DLZ)");
        pos += 4;
        alzEnd = pos;
        continue;
    }

    // ── ELZ\x01 — Encryption marker ──
    if (m0 === 0x45 && m1 === 0x4C && m2 === 0x5A && m3 === 0x01) {
        isEncrypted = true;
        hf.template.seek(pos);
        hf.template.beginStruct("ELZ_Encrypt");
        await hf.template.addField("Signature", "bytes:4", { color: "#FF5722" });
        hf.template.endStruct();
        hf.log("  Encryption marker (ELZ)");
        pos += 4;
        alzEnd = pos;
        continue;
    }

    // Unknown marker — stop
    hf.warn("Unknown marker at " + fmtHex(pos, 8) + ": " +
            fmtHex(m0, 2) + " " + fmtHex(m1, 2) + " " + fmtHex(m2, 2) + " " + fmtHex(m3, 2));
    break;
}

if (fileCount > 30) hf.log("  ... +" + (fileCount - 30) + " more files");
if (dirCount > 20) hf.log("  ... +" + (dirCount - 20) + " more dirs");

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (alzEnd < fileSize) {
    var overlaySize = fileSize - alzEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after ALZ end");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("ALZ Summary");
hf.log("==============================");
hf.log("  Files: " + fileCount + ", Dirs: " + dirCount);
hf.log("  Packed: " + fmtSize(totalPacked) + ", Unpacked: " + fmtSize(totalUnpacked));
if (totalUnpacked > 0) hf.log("  Ratio: " + (totalPacked * 100 / totalUnpacked).toFixed(1) + "%");
if (isEncrypted) hf.log("  Encrypted: yes");
if (isSplit) hf.log("  Split volume: yes");
hf.log("  ALZ data ends at: " + fmtHex(alzEnd, 8) + " (" + alzEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (alzEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - alzEnd).toLocaleString() + " bytes");
}

await hf.template.end();