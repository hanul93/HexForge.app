// HexForge JS Template - ICO.js
// Purpose: ICO (Windows Icon) / CUR (Windows Cursor)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image
// ID Bytes: 00 00 01 00 (ICO) or 00 00 02 00 (CUR)
// Reference: https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10)

var fileSize = await hf.fileSize;

hf.template.begin("ICO/CUR Image");
hf.template.setFormat("ico", "ICO/CUR Image", [".ico", ".cur"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
var hdr = await hf.read(0, 6);
var reserved = hdr[0] | (hdr[1] << 8);
var imgType = hdr[2] | (hdr[3] << 8);
var imgCount = hdr[4] | (hdr[5] << 8);

if (reserved !== 0 || (imgType !== 1 && imgType !== 2)) {
    hf.error("Not an ICO/CUR file (expected reserved=0, type=1 or 2)");
    await hf.template.end();
    throw new Error("Not a valid ICO/CUR");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function i32(buf, off) {
    var v = u32(buf, off);
    return v > 0x7FFFFFFF ? v - 0x100000000 : v;
}

var typeName = imgType === 1 ? "ICO" : "CUR";
var COMPRESSIONS = { 0: "BI_RGB", 1: "BI_RLE8", 2: "BI_RLE4", 3: "BI_BITFIELDS" };

// ──────────────────────────────────────────────
// ICONDIR (6 bytes)
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("ICONDIR");
await hf.template.addField("Reserved", "u16", { color: "#9E9E9E" });
await hf.template.addField("Type", "u16", { color: "#2196F3" });
await hf.template.addField("Count", "u16", { color: "#FF9800" });
hf.template.endStruct();

hf.log(typeName + " file: " + imgCount + " image(s)");

// ──────────────────────────────────────────────
// ICONDIRENTRY array (16 bytes each)
// ──────────────────────────────────────────────
var entries = [];
var maxEntry = Math.min(imgCount, 256);

for (var i = 0; i < maxEntry; i++) {
    var eOff = 6 + i * 16;
    if (eOff + 16 > fileSize) break;

    var eBuf = await hf.read(eOff, 16);
    var eWidth = eBuf[0] === 0 ? 256 : eBuf[0];
    var eHeight = eBuf[1] === 0 ? 256 : eBuf[1];
    var eColors = eBuf[2];
    var ePlanes, eBpp;
    if (imgType === 1) {
        ePlanes = u16(eBuf, 4);
        eBpp = u16(eBuf, 6);
    } else {
        // CUR: hotspot X/Y instead of planes/bpp
        ePlanes = u16(eBuf, 4); // hotspotX
        eBpp = u16(eBuf, 6);    // hotspotY
    }
    var eDataSize = u32(eBuf, 8);
    var eDataOff = u32(eBuf, 12);

    entries.push({
        width: eWidth, height: eHeight, colors: eColors,
        planes: ePlanes, bpp: eBpp,
        dataSize: eDataSize, dataOffset: eDataOff
    });

    hf.template.seek(eOff);
    hf.template.beginStruct("Entry_" + i);
    await hf.template.addField("Width", "u8", { color: "#03A9F4" });
    await hf.template.addField("Height", "u8", { color: "#03A9F4" });
    await hf.template.addField("ColorCount", "u8", { color: "#FF9800" });
    await hf.template.addField("Reserved", "u8", { color: "#9E9E9E" });

    if (imgType === 1) {
        await hf.template.addField("Planes", "u16");
        await hf.template.addField("BitCount", "u16", { color: "#E040FB" });
    } else {
        await hf.template.addField("HotspotX", "u16", { color: "#F44336" });
        await hf.template.addField("HotspotY", "u16", { color: "#F44336" });
    }
    await hf.template.addField("BytesInRes", "u32", { color: "#F44336" });
    await hf.template.addField("ImageOffset", "u32", { color: "#4CAF50" });
    hf.template.endStruct();

    var logLine = "  [" + i + "] " + eWidth + "x" + eHeight;
    if (imgType === 1) {
        logLine += " " + eBpp + "bpp";
        if (eColors > 0) logLine += " " + eColors + "colors";
    } else {
        logLine += " hotspot=" + ePlanes + "," + eBpp;
    }
    logLine += " size=" + eDataSize + " @0x" + eDataOff.toString(16);
    hf.log(logLine);
}

// ──────────────────────────────────────────────
// Image data blocks
// ──────────────────────────────────────────────
var icoEnd = 6 + maxEntry * 16;

for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.dataOffset + e.dataSize > fileSize) {
        hf.warn("Image " + i + " extends beyond file (offset=0x" + e.dataOffset.toString(16) +
                " size=" + e.dataSize + " file=" + fileSize + ")");
        var avail = fileSize - e.dataOffset;
        if (avail <= 0) continue;
        e.dataSize = avail;
    }

    // Detect PNG vs BMP DIB
    var probeBuf = await hf.read(e.dataOffset, Math.min(8, e.dataSize));
    var isPNG = (probeBuf[0] === 0x89 && probeBuf[1] === 0x50 &&
                 probeBuf[2] === 0x4E && probeBuf[3] === 0x47);

    hf.template.seek(e.dataOffset);

    if (isPNG) {
        // Embedded PNG
        hf.template.beginStruct("PNG_" + i);
        await hf.template.addField("PNGData", "bytes:" + e.dataSize, { color: "#4CAF50" });
        hf.template.endStruct();
        hf.log("  Image " + i + ": embedded PNG (" + e.dataSize + " bytes)");

    } else {
        // BMP DIB (no BITMAPFILEHEADER, starts with BITMAPINFOHEADER)
        hf.template.beginStruct("DIB_" + i);

        var dibHdrSize = u32(probeBuf, 0);

        if (dibHdrSize >= 40 && e.dataOffset + dibHdrSize <= fileSize) {
            var dibBuf = await hf.read(e.dataOffset, Math.min(dibHdrSize, e.dataSize));
            var dibWidth = i32(dibBuf, 4);
            var dibHeight = i32(dibBuf, 8); // double height (XOR + AND masks)
            var dibPlanes = u16(dibBuf, 12);
            var dibBpp = u16(dibBuf, 14);
            var dibComp = u32(dibBuf, 16);
            var dibImgSz = u32(dibBuf, 20);

            // DIB header
            await hf.template.addField("biSize", "u32", { color: "#FF9800" });
            await hf.template.addField("biWidth", "i32", { color: "#03A9F4" });
            await hf.template.addField("biHeight", "i32", { color: "#03A9F4" });
            await hf.template.addField("biPlanes", "u16");
            await hf.template.addField("biBitCount", "u16", { color: "#E040FB" });
            await hf.template.addField("biCompression", "u32", { color: "#FFC107", enumMap: COMPRESSIONS });
            await hf.template.addField("biSizeImage", "u32");
            await hf.template.addField("biXPelsPerMeter", "i32");
            await hf.template.addField("biYPelsPerMeter", "i32");
            await hf.template.addField("biClrUsed", "u32");
            await hf.template.addField("biClrImportant", "u32");

            // Extra DIB header bytes (V4/V5)
            if (dibHdrSize > 40) {
                var extraDib = dibHdrSize - 40;
                await hf.template.addField("ExtraDIB", "bytes:" + extraDib, { color: "#FF9800" });
            }

            var afterDib = e.dataOffset + dibHdrSize;
            var remainData = e.dataSize - dibHdrSize;

            // Color table for <= 8bpp
            var actualHeight = Math.abs(dibHeight) / 2; // icon stores double height
            var paletteEntries = 0;
            var paletteBytes = 0;
            if (dibBpp <= 8) {
                var clrUsed = u32(dibBuf, 32);
                paletteEntries = clrUsed > 0 ? clrUsed : (1 << dibBpp);
                paletteBytes = paletteEntries * 4;
                if (paletteBytes > 0 && paletteBytes <= remainData) {
                    await hf.template.addField("ColorTable", "bytes:" + paletteBytes, { color: "#FF9800" });
                    remainData -= paletteBytes;
                }
            }

            // XOR mask (pixel data)
            var rowBytes = Math.floor((dibBpp * dibWidth + 31) / 32) * 4;
            var xorSize = rowBytes * actualHeight;
            // AND mask (1bpp transparency)
            var andRowBytes = Math.floor((dibWidth + 31) / 32) * 4;
            var andSize = andRowBytes * actualHeight;

            var xorActual = Math.min(xorSize, remainData);
            if (xorActual > 0) {
                await hf.template.addField("XORPixels", "bytes:" + xorActual, { color: "#F44336" });
                remainData -= xorActual;
            }

            var andActual = Math.min(andSize, remainData);
            if (andActual > 0) {
                await hf.template.addField("ANDMask", "bytes:" + andActual, { color: "#00BCD4" });
                remainData -= andActual;
            }

            if (remainData > 0) {
                await hf.template.addField("ExtraData", "bytes:" + remainData, { color: "#9E9E9E" });
            }

            hf.log("  Image " + i + ": DIB " + dibWidth + "x" + actualHeight +
                   " " + dibBpp + "bpp " + (COMPRESSIONS[dibComp] || dibComp));
        } else {
            // Can't parse DIB, mark raw
            await hf.template.addField("RawData", "bytes:" + e.dataSize, { color: "#F44336" });
            hf.log("  Image " + i + ": raw data (" + e.dataSize + " bytes)");
        }

        hf.template.endStruct();
    }

    var entryEnd = e.dataOffset + e.dataSize;
    if (entryEnd > icoEnd) icoEnd = entryEnd;
}

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (icoEnd < fileSize) {
    var overlaySize = fileSize - icoEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after " + typeName + " end");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log(typeName + " Summary");
hf.log("==============================");
hf.log("  Type: " + typeName);
hf.log("  Images: " + entries.length);
for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    hf.log("    [" + i + "] " + e.width + "x" + e.height + " " + e.dataSize + " bytes");
}
hf.log("  " + typeName + " data ends at: 0x" + icoEnd.toString(16) + " (" + icoEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (icoEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - icoEnd).toLocaleString() + " bytes after " + typeName + " end");
}

await hf.template.end();