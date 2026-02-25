// HexForge JS Template - 7z.js
// Purpose: 7z Archive (7-Zip)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Archive
// ID Bytes: 37 7A BC AF 27 1C
// Reference: 7zFormat.txt (LZMA SDK)

var fileSize = await hf.fileSize;

hf.template.begin("7z Archive");
hf.template.setFormat("7z", "7-Zip Archive", [".7z"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
var sig = await hf.read(0, 6);
if (sig[0] !== 0x37 || sig[1] !== 0x7A || sig[2] !== 0xBC ||
    sig[3] !== 0xAF || sig[4] !== 0x27 || sig[5] !== 0x1C) {
    hf.error("Not a 7z file (invalid signature)");
    await hf.template.end();
    throw new Error("Not a valid 7z");
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

// 7z variable-length integer (first byte encodes size)
function readVarInt(buf, off) {
    var first = buf[off];
    var mask = 0x80, size = 0;
    while (size < 8 && (first & mask) !== 0) { mask >>= 1; size++; }
    if (size === 0) return { val: first, len: 1 };
    var val = first & (mask - 1);
    for (var i = 0; i < size; i++) {
        val |= buf[off + 1 + i] << (8 * i + (7 - size));
    }
    return { val: val, len: size + 1 };
}

// Property IDs
var PROP_NAMES = {
    0x00: "kEnd", 0x01: "kHeader", 0x02: "kArchiveProperties",
    0x03: "kAdditionalStreamsInfo", 0x04: "kMainStreamsInfo",
    0x05: "kFilesInfo", 0x06: "kPackInfo", 0x07: "kUnPackInfo",
    0x08: "kSubStreamsInfo", 0x09: "kSize", 0x0A: "kCRC",
    0x0B: "kFolder", 0x0C: "kCodersUnPackSize", 0x0D: "kNumUnPackStream",
    0x0E: "kEmptyStream", 0x0F: "kEmptyFile", 0x10: "kAnti",
    0x11: "kName", 0x12: "kCTime", 0x13: "kATime", 0x14: "kMTime",
    0x15: "kWinAttributes", 0x16: "kComment", 0x17: "kEncodedHeader",
    0x18: "kStartPos", 0x19: "kDummy"
};

// Known codec IDs
var CODEC_NAMES = {
    "030101": "LZMA", "21": "LZMA2",
    "03030103": "BCJ (x86)", "03030205": "PPC", "03030401": "BCJ2",
    "03030501": "SPARC", "03030301": "Alpha", "03030801": "ARM",
    "03030a01": "ARM64",
    "040108": "Deflate", "040109": "BZip2", "04010c": "ZSTD",
    "040202": "Swap2", "040203": "Swap4",
    "06f10701": "7zAES (AES-256+SHA-256)", "06f00101": "AES-CBC-256"
};

function codecName(idBytes) {
    var hex = "";
    for (var i = 0; i < idBytes.length; i++) hex += idBytes[i].toString(16).padStart(2, "0");
    return CODEC_NAMES[hex] || ("Codec_" + hex);
}

// ──────────────────────────────────────────────
// Signature Header (32 bytes)
// ──────────────────────────────────────────────
var hdrBuf = await hf.read(0, 32);

hf.template.seek(0);
hf.template.beginStruct("SignatureHeader");
await hf.template.addField("Signature", "bytes:6", { color: "#2196F3" });
await hf.template.addField("MajorVersion", "u8", { color: "#03A9F4" });
await hf.template.addField("MinorVersion", "u8", { color: "#03A9F4" });
await hf.template.addField("StartHeaderCRC", "u32", { color: "#9E9E9E" });
await hf.template.addField("NextHeaderOffset", "u64", { color: "#4CAF50" });
await hf.template.addField("NextHeaderSize", "u64", { color: "#FF9800" });
await hf.template.addField("NextHeaderCRC", "u32", { color: "#9E9E9E" });
hf.template.endStruct();

var verMajor = hdrBuf[6];
var verMinor = hdrBuf[7];
var nextHdrOff = u64(hdrBuf, 12);
var nextHdrSize = u64(hdrBuf, 20);
var nextHdrCRC = u32(hdrBuf, 28);

hf.log("7-Zip archive v" + verMajor + "." + verMinor);
hf.log("  NextHeader offset: " + fmtHex(nextHdrOff, 12) + " (from byte 32)");
hf.log("  NextHeader size: " + nextHdrSize);

// ──────────────────────────────────────────────
// Packed Data (between header and NextHeader)
// ──────────────────────────────────────────────
var packedStart = 32;
var nextHdrAbsOff = 32 + nextHdrOff;

if (nextHdrAbsOff > packedStart && nextHdrAbsOff <= fileSize) {
    var packedSize = nextHdrAbsOff - packedStart;
    if (packedSize > 0) {
        hf.template.seek(packedStart);
        hf.template.beginStruct("PackedStreams");
        await hf.template.addField("CompressedData", "bytes:" + packedSize, { color: "#F44336" });
        hf.template.endStruct();
        hf.log("  Packed data: " + packedSize.toLocaleString() + " bytes");
    }
}

// ──────────────────────────────────────────────
// End Header / Encoded Header
// ──────────────────────────────────────────────
var szEnd = 32; // minimum

if (nextHdrAbsOff + nextHdrSize <= fileSize && nextHdrSize > 0) {
    var nhBuf = new Uint8Array(await hf.read(nextHdrAbsOff, nextHdrSize));

    hf.template.seek(nextHdrAbsOff);
    hf.template.beginStruct("EndHeader");
    await hf.template.addField("HeaderData", "bytes:" + nextHdrSize, { color: "#FF9800" });
    hf.template.endStruct();

    szEnd = nextHdrAbsOff + nextHdrSize;

    // Parse header structure
    hf.log("\n-- End Header --");

    var pos = 0;
    var isEncoded = false;
    var numPackStreams = 0;
    var packSizes = [];
    var numFolders = 0;
    var codecs = [];
    var unpackSizes = [];
    var fileNames = [];
    var numFiles = 0;

    function readByte() {
        if (pos >= nhBuf.length) return 0;
        return nhBuf[pos++];
    }
    function readU32() {
        if (pos + 4 > nhBuf.length) return 0;
        var v = u32(nhBuf, pos); pos += 4; return v;
    }
    function readU64() {
        if (pos + 8 > nhBuf.length) return 0;
        var v = u64(nhBuf, pos); pos += 8; return v;
    }
    function readNumber() {
        if (pos >= nhBuf.length) return 0;
        var first = nhBuf[pos];
        if (first < 128) { pos++; return first; }
        // Extended encoding
        var mask = 0x40, val = first & 0x3F, shift = 6, bytes = 1;
        while (bytes < 8 && (first & (0x80 >> bytes)) !== 0) {
            mask >>= 1;
            bytes++;
        }
        for (var i = 0; i < bytes; i++) {
            pos++;
            if (pos >= nhBuf.length) break;
            val |= nhBuf[pos] << shift;
            shift += 8;
        }
        pos++;
        return val;
    }
    function skipData(size) { pos += size; }

    // Top-level property
    var topProp = readByte();
    if (topProp === 0x17) {
        // kEncodedHeader — the header itself is compressed
        isEncoded = true;
        hf.log("  Header is encoded (compressed)");

        // Parse PackInfo for encoded header
        var prop = readByte();
        while (prop !== 0x00 && pos < nhBuf.length) {
            if (prop === 0x06) { // kPackInfo
                var packPos = readNumber();
                numPackStreams = readNumber();
                hf.log("  PackInfo: pos=" + packPos + " streams=" + numPackStreams);
                // Read sizes
                var sub = readByte();
                if (sub === 0x09) { // kSize
                    for (var i = 0; i < numPackStreams; i++) {
                        var sz = readNumber();
                        packSizes.push(sz);
                        hf.log("    PackStream " + i + ": " + sz + " bytes");
                    }
                    sub = readByte(); // next
                }
                if (sub === 0x00) {} // kEnd
            } else if (prop === 0x07) { // kUnPackInfo
                var sub = readByte();
                if (sub === 0x0B) { // kFolder
                    numFolders = readNumber();
                    var external = readByte();
                    hf.log("  Folders: " + numFolders);

                    for (var fi = 0; fi < numFolders && fi < 10; fi++) {
                        var numCoders = readNumber();
                        for (var ci = 0; ci < numCoders; ci++) {
                            var coderFlags = readByte();
                            var idSize = coderFlags & 0x0F;
                            var isComplex = (coderFlags & 0x10) !== 0;
                            var hasAttrs = (coderFlags & 0x20) !== 0;
                            var idBytes = [];
                            for (var bi = 0; bi < idSize; bi++) idBytes.push(readByte());
                            var cName = codecName(idBytes);
                            codecs.push(cName);
                            hf.log("    Coder: " + cName);
                            if (isComplex) {
                                var numInStreams = readNumber();
                                var numOutStreams = readNumber();
                            }
                            if (hasAttrs) {
                                var propSize = readNumber();
                                skipData(propSize);
                            }
                        }
                        // BindPairs if complex
                    }
                    sub = readByte();
                }
                // kCodersUnPackSize
                if (sub === 0x0C) {
                    for (var fi = 0; fi < numFolders; fi++) {
                        var uSz = readNumber();
                        unpackSizes.push(uSz);
                    }
                    sub = readByte();
                }
                if (sub === 0x00) {} // kEnd
            } else {
                break;
            }
            prop = readByte();
        }
    } else if (topProp === 0x01) {
        // kHeader — uncompressed header, parse structure
        hf.log("  Header is uncompressed");

        var prop = readByte();
        while (prop !== 0x00 && pos < nhBuf.length) {
            var propName = PROP_NAMES[prop] || ("Prop_" + fmtHex(prop, 2));

            if (prop === 0x04) { // kMainStreamsInfo
                hf.log("  MainStreamsInfo:");
                var sub = readByte();
                while (sub !== 0x00 && pos < nhBuf.length) {
                    if (sub === 0x06) { // kPackInfo
                        var packPos = readNumber();
                        numPackStreams = readNumber();
                        hf.log("    PackInfo: pos=" + packPos + " streams=" + numPackStreams);
                        var ss = readByte();
                        if (ss === 0x09) {
                            for (var i = 0; i < numPackStreams; i++) packSizes.push(readNumber());
                            ss = readByte();
                        }
                        if (ss === 0x00) {}
                    } else if (sub === 0x07) { // kUnPackInfo
                        var ss = readByte();
                        if (ss === 0x0B) { // kFolder
                            numFolders = readNumber();
                            var external = readByte();
                            hf.log("    Folders: " + numFolders);
                            for (var fi = 0; fi < numFolders && fi < 20; fi++) {
                                var numCoders = readNumber();
                                for (var ci = 0; ci < numCoders; ci++) {
                                    var coderFlags = readByte();
                                    var idSize = coderFlags & 0x0F;
                                    var isComplex = (coderFlags & 0x10) !== 0;
                                    var hasAttrs = (coderFlags & 0x20) !== 0;
                                    var idBytes = [];
                                    for (var bi = 0; bi < idSize; bi++) idBytes.push(readByte());
                                    codecs.push(codecName(idBytes));
                                    if (isComplex) { readNumber(); readNumber(); }
                                    if (hasAttrs) { var ps = readNumber(); skipData(ps); }
                                }
                            }
                            ss = readByte();
                        }
                        if (ss === 0x0C) {
                            for (var fi = 0; fi < numFolders; fi++) unpackSizes.push(readNumber());
                            ss = readByte();
                        }
                        while (ss !== 0x00 && pos < nhBuf.length) ss = readByte();
                    } else if (sub === 0x08) { // kSubStreamsInfo
                        var ss = readByte();
                        while (ss !== 0x00 && pos < nhBuf.length) {
                            if (ss === 0x0D) { // kNumUnPackStream
                                for (var fi = 0; fi < numFolders; fi++) readNumber();
                            } else if (ss === 0x09) { // kSize
                                // variable — skip until next prop
                                // heuristic: read until we hit a known prop or kEnd
                                while (pos < nhBuf.length) {
                                    var peek = nhBuf[pos];
                                    if (peek === 0x00 || peek === 0x0A || PROP_NAMES[peek]) break;
                                    readNumber();
                                }
                            } else if (ss === 0x0A) { // kCRC
                                // skip CRC data
                                break;
                            }
                            ss = readByte();
                        }
                    } else {
                        break;
                    }
                    sub = readByte();
                }
            } else if (prop === 0x05) { // kFilesInfo
                numFiles = readNumber();
                hf.log("  FilesInfo: " + numFiles + " files");

                var fProp = readByte();
                while (fProp !== 0x00 && pos < nhBuf.length) {
                    var fSize = readNumber();
                    var fEnd = pos + fSize;

                    if (fProp === 0x11 && fSize > 0) { // kName
                        var external = readByte();
                        // Read UTF-16LE names
                        var nameIdx = 0;
                        while (pos < fEnd && nameIdx < numFiles && nameIdx < 50) {
                            var name = "";
                            while (pos + 1 < fEnd) {
                                var lo = nhBuf[pos]; var hi = nhBuf[pos + 1];
                                pos += 2;
                                if (lo === 0 && hi === 0) break;
                                name += String.fromCharCode(lo | (hi << 8));
                            }
                            if (name) {
                                fileNames.push(name);
                                if (nameIdx < 20) hf.log("    " + name);
                            }
                            nameIdx++;
                        }
                        if (nameIdx >= 20 && nameIdx < numFiles) hf.log("    ... +" + (numFiles - 20) + " more");
                    }
                    pos = fEnd;
                    fProp = readByte();
                }
            } else {
                // Skip unknown property
                break;
            }
            prop = readByte();
        }
    } else {
        hf.log("  Header starts with property: " + (PROP_NAMES[topProp] || fmtHex(topProp, 2)));
    }

    // Log codecs found
    if (codecs.length > 0) {
        var unique = [];
        for (var i = 0; i < codecs.length; i++) {
            if (unique.indexOf(codecs[i]) === -1) unique.push(codecs[i]);
        }
        hf.log("  Codecs: " + unique.join(", "));
    }
    if (unpackSizes.length > 0) {
        var totalUnpack = 0;
        for (var i = 0; i < unpackSizes.length; i++) totalUnpack += unpackSizes[i];
        hf.log("  Uncompressed size: " + totalUnpack.toLocaleString() + " bytes");
    }
} else {
    hf.warn("NextHeader beyond file bounds");
}

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (szEnd < fileSize) {
    var overlaySize = fileSize - szEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after 7z end");
    var oSigBuf = await hf.read(szEnd, Math.min(6, overlaySize));
    var oSig = "";
    for (var i = 0; i < Math.min(4, oSigBuf.length); i++) oSig += String.fromCharCode(oSigBuf[i]);
    // Check for multi-volume
    if (oSigBuf[0] === 0x37 && oSigBuf[1] === 0x7A && oSigBuf[2] === 0xBC)
        hf.warn("  Overlay appears to be another 7z archive (multi-volume?)");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("7z Summary");
hf.log("==============================");
hf.log("  Version: " + verMajor + "." + verMinor);
if (isEncoded) hf.log("  Header: encoded (compressed)");
hf.log("  Folders: " + numFolders);
if (numFiles > 0) hf.log("  Files: " + numFiles);
if (codecs.length > 0) {
    var unique = [];
    for (var i = 0; i < codecs.length; i++) if (unique.indexOf(codecs[i]) === -1) unique.push(codecs[i]);
    hf.log("  Codecs: " + unique.join(", "));
}
hf.log("  7z data ends at: " + fmtHex(szEnd, 8) + " (" + szEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (szEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - szEnd).toLocaleString() + " bytes");
}

await hf.template.end();