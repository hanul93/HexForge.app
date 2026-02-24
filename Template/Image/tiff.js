// HexForge JS Template - TIFF.js
// Purpose: TIFF (Tagged Image File Format) — Images & GeoTIFF
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image
// ID Bytes: 49 49 2A 00 (LE) or 4D 4D 00 2A (BE) — also BigTIFF 49 49 2B 00 / 4D 4D 00 2B
// Reference: TIFF 6.0 Specification, Adobe TIFF Supplement, BigTIFF

var fileSize = await hf.fileSize;

hf.template.begin("TIFF Image");
hf.template.setFormat("tiff", "TIFF Image", [".tif", ".tiff"]);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
var hdr = await hf.read(0, 8);
var isle = (hdr[0] === 0x49 && hdr[1] === 0x49); // II = little-endian
var isbe = (hdr[0] === 0x4D && hdr[1] === 0x4D); // MM = big-endian

if (!isle && !isbe) {
    hf.error("Not a TIFF file (expected byte order II or MM)");
    await hf.template.end();
    throw new Error("Not a valid TIFF");
}

function u16(buf, off) {
    if (isle) return buf[off] | (buf[off + 1] << 8);
    return (buf[off] << 8) | buf[off + 1];
}

var magic = u16(hdr, 2);
if (magic !== 42 && magic !== 43) {
    hf.error("Not a TIFF file (expected magic 42 or 43, got " + magic + ")");
    await hf.template.end();
    throw new Error("Not a valid TIFF");
}
function u32(buf, off) {
    if (isle) return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
    return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}
function i32(buf, off) {
    var v = u32(buf, off);
    return v > 0x7FFFFFFF ? v - 0x100000000 : v;
}

var isBigTiff = (magic === 43);
if (isBigTiff) {
    hf.log("BigTIFF detected (64-bit offsets) — parsing header only");
}

var firstIFD = u32(hdr, 4);

// Tag/Type database
var TAG_NAMES = {
    254:"NewSubfileType",255:"SubfileType",256:"ImageWidth",257:"ImageLength",
    258:"BitsPerSample",259:"Compression",262:"PhotometricInterpretation",
    263:"Threshholding",266:"FillOrder",269:"DocumentName",270:"ImageDescription",
    271:"Make",272:"Model",273:"StripOffsets",274:"Orientation",
    277:"SamplesPerPixel",278:"RowsPerStrip",279:"StripByteCounts",
    280:"MinSampleValue",281:"MaxSampleValue",282:"XResolution",283:"YResolution",
    284:"PlanarConfiguration",288:"FreeOffsets",289:"FreeByteCounts",
    290:"GrayResponseUnit",292:"T4Options",293:"T6Options",
    296:"ResolutionUnit",301:"TransferFunction",305:"Software",306:"DateTime",
    315:"Artist",316:"HostComputer",317:"Predictor",318:"WhitePoint",
    319:"PrimaryChromaticities",320:"ColorMap",321:"HalftoneHints",
    322:"TileWidth",323:"TileLength",324:"TileOffsets",325:"TileByteCounts",
    330:"SubIFDs",338:"ExtraSamples",339:"SampleFormat",347:"JPEGTables",
    530:"YCbCrSubSampling",531:"YCbCrPositioning",532:"ReferenceBlackWhite",
    700:"XMP",
    33432:"Copyright",33434:"ExposureTime",33437:"FNumber",
    34665:"ExifIFD",34853:"GPSIFD",
    36864:"ExifVersion",36867:"DateTimeOriginal",36868:"DateTimeDigitized",
    37377:"ShutterSpeedValue",37378:"ApertureValue",37380:"ExposureBiasValue",
    37383:"MeteringMode",37384:"LightSource",37385:"Flash",37386:"FocalLength",
    37500:"MakerNote",37510:"UserComment",
    40960:"FlashpixVersion",40961:"ColorSpace",40962:"PixelXDimension",40963:"PixelYDimension",
    41486:"FocalPlaneXRes",41487:"FocalPlaneYRes",41488:"FocalPlaneResUnit",
    41985:"CustomRendered",41986:"ExposureMode",41987:"WhiteBalance",42016:"ImageUniqueID",
    // GeoTIFF
    33550:"ModelPixelScale",33922:"ModelTiepoint",34264:"ModelTransformation",
    34735:"GeoKeyDirectory",34736:"GeoDoubleParams",34737:"GeoAsciiParams",
    // DNG
    50706:"DNGVersion",50707:"DNGBackwardVersion",50708:"UniqueCameraModel",
    50721:"ColorMatrix1",50722:"ColorMatrix2",50727:"AnalogBalance",
    50740:"DNGPrivateData",50741:"MakerNoteSafety",
};

var TYPE_NAMES = {1:"BYTE",2:"ASCII",3:"SHORT",4:"LONG",5:"RATIONAL",6:"SBYTE",7:"UNDEFINED",
    8:"SSHORT",9:"SLONG",10:"SRATIONAL",11:"FLOAT",12:"DOUBLE",16:"LONG8",17:"SLONG8",18:"IFD8"};
var TYPE_SIZES = {1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8,16:8,17:8,18:8};

var COMPRESSIONS = {1:"None",2:"CCITT_RLE",3:"CCITT_G3",4:"CCITT_G4",5:"LZW",
    6:"JPEG_old",7:"JPEG",8:"Deflate/zlib",32773:"PackBits",34712:"JPEG2000",
    50000:"ZSTD",50001:"WEBP"};
var PHOTOMETRICS = {0:"WhiteIsZero",1:"BlackIsZero",2:"RGB",3:"Palette",
    4:"TransparencyMask",5:"CMYK",6:"YCbCr",8:"CIELab",32803:"CFA",34892:"LinearRaw"};
var ORIENTATIONS = {1:"TopLeft",2:"TopRight",3:"BottomRight",4:"BottomLeft",
    5:"LeftTop",6:"RightTop",7:"RightBottom",8:"LeftBottom"};
var RES_UNITS = {1:"None",2:"inch",3:"cm"};
var SAMPLE_FMTS = {1:"uint",2:"int",3:"float",4:"undefined"};

function tagName(t) { return TAG_NAMES[t] || ("Tag_" + t); }
function typeName(t) { return TYPE_NAMES[t] || ("Type_" + t); }

// Track marked regions for full coverage
var marked = {}; // offset -> size

function mark(off, sz) {
    if (sz > 0) marked[off] = Math.max(marked[off] || 0, sz);
}

// ──────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("TIFFHeader");
await hf.template.addField("ByteOrder", "string:2", { color: "#2196F3" });
await hf.template.addField("Magic", "u16", { color: "#2196F3" });
await hf.template.addField("IFD0_Offset", "u32", { color: "#4CAF50" });
hf.template.endStruct();
mark(0, 8);

var boStr = isle ? "Little-Endian (II)" : "Big-Endian (MM)";
hf.log("TIFF " + (isBigTiff ? "BigTIFF" : "6.0") + " — " + boStr);
hf.log("  First IFD at offset 0x" + firstIFD.toString(16));

if (isBigTiff) {
    hf.log("  BigTIFF parsing not fully supported — header only");
    await hf.template.end();
    throw new Error("__BIGTIFF_STUB__");
}

// ──────────────────────────────────────────────
// Parse IFDs
// ──────────────────────────────────────────────
var ifdOffsets = []; // queue of {offset, name}
var parsedIFDs = {}; // prevent infinite loops
var allStrips = [];  // [{offset, size}] for image data
var allTiles = [];

ifdOffsets.push({ offset: firstIFD, name: "IFD0" });

// Collect sub-IFDs from ExifIFD, GPSIFD, SubIFDs tags
function queueSubIFD(val, name) {
    if (val > 0 && val < fileSize && !parsedIFDs[val]) {
        ifdOffsets.push({ offset: val, name: name });
    }
}

var ifdIdx = 0;

while (ifdOffsets.length > 0 && ifdIdx < 20) {
    var cur = ifdOffsets.shift();
    var ifdOff = cur.offset;
    var ifdName = cur.name;

    if (parsedIFDs[ifdOff]) continue;
    if (ifdOff + 2 > fileSize) continue;
    parsedIFDs[ifdOff] = true;

    var countBuf = await hf.read(ifdOff, 2);
    var numEntries = u16(countBuf, 0);
    if (numEntries === 0 || numEntries > 1000) continue;

    var ifdSize = 2 + numEntries * 12 + 4;
    if (ifdOff + ifdSize > fileSize) continue;

    var ifdBuf = await hf.read(ifdOff, ifdSize);

    hf.template.seek(ifdOff);
    hf.template.beginStruct(ifdName);
    await hf.template.addField("EntryCount", "u16", { color: "#FF9800" });

    hf.log("\n-- " + ifdName + " at 0x" + ifdOff.toString(16) + " (" + numEntries + " entries) --");

    // Image properties for this IFD
    var imgWidth = 0, imgHeight = 0, compression = 1, photometric = 0;
    var bps = [], spp = 1, orientation = 1, resUnit = 2;
    var xres = "", yres = "";
    var stripOffsets = [], stripByteCounts = [];
    var tileOffsets = [], tileByteCounts = [];
    var tileWidth = 0, tileHeight = 0;
    var software = "", dateTime = "", make = "", model = "", desc = "";

    for (var ei = 0; ei < numEntries; ei++) {
        var eOff = 2 + ei * 12;
        var tag = u16(ifdBuf, eOff);
        var typ = u16(ifdBuf, eOff + 2);
        var cnt = u32(ifdBuf, eOff + 4);
        var valRaw = u32(ifdBuf, eOff + 8);

        var tSz = TYPE_SIZES[typ] || 1;
        var totalBytes = cnt * tSz;
        var isInline = (totalBytes <= 4);
        var valOff = isInline ? (ifdOff + eOff + 8) : valRaw;

        // Color by tag category
        var color = "#E040FB"; // default
        if (tag <= 320) color = "#03A9F4"; // baseline
        else if (tag >= 33432 && tag < 40000) color = "#FFC107"; // EXIF
        else if (tag >= 33550 && tag <= 34737) color = "#4CAF50"; // GeoTIFF
        else if (tag >= 50706) color = "#7C4DFF"; // DNG

        await hf.template.addField(tagName(tag), "bytes:12", { color: color });

        // Read value for interpretation
        var vals = [];
        if (totalBytes > 0 && totalBytes <= 65536) {
            var vBuf;
            if (isInline) {
                vBuf = ifdBuf.slice(eOff + 8, eOff + 12);
            } else {
                if (valRaw + totalBytes <= fileSize) {
                    vBuf = new Uint8Array(await hf.read(valRaw, totalBytes));
                    // Mark external data
                    mark(valRaw, totalBytes);
                } else {
                    vBuf = new Uint8Array(0);
                }
            }

            if (vBuf.length > 0) {
                if (typ === 2) { // ASCII
                    var s = "";
                    for (var j = 0; j < vBuf.length && vBuf[j] !== 0; j++) s += String.fromCharCode(vBuf[j]);
                    vals = [s];
                } else {
                    for (var j = 0; j < cnt && j * tSz < vBuf.length; j++) {
                        if (typ === 1 || typ === 6 || typ === 7) vals.push(vBuf[j * tSz]);
                        else if (typ === 3 || typ === 8) vals.push(u16(vBuf, j * tSz));
                        else if (typ === 4 || typ === 9) vals.push(u32(vBuf, j * tSz));
                        else if (typ === 5 || typ === 10) {
                            var num = u32(vBuf, j * 8);
                            var den = u32(vBuf, j * 8 + 4);
                            vals.push(den !== 0 ? num + "/" + den : "0");
                        }
                        else vals.push(u32(vBuf, j * tSz));
                    }
                }
            }
        }

        // Extract key properties
        var v0 = vals.length > 0 ? vals[0] : valRaw;
        if (tag === 256) imgWidth = v0;
        else if (tag === 257) imgHeight = v0;
        else if (tag === 258) bps = vals;
        else if (tag === 259) compression = v0;
        else if (tag === 262) photometric = v0;
        else if (tag === 271) make = v0;
        else if (tag === 272) model = v0;
        else if (tag === 273) stripOffsets = vals;
        else if (tag === 274) orientation = v0;
        else if (tag === 277) spp = v0;
        else if (tag === 278) { } // RowsPerStrip
        else if (tag === 279) stripByteCounts = vals;
        else if (tag === 282) xres = v0;
        else if (tag === 283) yres = v0;
        else if (tag === 296) resUnit = v0;
        else if (tag === 305) software = v0;
        else if (tag === 306) dateTime = v0;
        else if (tag === 270) desc = v0;
        else if (tag === 322) tileWidth = v0;
        else if (tag === 323) tileHeight = v0;
        else if (tag === 324) tileOffsets = vals;
        else if (tag === 325) tileByteCounts = vals;
        else if (tag === 34665) queueSubIFD(v0, "ExifIFD");
        else if (tag === 34853) queueSubIFD(v0, "GPSIFD");
        else if (tag === 330) {
            for (var si = 0; si < vals.length; si++) queueSubIFD(vals[si], "SubIFD_" + si);
        }

        // Log entry
        var valStr = "";
        if (typ === 2) valStr = "\"" + (vals[0] || "").slice(0, 60) + "\"";
        else if (vals.length <= 6) valStr = vals.join(", ");
        else valStr = vals.slice(0, 4).join(", ") + " ... (" + vals.length + " values)";

        // Add decoded meaning
        var decoded = "";
        if (tag === 259) decoded = COMPRESSIONS[v0] || "";
        else if (tag === 262) decoded = PHOTOMETRICS[v0] || "";
        else if (tag === 274) decoded = ORIENTATIONS[v0] || "";
        else if (tag === 296) decoded = RES_UNITS[v0] || "";
        else if (tag === 339 && vals.length > 0) decoded = vals.map(function(x) { return SAMPLE_FMTS[x] || ""; }).join(",");

        var logLine = "  " + tagName(tag).padEnd(28) + typeName(typ).padEnd(10) + "[" + cnt + "] " + valStr;
        if (decoded) logLine += " = " + decoded;
        hf.log(logLine);
    }

    // Next IFD offset
    var nextIFD = u32(ifdBuf, 2 + numEntries * 12);
    await hf.template.addField("NextIFD", "u32", { color: "#9E9E9E" });
    hf.template.endStruct();
    mark(ifdOff, ifdSize);

    if (nextIFD > 0 && nextIFD < fileSize) {
        queueSubIFD(nextIFD, "IFD" + (ifdIdx + 1));
    }

    // Log image summary
    if (imgWidth > 0 && imgHeight > 0) {
        hf.log("  ---- Image: " + imgWidth + "x" + imgHeight +
               " " + (PHOTOMETRICS[photometric] || photometric) +
               " " + (COMPRESSIONS[compression] || compression) +
               " " + bps.join("/") + "bps SPP=" + spp);
        if (xres) hf.log("  Resolution: " + xres + " x " + yres + " " + (RES_UNITS[resUnit] || ""));
        if (make || model) hf.log("  Camera: " + make + " " + model);
        if (software) hf.log("  Software: " + software);
        if (dateTime) hf.log("  DateTime: " + dateTime);
    }

    // Collect strips/tiles
    for (var si = 0; si < stripOffsets.length; si++) {
        var so = stripOffsets[si];
        var sb = si < stripByteCounts.length ? stripByteCounts[si] : 0;
        if (so > 0 && sb > 0) allStrips.push({ offset: so, size: sb });
    }
    for (var ti = 0; ti < tileOffsets.length; ti++) {
        var to = tileOffsets[ti];
        var tb = ti < tileByteCounts.length ? tileByteCounts[ti] : 0;
        if (to > 0 && tb > 0) allTiles.push({ offset: to, size: tb });
    }

    ifdIdx++;
}

// ══════════════════════════════════════════════
// Mark external tag data regions
// ══════════════════════════════════════════════
var extRegions = [];
for (var off in marked) {
    var o = parseInt(off);
    var s = marked[off];
    // Don't re-mark IFD regions or header
    var isIFD = false;
    for (var k in parsedIFDs) { if (o === parseInt(k)) { isIFD = true; break; } }
    if (o < 8 || isIFD) continue;
    extRegions.push({ offset: o, size: s });
}

// Sort and deduplicate
extRegions.sort(function(a, b) { return a.offset - b.offset; });

for (var i = 0; i < extRegions.length; i++) {
    var r = extRegions[i];
    if (r.offset + r.size > fileSize) r.size = fileSize - r.offset;
    if (r.size <= 0) continue;
    hf.template.seek(r.offset);
    hf.template.beginStruct("TagData_0x" + r.offset.toString(16));
    await hf.template.addField("Data_0x" + r.offset.toString(16), "bytes:" + r.size, { color: "#00BCD4" });
    hf.template.endStruct();
}

// ══════════════════════════════════════════════
// Mark image data (strips/tiles)
// ══════════════════════════════════════════════
var imgData = allStrips.concat(allTiles);
imgData.sort(function(a, b) { return a.offset - b.offset; });

// Merge overlapping/adjacent
var merged = [];
for (var i = 0; i < imgData.length; i++) {
    var r = imgData[i];
    if (merged.length > 0) {
        var last = merged[merged.length - 1];
        if (r.offset <= last.offset + last.size) {
            last.size = Math.max(last.size, r.offset + r.size - last.offset);
            continue;
        }
    }
    merged.push({ offset: r.offset, size: r.size });
}

var totalImgBytes = 0;
for (var i = 0; i < merged.length; i++) {
    var r = merged[i];
    if (r.offset + r.size > fileSize) r.size = fileSize - r.offset;
    if (r.size <= 0) continue;
    totalImgBytes += r.size;

    hf.template.seek(r.offset);
    if (merged.length <= 20) {
        hf.template.beginStruct("ImageData_" + i);
        await hf.template.addField("Strip_" + i, "bytes:" + r.size, { color: "#F44336" });
        hf.template.endStruct();
    } else if (i < 10 || i === merged.length - 1) {
        hf.template.beginStruct("ImageData_" + i);
        await hf.template.addField("Strip_" + i, "bytes:" + r.size, { color: "#F44336" });
        hf.template.endStruct();
    } else {
        // Group remaining into one block
        if (i === 10) {
            var groupOff = r.offset;
            var groupEnd = r.offset + r.size;
            for (var j = i + 1; j < merged.length - 1; j++) {
                groupEnd = Math.max(groupEnd, merged[j].offset + merged[j].size);
            }
            var groupSz = groupEnd - groupOff;
            if (groupSz > 0 && groupOff + groupSz <= fileSize) {
                hf.template.beginStruct("ImageData_bulk");
                await hf.template.addField("Strips_bulk", "bytes:" + groupSz, { color: "#F44336" });
                hf.template.endStruct();
            }
            i = merged.length - 2; // skip to last
        }
    }
}

if (allStrips.length > 0) hf.log("\n  Image data: " + allStrips.length + " strips, " + totalImgBytes + " bytes");
if (allTiles.length > 0) hf.log("\n  Image data: " + allTiles.length + " tiles, " + totalImgBytes + " bytes");

// ══════════════════════════════════════════════
// Compute TIFF end boundary
// ══════════════════════════════════════════════
var tiffEnd = 8; // at minimum, header

for (var k in parsedIFDs) {
    var o = parseInt(k);
    if (o + 2 <= fileSize) {
        var cb = await hf.read(o, 2);
        var ne = u16(cb, 0);
        var sz = 2 + ne * 12 + 4;
        if (o + sz > tiffEnd) tiffEnd = o + sz;
    }
}
for (var i = 0; i < extRegions.length; i++) {
    var re = extRegions[i].offset + extRegions[i].size;
    if (re > tiffEnd) tiffEnd = re;
}
for (var i = 0; i < merged.length; i++) {
    var re = merged[i].offset + merged[i].size;
    if (re > tiffEnd) tiffEnd = re;
}

if (tiffEnd < fileSize) {
    var overlaySize = fileSize - tiffEnd;
    hf.warn("Overlay data detected after TIFF end at 0x" + tiffEnd.toString(16) +
            " (" + overlaySize.toLocaleString() + " bytes)");
    // Identify overlay signature
    var sigBuf = await hf.read(tiffEnd, Math.min(4, fileSize - tiffEnd));
    var sig = "";
    for (var si = 0; si < sigBuf.length; si++) sig += String.fromCharCode(sigBuf[si]);
    if (sig.slice(0, 2) === "MZ") hf.warn("  Overlay appears to be a PE (MZ) executable");
    else if (sig === "\x89PNG") hf.warn("  Overlay appears to be a PNG image");
    else if (sig.slice(0, 2) === "\xFF\xD8") hf.warn("  Overlay appears to be a JPEG image");
    else if (sig === "%PDF") hf.warn("  Overlay appears to be a PDF document");
    else if (sig === "PK\x03\x04") hf.warn("  Overlay appears to be a ZIP archive");
    else if (sig === "Rar!") hf.warn("  Overlay appears to be a RAR archive");
}

// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════
hf.log("\n==============================");
hf.log("TIFF Summary");
hf.log("==============================");
hf.log("  Byte order: " + boStr);
hf.log("  IFDs parsed: " + ifdIdx);
hf.log("  TIFF data ends at: 0x" + tiffEnd.toString(16) + " (" + tiffEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
hf.log("  Image data: " + totalImgBytes.toLocaleString() + " bytes");
if (tiffEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - tiffEnd).toLocaleString() + " bytes after TIFF end");
}

await hf.template.end();