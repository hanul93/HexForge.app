// HexForge JS Template - TAR.js
// Purpose: TAR Archive (Tape Archive) — ustar / GNU / v7
// Author: Kei Choi (hanul93@gmail.com)
// Category: Archive
// ID Bytes: "ustar" at offset 257 (POSIX/GNU) or heuristic for v7
// Reference: https://www.gnu.org/software/tar/manual/html_node/Standard.html
//            IEEE Std 1003.1 (POSIX.1)

var fileSize = await hf.fileSize;

hf.template.begin("TAR Archive");
hf.template.setFormat("tar", "TAR Archive", [".tar"]);

// ──────────────────────────────────────────────
// Validate — check for ustar magic or v7 heuristic
// ──────────────────────────────────────────────
if (fileSize < 512) {
    hf.error("Not a TAR file (file too small, need at least 512 bytes)");
    await hf.template.end();
    throw new Error("Not a valid TAR");
}

var firstBlock = await hf.read(0, 512);

function ascii(buf, off, len) {
    var s = "";
    for (var i = 0; i < len && off + i < buf.length; i++) {
        var c = buf[off + i];
        if (c === 0) break;
        if (c >= 32 && c < 127) s += String.fromCharCode(c);
    }
    return s;
}

var magic257 = ascii(firstBlock, 257, 5);
var isUstar = (magic257 === "ustar");

// v7 heuristic: valid octal in size field (offset 124, 12 bytes) and valid typeflag
if (!isUstar) {
    var sizeField = ascii(firstBlock, 124, 12).trim();
    var typeFlag = firstBlock[156];
    var validOctal = /^[0-7\s]*$/.test(sizeField) && sizeField.length > 0;
    var validType = (typeFlag === 0 || (typeFlag >= 0x30 && typeFlag <= 0x37) || typeFlag === 0x78);
    // Also check name field is printable
    var name0 = firstBlock[0];
    var nameOk = (name0 >= 0x20 && name0 < 0x7F);
    if (!(validOctal && validType && nameOk)) {
        hf.error("Not a TAR file (no ustar magic and header validation failed)");
        await hf.template.end();
        throw new Error("Not a valid TAR");
    }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function parseOctal(buf, off, len) {
    var s = ascii(buf, off, len).trim();
    if (s === "") return 0;
    // GNU extensions: base-256 encoding (high bit set)
    if (buf[off] & 0x80) {
        var val = 0;
        for (var i = 1; i < len; i++) val = val * 256 + buf[off + i];
        return val;
    }
    return parseInt(s, 8) || 0;
}

function parseTime(buf, off, len) {
    var ts = parseOctal(buf, off, len);
    if (ts === 0) return "";
    try { return new Date(ts * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC"); }
    catch (e) { return ts.toString(); }
}

function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
}

var TYPE_NAMES = {
    0: "Regular", 0x30: "Regular", 0x31: "HardLink", 0x32: "SymLink",
    0x33: "CharDev", 0x34: "BlockDev", 0x35: "Directory", 0x36: "FIFO",
    0x37: "Contiguous",
    0x67: "GlobalExtHdr", 0x78: "ExtHeader(pax)",
    0x4B: "GNU_LongLink", 0x4C: "GNU_LongName",
    0x53: "GNU_Sparse", 0x56: "GNU_Volume"
};

function typeName(t) { return TYPE_NAMES[t] || ("Type_" + t.toString(16)); }

function typeColor(t) {
    if (t === 0 || t === 0x30) return "#F44336";       // regular file
    if (t === 0x35) return "#4CAF50";                   // directory
    if (t === 0x32) return "#03A9F4";                   // symlink
    if (t === 0x31) return "#00BCD4";                   // hardlink
    if (t === 0x78 || t === 0x67) return "#FFC107";     // pax extension
    if (t === 0x4C || t === 0x4B) return "#FF9800";     // GNU long
    return "#E040FB";                                   // other
}

// ──────────────────────────────────────────────
// Parse TAR entries
// ──────────────────────────────────────────────
var pos = 0;
var entryCount = 0;
var fileCount = 0;
var dirCount = 0;
var totalDataBytes = 0;
var tarEnd = 0;
var zeroBlocks = 0;
var format = isUstar ? "POSIX ustar" : "v7";
var isGNU = false;

hf.log("TAR archive (" + format + ")");

while (pos + 512 <= fileSize && entryCount < 5000) {
    var hdrBuf = await hf.read(pos, 512);

    // Check for end-of-archive (two consecutive 512-byte zero blocks)
    var allZero = true;
    for (var zi = 0; zi < 512; zi++) { if (hdrBuf[zi] !== 0) { allZero = false; break; } }
    if (allZero) {
        zeroBlocks++;
        hf.template.seek(pos);
        hf.template.beginStruct("EndBlock_" + zeroBlocks);
        await hf.template.addField("ZeroBlock", "bytes:512", { color: "#9E9E9E" });
        hf.template.endStruct();
        pos += 512;
        tarEnd = pos;
        if (zeroBlocks >= 2) {
            hf.log("  End of archive (2 zero blocks)");
            break;
        }
        continue;
    }
    zeroBlocks = 0;

    // Parse header fields
    var name = ascii(hdrBuf, 0, 100);
    var mode = ascii(hdrBuf, 100, 8).trim();
    var uid = parseOctal(hdrBuf, 108, 8);
    var gid = parseOctal(hdrBuf, 116, 8);
    var size = parseOctal(hdrBuf, 124, 12);
    var mtime = parseTime(hdrBuf, 136, 12);
    var chksum = ascii(hdrBuf, 148, 8).trim();
    var typeFlag = hdrBuf[156];
    var linkName = ascii(hdrBuf, 157, 100);

    // ustar fields
    var ustarMagic = ascii(hdrBuf, 257, 5);
    var ustarVer = ascii(hdrBuf, 263, 2);
    var uname = ascii(hdrBuf, 265, 32);
    var gname = ascii(hdrBuf, 297, 32);
    var devMajor = ascii(hdrBuf, 329, 8).trim();
    var devMinor = ascii(hdrBuf, 337, 8).trim();
    var prefix = ascii(hdrBuf, 345, 155);

    // GNU magic check
    if (ustarMagic === "ustar" && hdrBuf[262] === 0x20) {
        isGNU = true;
        format = "GNU tar";
    }

    // Full path
    var fullName = prefix ? (prefix + "/" + name) : name;

    var hdrColor = typeColor(typeFlag);

    // Mark header block
    hf.template.seek(pos);
    hf.template.beginStruct("Entry_" + entryCount);

    await hf.template.addField("name", "string:100", { color: hdrColor });
    await hf.template.addField("mode", "string:8", { color: "#9E9E9E" });
    await hf.template.addField("uid", "string:8", { color: "#9E9E9E" });
    await hf.template.addField("gid", "string:8", { color: "#9E9E9E" });
    await hf.template.addField("size", "string:12", { color: "#FF9800" });
    await hf.template.addField("mtime", "string:12", { color: "#FFC107" });
    await hf.template.addField("chksum", "string:8", { color: "#9E9E9E" });
    await hf.template.addField("typeflag", "u8", { color: hdrColor });
    await hf.template.addField("linkname", "string:100", { color: "#03A9F4" });
    await hf.template.addField("magic", "string:6", { color: "#2196F3" });
    await hf.template.addField("version", "string:2", { color: "#2196F3" });
    await hf.template.addField("uname", "string:32", { color: "#9E9E9E" });
    await hf.template.addField("gname", "string:32", { color: "#9E9E9E" });
    await hf.template.addField("devmajor", "string:8");
    await hf.template.addField("devminor", "string:8");
    await hf.template.addField("prefix", "string:155", { color: hdrColor });
    await hf.template.addField("padding", "bytes:12", { color: "#9E9E9E" });

    pos += 512;

    // Data blocks
    var dataBlocks = Math.ceil(size / 512);
    var paddedDataSize = dataBlocks * 512;

    if (size > 0 && pos + paddedDataSize <= fileSize) {
        await hf.template.addField("data", "bytes:" + size, { color: hdrColor });
        var padBytes = paddedDataSize - size;
        if (padBytes > 0) {
            await hf.template.addField("dataPad", "bytes:" + padBytes, { color: "#9E9E9E" });
        }
        totalDataBytes += size;
    } else if (size > 0) {
        // Truncated
        var avail = fileSize - pos;
        if (avail > 0) {
            await hf.template.addField("data_trunc", "bytes:" + avail, { color: "#616161" });
        }
        hf.warn("Truncated entry: " + fullName);
    }

    hf.template.endStruct();

    pos += paddedDataSize;
    tarEnd = pos;

    // Log entry
    var tName = typeName(typeFlag);
    var shortName = fullName.length > 60 ? "..." + fullName.slice(-57) : fullName;

    if (typeFlag === 0x35) {
        dirCount++;
        if (dirCount <= 20) hf.log("  D " + shortName);
    } else if (typeFlag === 0 || typeFlag === 0x30) {
        fileCount++;
        if (fileCount <= 30) hf.log("  F " + shortName + " (" + fmtSize(size) + ")");
    } else if (typeFlag === 0x32) {
        if (entryCount < 30) hf.log("  L " + shortName + " -> " + linkName);
    } else if (typeFlag === 0x78 || typeFlag === 0x67) {
        // pax extended header — log but don't count as file
        if (entryCount < 30) hf.log("  P " + tName + " (" + size + " bytes)");
    } else if (typeFlag === 0x4C) {
        // GNU LongName — the data is the long filename
        if (entryCount < 30) hf.log("  G GNU LongName (" + size + " bytes)");
    } else {
        if (entryCount < 30) hf.log("  ? " + tName + " " + shortName);
    }

    entryCount++;
}

if (fileCount > 30) hf.log("  ... +" + (fileCount - 30) + " more files");
if (dirCount > 20) hf.log("  ... +" + (dirCount - 20) + " more directories");

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (tarEnd < fileSize) {
    var overlaySize = fileSize - tarEnd;
    // Small trailing zeros are normal padding
    if (overlaySize > 0) {
        hf.warn("Overlay data: " + overlaySize + " byte(s) after TAR end");
    }
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("TAR Summary");
hf.log("==============================");
hf.log("  Format: " + format);
hf.log("  Entries: " + entryCount);
hf.log("  Files: " + fileCount + ", Directories: " + dirCount);
hf.log("  Total data: " + totalDataBytes.toLocaleString() + " bytes (" + fmtSize(totalDataBytes) + ")");
hf.log("  TAR data ends at: 0x" + tarEnd.toString(16) + " (" + tarEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (tarEnd < fileSize) {
    hf.log("  Trailing: " + (fileSize - tarEnd).toLocaleString() + " bytes");
}

await hf.template.end();