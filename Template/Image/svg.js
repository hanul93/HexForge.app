// HexForge JS Template - SVG.js
// Purpose: SVG (Scalable Vector Graphics) — XML-based vector image
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image
// ID Bytes: 3C 3F 78 6D 6C (<?xml) or 3C 73 76 67 (<svg) or 1F 8B (gzip/svgz)
// Reference: https://www.w3.org/TR/SVG2/

var fileSize = await hf.fileSize;

hf.template.begin("SVG Image");
hf.template.setFormat("svg", "SVG Image", [".svg", ".svgz"]);

// ──────────────────────────────────────────────
// Validate — detect SVG, SVGZ, or reject
// ──────────────────────────────────────────────
var probeSize = Math.min(1024, fileSize);
var probe = await hf.read(0, probeSize);

function ascii(buf, off, len) {
    var s = "";
    for (var i = 0; i < len && off + i < buf.length; i++) {
        var c = buf[off + i];
        s += (c >= 32 && c < 127) ? String.fromCharCode(c) : "";
    }
    return s;
}

var isGzip = (probe[0] === 0x1F && probe[1] === 0x8B);
var isSVG = false;
var svgStart = -1; // byte offset where <svg is found

if (!isGzip) {
    // Scan for <svg or <?xml ... <svg
    var text = ascii(probe, 0, probeSize);
    var lower = text.toLowerCase();
    var svgIdx = lower.indexOf("<svg");
    if (svgIdx >= 0) {
        isSVG = true;
        svgStart = svgIdx;
    }
}

if (!isSVG && !isGzip) {
    hf.error("Not an SVG file (no <svg> tag or gzip signature found in first 1KB)");
    await hf.template.end();
    throw new Error("Not a valid SVG");
}

// ──────────────────────────────────────────────
// SVGZ (gzip compressed)
// ──────────────────────────────────────────────
if (isGzip) {
    hf.template.seek(0);
    hf.template.beginStruct("SVGZ_GzipHeader");
    await hf.template.addField("Magic", "u16", { color: "#2196F3" });
    await hf.template.addField("Method", "u8");
    await hf.template.addField("Flags", "u8", { color: "#FF9800" });
    await hf.template.addField("MTime", "u32", { color: "#FFC107" });
    await hf.template.addField("XFlags", "u8");
    await hf.template.addField("OS", "u8");
    hf.template.endStruct();

    // Mark rest as compressed data
    var compSize = fileSize - 10;
    if (compSize > 8) {
        hf.template.beginStruct("CompressedSVG");
        await hf.template.addField("DeflateStream", "bytes:" + (compSize - 8), { color: "#F44336" });
        hf.template.endStruct();

        // Gzip trailer (CRC32 + original size)
        hf.template.beginStruct("GzipTrailer");
        await hf.template.addField("CRC32", "u32", { color: "#9E9E9E" });
        var origSize = await hf.template.addField("OriginalSize", "u32", { color: "#4CAF50" });
        hf.template.endStruct();

        hf.log("SVGZ (gzip-compressed SVG)");
        hf.log("  Compressed size: " + fileSize + " bytes");
        hf.log("  Original size: " + origSize + " bytes");
    } else {
        hf.template.beginStruct("CompressedData");
        await hf.template.addField("Data", "bytes:" + compSize, { color: "#F44336" });
        hf.template.endStruct();
        hf.log("SVGZ (gzip-compressed SVG)");
    }

    hf.log("\n==============================");
    hf.log("SVG Summary");
    hf.log("==============================");
    hf.log("  Format: SVGZ (gzip)");
    hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
    await hf.template.end();
    throw new Error("__SVGZ_DONE__");
}

// ──────────────────────────────────────────────
// Plain SVG — read full text
// ──────────────────────────────────────────────
var fullBuf = await hf.read(0, fileSize);
var fullText = "";
for (var i = 0; i < fullBuf.length; i++) fullText += String.fromCharCode(fullBuf[i]);

// ──────────────────────────────────────────────
// Mark BOM if present
// ──────────────────────────────────────────────
var contentStart = 0;
if (fullBuf[0] === 0xEF && fullBuf[1] === 0xBB && fullBuf[2] === 0xBF) {
    hf.template.seek(0);
    hf.template.beginStruct("BOM");
    await hf.template.addField("UTF8_BOM", "bytes:3", { color: "#9E9E9E" });
    hf.template.endStruct();
    contentStart = 3;
    hf.log("  UTF-8 BOM detected");
}

// ──────────────────────────────────────────────
// Parse XML structure — identify major sections
// ──────────────────────────────────────────────
// We scan for key structural elements and mark their byte ranges

function findTag(text, tag, startFrom) {
    var idx = text.indexOf("<" + tag, startFrom);
    if (idx === -1) return null;
    // Find end of this opening tag
    var gt = text.indexOf(">", idx);
    if (gt === -1) return null;
    var selfClose = (text[gt - 1] === "/");

    // Find closing tag
    var closeIdx = -1;
    if (!selfClose) {
        closeIdx = text.indexOf("</" + tag, gt);
        if (closeIdx !== -1) {
            var closeEnd = text.indexOf(">", closeIdx);
            if (closeEnd !== -1) closeIdx = closeEnd + 1;
        }
    }
    var endIdx = selfClose ? (gt + 1) : (closeIdx !== -1 ? closeIdx : (gt + 1));
    return { start: idx, end: endIdx, selfClose: selfClose };
}

function extractAttr(text, start, end, attr) {
    var tagEnd = text.indexOf(">", start);
    if (tagEnd === -1 || tagEnd > end) tagEnd = end;
    var chunk = text.substring(start, tagEnd);
    var re = new RegExp(attr + '\\s*=\\s*["\']([^"\']*)["\']');
    var m = chunk.match(re);
    return m ? m[1] : null;
}

// ── XML Declaration ──
var xmlDeclStart = fullText.indexOf("<?xml");
var xmlDeclEnd = xmlDeclStart >= 0 ? fullText.indexOf("?>", xmlDeclStart) : -1;
if (xmlDeclStart >= 0 && xmlDeclEnd >= 0) {
    var declLen = xmlDeclEnd + 2 - xmlDeclStart;
    hf.template.seek(xmlDeclStart);
    hf.template.beginStruct("XMLDeclaration");
    await hf.template.addField("Decl", "string:" + declLen, { color: "#03A9F4" });
    hf.template.endStruct();

    var encoding = extractAttr(fullText, xmlDeclStart, xmlDeclEnd, "encoding");
    var version = extractAttr(fullText, xmlDeclStart, xmlDeclEnd, "version");
    hf.log("  XML " + (version || "1.0") + (encoding ? " encoding=" + encoding : ""));
}

// ── DOCTYPE ──
var dtdStart = fullText.indexOf("<!DOCTYPE");
if (dtdStart === -1) dtdStart = fullText.indexOf("<!doctype");
if (dtdStart >= 0) {
    var dtdEnd = fullText.indexOf(">", dtdStart);
    if (dtdEnd >= 0) {
        var dtdLen = dtdEnd + 1 - dtdStart;
        hf.template.seek(dtdStart);
        hf.template.beginStruct("DOCTYPE");
        await hf.template.addField("DocType", "string:" + dtdLen, { color: "#9E9E9E" });
        hf.template.endStruct();
    }
}

// ── Comments before <svg> ──
var commentIdx = 0;
var commentNum = 0;
while (commentIdx < svgStart) {
    var cs = fullText.indexOf("<!--", commentIdx);
    if (cs === -1 || cs >= svgStart) break;
    var ce = fullText.indexOf("-->", cs);
    if (ce === -1) break;
    ce += 3;
    hf.template.seek(cs);
    hf.template.beginStruct("Comment_" + commentNum);
    await hf.template.addField("Comment", "string:" + (ce - cs), { color: "#9E9E9E" });
    hf.template.endStruct();
    commentIdx = ce;
    commentNum++;
}

// ── <svg> root element ──
var svgTagEnd = fullText.indexOf(">", svgStart);
if (svgTagEnd >= 0) {
    var svgTagLen = svgTagEnd + 1 - svgStart;
    hf.template.seek(svgStart);
    hf.template.beginStruct("SVGOpenTag");
    await hf.template.addField("Tag", "string:" + svgTagLen, { color: "#2196F3" });
    hf.template.endStruct();

    // Extract key attributes
    var svgWidth = extractAttr(fullText, svgStart, svgTagEnd, "width");
    var svgHeight = extractAttr(fullText, svgStart, svgTagEnd, "height");
    var viewBox = extractAttr(fullText, svgStart, svgTagEnd, "viewBox");
    var xmlns = extractAttr(fullText, svgStart, svgTagEnd, "xmlns");

    hf.log("  SVG root element:");
    if (svgWidth && svgHeight) hf.log("    Size: " + svgWidth + " x " + svgHeight);
    if (viewBox) hf.log("    viewBox: " + viewBox);
    if (xmlns) hf.log("    xmlns: " + xmlns);
}

// ── Scan for major child elements inside <svg> ──
var ELEMENTS = [
    { tag: "defs", label: "Definitions", color: "#FF9800" },
    { tag: "style", label: "Style", color: "#FFC107" },
    { tag: "metadata", label: "Metadata", color: "#CDDC39" },
    { tag: "title", label: "Title", color: "#4CAF50" },
    { tag: "desc", label: "Description", color: "#4CAF50" },
    { tag: "linearGradient", label: "LinearGradient", color: "#E040FB" },
    { tag: "radialGradient", label: "RadialGradient", color: "#E040FB" },
    { tag: "clipPath", label: "ClipPath", color: "#E040FB" },
    { tag: "mask", label: "Mask", color: "#E040FB" },
    { tag: "filter", label: "Filter", color: "#7C4DFF" },
    { tag: "symbol", label: "Symbol", color: "#FF9800" },
    { tag: "pattern", label: "Pattern", color: "#FF9800" },
    { tag: "image", label: "Image", color: "#F44336" },
    { tag: "script", label: "Script", color: "#FF5722" },
    { tag: "foreignObject", label: "ForeignObject", color: "#795548" },
];

// Count drawing elements
var drawTags = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "use", "g"];
var drawCounts = {};
var totalDrawn = 0;

for (var di = 0; di < drawTags.length; di++) {
    var dt = drawTags[di];
    var count = 0;
    var searchPos = svgStart;
    while (true) {
        var found = fullText.indexOf("<" + dt, searchPos);
        if (found === -1) break;
        // Make sure it's a tag, not partial match (e.g. <greeting vs <g)
        var nextChar = fullText[found + dt.length + 1];
        if (nextChar === " " || nextChar === ">" || nextChar === "/" || nextChar === "\n" || nextChar === "\r" || nextChar === "\t") {
            count++;
        }
        searchPos = found + 1;
    }
    if (count > 0) {
        drawCounts[dt] = count;
        totalDrawn += count;
    }
}

// Mark notable child elements
for (var ei = 0; ei < ELEMENTS.length; ei++) {
    var el = ELEMENTS[ei];
    var searchPos = svgStart;
    var elNum = 0;
    while (elNum < 10) {
        var loc = findTag(fullText, el.tag, searchPos);
        if (!loc) break;
        var elLen = loc.end - loc.start;
        if (elLen > 0 && elLen < 100000) {
            hf.template.seek(loc.start);
            var sName = el.label + (elNum > 0 ? "_" + elNum : "");
            hf.template.beginStruct(sName);
            await hf.template.addField(sName, "string:" + elLen, { color: el.color });
            hf.template.endStruct();

            // Extract title/desc text
            if (el.tag === "title" || el.tag === "desc") {
                var innerStart = fullText.indexOf(">", loc.start) + 1;
                var innerEnd = fullText.indexOf("</", innerStart);
                if (innerEnd > innerStart) {
                    var inner = fullText.substring(innerStart, Math.min(innerEnd, innerStart + 80)).trim();
                    if (inner) hf.log("  " + el.label + ": \"" + inner + "\"");
                }
            } else {
                hf.log("  " + el.label + ": " + elLen + " bytes");
            }
        }
        searchPos = loc.end;
        elNum++;
    }
}

// ── SVG body (drawing content between known elements) ──
// Mark the bulk SVG content
var svgCloseIdx = fullText.lastIndexOf("</svg>");
var svgEndIdx = svgCloseIdx >= 0 ? svgCloseIdx + 6 : fileSize;
// Find any trailing > after </svg>
var trueEnd = svgCloseIdx >= 0 ? fullText.indexOf(">", svgCloseIdx) + 1 : fileSize;
if (trueEnd <= 0) trueEnd = fileSize;

// Mark closing </svg> tag
if (svgCloseIdx >= 0) {
    hf.template.seek(svgCloseIdx);
    hf.template.beginStruct("SVGCloseTag");
    await hf.template.addField("CloseTag", "string:" + (trueEnd - svgCloseIdx), { color: "#2196F3" });
    hf.template.endStruct();
}

// Log drawing element counts
if (totalDrawn > 0) {
    hf.log("  Drawing elements (" + totalDrawn + " total):");
    for (var dt in drawCounts) {
        hf.log("    <" + dt + ">: " + drawCounts[dt]);
    }
}

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (trueEnd < fileSize) {
    // Check if remaining is just whitespace
    var trailing = fullText.substring(trueEnd);
    var trimmed = trailing.trim();
    if (trimmed.length > 0) {
        hf.warn("Overlay data: " + (fileSize - trueEnd) + " byte(s) after </svg>");
    }
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("SVG Summary");
hf.log("==============================");
hf.log("  Format: SVG (plain XML)");
if (svgWidth && svgHeight) hf.log("  Size: " + svgWidth + " x " + svgHeight);
if (viewBox) hf.log("  viewBox: " + viewBox);
hf.log("  Drawing elements: " + totalDrawn);
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");

await hf.template.end();