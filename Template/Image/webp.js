// HexForge JS Template - WebP.js
// Purpose: WebP Image (RIFF-based container)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image
// ID Bytes: 52 49 46 46 xx xx xx xx 57 45 42 50 (RIFF....WEBP)
// Reference: https://developers.google.com/speed/webp/docs/riff_container

var fileSize = await hf.fileSize;

hf.template.begin("WebP Image");
hf.template.setFormat("webp", "WebP Image", [".webp"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
if (fileSize < 12) {
    hf.error("Not a WebP file (file too small)");
    await hf.template.end();
    throw new Error("Not a valid WebP");
}

var hdr = await hf.read(0, 12);
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function u24(buf, off) { return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16); }
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function fourcc(buf, off) {
    var s = "";
    for (var i = 0; i < 4; i++) {
        var c = buf[off + i];
        s += (c >= 32 && c < 127) ? String.fromCharCode(c) : ".";
    }
    return s;
}

var riffTag = fourcc(hdr, 0);
var webpTag = fourcc(hdr, 8);

if (riffTag !== "RIFF" || webpTag !== "WEBP") {
    hf.error("Not a WebP file (expected RIFF....WEBP, got " + riffTag + "...." + webpTag + ")");
    await hf.template.end();
    throw new Error("Not a valid WebP");
}

var riffSize = u32(hdr, 4);

// ──────────────────────────────────────────────
// RIFF Header (12 bytes)
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("RIFFHeader");
await hf.template.addField("RIFF", "string:4", { color: "#2196F3" });
await hf.template.addField("FileSize", "u32", { color: "#03A9F4" });
await hf.template.addField("WEBP", "string:4", { color: "#2196F3" });
hf.template.endStruct();

hf.log("WebP image detected");
hf.log("  RIFF size: " + riffSize + " (file size: " + fileSize + ")");

// ──────────────────────────────────────────────
// Chunk colors
// ──────────────────────────────────────────────
function chunkColor(tag) {
    if (tag === "VP8 ") return "#F44336";     // lossy
    if (tag === "VP8L") return "#E91E63";     // lossless
    if (tag === "VP8X") return "#FF9800";     // extended
    if (tag === "ANIM") return "#E040FB";     // animation params
    if (tag === "ANMF") return "#9C27B0";     // animation frame
    if (tag === "ALPH") return "#00BCD4";     // alpha
    if (tag === "ICCP") return "#795548";     // ICC profile
    if (tag === "EXIF") return "#FFC107";     // EXIF
    if (tag === "XMP ") return "#CDDC39";     // XMP
    return "#4CAF50";
}

// ──────────────────────────────────────────────
// Parse chunks
// ──────────────────────────────────────────────
var pos = 12;
var riffEnd = Math.min(8 + riffSize, fileSize);
var chunkCount = 0;
var imgWidth = 0, imgHeight = 0;
var hasAlpha = false, hasAnim = false, hasExif = false, hasIccp = false, hasXmp = false;
var frameCount = 0;
var codecStr = "";

while (pos + 8 <= riffEnd && chunkCount < 1000) {
    var chHdr = await hf.read(pos, 8);
    var chTag = fourcc(chHdr, 0);
    var chSize = u32(chHdr, 4);

    // Chunk total: 8 (header) + chSize + padding (to even)
    var chPadded = chSize + (chSize & 1);
    var chTotal = 8 + chPadded;

    if (pos + 8 + chSize > riffEnd) {
        hf.warn("Truncated chunk '" + chTag + "' at 0x" + pos.toString(16));
        var avail = riffEnd - pos;
        if (avail > 0) {
            hf.template.seek(pos);
            hf.template.beginStruct(chTag + "_truncated");
            await hf.template.addField("TruncatedChunk", "bytes:" + avail, { color: "#616161" });
            hf.template.endStruct();
        }
        pos = riffEnd;
        break;
    }

    var color = chunkColor(chTag);

    hf.template.seek(pos);
    hf.template.beginStruct(chTag.trim() || ("Chunk_" + chunkCount));
    await hf.template.addField("FourCC", "string:4", { color: color });
    await hf.template.addField("Size", "u32", { color: color });

    if (chTag === "VP8X" && chSize >= 10) {
        // Extended file format header
        var vp8xBuf = await hf.read(pos + 8, 10);
        var flags = vp8xBuf[0];
        hasIccp = (flags & 0x20) !== 0;
        hasAlpha = (flags & 0x10) !== 0;
        hasExif = (flags & 0x08) !== 0;
        hasXmp = (flags & 0x04) !== 0;
        hasAnim = (flags & 0x02) !== 0;

        var canvasW = (u24(vp8xBuf, 4) & 0xFFFFFF) + 1;
        var canvasH = (u24(vp8xBuf, 7) & 0xFFFFFF) + 1;
        imgWidth = canvasW;
        imgHeight = canvasH;

        await hf.template.addField("Flags", "u8", { color: color });
        await hf.template.addField("Reserved", "bytes:3", { color: "#9E9E9E" });
        await hf.template.addField("CanvasWidth_minus1", "bytes:3", { color: "#03A9F4" });
        await hf.template.addField("CanvasHeight_minus1", "bytes:3", { color: "#03A9F4" });

        var flagList = [];
        if (hasIccp) flagList.push("ICCP");
        if (hasAlpha) flagList.push("Alpha");
        if (hasExif) flagList.push("EXIF");
        if (hasXmp) flagList.push("XMP");
        if (hasAnim) flagList.push("Animation");
        hf.log("  VP8X: " + canvasW + "x" + canvasH + " [" + flagList.join(", ") + "]");
        codecStr = "VP8X (extended)";

    } else if (chTag === "VP8 " && chSize >= 10) {
        // Lossy VP8 bitstream header
        var vp8Buf = await hf.read(pos + 8, Math.min(10, chSize));
        // Frame tag: 3 bytes, then start code 9D 01 2A, then width/height
        var isKeyframe = (vp8Buf[0] & 0x01) === 0;
        if (isKeyframe && vp8Buf[3] === 0x9D && vp8Buf[4] === 0x01 && vp8Buf[5] === 0x2A) {
            var w = u16(vp8Buf, 6) & 0x3FFF;
            var h = u16(vp8Buf, 8) & 0x3FFF;
            if (imgWidth === 0) { imgWidth = w; imgHeight = h; }
            hf.log("  VP8: " + w + "x" + h + " lossy (keyframe)");
        } else {
            hf.log("  VP8: lossy bitstream (" + chSize + " bytes)");
        }
        await hf.template.addField("VP8Data", "bytes:" + chSize, { color: color });
        codecStr = "VP8 (lossy)";

    } else if (chTag === "VP8L" && chSize >= 5) {
        // Lossless VP8L header
        var vp8lBuf = await hf.read(pos + 8, 5);
        var lSig = vp8lBuf[0]; // should be 0x2F
        if (lSig === 0x2F) {
            var bits = u32(vp8lBuf, 1);
            var w = (bits & 0x3FFF) + 1;
            var h = ((bits >> 14) & 0x3FFF) + 1;
            var alphaUsed = (bits >> 28) & 0x01;
            if (imgWidth === 0) { imgWidth = w; imgHeight = h; }
            if (alphaUsed) hasAlpha = true;
            hf.log("  VP8L: " + w + "x" + h + " lossless" + (alphaUsed ? " +alpha" : ""));
        } else {
            hf.log("  VP8L: lossless bitstream (" + chSize + " bytes)");
        }
        await hf.template.addField("VP8LData", "bytes:" + chSize, { color: color });
        codecStr = "VP8L (lossless)";

    } else if (chTag === "ALPH" && chSize >= 1) {
        var alphByte = (await hf.read(pos + 8, 1))[0];
        var filtMethod = (alphByte >> 2) & 0x03;
        var compMethod = alphByte & 0x03;
        var ALPHA_FILTER = { 0: "None", 1: "Horizontal", 2: "Vertical", 3: "Gradient" };
        var ALPHA_COMP = { 0: "Uncompressed", 1: "LosslessCompressed" };

        await hf.template.addField("AlphaHeader", "u8", { color: color });
        if (chSize > 1) {
            await hf.template.addField("AlphaData", "bytes:" + (chSize - 1), { color: color });
        }
        hf.log("  ALPH: filter=" + (ALPHA_FILTER[filtMethod] || filtMethod) +
               " compress=" + (ALPHA_COMP[compMethod] || compMethod) +
               " (" + chSize + " bytes)");

    } else if (chTag === "ANIM" && chSize >= 6) {
        var animBuf = await hf.read(pos + 8, 6);
        var bgColor = u32(animBuf, 0);
        var loopCount = u16(animBuf, 4);

        await hf.template.addField("BackgroundColor", "u32", { color: color });
        await hf.template.addField("LoopCount", "u16", { color: color });
        hf.log("  ANIM: bg=0x" + bgColor.toString(16).padStart(8, "0") +
               " loops=" + (loopCount === 0 ? "infinite" : loopCount));

    } else if (chTag === "ANMF" && chSize >= 16) {
        var anmfBuf = await hf.read(pos + 8, 16);
        var fX = u24(anmfBuf, 0) * 2;
        var fY = u24(anmfBuf, 3) * 2;
        var fW = (u24(anmfBuf, 6) & 0xFFFFFF) + 1;
        var fH = (u24(anmfBuf, 9) & 0xFFFFFF) + 1;
        var fDur = u24(anmfBuf, 12);
        var fFlags = anmfBuf[15];
        var fDispose = (fFlags & 0x01) ? "Background" : "None";
        var fBlend = (fFlags & 0x02) ? "NoBlend" : "AlphaBlend";

        await hf.template.addField("OffsetX", "bytes:3", { color: color });
        await hf.template.addField("OffsetY", "bytes:3", { color: color });
        await hf.template.addField("Width_minus1", "bytes:3", { color: "#03A9F4" });
        await hf.template.addField("Height_minus1", "bytes:3", { color: "#03A9F4" });
        await hf.template.addField("Duration", "bytes:3", { color: color });
        await hf.template.addField("Flags", "u8", { color: color });

        var frameDataSize = chSize - 16;
        if (frameDataSize > 0) {
            await hf.template.addField("FrameData", "bytes:" + frameDataSize, { color: "#9C27B0" });
        }

        frameCount++;
        hf.log("  ANMF[" + (frameCount - 1) + "]: " + fW + "x" + fH + " @" + fX + "," + fY +
               " " + fDur + "ms " + fDispose + "/" + fBlend);

    } else if (chTag === "ICCP") {
        await hf.template.addField("ICCProfile", "bytes:" + chSize, { color: color });
        hf.log("  ICCP: ICC profile (" + chSize + " bytes)");

    } else if (chTag === "EXIF") {
        await hf.template.addField("ExifData", "bytes:" + chSize, { color: color });
        hf.log("  EXIF: " + chSize + " bytes");

    } else if (chTag === "XMP ") {
        await hf.template.addField("XMPData", "bytes:" + chSize, { color: color });
        hf.log("  XMP: " + chSize + " bytes");

    } else {
        // Unknown/generic chunk
        if (chSize > 0) {
            await hf.template.addField("Data", "bytes:" + chSize, { color: color });
        }
        hf.log("  " + chTag + ": " + chSize + " bytes");
    }

    // Padding byte
    if (chSize & 1) {
        await hf.template.addField("Pad", "u8", { color: "#9E9E9E" });
    }

    hf.template.endStruct();

    pos += chTotal;
    chunkCount++;
}

var webpEnd = Math.min(riffEnd, fileSize);

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (webpEnd < fileSize) {
    var overlaySize = fileSize - webpEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after WebP end");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("WebP Summary");
hf.log("==============================");
hf.log("  Codec: " + (codecStr || "unknown"));
hf.log("  Image: " + imgWidth + " x " + imgHeight);
if (hasAlpha) hf.log("  Alpha: yes");
if (hasAnim) hf.log("  Animated: " + frameCount + " frames");
if (hasIccp) hf.log("  ICC Profile: yes");
if (hasExif) hf.log("  EXIF: yes");
if (hasXmp) hf.log("  XMP: yes");
hf.log("  Chunks: " + chunkCount);
hf.log("  WebP data ends at: 0x" + webpEnd.toString(16) + " (" + webpEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (webpEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - webpEnd).toLocaleString() + " bytes after WebP end");
}

await hf.template.end();