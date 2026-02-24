// HexForge JS Template - PNG.js
// Purpose: PNG (Portable Network Graphics) / APNG
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image
// ID Bytes: 89 50 4E 47 0D 0A 1A 0A
// Reference: https://www.w3.org/TR/PNG/

var fileSize = await hf.fileSize;

hf.template.begin("PNG Image");
hf.template.setFormat("png", "PNG Image", [".png", ".apng"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
var sig = await hf.read(0, 8);
if (sig[0] !== 0x89 || sig[1] !== 0x50 || sig[2] !== 0x4E || sig[3] !== 0x47 ||
    sig[4] !== 0x0D || sig[5] !== 0x0A || sig[6] !== 0x1A || sig[7] !== 0x0A) {
    hf.error("Not a PNG file (invalid signature)");
    await hf.template.end();
    throw new Error("Not a valid PNG");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u32be(buf, off) {
    return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}
function u16be(buf, off) {
    return (buf[off] << 8) | buf[off + 1];
}
function i32be(buf, off) {
    var v = u32be(buf, off);
    return v > 0x7FFFFFFF ? v - 0x100000000 : v;
}
function ascii(buf, off, len) {
    var s = "";
    for (var i = 0; i < len && off + i < buf.length; i++) {
        var c = buf[off + i];
        if (c >= 32 && c < 127) s += String.fromCharCode(c);
        else s += ".";
    }
    return s;
}
function latin1(buf, off, maxLen) {
    var s = "";
    for (var i = 0; i < maxLen && off + i < buf.length; i++) {
        var c = buf[off + i];
        if (c === 0) break;
        s += String.fromCharCode(c);
    }
    return s;
}

// Color type names
var COLOR_TYPES = { 0: "Grayscale", 2: "RGB", 3: "Indexed", 4: "GrayAlpha", 6: "RGBA" };
var INTERLACE = { 0: "None", 1: "Adam7" };
var SRGB_INTENTS = { 0: "Perceptual", 1: "RelativeColorimetric", 2: "Saturation", 3: "AbsoluteColorimetric" };
var PHYS_UNITS = { 0: "unknown", 1: "meter" };
var APNG_DISPOSE = { 0: "None", 1: "Background", 2: "Previous" };
var APNG_BLEND = { 0: "Source", 1: "Over" };

// Chunk colors by category
function chunkColor(type) {
    // Critical
    if (type === "IHDR") return "#2196F3";
    if (type === "PLTE") return "#FF9800";
    if (type === "IDAT") return "#F44336";
    if (type === "IEND") return "#9E9E9E";
    // APNG
    if (type === "acTL" || type === "fcTL" || type === "fdAT") return "#E040FB";
    // Color/Gamma
    if (type === "gAMA" || type === "cHRM" || type === "sRGB" || type === "iCCP" || type === "sBIT") return "#4CAF50";
    // Transparency
    if (type === "tRNS" || type === "bKGD") return "#00BCD4";
    // Text
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") return "#FFC107";
    // Layout
    if (type === "pHYs") return "#CDDC39";
    // Time
    if (type === "tIME") return "#FF5722";
    // Exif
    if (type === "eXIf") return "#7C4DFF";
    // Other
    return "#03A9F4";
}

// ──────────────────────────────────────────────
// Signature
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("PNGSignature");
await hf.template.addField("Signature", "bytes:8", { color: "#2196F3" });
hf.template.endStruct();

hf.log("PNG image detected");

// ──────────────────────────────────────────────
// Parse chunks
// ──────────────────────────────────────────────
var pos = 8;
var chunkCount = 0;
var idatCount = 0;
var idatTotalBytes = 0;
var pngEnd = 8;
var isAPNG = false;
var imgWidth = 0, imgHeight = 0, bitDepth = 0, colorType = 0;

while (pos + 12 <= fileSize && chunkCount < 2000) {
    var chunkHdr = await hf.read(pos, 8);
    var dataLen = u32be(chunkHdr, 0);
    var typeStr = ascii(chunkHdr, 4, 4);

    var chunkTotalSize = 12 + dataLen; // length(4) + type(4) + data + crc(4)
    if (pos + chunkTotalSize > fileSize) {
        hf.warn("Truncated chunk '" + typeStr + "' at 0x" + pos.toString(16) + " (need " + chunkTotalSize + " bytes, only " + (fileSize - pos) + " available)");
        // Mark what we can
        var avail = fileSize - pos;
        hf.template.seek(pos);
        hf.template.beginStruct(typeStr + "_truncated");
        await hf.template.addField("TruncatedChunk", "bytes:" + avail, { color: "#616161" });
        hf.template.endStruct();
        pngEnd = fileSize;
        break;
    }

    // Read chunk data for interpretation
    var chunkData = null;
    if (dataLen > 0 && dataLen <= 65536) {
        chunkData = new Uint8Array(await hf.read(pos + 8, dataLen));
    }

    var color = chunkColor(typeStr);

    // Consolidated IDAT handling
    if (typeStr === "IDAT") {
        if (idatCount === 0) {
            // First IDAT: mark individually
            hf.template.seek(pos);
            hf.template.beginStruct("IDAT_0");
            await hf.template.addField("Length", "u32", { color: color });
            await hf.template.addField("Type", "string:4", { color: color });
            if (dataLen > 0) {
                await hf.template.addField("CompressedData", "bytes:" + dataLen, { color: color });
            }
            await hf.template.addField("CRC", "u32", { color: "#9E9E9E" });
            hf.template.endStruct();
        } else {
            // Subsequent IDATs: mark as single block
            hf.template.seek(pos);
            hf.template.beginStruct("IDAT_" + idatCount);
            await hf.template.addField("Chunk", "bytes:" + chunkTotalSize, { color: color });
            hf.template.endStruct();
        }
        idatCount++;
        idatTotalBytes += dataLen;
    } else if (typeStr === "fdAT") {
        // APNG frame data — same compact treatment
        hf.template.seek(pos);
        hf.template.beginStruct("fdAT_" + chunkCount);
        await hf.template.addField("Chunk", "bytes:" + chunkTotalSize, { color: color });
        hf.template.endStruct();
    } else {
        // All other chunks: parse length + type + data + CRC
        hf.template.seek(pos);
        hf.template.beginStruct(typeStr);
        await hf.template.addField("Length", "u32", { color: color });
        await hf.template.addField("Type", "string:4", { color: color });

        if (typeStr === "IHDR" && dataLen === 13) {
            imgWidth = await hf.template.addField("Width", "u32", { color: "#2196F3" });
            imgHeight = await hf.template.addField("Height", "u32", { color: "#2196F3" });
            bitDepth = await hf.template.addField("BitDepth", "u8", { color: "#03A9F4" });
            colorType = await hf.template.addField("ColorType", "u8", { color: "#03A9F4", enumMap: COLOR_TYPES });
            await hf.template.addField("Compression", "u8");
            await hf.template.addField("Filter", "u8");
            await hf.template.addField("Interlace", "u8", { enumMap: INTERLACE });

            hf.log("  " + imgWidth + " x " + imgHeight + ", " + bitDepth + "bpp " +
                   (COLOR_TYPES[colorType] || colorType));

        } else if (typeStr === "PLTE" && dataLen >= 3) {
            var nColors = Math.floor(dataLen / 3);
            await hf.template.addField("PaletteEntries", "bytes:" + dataLen, { color: color });
            hf.log("  Palette: " + nColors + " colors");

        } else if (typeStr === "gAMA" && dataLen === 4 && chunkData) {
            await hf.template.addField("Gamma", "u32", { color: color });
            var gamma = u32be(chunkData, 0) / 100000;
            hf.log("  Gamma: " + gamma.toFixed(5));

        } else if (typeStr === "cHRM" && dataLen === 32 && chunkData) {
            await hf.template.addField("WhiteX", "u32", { color: color });
            await hf.template.addField("WhiteY", "u32", { color: color });
            await hf.template.addField("RedX", "u32", { color: color });
            await hf.template.addField("RedY", "u32", { color: color });
            await hf.template.addField("GreenX", "u32", { color: color });
            await hf.template.addField("GreenY", "u32", { color: color });
            await hf.template.addField("BlueX", "u32", { color: color });
            await hf.template.addField("BlueY", "u32", { color: color });
            hf.log("  Chromaticities defined");

        } else if (typeStr === "sRGB" && dataLen === 1 && chunkData) {
            await hf.template.addField("RenderingIntent", "u8", { color: color, enumMap: SRGB_INTENTS });
            hf.log("  sRGB intent: " + (SRGB_INTENTS[chunkData[0]] || chunkData[0]));

        } else if (typeStr === "iCCP" && dataLen > 2 && chunkData) {
            var profName = latin1(chunkData, 0, 80);
            var nameLen = profName.length + 1; // +null
            await hf.template.addField("ProfileName", "string:" + nameLen, { color: color });
            await hf.template.addField("CompressionMethod", "u8");
            var compDataLen = dataLen - nameLen - 1;
            if (compDataLen > 0) {
                await hf.template.addField("CompressedProfile", "bytes:" + compDataLen, { color: color });
            }
            hf.log("  ICC Profile: \"" + profName + "\" (" + compDataLen + " bytes compressed)");

        } else if (typeStr === "pHYs" && dataLen === 9 && chunkData) {
            var ppuX = await hf.template.addField("PixelsPerUnitX", "u32", { color: color });
            var ppuY = await hf.template.addField("PixelsPerUnitY", "u32", { color: color });
            var unit = await hf.template.addField("Unit", "u8", { color: color, enumMap: PHYS_UNITS });
            var unitStr = PHYS_UNITS[unit] || "unknown";
            hf.log("  Physical: " + ppuX + " x " + ppuY + " per " + unitStr);
            if (unit === 1) {
                var dpiX = Math.round(ppuX * 0.0254);
                var dpiY = Math.round(ppuY * 0.0254);
                hf.log("    ~" + dpiX + " x " + dpiY + " DPI");
            }

        } else if (typeStr === "tEXt" && chunkData) {
            var kw = latin1(chunkData, 0, dataLen);
            var kwLen = kw.length + 1;
            await hf.template.addField("Keyword", "string:" + kwLen, { color: color });
            var txtLen = dataLen - kwLen;
            if (txtLen > 0) {
                await hf.template.addField("Text", "string:" + txtLen, { color: color });
                var txt = latin1(chunkData, kwLen, txtLen);
                var shortTxt = txt.length > 60 ? txt.slice(0, 57) + "..." : txt;
                hf.log("  tEXt: " + kw + " = \"" + shortTxt + "\"");
            } else {
                hf.log("  tEXt: " + kw);
            }

        } else if (typeStr === "zTXt" && chunkData) {
            var kw = latin1(chunkData, 0, dataLen);
            var kwLen = kw.length + 1;
            await hf.template.addField("Keyword", "string:" + kwLen, { color: color });
            await hf.template.addField("CompressionMethod", "u8");
            var compLen = dataLen - kwLen - 1;
            if (compLen > 0) {
                await hf.template.addField("CompressedText", "bytes:" + compLen, { color: color });
            }
            hf.log("  zTXt: " + kw + " (" + compLen + " bytes compressed)");

        } else if (typeStr === "iTXt" && chunkData) {
            var kw = latin1(chunkData, 0, dataLen);
            var kwLen = kw.length + 1;
            await hf.template.addField("Keyword", "string:" + kwLen, { color: color });
            var restLen = dataLen - kwLen;
            if (restLen > 0) {
                await hf.template.addField("Data", "bytes:" + restLen, { color: color });
            }
            hf.log("  iTXt: " + kw);

        } else if (typeStr === "tIME" && dataLen === 7 && chunkData) {
            var year = await hf.template.addField("Year", "u16", { color: color });
            var month = await hf.template.addField("Month", "u8", { color: color });
            var day = await hf.template.addField("Day", "u8", { color: color });
            var hour = await hf.template.addField("Hour", "u8", { color: color });
            var min = await hf.template.addField("Minute", "u8", { color: color });
            var sec = await hf.template.addField("Second", "u8", { color: color });
            hf.log("  Time: " + year + "-" + (month < 10 ? "0" : "") + month + "-" + (day < 10 ? "0" : "") + day +
                   " " + (hour < 10 ? "0" : "") + hour + ":" + (min < 10 ? "0" : "") + min + ":" + (sec < 10 ? "0" : "") + sec);

        } else if (typeStr === "tRNS" && chunkData) {
            await hf.template.addField("TransparencyData", "bytes:" + dataLen, { color: color });
            if (colorType === 0) hf.log("  Transparency: gray=" + u16be(chunkData, 0));
            else if (colorType === 2) hf.log("  Transparency: R=" + u16be(chunkData, 0) + " G=" + u16be(chunkData, 2) + " B=" + u16be(chunkData, 4));
            else if (colorType === 3) hf.log("  Transparency: " + dataLen + " palette alpha entries");

        } else if (typeStr === "bKGD" && chunkData) {
            await hf.template.addField("BackgroundData", "bytes:" + dataLen, { color: color });
            if (colorType === 0 || colorType === 4) hf.log("  Background: gray=" + u16be(chunkData, 0));
            else if (colorType === 2 || colorType === 6) hf.log("  Background: R=" + u16be(chunkData, 0) + " G=" + u16be(chunkData, 2) + " B=" + u16be(chunkData, 4));
            else if (colorType === 3) hf.log("  Background: palette index=" + chunkData[0]);

        } else if (typeStr === "sBIT" && chunkData) {
            await hf.template.addField("SignificantBits", "bytes:" + dataLen, { color: color });
            hf.log("  sBIT: " + Array.from(chunkData).join(", "));

        } else if (typeStr === "hIST" && chunkData) {
            await hf.template.addField("Histogram", "bytes:" + dataLen, { color: color });
            hf.log("  Histogram: " + (dataLen / 2) + " entries");

        } else if (typeStr === "acTL" && dataLen === 8 && chunkData) {
            isAPNG = true;
            var numFrames = await hf.template.addField("NumFrames", "u32", { color: color });
            var numPlays = await hf.template.addField("NumPlays", "u32", { color: color });
            hf.log("  APNG: " + numFrames + " frames, " + (numPlays === 0 ? "infinite" : numPlays) + " plays");

        } else if (typeStr === "fcTL" && dataLen === 26 && chunkData) {
            await hf.template.addField("Sequence", "u32", { color: color });
            var fW = await hf.template.addField("Width", "u32", { color: color });
            var fH = await hf.template.addField("Height", "u32", { color: color });
            var fX = await hf.template.addField("XOffset", "u32", { color: color });
            var fY = await hf.template.addField("YOffset", "u32", { color: color });
            var delayNum = await hf.template.addField("DelayNum", "u16", { color: color });
            var delayDen = await hf.template.addField("DelayDen", "u16", { color: color });
            await hf.template.addField("DisposeOp", "u8", { color: color, enumMap: APNG_DISPOSE });
            await hf.template.addField("BlendOp", "u8", { color: color, enumMap: APNG_BLEND });
            var delayMs = delayDen === 0 ? (delayNum * 10) : Math.round(delayNum * 1000 / delayDen);
            hf.log("  Frame: " + fW + "x" + fH + " +" + fX + "+" + fY + " " + delayMs + "ms");

        } else if (typeStr === "eXIf" && chunkData) {
            await hf.template.addField("ExifData", "bytes:" + dataLen, { color: color });
            hf.log("  EXIF: " + dataLen + " bytes");

        } else if (typeStr === "IEND") {
            // No data
        } else {
            // Generic chunk data
            if (dataLen > 0) {
                await hf.template.addField("Data", "bytes:" + dataLen, { color: color });
            }
            var critical = (typeStr.charCodeAt(0) & 0x20) === 0 ? " [critical]" : "";
            hf.log("  " + typeStr + ": " + dataLen + " bytes" + critical);
        }

        await hf.template.addField("CRC", "u32", { color: "#9E9E9E" });
        hf.template.endStruct();
    }

    pos += chunkTotalSize;
    pngEnd = pos;
    chunkCount++;

    // Stop after IEND
    if (typeStr === "IEND") {
        hf.log("End of PNG (IEND)");
        break;
    }
}

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (pngEnd < fileSize) {
    var overlaySize = fileSize - pngEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after IEND chunk");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("PNG Summary");
hf.log("==============================");
hf.log("  Image: " + imgWidth + " x " + imgHeight);
hf.log("  Color: " + (COLOR_TYPES[colorType] || colorType) + ", " + bitDepth + " bpp");
hf.log("  Chunks: " + chunkCount);
if (idatCount > 0) hf.log("  IDAT: " + idatCount + " chunks, " + idatTotalBytes.toLocaleString() + " bytes compressed");
if (isAPNG) hf.log("  Format: APNG (animated)");
hf.log("  PNG data ends at: 0x" + pngEnd.toString(16) + " (" + pngEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (pngEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - pngEnd).toLocaleString() + " bytes after PNG end");
}

await hf.template.end();