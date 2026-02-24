// HexForge JS Template - BMP.js
// Purpose: BMP (Windows Bitmap) — DIB file format
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image
// ID Bytes: 42 4D (BM)
// Reference: https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-storage

var fileSize = await hf.fileSize;

hf.template.begin("BMP Image");
hf.template.setFormat("bmp", "BMP Image", [".bmp", ".dib", ".rle"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
var magic = await hf.read(0, 2);
if (magic[0] !== 0x42 || magic[1] !== 0x4D) {
    hf.error("Not a BMP file (expected 'BM', got 0x" +
             magic[0].toString(16).toUpperCase() + magic[1].toString(16).toUpperCase() + ")");
    await hf.template.end();
    throw new Error("Not a valid BMP");
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

var COMPRESSIONS = {
    0: "BI_RGB", 1: "BI_RLE8", 2: "BI_RLE4", 3: "BI_BITFIELDS",
    4: "BI_JPEG", 5: "BI_PNG", 6: "BI_ALPHABITFIELDS",
    11: "BI_CMYK", 12: "BI_CMYKRLE8", 13: "BI_CMYKRLE4"
};
var COLORSPACE_TYPES = {
    0: "LCS_CALIBRATED_RGB",
    0x73524742: "LCS_sRGB",       // 'sRGB'
    0x57696E20: "LCS_WINDOWS_COLOR_SPACE", // 'Win '
    0x4C494E4B: "PROFILE_LINKED", // 'LINK'
    0x4D424544: "PROFILE_EMBEDDED" // 'MBED'
};
var INTENT_MAP = { 1: "Business(Saturation)", 2: "Graphics(RelColorimetric)", 4: "Images(Perceptual)", 8: "AbsColorimetric" };

// ──────────────────────────────────────────────
// BITMAPFILEHEADER (14 bytes)
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("BITMAPFILEHEADER");
await hf.template.addField("bfType", "string:2", { color: "#2196F3" });
var bfSize = await hf.template.addField("bfSize", "u32", { color: "#03A9F4" });
await hf.template.addField("bfReserved1", "u16", { color: "#9E9E9E" });
await hf.template.addField("bfReserved2", "u16", { color: "#9E9E9E" });
var bfOffBits = await hf.template.addField("bfOffBits", "u32", { color: "#4CAF50" });
hf.template.endStruct();

hf.log("BMP detected");
hf.log("  File size (header): " + bfSize + ", Pixel data offset: 0x" + bfOffBits.toString(16));

// ──────────────────────────────────────────────
// DIB Header — detect variant by size
// ──────────────────────────────────────────────
var dibSizeBuf = await hf.read(14, 4);
var dibSize = u32(dibSizeBuf, 0);

var DIB_NAMES = {
    12: "BITMAPCOREHEADER",
    40: "BITMAPINFOHEADER",
    52: "BITMAPV2INFOHEADER",
    56: "BITMAPV3INFOHEADER",
    64: "OS22XBITMAPHEADER",
    108: "BITMAPV4HEADER",
    124: "BITMAPV5HEADER"
};
var dibName = DIB_NAMES[dibSize] || ("DIBHeader_" + dibSize);

hf.template.beginStruct(dibName);
await hf.template.addField("biSize", "u32", { color: "#FF9800" });

var imgWidth = 0, imgHeight = 0, absHeight = 0, topDown = false;
var biBitCount = 0, biCompression = 0, biSizeImage = 0;
var biClrUsed = 0, biClrImportant = 0;
var planes = 0;

if (dibSize === 12) {
    // BITMAPCOREHEADER (OS/2 1.x) — uses 16-bit width/height
    imgWidth = await hf.template.addField("bcWidth", "u16", { color: "#03A9F4" });
    imgHeight = await hf.template.addField("bcHeight", "u16", { color: "#03A9F4" });
    absHeight = imgHeight;
    planes = await hf.template.addField("bcPlanes", "u16");
    biBitCount = await hf.template.addField("bcBitCount", "u16", { color: "#E040FB" });

    hf.log("  " + dibName + " (OS/2 1.x)");
    hf.log("  " + imgWidth + " x " + imgHeight + ", " + biBitCount + " bpp");

} else {
    // BITMAPINFOHEADER and variants (40+)
    imgWidth = await hf.template.addField("biWidth", "i32", { color: "#03A9F4" });
    var rawHeight = await hf.template.addField("biHeight", "i32", { color: "#03A9F4" });
    imgHeight = rawHeight;
    topDown = rawHeight < 0;
    absHeight = topDown ? -rawHeight : rawHeight;
    planes = await hf.template.addField("biPlanes", "u16");
    biBitCount = await hf.template.addField("biBitCount", "u16", { color: "#E040FB" });
    biCompression = await hf.template.addField("biCompression", "u32", { color: "#FFC107", enumMap: COMPRESSIONS });
    biSizeImage = await hf.template.addField("biSizeImage", "u32", { color: "#F44336" });
    await hf.template.addField("biXPelsPerMeter", "i32", { color: "#CDDC39" });
    await hf.template.addField("biYPelsPerMeter", "i32", { color: "#CDDC39" });
    biClrUsed = await hf.template.addField("biClrUsed", "u32", { color: "#FF9800" });
    biClrImportant = await hf.template.addField("biClrImportant", "u32");

    hf.log("  " + dibName);
    hf.log("  " + imgWidth + " x " + absHeight + (topDown ? " (top-down)" : " (bottom-up)") +
           ", " + biBitCount + " bpp");
    hf.log("  Compression: " + (COMPRESSIONS[biCompression] || ("0x" + biCompression.toString(16))));
    if (biSizeImage > 0) hf.log("  Image data size: " + biSizeImage + " bytes");
    if (biClrUsed > 0) hf.log("  Colors used: " + biClrUsed);

    // V2 (52): adds RGB bitmasks
    if (dibSize >= 52) {
        await hf.template.addField("RedMask", "u32", { color: "#F44336" });
        await hf.template.addField("GreenMask", "u32", { color: "#4CAF50" });
        await hf.template.addField("BlueMask", "u32", { color: "#2196F3" });
    }

    // V3 (56): adds alpha mask
    if (dibSize >= 56) {
        await hf.template.addField("AlphaMask", "u32", { color: "#00BCD4" });
    }

    // V4 (108): color space and endpoints
    if (dibSize >= 108) {
        var csType = await hf.template.addField("CSType", "u32", { color: "#7C4DFF", enumMap: COLORSPACE_TYPES });
        // CIEXYZTRIPLE Endpoints (36 bytes = 9 x i32)
        await hf.template.addField("RedX", "i32", { color: "#F44336" });
        await hf.template.addField("RedY", "i32", { color: "#F44336" });
        await hf.template.addField("RedZ", "i32", { color: "#F44336" });
        await hf.template.addField("GreenX", "i32", { color: "#4CAF50" });
        await hf.template.addField("GreenY", "i32", { color: "#4CAF50" });
        await hf.template.addField("GreenZ", "i32", { color: "#4CAF50" });
        await hf.template.addField("BlueX", "i32", { color: "#2196F3" });
        await hf.template.addField("BlueY", "i32", { color: "#2196F3" });
        await hf.template.addField("BlueZ", "i32", { color: "#2196F3" });
        await hf.template.addField("GammaRed", "u32", { color: "#FF5722" });
        await hf.template.addField("GammaGreen", "u32", { color: "#FF5722" });
        await hf.template.addField("GammaBlue", "u32", { color: "#FF5722" });

        var csName = COLORSPACE_TYPES[csType] || ("0x" + csType.toString(16));
        hf.log("  Color space: " + csName);
    }

    // V5 (124): intent, profile data
    if (dibSize >= 124) {
        var intent = await hf.template.addField("Intent", "u32", { color: "#7C4DFF", enumMap: INTENT_MAP });
        var profileData = await hf.template.addField("ProfileData", "u32", { color: "#795548" });
        var profileSize = await hf.template.addField("ProfileSize", "u32", { color: "#795548" });
        await hf.template.addField("Reserved", "u32", { color: "#9E9E9E" });

        hf.log("  Intent: " + (INTENT_MAP[intent] || intent));
        if (profileSize > 0) hf.log("  ICC Profile: offset=" + profileData + " size=" + profileSize);
    }

    // Handle unknown/larger DIB sizes
    var consumedDib = 40;
    if (dibSize >= 52) consumedDib = 52;
    if (dibSize >= 56) consumedDib = 56;
    if (dibSize >= 108) consumedDib = 108;
    if (dibSize >= 124) consumedDib = 124;

    if (dibSize > consumedDib) {
        var extraDib = dibSize - consumedDib;
        await hf.template.addField("ExtraDIBData", "bytes:" + extraDib, { color: "#9E9E9E" });
    }
}

hf.template.endStruct();

// ──────────────────────────────────────────────
// BITFIELDS (if compression = 3 or 6 and not embedded in header)
// ──────────────────────────────────────────────
var afterDIB = 14 + dibSize;
if ((biCompression === 3 || biCompression === 6) && dibSize === 40) {
    // Separate bitmasks after 40-byte header
    var maskSize = (biCompression === 6) ? 16 : 12;
    if (afterDIB + maskSize <= bfOffBits) {
        hf.template.seek(afterDIB);
        hf.template.beginStruct("BitfieldMasks");
        await hf.template.addField("RedMask", "u32", { color: "#F44336" });
        await hf.template.addField("GreenMask", "u32", { color: "#4CAF50" });
        await hf.template.addField("BlueMask", "u32", { color: "#2196F3" });
        if (biCompression === 6) {
            await hf.template.addField("AlphaMask", "u32", { color: "#00BCD4" });
        }
        hf.template.endStruct();
        afterDIB += maskSize;
        hf.log("  Bitfield masks present");
    }
}

// ──────────────────────────────────────────────
// Color Table (Palette)
// ──────────────────────────────────────────────
var paletteStart = afterDIB;
var paletteEnd = bfOffBits;
var paletteBytes = paletteEnd - paletteStart;

if (paletteBytes > 0 && biBitCount <= 8) {
    var entrySize = (dibSize === 12) ? 3 : 4; // RGBTRIPLE vs RGBQUAD
    var paletteEntries = Math.floor(paletteBytes / entrySize);

    hf.template.seek(paletteStart);
    hf.template.beginStruct("ColorTable");
    await hf.template.addField("Palette", "bytes:" + paletteBytes, { color: "#FF9800" });
    hf.template.endStruct();

    hf.log("  Palette: " + paletteEntries + " entries (" + paletteBytes + " bytes)");
} else if (paletteBytes > 0) {
    // Gap between DIB header and pixel data (could be bitfield masks already consumed, or extra data)
    hf.template.seek(paletteStart);
    hf.template.beginStruct("HeaderGap");
    await hf.template.addField("GapData", "bytes:" + paletteBytes, { color: "#9E9E9E" });
    hf.template.endStruct();
}

// ──────────────────────────────────────────────
// Pixel Data
// ──────────────────────────────────────────────
var bmpEnd = bfOffBits;

if (bfOffBits < fileSize) {
    var pixelDataSize;
    if (biSizeImage > 0) {
        pixelDataSize = biSizeImage;
    } else {
        // Calculate: row size = ceil(biBitCount * width / 32) * 4
        var rowBytes = Math.floor((biBitCount * imgWidth + 31) / 32) * 4;
        pixelDataSize = rowBytes * absHeight;
    }

    // Clamp to file
    if (bfOffBits + pixelDataSize > fileSize) {
        pixelDataSize = fileSize - bfOffBits;
    }

    if (pixelDataSize > 0) {
        hf.template.seek(bfOffBits);
        hf.template.beginStruct("PixelData");
        await hf.template.addField("Pixels", "bytes:" + pixelDataSize, { color: "#F44336" });
        hf.template.endStruct();
        bmpEnd = bfOffBits + pixelDataSize;

        hf.log("  Pixel data: " + pixelDataSize.toLocaleString() + " bytes at 0x" + bfOffBits.toString(16));
    }
}

// ──────────────────────────────────────────────
// ICC Profile (V5, embedded after pixel data)
// ──────────────────────────────────────────────
if (dibSize >= 124) {
    var dibBuf = await hf.read(14, 124);
    var profOff = u32(dibBuf, 108); // relative to BITMAPFILEHEADER start (14)
    var profSz = u32(dibBuf, 112);
    if (profSz > 0 && profOff > 0) {
        var profAbsOff = 14 + profOff;
        if (profAbsOff + profSz <= fileSize) {
            hf.template.seek(profAbsOff);
            hf.template.beginStruct("ICCProfile");
            await hf.template.addField("ProfileData", "bytes:" + profSz, { color: "#795548" });
            hf.template.endStruct();
            if (profAbsOff + profSz > bmpEnd) bmpEnd = profAbsOff + profSz;
            hf.log("  ICC Profile: " + profSz + " bytes at 0x" + profAbsOff.toString(16));
        }
    }
}

// Use bfSize if it's larger (some BMPs have trailing data within bfSize)
if (bfSize > bmpEnd && bfSize <= fileSize) bmpEnd = bfSize;

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (bmpEnd < fileSize) {
    var overlaySize = fileSize - bmpEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after BMP end");
    var oSigBuf = await hf.read(bmpEnd, Math.min(4, overlaySize));
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
hf.log("BMP Summary");
hf.log("==============================");
hf.log("  DIB header: " + dibName + " (" + dibSize + " bytes)");
hf.log("  Image: " + imgWidth + " x " + absHeight + ", " + biBitCount + " bpp");
hf.log("  Compression: " + (COMPRESSIONS[biCompression] || biCompression));
hf.log("  BMP data ends at: 0x" + bmpEnd.toString(16) + " (" + bmpEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (bmpEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - bmpEnd).toLocaleString() + " bytes after BMP end");
}

await hf.template.end();