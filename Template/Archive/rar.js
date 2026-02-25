// HexForge JS Template - RAR.js
// Purpose: RAR Archive — RAR4 (v1.5-4.x) and RAR5 (v5.0+)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Archive
// ID Bytes: 52 61 72 21 1A 07 00 (RAR4) or 52 61 72 21 1A 07 01 00 (RAR5)
// Reference: https://www.rarlab.com/technote.htm

var fileSize = await hf.fileSize;

hf.template.begin("RAR Archive");
hf.template.setFormat("rar", "RAR Archive", [".rar", ".r00", ".r01"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
if (fileSize < 7) {
    hf.error("Not a RAR file (file too small)");
    await hf.template.end();
    throw new Error("Not a valid RAR");
}

var sig = await hf.read(0, 8);
var isRAR4 = (sig[0] === 0x52 && sig[1] === 0x61 && sig[2] === 0x72 && sig[3] === 0x21 &&
              sig[4] === 0x1A && sig[5] === 0x07 && sig[6] === 0x00);
var isRAR5 = (sig[0] === 0x52 && sig[1] === 0x61 && sig[2] === 0x72 && sig[3] === 0x21 &&
              sig[4] === 0x1A && sig[5] === 0x07 && sig[6] === 0x01 && sig[7] === 0x00);

if (!isRAR4 && !isRAR5) {
    hf.error("Not a RAR file (invalid signature)");
    await hf.template.end();
    throw new Error("Not a valid RAR");
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
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(1) + " GB";
}
function dosTime(date, time) {
    var y = ((date >> 9) & 0x7F) + 1980;
    var m = (date >> 5) & 0x0F;
    var d = date & 0x1F;
    var hh = (time >> 11) & 0x1F;
    var mm = (time >> 5) & 0x3F;
    var ss = (time & 0x1F) * 2;
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0") + " " +
           String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

// RAR5 vint (variable-length integer)
function readVint(buf, off) {
    var val = 0, shift = 0, len = 0;
    while (off + len < buf.length && len < 10) {
        var b = buf[off + len];
        val |= (b & 0x7F) * Math.pow(2, shift);
        len++;
        if ((b & 0x80) === 0) break;
        shift += 7;
    }
    return { val: val, len: len };
}

var RAR4_BLOCK_TYPES = {
    0x72: "MARKER", 0x73: "ARCHIVE", 0x74: "FILE",
    0x75: "COMMENT", 0x76: "EXTRA_INFO", 0x77: "SUB",
    0x78: "RECOVERY", 0x79: "OLDAUTH", 0x7A: "SUB_NEW", 0x7B: "ENDARC"
};
var RAR5_HEADER_TYPES = {
    1: "ARCHIVE", 2: "FILE", 3: "SERVICE", 4: "ENCRYPTION", 5: "ENDARC"
};
var RAR4_METHODS = { 0x30: "Store", 0x31: "Fastest", 0x32: "Fast", 0x33: "Normal", 0x34: "Good", 0x35: "Best" };
var RAR4_OS = { 0: "MSDOS", 1: "OS/2", 2: "Win32", 3: "Unix", 4: "MacOS", 5: "BeOS" };

var COMPRESSIONS_5 = { 0: "Store", 1: "LZ_Fastest", 2: "LZ_Fast", 3: "LZ_Normal", 4: "LZ_Good", 5: "LZ_Best" };

function blockColor(type, ver) {
    if (ver === 4) {
        if (type === 0x73) return "#2196F3";
        if (type === 0x74) return "#F44336";
        if (type === 0x7A) return "#E040FB";
        if (type === 0x7B) return "#9E9E9E";
        return "#FF9800";
    } else {
        if (type === 1) return "#2196F3";
        if (type === 2) return "#F44336";
        if (type === 3) return "#E040FB";
        if (type === 4) return "#FF5722";
        if (type === 5) return "#9E9E9E";
        return "#FF9800";
    }
}

// ══════════════════════════════════════════════
// RAR4
// ══════════════════════════════════════════════
if (isRAR4) {
    hf.template.seek(0);
    hf.template.beginStruct("Signature");
    await hf.template.addField("Magic", "bytes:7", { color: "#2196F3" });
    hf.template.endStruct();

    hf.log("RAR4 archive (v1.5-4.x)");

    var pos = 7;
    var blockCount = 0;
    var fileCount = 0;
    var dirCount = 0;
    var totalUnpacked = 0;
    var totalPacked = 0;
    var rarEnd = 7;
    var isEncrypted = false;
    var isSolid = false;
    var isVolume = false;

    while (pos + 7 <= fileSize && blockCount < 5000) {
        var hdrBuf = await hf.read(pos, Math.min(32, fileSize - pos));
        if (hdrBuf.length < 7) break;

        var hdrCRC = u16(hdrBuf, 0);
        var hdrType = hdrBuf[2];
        var hdrFlags = u16(hdrBuf, 3);
        var hdrSize = u16(hdrBuf, 5);

        if (hdrSize < 7 || pos + hdrSize > fileSize) break;

        var hasAddSize = (hdrFlags & 0x8000) !== 0;
        var addSize = 0;
        if (hasAddSize && hdrBuf.length >= 11) {
            addSize = u32(hdrBuf, 7);
        }

        var totalBlockSize = hdrSize + addSize;
        var typeName = RAR4_BLOCK_TYPES[hdrType] || ("Block_" + fmtHex(hdrType, 2));
        var color = blockColor(hdrType, 4);

        hf.template.seek(pos);
        hf.template.beginStruct(typeName + "_" + blockCount);

        // Header bytes
        await hf.template.addField("HeaderCRC", "u16", { color: "#9E9E9E" });
        await hf.template.addField("HeaderType", "u8", { color: color });
        await hf.template.addField("Flags", "u16", { color: color });
        await hf.template.addField("HeaderSize", "u16", { color: "#FF9800" });

        var hdrDataSize = hdrSize - 7;

        if (hdrType === 0x73) {
            // Archive header
            if (hdrDataSize >= 6) {
                await hf.template.addField("Reserved1", "u16");
                await hf.template.addField("Reserved2", "u32");
                hdrDataSize -= 6;
            }
            if (hdrFlags & 0x0001) isVolume = true;
            if (hdrFlags & 0x0008) isSolid = true;
            if (hdrFlags & 0x0004) { /* locked */ }
            if (hdrFlags & 0x0080) isEncrypted = true;

            var archFlags = [];
            if (isVolume) archFlags.push("Volume");
            if (isSolid) archFlags.push("Solid");
            if (isEncrypted) archFlags.push("Encrypted");
            if (hdrFlags & 0x0100) archFlags.push("FirstVolume");
            hf.log("  Archive flags: " + (archFlags.length > 0 ? archFlags.join(", ") : "none"));

        } else if (hdrType === 0x74 && hdrBuf.length >= 32) {
            // File header
            var packSize = u32(hdrBuf, 7);
            var unpSize = u32(hdrBuf, 11);
            var hostOS = hdrBuf[15];
            var fileCRC = u32(hdrBuf, 16);
            var fileTime = u16(hdrBuf, 20);
            var fileDate = u16(hdrBuf, 22);
            var unpVer = hdrBuf[24];
            var method = hdrBuf[25];
            var nameSize = u16(hdrBuf, 26);
            var attrs = u32(hdrBuf, 28);

            await hf.template.addField("PackSize", "u32", { color: "#F44336" });
            await hf.template.addField("UnpSize", "u32", { color: "#4CAF50" });
            await hf.template.addField("HostOS", "u8", { color: "#9E9E9E" });
            await hf.template.addField("FileCRC", "u32", { color: "#9E9E9E" });
            await hf.template.addField("FileTime", "u16", { color: "#FFC107" });
            await hf.template.addField("FileDate", "u16", { color: "#FFC107" });
            await hf.template.addField("UnpVer", "u8");
            await hf.template.addField("Method", "u8", { color: "#E040FB" });
            await hf.template.addField("NameSize", "u16");
            await hf.template.addField("FileAttr", "u32");

            hdrDataSize -= 25;

            // High 32 bits for large files
            if (hdrFlags & 0x0100) {
                if (hdrDataSize >= 8) {
                    var highPack = await hf.template.addField("HighPackSize", "u32");
                    var highUnp = await hf.template.addField("HighUnpSize", "u32");
                    packSize = highPack * 0x100000000 + packSize;
                    unpSize = highUnp * 0x100000000 + unpSize;
                    hdrDataSize -= 8;
                }
            }

            // Filename
            var fnLen = Math.min(nameSize, hdrDataSize);
            if (fnLen > 0) {
                await hf.template.addField("FileName", "string:" + fnLen, { color: color });
                hdrDataSize -= fnLen;
            }

            // Read filename bytes
            var fnOff = pos + hdrSize - hdrDataSize - fnLen;
            var fnBuf = await hf.read(pos + 32, Math.min(fnLen, fileSize - pos - 32));
            var fileName = "";
            for (var fi = 0; fi < fnBuf.length && fnBuf[fi] !== 0; fi++) {
                fileName += String.fromCharCode(fnBuf[fi]);
            }

            var isDir = (hdrFlags & 0x00E0) === 0x00E0;
            if (isDir) {
                dirCount++;
                if (dirCount <= 20) hf.log("  D " + fileName);
            } else {
                fileCount++;
                totalPacked += packSize;
                totalUnpacked += unpSize;
                if (fileCount <= 30) {
                    var methodStr = RAR4_METHODS[method] || ("m" + method);
                    hf.log("  F " + fileName + " (" + fmtSize(unpSize) + " -> " +
                           fmtSize(packSize) + " " + methodStr + ")");
                }
            }

            addSize = packSize;

        } else if (hdrType === 0x7B) {
            // End archive
            hf.log("  End of archive");
        }

        // Remaining header data
        if (hdrDataSize > 0) {
            await hf.template.addField("HdrExtra", "bytes:" + hdrDataSize, { color: "#9E9E9E" });
        }

        // Packed data after header
        if (addSize > 0) {
            var dataActual = Math.min(addSize, fileSize - pos - hdrSize);
            if (dataActual > 0) {
                await hf.template.addField("PackedData", "bytes:" + dataActual, { color: color });
            }
        }

        hf.template.endStruct();

        pos += totalBlockSize;
        rarEnd = pos;
        blockCount++;

        if (hdrType === 0x7B) break;
    }

    if (fileCount > 30) hf.log("  ... +" + (fileCount - 30) + " more files");
    if (dirCount > 20) hf.log("  ... +" + (dirCount - 20) + " more dirs");

    // Summary
    hf.log("\n==============================");
    hf.log("RAR4 Summary");
    hf.log("==============================");
    hf.log("  Files: " + fileCount + ", Dirs: " + dirCount);
    hf.log("  Packed: " + fmtSize(totalPacked) + ", Unpacked: " + fmtSize(totalUnpacked));
    if (totalUnpacked > 0) hf.log("  Ratio: " + (totalPacked * 100 / totalUnpacked).toFixed(1) + "%");
    if (isSolid) hf.log("  Solid: yes");
    if (isEncrypted) hf.log("  Encrypted: yes");
    if (isVolume) hf.log("  Multi-volume: yes");
    hf.log("  RAR data ends at: " + fmtHex(rarEnd, 8));
    hf.log("  File size: " + fileSize.toLocaleString() + " bytes");

    if (rarEnd < fileSize) {
        var overlaySize = fileSize - rarEnd;
        hf.warn("Overlay data: " + overlaySize + " byte(s) after RAR end");
        hf.log("  Overlay: " + overlaySize.toLocaleString() + " bytes");
    }

    await hf.template.end();
    throw new Error("__RAR4_DONE__");
}

// ══════════════════════════════════════════════
// RAR5
// ══════════════════════════════════════════════
hf.template.seek(0);
hf.template.beginStruct("Signature");
await hf.template.addField("Magic", "bytes:8", { color: "#2196F3" });
hf.template.endStruct();

hf.log("RAR5 archive (v5.0+)");

var pos = 8;
var blockCount = 0;
var fileCount = 0;
var dirCount = 0;
var totalUnpacked = 0;
var totalPacked = 0;
var rarEnd = 8;
var isEncrypted = false;
var isSolid = false;
var isVolume = false;

while (pos + 4 <= fileSize && blockCount < 5000) {
    var peekBuf = await hf.read(pos, Math.min(64, fileSize - pos));
    if (peekBuf.length < 4) break;

    // Header CRC32 (4 bytes)
    var hdrCRC = u32(peekBuf, 0);
    var off = 4;

    // Header size (vint)
    var hs = readVint(peekBuf, off);
    var hdrSize = hs.val; off += hs.len;
    if (hdrSize === 0 || pos + 4 + hs.len + hdrSize > fileSize) break;

    // Read full header
    var fullHdrSize = 4 + hs.len + hdrSize;
    var hdrBuf = await hf.read(pos, fullHdrSize);
    off = 4 + hs.len;

    // Header type (vint)
    var ht = readVint(hdrBuf, off);
    var hdrType = ht.val; off += ht.len;

    // Header flags (vint)
    var hf2 = readVint(hdrBuf, off);
    var hdrFlags = hf2.val; off += hf2.len;

    var hasExtraArea = (hdrFlags & 0x0001) !== 0;
    var hasDataArea = (hdrFlags & 0x0002) !== 0;

    var extraSize = 0, dataSize = 0;
    if (hasExtraArea) {
        var es = readVint(hdrBuf, off);
        extraSize = es.val; off += es.len;
    }
    if (hasDataArea) {
        var ds = readVint(hdrBuf, off);
        dataSize = ds.val; off += ds.len;
    }

    var typeName = RAR5_HEADER_TYPES[hdrType] || ("Header_" + hdrType);
    var color = blockColor(hdrType, 5);

    hf.template.seek(pos);
    hf.template.beginStruct(typeName + "_" + blockCount);
    await hf.template.addField("Header", "bytes:" + fullHdrSize, { color: color });

    if (hdrType === 1) {
        // Archive header
        var archFlags = readVint(hdrBuf, off);
        var af = archFlags.val;
        if (af & 0x0001) isVolume = true;
        if (af & 0x0004) isSolid = true;

        var flagList = [];
        if (isVolume) flagList.push("Volume");
        if (af & 0x0002) flagList.push("VolumeNumberField");
        if (isSolid) flagList.push("Solid");
        hf.log("  Archive flags: " + (flagList.length > 0 ? flagList.join(", ") : "none"));

    } else if (hdrType === 2) {
        // File header
        var fileFlags = readVint(hdrBuf, off);
        var ff = fileFlags.val; off += fileFlags.len;

        var unpSz = readVint(hdrBuf, off); off += unpSz.len;
        var attrs = readVint(hdrBuf, off); off += attrs.len;
        var mtime32 = 0;
        if (ff & 0x0002) { mtime32 = u32(hdrBuf, off); off += 4; }
        var dataCRC = 0;
        if (ff & 0x0004) { dataCRC = u32(hdrBuf, off); off += 4; }

        var compInfo = readVint(hdrBuf, off); off += compInfo.len;
        var hostOS5 = readVint(hdrBuf, off); off += hostOS5.len;
        var nameLen = readVint(hdrBuf, off); off += nameLen.len;

        // Read filename (UTF-8)
        var fnBytes = Math.min(nameLen.val, hdrBuf.length - off);
        var fileName = "";
        for (var fi = 0; fi < fnBytes; fi++) {
            var c = hdrBuf[off + fi];
            if (c === 0) break;
            fileName += String.fromCharCode(c);
        }

        // Decode compression info
        var compAlgo = compInfo.val & 0x3F;
        var compMethod = (compInfo.val >> 7) & 0x07;
        var dictSizeBits = (compInfo.val >> 10) & 0x0F;

        var isDir = (ff & 0x0001) !== 0;

        if (isDir) {
            dirCount++;
            if (dirCount <= 20) hf.log("  D " + fileName);
        } else {
            fileCount++;
            totalUnpacked += unpSz.val;
            totalPacked += dataSize;
            if (fileCount <= 30) {
                var methodStr = COMPRESSIONS_5[compMethod] || ("m" + compMethod);
                hf.log("  F " + fileName + " (" + fmtSize(unpSz.val) + " -> " +
                       fmtSize(dataSize) + " " + methodStr + ")");
            }
        }

    } else if (hdrType === 3) {
        // Service header (e.g., CMT comment, ACL, streams)
        hf.log("  Service block (" + dataSize + " bytes data)");

    } else if (hdrType === 4) {
        // Archive encryption header
        isEncrypted = true;
        hf.log("  Archive encryption header");

    } else if (hdrType === 5) {
        // End of archive
        var endFlags = readVint(hdrBuf, off);
        hf.log("  End of archive" + ((endFlags.val & 0x0001) ? " (more volumes)" : ""));
    }

    // Data area
    if (dataSize > 0) {
        var dataActual = Math.min(dataSize, fileSize - pos - fullHdrSize);
        if (dataActual > 0) {
            await hf.template.addField("Data", "bytes:" + dataActual, { color: color });
        }
    }

    hf.template.endStruct();

    pos += fullHdrSize + dataSize;
    rarEnd = pos;
    blockCount++;

    if (hdrType === 5) break;
}

if (fileCount > 30) hf.log("  ... +" + (fileCount - 30) + " more files");
if (dirCount > 20) hf.log("  ... +" + (dirCount - 20) + " more dirs");

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (rarEnd < fileSize) {
    var overlaySize = fileSize - rarEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after RAR end");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("RAR5 Summary");
hf.log("==============================");
hf.log("  Files: " + fileCount + ", Dirs: " + dirCount);
hf.log("  Packed: " + fmtSize(totalPacked) + ", Unpacked: " + fmtSize(totalUnpacked));
if (totalUnpacked > 0) hf.log("  Ratio: " + (totalPacked * 100 / totalUnpacked).toFixed(1) + "%");
if (isSolid) hf.log("  Solid: yes");
if (isEncrypted) hf.log("  Encrypted: yes");
if (isVolume) hf.log("  Multi-volume: yes");
hf.log("  RAR data ends at: " + fmtHex(rarEnd, 8));
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (rarEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - rarEnd).toLocaleString() + " bytes");
}

await hf.template.end();