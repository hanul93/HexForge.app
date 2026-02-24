// HexForge JS Template - GIF.js
// Purpose: GIF (Graphics Interchange Format) — GIF87a / GIF89a
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image
// ID Bytes: 47 49 46 38 37 61 (GIF87a) or 47 49 46 38 39 61 (GIF89a)
// Reference: GIF89a Specification

var fileSize = await hf.fileSize;

hf.template.begin("GIF Image");
hf.template.setFormat("gif", "GIF Image", [".gif"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
var sig = await hf.read(0, 6);
var sigStr = "";
for (var i = 0; i < 6; i++) sigStr += String.fromCharCode(sig[i]);

if (sigStr !== "GIF87a" && sigStr !== "GIF89a") {
    hf.error("Not a GIF file (expected GIF87a or GIF89a, got \"" + sigStr + "\")");
    await hf.template.end();
    throw new Error("Not a valid GIF");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16le(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32le(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function ascii(buf, off, len) {
    var s = "";
    for (var i = 0; i < len && off + i < buf.length; i++) {
        var c = buf[off + i];
        s += (c >= 32 && c < 127) ? String.fromCharCode(c) : ".";
    }
    return s;
}

var DISPOSAL = { 0: "None", 1: "DoNotDispose", 2: "RestoreBackground", 3: "RestorePrevious" };

// ──────────────────────────────────────────────
// Header (6 bytes)
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("GIFHeader");
await hf.template.addField("Signature", "string:3", { color: "#2196F3" });
await hf.template.addField("Version", "string:3", { color: "#2196F3" });
hf.template.endStruct();

hf.log("GIF " + sigStr.slice(3) + " detected");

// ──────────────────────────────────────────────
// Logical Screen Descriptor (7 bytes)
// ──────────────────────────────────────────────
var lsd = await hf.read(6, 7);
var scrWidth = u16le(lsd, 0);
var scrHeight = u16le(lsd, 2);
var packed = lsd[4];
var bgColorIdx = lsd[5];
var pixelAspect = lsd[6];

var hasGCT = (packed & 0x80) !== 0;
var colorRes = ((packed >> 4) & 0x07) + 1;
var sortFlag = (packed & 0x08) !== 0;
var gctSizeBits = packed & 0x07;
var gctEntries = hasGCT ? (1 << (gctSizeBits + 1)) : 0;
var gctBytes = gctEntries * 3;

hf.template.beginStruct("LogicalScreenDescriptor");
await hf.template.addField("CanvasWidth", "u16", { color: "#03A9F4" });
await hf.template.addField("CanvasHeight", "u16", { color: "#03A9F4" });
await hf.template.addField("Packed", "u8", { color: "#FF9800" });
await hf.template.addField("BackgroundColorIndex", "u8", { color: "#FFC107" });
await hf.template.addField("PixelAspectRatio", "u8");
hf.template.endStruct();

hf.log("  Canvas: " + scrWidth + " x " + scrHeight);
hf.log("  Color resolution: " + colorRes + " bits");
if (hasGCT) hf.log("  Global Color Table: " + gctEntries + " colors (" + gctBytes + " bytes)");
if (bgColorIdx > 0) hf.log("  Background color index: " + bgColorIdx);

// ──────────────────────────────────────────────
// Global Color Table
// ──────────────────────────────────────────────
if (hasGCT && gctBytes > 0) {
    hf.template.beginStruct("GlobalColorTable");
    await hf.template.addField("Colors", "bytes:" + gctBytes, { color: "#FF9800" });
    hf.template.endStruct();
}

// ──────────────────────────────────────────────
// Parse blocks
// ──────────────────────────────────────────────
var pos = 13 + gctBytes;
var frameCount = 0;
var extCount = 0;
var blockCount = 0;
var gifEnd = pos;

// Helper: skip sub-blocks, marking them
async function skipSubBlocks(label, color) {
    var totalSub = 0;
    while (pos < fileSize) {
        var sb = await hf.read(pos, 1);
        var subSize = sb[0];
        if (subSize === 0) {
            // Block terminator
            await hf.template.addField("Terminator", "u8", { color: "#9E9E9E" });
            pos += 1;
            break;
        }
        if (pos + 1 + subSize > fileSize) {
            var avail = fileSize - pos;
            await hf.template.addField(label + "_trunc", "bytes:" + avail, { color: "#616161" });
            pos += avail;
            break;
        }
        await hf.template.addField(label + "_" + totalSub, "bytes:" + (1 + subSize), { color: color });
        pos += 1 + subSize;
        totalSub += subSize;
    }
    return totalSub;
}

while (pos < fileSize && blockCount < 5000) {
    var intro = await hf.read(pos, 1);
    var sentinel = intro[0];

    if (sentinel === 0x3B) {
        // ── Trailer ──
        hf.template.seek(pos);
        hf.template.beginStruct("Trailer");
        await hf.template.addField("Sentinel", "u8", { color: "#9E9E9E" });
        hf.template.endStruct();
        pos += 1;
        gifEnd = pos;
        hf.log("  Trailer (end of GIF)");
        break;

    } else if (sentinel === 0x2C) {
        // ── Image Descriptor ──
        if (pos + 10 > fileSize) break;
        var imgDesc = await hf.read(pos, 10);
        var imgLeft = u16le(imgDesc, 1);
        var imgTop = u16le(imgDesc, 3);
        var imgW = u16le(imgDesc, 5);
        var imgH = u16le(imgDesc, 7);
        var imgPacked = imgDesc[9];

        var hasLCT = (imgPacked & 0x80) !== 0;
        var interlaced = (imgPacked & 0x40) !== 0;
        var lctSizeBits = imgPacked & 0x07;
        var lctEntries = hasLCT ? (1 << (lctSizeBits + 1)) : 0;
        var lctBytes = lctEntries * 3;

        hf.template.seek(pos);
        hf.template.beginStruct("Frame_" + frameCount);

        await hf.template.addField("ImageSeparator", "u8", { color: "#F44336" });
        await hf.template.addField("Left", "u16", { color: "#F44336" });
        await hf.template.addField("Top", "u16", { color: "#F44336" });
        await hf.template.addField("Width", "u16", { color: "#F44336" });
        await hf.template.addField("Height", "u16", { color: "#F44336" });
        await hf.template.addField("Packed", "u8", { color: "#FF9800" });
        pos += 10;

        var frameLog = "  Frame " + frameCount + ": " + imgW + "x" + imgH + " @" + imgLeft + "," + imgTop;
        if (interlaced) frameLog += " interlaced";

        // Local Color Table
        if (hasLCT && lctBytes > 0) {
            await hf.template.addField("LocalColorTable", "bytes:" + lctBytes, { color: "#FF9800" });
            pos += lctBytes;
            frameLog += " LCT=" + lctEntries;
        }

        hf.log(frameLog);

        // LZW Minimum Code Size
        await hf.template.addField("LZWMinCodeSize", "u8", { color: "#E040FB" });
        pos += 1;

        // Image data sub-blocks
        hf.template.seek(pos);
        var imgDataBytes = await skipSubBlocks("ImgData", "#F44336");

        hf.template.endStruct();
        frameCount++;

    } else if (sentinel === 0x21) {
        // ── Extension Block ──
        if (pos + 2 > fileSize) break;
        var extLabel = (await hf.read(pos + 1, 1))[0];

        if (extLabel === 0xF9) {
            // Graphic Control Extension
            if (pos + 8 > fileSize) break;
            var gce = await hf.read(pos, 8);
            var gcPacked = gce[3];
            var disposal = (gcPacked >> 2) & 0x07;
            var userInput = (gcPacked & 0x02) !== 0;
            var hasTransp = (gcPacked & 0x01) !== 0;
            var delay = u16le(gce, 4);
            var transpIdx = gce[6];

            hf.template.seek(pos);
            hf.template.beginStruct("GraphicControlExt");
            await hf.template.addField("Introducer", "u8", { color: "#4CAF50" });
            await hf.template.addField("Label", "u8", { color: "#4CAF50" });
            await hf.template.addField("BlockSize", "u8");
            await hf.template.addField("Packed", "u8", { color: "#4CAF50" });
            await hf.template.addField("DelayTime", "u16", { color: "#4CAF50" });
            await hf.template.addField("TransparentIndex", "u8", { color: "#00BCD4" });
            await hf.template.addField("Terminator", "u8", { color: "#9E9E9E" });
            hf.template.endStruct();
            pos += 8;

            var gceLog = "  GCE: delay=" + (delay * 10) + "ms dispose=" + (DISPOSAL[disposal] || disposal);
            if (hasTransp) gceLog += " transparent=" + transpIdx;
            hf.log(gceLog);

        } else if (extLabel === 0xFF) {
            // Application Extension
            if (pos + 2 > fileSize) break;
            hf.template.seek(pos);
            hf.template.beginStruct("ApplicationExt");
            await hf.template.addField("Introducer", "u8", { color: "#7C4DFF" });
            await hf.template.addField("Label", "u8", { color: "#7C4DFF" });
            pos += 2;

            // Block size (should be 11)
            var appBS = (await hf.read(pos, 1))[0];
            await hf.template.addField("BlockSize", "u8");
            pos += 1;

            if (appBS === 11 && pos + 11 <= fileSize) {
                var appIdBuf = await hf.read(pos, 11);
                var appId = ascii(appIdBuf, 0, 8);
                var authCode = ascii(appIdBuf, 8, 3);

                await hf.template.addField("AppIdentifier", "string:8", { color: "#7C4DFF" });
                await hf.template.addField("AuthCode", "bytes:3", { color: "#7C4DFF" });
                pos += 11;

                hf.template.seek(pos);

                if (appId === "NETSCAPE" || appId === "ANIMEXTS") {
                    // NETSCAPE2.0 / ANIMEXTS1.0 loop extension
                    var nsData = await hf.read(pos, 1);
                    if (nsData[0] === 3 && pos + 4 <= fileSize) {
                        var loopBuf = await hf.read(pos, 5);
                        await hf.template.addField("SubBlockSize", "u8");
                        await hf.template.addField("SubBlockID", "u8");
                        await hf.template.addField("LoopCount", "u16", { color: "#7C4DFF" });
                        await hf.template.addField("Terminator", "u8", { color: "#9E9E9E" });
                        var loops = u16le(loopBuf, 2);
                        hf.log("  " + appId + ": loop=" + (loops === 0 ? "infinite" : loops));
                        pos += 5;
                    } else {
                        hf.template.seek(pos);
                        await skipSubBlocks("AppData", "#7C4DFF");
                        hf.log("  " + appId + " extension");
                    }
                } else if (appId === "XMP Data") {
                    hf.template.seek(pos);
                    var xmpBytes = await skipSubBlocks("XMPData", "#FFC107");
                    hf.log("  XMP Data: " + xmpBytes + " bytes");
                } else {
                    hf.template.seek(pos);
                    var appBytes = await skipSubBlocks("AppData", "#7C4DFF");
                    hf.log("  App: " + appId + " (" + appBytes + " bytes)");
                }
            } else {
                hf.template.seek(pos);
                await skipSubBlocks("AppData", "#7C4DFF");
            }

            hf.template.endStruct();

        } else if (extLabel === 0xFE) {
            // Comment Extension
            hf.template.seek(pos);
            hf.template.beginStruct("CommentExt");
            await hf.template.addField("Introducer", "u8", { color: "#FFC107" });
            await hf.template.addField("Label", "u8", { color: "#FFC107" });
            pos += 2;

            // Read first sub-block for display
            if (pos < fileSize) {
                var peekSz = (await hf.read(pos, 1))[0];
                if (peekSz > 0 && pos + 1 + peekSz <= fileSize) {
                    var commentBuf = await hf.read(pos + 1, Math.min(peekSz, 80));
                    var commentStr = "";
                    for (var ci = 0; ci < commentBuf.length; ci++) {
                        var cc = commentBuf[ci];
                        commentStr += (cc >= 32 && cc < 127) ? String.fromCharCode(cc) : ".";
                    }
                    var shortComment = commentStr.length > 60 ? commentStr.slice(0, 57) + "..." : commentStr;
                    hf.log("  Comment: \"" + shortComment + "\"");
                }
            }

            hf.template.seek(pos);
            await skipSubBlocks("Comment", "#FFC107");
            hf.template.endStruct();

        } else if (extLabel === 0x01) {
            // Plain Text Extension
            hf.template.seek(pos);
            hf.template.beginStruct("PlainTextExt");
            await hf.template.addField("Introducer", "u8", { color: "#CDDC39" });
            await hf.template.addField("Label", "u8", { color: "#CDDC39" });
            pos += 2;

            // Fixed header block (should be 12 bytes)
            var ptBS = (await hf.read(pos, 1))[0];
            if (ptBS === 12 && pos + 13 <= fileSize) {
                await hf.template.addField("BlockSize", "u8");
                await hf.template.addField("TextGridLeft", "u16", { color: "#CDDC39" });
                await hf.template.addField("TextGridTop", "u16", { color: "#CDDC39" });
                await hf.template.addField("TextGridWidth", "u16", { color: "#CDDC39" });
                await hf.template.addField("TextGridHeight", "u16", { color: "#CDDC39" });
                await hf.template.addField("CellWidth", "u8");
                await hf.template.addField("CellHeight", "u8");
                await hf.template.addField("FGColorIndex", "u8");
                await hf.template.addField("BGColorIndex", "u8");
                pos += 13;
            }

            hf.template.seek(pos);
            await skipSubBlocks("PlainText", "#CDDC39");
            hf.template.endStruct();
            hf.log("  Plain Text Extension");

        } else {
            // Unknown extension
            hf.template.seek(pos);
            hf.template.beginStruct("UnknownExt_0x" + extLabel.toString(16));
            await hf.template.addField("Introducer", "u8", { color: "#616161" });
            await hf.template.addField("Label", "u8", { color: "#616161" });
            pos += 2;
            hf.template.seek(pos);
            await skipSubBlocks("ExtData", "#616161");
            hf.template.endStruct();
            hf.log("  Unknown extension: 0x" + extLabel.toString(16));
        }

        extCount++;

    } else if (sentinel === 0x00) {
        // Padding / filler byte
        hf.template.seek(pos);
        hf.template.beginStruct("Padding");
        await hf.template.addField("Pad", "u8", { color: "#9E9E9E" });
        hf.template.endStruct();
        pos += 1;

    } else {
        // Unknown sentinel — stop
        hf.warn("Unknown block sentinel 0x" + sentinel.toString(16) + " at offset 0x" + pos.toString(16));
        break;
    }

    gifEnd = pos;
    blockCount++;
}

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (gifEnd < fileSize) {
    var overlaySize = fileSize - gifEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after GIF end");
    var oSigBuf = await hf.read(gifEnd, Math.min(4, overlaySize));
    var oSig = "";
    for (var i = 0; i < oSigBuf.length; i++) oSig += String.fromCharCode(oSigBuf[i]);
    if (oSig.slice(0, 2) === "MZ") hf.warn("  Overlay appears to be a PE (MZ) executable");
    else if (oSig === "\x89PNG") hf.warn("  Overlay appears to be a PNG image");
    else if (oSig.slice(0, 2) === "\xFF\xD8") hf.warn("  Overlay appears to be a JPEG image");
    else if (oSig === "%PDF") hf.warn("  Overlay appears to be a PDF document");
    else if (oSig === "PK\x03\x04") hf.warn("  Overlay appears to be a ZIP archive");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("GIF Summary");
hf.log("==============================");
hf.log("  Version: " + sigStr);
hf.log("  Canvas: " + scrWidth + " x " + scrHeight);
hf.log("  Frames: " + frameCount);
if (frameCount > 1) hf.log("  Animated: yes");
hf.log("  Extensions: " + extCount);
hf.log("  GIF data ends at: 0x" + gifEnd.toString(16) + " (" + gifEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (gifEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - gifEnd).toLocaleString() + " bytes after GIF end");
}

await hf.template.end();