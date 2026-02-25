// HexForge JS Template - EGG.js
// Purpose: EGG Archive (ALZip by ESTsoft)
// Author: Kei Choi (hanul93@gmail.com)
// Category: Archive
// ID Bytes: 45 47 47 41 ("EGGA")
// Reference: EGG Format Specification v1.0 (ESTsoft Corp. 2009-2016)

var fileSize = await hf.fileSize;

hf.template.begin("EGG Archive");
hf.template.setFormat("egg", "EGG Archive", [".egg"]);

// ──────────────────────────────────────────────
// Validate signature
// ──────────────────────────────────────────────
if (fileSize < 18) {
    hf.error("Not an EGG file (file too small)");
    await hf.template.end();
    throw new Error("Not a valid EGG");
}

var sig = await hf.read(0, 4);
if (sig[0] !== 0x45 || sig[1] !== 0x47 || sig[2] !== 0x47 || sig[3] !== 0x41) {
    hf.error("Not an EGG file (expected 'EGGA' / 0x41474745)");
    await hf.template.end();
    throw new Error("Not a valid EGG");
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
function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(1) + " GB";
}

// Decode UTF-8 from byte buffer
function decodeUTF8(buf, off, len) {
    var s = "";
    for (var i = 0; i < len; i++) {
        var c = buf[off + i];
        if (c < 0x80) {
            s += String.fromCharCode(c);
        } else if (c < 0xC0) {
            s += "?";
        } else if (c < 0xE0 && i + 1 < len) {
            s += String.fromCharCode(((c & 0x1F) << 6) | (buf[off + i + 1] & 0x3F));
            i++;
        } else if (c < 0xF0 && i + 2 < len) {
            s += String.fromCharCode(((c & 0x0F) << 12) | ((buf[off + i + 1] & 0x3F) << 6) | (buf[off + i + 2] & 0x3F));
            i += 2;
        } else {
            s += "?";
            if (c >= 0xF0) i += 3;
        }
    }
    return s;
}

// Windows FILETIME → date string
function winFileTime(buf, off) {
    var lo = u32(buf, off), hi = u32(buf, off + 4);
    var ft = hi * 0x100000000 + lo;
    var epochDiff = 11644473600000;
    var ms = ft / 10000 - epochDiff;
    if (ms < 0 || ms > 4102444800000) return "(invalid)";
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" +
           String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(d.getUTCDate()).padStart(2, "0") + " " +
           String(d.getUTCHours()).padStart(2, "0") + ":" +
           String(d.getUTCMinutes()).padStart(2, "0") + ":" +
           String(d.getUTCSeconds()).padStart(2, "0") + " UTC";
}

// Read magic at position and return u32
async function readMagic(p) {
    if (p + 4 > fileSize) return 0;
    var b = await hf.read(p, 4);
    return u32(b, 0);
}

// Read Extra Field size — depends on bitflag bit0
// Returns { bitflag, size, headerBytes } where headerBytes = 1 + (2 or 4)
function extraFieldSizeInfo(bitflag) {
    var is4byte = (bitflag & 1) !== 0;
    return { sizeLen: is4byte ? 4 : 2, headerBytes: 1 + (is4byte ? 4 : 2) };
}

// ──────────────────────────────────────────────
// Signatures (Section 5)
// ──────────────────────────────────────────────
var SIG = {
    EGGA:           0x41474745,
    EOFARC:         0x08E28222,
    FILE_HEADER:    0x0A8590E3,
    BLOCK_HEADER:   0x02B50C13,
    ENCRYPT:        0x08D1470F,
    FILENAME:       0x0A8591AC,
    WIN_FILE_INFO:  0x2C86950B,
    POSIX_FILE_INFO:0x1EE922E5,
    COMMENT:        0x04C63672,
    SPLIT:          0x24F5A262,
    SOLID:          0x24E5A060,
    DUMMY:          0x07463307,
    SKIP:           0xFFFF0000,
    GLOBAL_ENCRYPT: 0x08D144A8
};

var COMP_METHODS = { 0: "Store", 1: "Deflate", 2: "Bzip2", 3: "AZO", 4: "LZMA" };
var ENC_METHODS = { 0: "KeyBase XOR", 1: "AES-128", 2: "AES-256", 5: "LEA-128", 6: "LEA-256" };

// Colors — Material Design vivid palette
var CLR = {
    HEADER:  "#2196F3",   // blue
    FILE:    "#F44336",   // red
    FNAME:   "#FF9800",   // orange
    BLOCK:   "#E040FB",   // purple
    DATA:    "#FFAB40",   // amber
    WININFO: "#4CAF50",   // green
    POSIX:   "#00BCD4",   // cyan
    ENCRYPT: "#FF5722",   // deep orange
    COMMENT: "#FFC107",   // yellow
    SPLIT:   "#795548",   // brown
    SOLID:   "#607D8B",   // blue-grey
    DUMMY:   "#BDBDBD",   // light grey
    END:     "#9E9E9E",   // grey
    GREY:    "#9E9E9E"
};

// ──────────────────────────────────────────────
// EGG Header: Magic(4) + Version(2) + HeaderID(4) + Reserved(4) = 14
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("EGG_Header");
await hf.template.addField("Magic", "bytes:4", { color: CLR.HEADER, display: "EGGA (0x41474745)" });
await hf.template.addField("Version", "u16", { color: CLR.HEADER });
await hf.template.addField("HeaderID", "u32", { color: CLR.HEADER });
await hf.template.addField("Reserved", "u32", { color: CLR.GREY });

var pos = 14;
var isSplit = false;
var isSolid = false;
var isEncrypted = false;

// ── Extra Field 1: Split / Solid / Global Encrypt / Comment ──
while (pos + 4 <= fileSize) {
    var m = await readMagic(pos);

    if (m === SIG.EOFARC) {
        hf.template.seek(pos);
        await hf.template.addField("EOFARC", "bytes:4", { color: CLR.END, display: "End of EGG Header" });
        pos += 4;
        break;
    }

    if (m === SIG.SPLIT) {
        isSplit = true;
        hf.template.seek(pos);
        await hf.template.addField("SplitMagic", "bytes:4", { color: CLR.SPLIT, display: "Split (0x24F5A262)" });
        pos += 4;
        if (pos + 3 > fileSize) break;
        var sBuf = await hf.read(pos, 3);
        var sInfo = extraFieldSizeInfo(sBuf[0]);
        await hf.template.addField("S_BitFlag", "u8", { color: CLR.SPLIT });
        if (sInfo.sizeLen === 2) {
            await hf.template.addField("S_Size", "u16", { color: CLR.SPLIT });
        } else {
            await hf.template.addField("S_Size", "u32", { color: CLR.SPLIT });
        }
        pos += sInfo.headerBytes;
        // PrevFileID(4) + NextFileID(4)
        if (pos + 8 <= fileSize) {
            var spBuf = await hf.read(pos, 8);
            await hf.template.addField("PrevFileID", "u32", { color: CLR.SPLIT });
            await hf.template.addField("NextFileID", "u32", { color: CLR.SPLIT });
            hf.log("  Split: Prev=" + fmtHex(u32(spBuf, 0), 8) + " Next=" + fmtHex(u32(spBuf, 4), 8));
            pos += 8;
        }
        continue;
    }

    if (m === SIG.SOLID) {
        isSolid = true;
        hf.template.seek(pos);
        await hf.template.addField("SolidMagic", "bytes:4", { color: CLR.SOLID, display: "Solid (0x24E5A060)" });
        pos += 4;
        if (pos + 3 > fileSize) break;
        var solBuf = await hf.read(pos, 3);
        var solInfo = extraFieldSizeInfo(solBuf[0]);
        await hf.template.addField("SOL_BitFlag", "u8", { color: CLR.SOLID });
        if (solInfo.sizeLen === 2) {
            await hf.template.addField("SOL_Size", "u16", { color: CLR.SOLID });
        } else {
            await hf.template.addField("SOL_Size", "u32", { color: CLR.SOLID });
        }
        pos += solInfo.headerBytes;
        hf.log("  Solid compression enabled");
        continue;
    }

    if (m === SIG.GLOBAL_ENCRYPT) {
        isEncrypted = true;
        hf.template.seek(pos);
        await hf.template.addField("GEncMagic", "bytes:4", { color: CLR.ENCRYPT, display: "GlobalEncrypt (0x08D144A8)" });
        pos += 4;
        if (pos + 1 > fileSize) break;
        var geBuf = await hf.read(pos, 1);
        var geInfo = extraFieldSizeInfo(geBuf[0]);
        if (pos + geInfo.headerBytes > fileSize) break;
        var geHdr = await hf.read(pos, geInfo.headerBytes);
        var geSize = geInfo.sizeLen === 2 ? u16(geHdr, 1) : u32(geHdr, 1);
        await hf.template.addField("GE_BitFlag", "u8", { color: CLR.ENCRYPT });
        if (geInfo.sizeLen === 2) {
            await hf.template.addField("GE_Size", "u16", { color: CLR.ENCRYPT });
        } else {
            await hf.template.addField("GE_Size", "u32", { color: CLR.ENCRYPT });
        }
        pos += geInfo.headerBytes;
        if (geSize > 0 && pos + geSize <= fileSize) {
            await hf.template.addField("GE_Data", "bytes:" + geSize, { color: CLR.ENCRYPT });
            pos += geSize;
        }
        continue;
    }

    if (m === SIG.COMMENT) {
        pos = await parseCommentField(pos, "EGG_Header");
        continue;
    }

    if (m === SIG.DUMMY) {
        pos = await parseDummyField(pos);
        continue;
    }

    // Unknown extra field — try generic skip
    hf.warn("Unknown EGG header extra: " + fmtHex(m, 8) + " at " + fmtHex(pos, 8));
    break;
}

hf.template.endStruct();

hf.log("EGG (알집) archive detected" +
       (isSplit ? " [Split]" : "") +
       (isSolid ? " [Solid]" : "") +
       (isEncrypted ? " [Encrypted]" : ""));

// ──────────────────────────────────────────────
// Helper: parse an Extra Field generically
// Reads Magic(already consumed)+BitFlag(1)+Size(2|4)+Data(Size)
// ──────────────────────────────────────────────
async function readExtraFieldHeader(p) {
    if (p + 1 > fileSize) return null;
    var bf = (await hf.read(p, 1))[0];
    var info = extraFieldSizeInfo(bf);
    if (p + info.headerBytes > fileSize) return null;
    var hdr = await hf.read(p, info.headerBytes);
    var sz = info.sizeLen === 2 ? u16(hdr, 1) : u32(hdr, 1);
    return { bitflag: bf, size: sz, sizeLen: info.sizeLen, totalHeader: info.headerBytes };
}

// ──────────────────────────────────────────────
// Helper: parse Filename Header (after magic consumed)
// ──────────────────────────────────────────────
async function parseFilenameField(p) {
    // BitFlag(1) + Size(2|4) + [Locale(2)] + [ParentPathID(4)] + Name(N)
    var ef = await readExtraFieldHeader(p);
    if (!ef) return { pos: p, name: "(error)" };

    hf.template.seek(p);
    await hf.template.addField("FN_BitFlag", "u8", { color: CLR.FNAME,
        display: ((ef.bitflag & 4) ? "Encrypted " : "") +
                 ((ef.bitflag & 8) ? "AreaCode " : "UTF-8 ") +
                 ((ef.bitflag & 16) ? "Relative" : "Absolute") });
    if (ef.sizeLen === 2) {
        await hf.template.addField("FN_Size", "u16", { color: CLR.FNAME });
    } else {
        await hf.template.addField("FN_Size", "u32", { color: CLR.FNAME });
    }
    p += ef.totalHeader;

    var nameSize = ef.size;
    var hasLocale = (ef.bitflag & 8) !== 0;
    var hasRelPath = (ef.bitflag & 16) !== 0;

    if (hasLocale && p + 2 <= fileSize) {
        var locBuf = await hf.read(p, 2);
        var locale = u16(locBuf, 0);
        await hf.template.addField("FN_Locale", "u16", { color: CLR.FNAME,
            display: "Codepage " + locale });
        p += 2;
        nameSize -= 2;
    }

    if (hasRelPath && p + 4 <= fileSize) {
        await hf.template.addField("FN_ParentPathID", "u32", { color: CLR.FNAME });
        p += 4;
        nameSize -= 4;
    }

    var fileName = "(empty)";
    if (nameSize > 0 && p + nameSize <= fileSize) {
        var fnameBuf = await hf.read(p, nameSize);
        fileName = decodeUTF8(fnameBuf, 0, nameSize);
        await hf.template.addField("FileName", "bytes:" + nameSize, { color: CLR.FNAME,
            display: fileName });
        p += nameSize;
    }

    return { pos: p, name: fileName };
}

// ──────────────────────────────────────────────
// Helper: parse WinFileInfo (after magic consumed)
// BitFlag(1) + Size(2) + LastModified(8) + Attribute(1)
// ──────────────────────────────────────────────
async function parseWinFileInfo(p) {
    var ef = await readExtraFieldHeader(p);
    if (!ef) return { pos: p, isDir: false };

    hf.template.seek(p);
    await hf.template.addField("WF_BitFlag", "u8", { color: CLR.WININFO });
    if (ef.sizeLen === 2) {
        await hf.template.addField("WF_Size", "u16", { color: CLR.WININFO });
    } else {
        await hf.template.addField("WF_Size", "u32", { color: CLR.WININFO });
    }
    p += ef.totalHeader;

    var isDir = false;
    if (ef.size >= 9 && p + ef.size <= fileSize) {
        var wfBuf = await hf.read(p, ef.size);
        await hf.template.addField("WF_LastModified", "u64", { color: CLR.WININFO,
            display: winFileTime(wfBuf, 0) });
        var wfAttr = wfBuf[8];
        var attrStr = "";
        if (wfAttr & 0x01) attrStr += "ReadOnly ";
        if (wfAttr & 0x02) attrStr += "Hidden ";
        if (wfAttr & 0x04) attrStr += "System ";
        if (wfAttr & 0x08) attrStr += "Link ";
        if (wfAttr & 0x80) attrStr += "Directory ";
        if (!attrStr) attrStr = "Normal";
        await hf.template.addField("WF_Attribute", "u8", { color: CLR.WININFO,
            display: attrStr });
        if (wfAttr & 0x80) isDir = true;
        p += ef.size;
    }

    return { pos: p, isDir: isDir };
}

// ──────────────────────────────────────────────
// Helper: parse PosixFileInfo (after magic consumed)
// BitFlag(1) + Size(2) + Mode(4) + UID(4) + GID(4) + LastModified(8)
// ──────────────────────────────────────────────
async function parsePosixFileInfo(p) {
    var ef = await readExtraFieldHeader(p);
    if (!ef) return { pos: p };

    hf.template.seek(p);
    await hf.template.addField("PX_BitFlag", "u8", { color: CLR.POSIX });
    if (ef.sizeLen === 2) {
        await hf.template.addField("PX_Size", "u16", { color: CLR.POSIX });
    } else {
        await hf.template.addField("PX_Size", "u32", { color: CLR.POSIX });
    }
    p += ef.totalHeader;

    if (ef.size >= 20 && p + ef.size <= fileSize) {
        var pxBuf = await hf.read(p, ef.size);
        var pxMode = u32(pxBuf, 0);
        await hf.template.addField("PX_Mode", "u32", { color: CLR.POSIX,
            display: "0" + pxMode.toString(8) });
        await hf.template.addField("PX_UID", "u32", { color: CLR.POSIX });
        await hf.template.addField("PX_GID", "u32", { color: CLR.POSIX });
        await hf.template.addField("PX_LastModified", "u64", { color: CLR.POSIX });
        p += ef.size;
    }

    return { pos: p };
}

// ──────────────────────────────────────────────
// Helper: parse EncryptHeader (after magic consumed)
// ──────────────────────────────────────────────
async function parseEncryptField(p) {
    var ef = await readExtraFieldHeader(p);
    if (!ef) return p;

    hf.template.seek(p);
    await hf.template.addField("ENC_BitFlag", "u8", { color: CLR.ENCRYPT });
    if (ef.sizeLen === 2) {
        await hf.template.addField("ENC_Size", "u16", { color: CLR.ENCRYPT });
    } else {
        await hf.template.addField("ENC_Size", "u32", { color: CLR.ENCRYPT });
    }
    p += ef.totalHeader;

    if (ef.size > 0 && p + ef.size <= fileSize) {
        var encBuf = await hf.read(p, Math.min(1, ef.size));
        var encMethod = encBuf[0];
        var encStr = ENC_METHODS[encMethod] || ("Method_" + encMethod);
        await hf.template.addField("ENC_Data", "bytes:" + ef.size, { color: CLR.ENCRYPT,
            display: encStr });
        hf.log("    Encryption: " + encStr);
        p += ef.size;
    }

    isEncrypted = true;
    return p;
}

// ──────────────────────────────────────────────
// Helper: parse CommentHeader (after magic consumed)
// ──────────────────────────────────────────────
async function parseCommentField(p, context) {
    hf.template.seek(p);
    await hf.template.addField("CmtMagic", "bytes:4", { color: CLR.COMMENT,
        display: "Comment (0x04C63672)" });
    p += 4;

    var ef = await readExtraFieldHeader(p);
    if (!ef) return p;

    await hf.template.addField("CMT_BitFlag", "u8", { color: CLR.COMMENT });
    if (ef.sizeLen === 2) {
        await hf.template.addField("CMT_Size", "u16", { color: CLR.COMMENT });
    } else {
        await hf.template.addField("CMT_Size", "u32", { color: CLR.COMMENT });
    }
    p += ef.totalHeader;

    if (ef.size > 0 && p + ef.size <= fileSize) {
        var cmtBuf = await hf.read(p, ef.size);
        var cmtText = decodeUTF8(cmtBuf, 0, ef.size);
        await hf.template.addField("CMT_Text", "bytes:" + ef.size, { color: CLR.COMMENT,
            display: cmtText });
        p += ef.size;
    }

    return p;
}

// ──────────────────────────────────────────────
// Helper: parse DummyHeader
// ──────────────────────────────────────────────
async function parseDummyField(p) {
    hf.template.seek(p);
    await hf.template.addField("DummyMagic", "bytes:4", { color: CLR.DUMMY,
        display: "Dummy (0x07463307)" });
    p += 4;

    var ef = await readExtraFieldHeader(p);
    if (!ef) return p;

    await hf.template.addField("DUM_BitFlag", "u8", { color: CLR.DUMMY });
    if (ef.sizeLen === 2) {
        await hf.template.addField("DUM_Size", "u16", { color: CLR.DUMMY });
    } else {
        await hf.template.addField("DUM_Size", "u32", { color: CLR.DUMMY });
    }
    p += ef.totalHeader;

    if (ef.size > 0 && p + ef.size <= fileSize) {
        await hf.template.addField("DummyData", "bytes:" + ef.size, { color: CLR.DUMMY });
        p += ef.size;
    }

    return p;
}

// ──────────────────────────────────────────────
// Helper: skip unknown extra field generically
// ──────────────────────────────────────────────
async function skipUnknownExtra(p, magic) {
    hf.template.seek(p);
    await hf.template.addField("UnkMagic", "bytes:4", { color: CLR.GREY,
        display: "Unknown (" + fmtHex(magic, 8) + ")" });
    p += 4;

    var ef = await readExtraFieldHeader(p);
    if (!ef) return p;

    await hf.template.addField("UNK_BitFlag", "u8", { color: CLR.GREY });
    if (ef.sizeLen === 2) {
        await hf.template.addField("UNK_Size", "u16", { color: CLR.GREY });
    } else {
        await hf.template.addField("UNK_Size", "u32", { color: CLR.GREY });
    }
    p += ef.totalHeader;

    if (ef.size > 0 && p + ef.size <= fileSize) {
        await hf.template.addField("UNK_Data", "bytes:" + ef.size, { color: CLR.GREY });
        p += ef.size;
    }

    return p;
}

// ──────────────────────────────────────────────
// Parse File Entries and Blocks
// ──────────────────────────────────────────────
var entryCount = 0;
var fileCount = 0;
var dirCount = 0;
var blockCount = 0;
var totalPacked = 0;
var totalUnpacked = 0;
var eggEnd = pos;

while (pos + 4 <= fileSize && entryCount < 10000) {
    var magic = await readMagic(pos);

    // ── End of Archive ──
    if (magic === SIG.EOFARC) {
        hf.template.seek(pos);
        hf.template.beginStruct("EndOfArchive");
        await hf.template.addField("EOFARC", "bytes:4", { color: CLR.END, display: "End of Archive" });
        hf.template.endStruct();
        pos += 4;
        eggEnd = pos;
        break;
    }

    // ── Extra Field 4: Global Comment ──
    if (magic === SIG.COMMENT) {
        pos = await parseCommentField(pos, "global");
        eggEnd = pos;
        continue;
    }

    // ── File Header (0x0A8590E3) ──
    if (magic === SIG.FILE_HEADER) {
        if (pos + 16 > fileSize) break;

        var fhBuf = await hf.read(pos, 16);
        var fileId = u32(fhBuf, 4);
        var fileLength = u64(fhBuf, 8);

        hf.template.seek(pos);
        hf.template.beginStruct("File_" + entryCount);
        await hf.template.addField("FileHeaderMagic", "bytes:4", { color: CLR.FILE,
            display: "FileHeader (0x0A8590E3)" });
        await hf.template.addField("FileID", "u32", { color: CLR.FILE,
            display: fmtHex(fileId, 8) });
        await hf.template.addField("FileLength", "u64", { color: CLR.FILE,
            display: fmtSize(fileLength) + " (uncompressed)" });
        pos += 16;

        // ── Extra Field 2: Filename / WinFileInfo / PosixFileInfo / Encrypt / Comment ──
        var fileName = "(unknown)";
        var entryIsDir = false;
        var hasEncrypt = false;

        while (pos + 4 <= fileSize) {
            var subMagic = await readMagic(pos);

            // End of file header extras
            if (subMagic === SIG.EOFARC) {
                hf.template.seek(pos);
                await hf.template.addField("FileEnd", "bytes:4", { color: CLR.END,
                    display: "End of File Header" });
                pos += 4;
                break;
            }

            // Filename Header
            if (subMagic === SIG.FILENAME) {
                hf.template.seek(pos);
                await hf.template.addField("FNameMagic", "bytes:4", { color: CLR.FNAME,
                    display: "Filename (0x0A8591AC)" });
                pos += 4;
                var fnResult = await parseFilenameField(pos);
                pos = fnResult.pos;
                fileName = fnResult.name;
                if (fileName.endsWith("/") || fileName.endsWith("\\")) entryIsDir = true;
                continue;
            }

            // Windows File Information
            if (subMagic === SIG.WIN_FILE_INFO) {
                hf.template.seek(pos);
                await hf.template.addField("WinInfoMagic", "bytes:4", { color: CLR.WININFO,
                    display: "WinFileInfo (0x2C86950B)" });
                pos += 4;
                var wfResult = await parseWinFileInfo(pos);
                pos = wfResult.pos;
                if (wfResult.isDir) entryIsDir = true;
                continue;
            }

            // Posix File Information
            if (subMagic === SIG.POSIX_FILE_INFO) {
                hf.template.seek(pos);
                await hf.template.addField("PosixMagic", "bytes:4", { color: CLR.POSIX,
                    display: "PosixFileInfo (0x1EE922E5)" });
                pos += 4;
                var pxResult = await parsePosixFileInfo(pos);
                pos = pxResult.pos;
                continue;
            }

            // Encrypt Header
            if (subMagic === SIG.ENCRYPT) {
                hf.template.seek(pos);
                await hf.template.addField("EncMagic", "bytes:4", { color: CLR.ENCRYPT,
                    display: "Encrypt (0x08D1470F)" });
                pos += 4;
                pos = await parseEncryptField(pos);
                hasEncrypt = true;
                continue;
            }

            // Comment Header
            if (subMagic === SIG.COMMENT) {
                pos = await parseCommentField(pos, "file");
                continue;
            }

            // Dummy Header
            if (subMagic === SIG.DUMMY) {
                pos = await parseDummyField(pos);
                continue;
            }

            // Skip Header (0xFFFF0000) — modified header to skip
            if (subMagic === SIG.SKIP) {
                pos = await skipUnknownExtra(pos, subMagic);
                continue;
            }

            // Block Header or next File Header — don't consume
            if (subMagic === SIG.BLOCK_HEADER || subMagic === SIG.FILE_HEADER) {
                break;
            }

            // Unknown extra field
            hf.warn("Unknown extra field " + fmtHex(subMagic, 8) + " at " + fmtHex(pos, 8));
            pos = await skipUnknownExtra(pos, subMagic);
            continue;
        }

        if (fileLength === 0) entryIsDir = true;

        // ── Block(s) for this file (non-solid: one or more blocks per file) ──
        if (!isSolid && !entryIsDir) {
            while (pos + 4 <= fileSize) {
                var blkMagic = await readMagic(pos);
                if (blkMagic !== SIG.BLOCK_HEADER) break;

                // Block Header: Magic(4) + Method(1) + Hint(1) + UncompSz(4) + CompSz(4) + CRC(4) = 18
                if (pos + 18 > fileSize) break;

                var blkBuf = await hf.read(pos, 18);
                var compMethod = blkBuf[4];
                var compHint = blkBuf[5];
                var blkUncompSz = u32(blkBuf, 6);
                var blkCompSz = u32(blkBuf, 10);
                var blkCrc = u32(blkBuf, 14);
                var methodStr = COMP_METHODS[compMethod] || ("Method_" + compMethod);

                hf.template.seek(pos);
                await hf.template.addField("BlockMagic", "bytes:4", { color: CLR.BLOCK,
                    display: "Block (0x02B50C13)" });
                await hf.template.addField("BLK_Method", "u8", { color: CLR.BLOCK,
                    display: methodStr });
                await hf.template.addField("BLK_Hint", "u8", { color: CLR.BLOCK });
                await hf.template.addField("BLK_UncompSize", "u32", { color: CLR.BLOCK });
                await hf.template.addField("BLK_CompSize", "u32", { color: CLR.BLOCK });
                await hf.template.addField("BLK_CRC32", "u32", { color: CLR.BLOCK,
                    display: fmtHex(blkCrc, 8) });
                pos += 18;

                // Extra Field 3 + EOFARC for block header
                while (pos + 4 <= fileSize) {
                    var bexMagic = await readMagic(pos);
                    if (bexMagic === SIG.EOFARC) {
                        hf.template.seek(pos);
                        await hf.template.addField("BlockEnd", "bytes:4", { color: CLR.END,
                            display: "End of Block Header" });
                        pos += 4;
                        break;
                    }
                    // Skip any extra field 3
                    pos = await skipUnknownExtra(pos, bexMagic);
                }

                // Compressed data
                if (blkCompSz > 0) {
                    var dataActual = Math.min(blkCompSz, fileSize - pos);
                    if (dataActual > 0) {
                        hf.template.seek(pos);
                        await hf.template.addField("CompressedData", "bytes:" + dataActual, { color: CLR.DATA });
                        pos += dataActual;
                    }
                }

                totalPacked += blkCompSz;
                blockCount++;

                // More blocks possible for same file (>4G files)
                // Next magic determines: if BLOCK_HEADER → another block, else → done
            }
        }

        hf.template.endStruct();

        // Log entry
        if (entryIsDir) {
            dirCount++;
            if (dirCount <= 20) hf.log("  D " + fileName);
        } else {
            fileCount++;
            totalUnpacked += fileLength;
            if (fileCount <= 30) {
                hf.log("  F " + fileName + " (" + fmtSize(fileLength) +
                       (hasEncrypt ? " Encrypted" : "") + ")");
            }
        }

        eggEnd = pos;
        entryCount++;
        continue;
    }

    // ── Block Header outside file entry (solid mode) ──
    if (magic === SIG.BLOCK_HEADER) {
        if (pos + 18 > fileSize) break;

        var sBlkBuf = await hf.read(pos, 18);
        var sCompMethod = sBlkBuf[4];
        var sBlkUncompSz = u32(sBlkBuf, 6);
        var sBlkCompSz = u32(sBlkBuf, 10);
        var sBlkCrc = u32(sBlkBuf, 14);
        var sMethodStr = COMP_METHODS[sCompMethod] || ("Method_" + sCompMethod);

        hf.template.seek(pos);
        hf.template.beginStruct("SolidBlock_" + blockCount);
        await hf.template.addField("BlockMagic", "bytes:4", { color: CLR.BLOCK,
            display: "Block (0x02B50C13)" + (isSolid ? " [Solid]" : "") });
        await hf.template.addField("BLK_Method", "u8", { color: CLR.BLOCK, display: sMethodStr });
        await hf.template.addField("BLK_Hint", "u8", { color: CLR.BLOCK });
        await hf.template.addField("BLK_UncompSize", "u32", { color: CLR.BLOCK });
        await hf.template.addField("BLK_CompSize", "u32", { color: CLR.BLOCK });
        await hf.template.addField("BLK_CRC32", "u32", { color: CLR.BLOCK, display: fmtHex(sBlkCrc, 8) });
        pos += 18;

        // Block EOFARC
        while (pos + 4 <= fileSize) {
            var sbeMagic = await readMagic(pos);
            if (sbeMagic === SIG.EOFARC) {
                hf.template.seek(pos);
                await hf.template.addField("BlockEnd", "bytes:4", { color: CLR.END,
                    display: "End of Block Header" });
                pos += 4;
                break;
            }
            pos = await skipUnknownExtra(pos, sbeMagic);
        }

        if (sBlkCompSz > 0) {
            var sDataActual = Math.min(sBlkCompSz, fileSize - pos);
            if (sDataActual > 0) {
                hf.template.seek(pos);
                await hf.template.addField("CompressedData", "bytes:" + sDataActual, { color: CLR.DATA });
                pos += sDataActual;
            }
        }

        hf.template.endStruct();

        totalPacked += sBlkCompSz;
        blockCount++;
        eggEnd = pos;
        hf.log("  Block #" + blockCount + ": " + sMethodStr + " " +
               fmtSize(sBlkUncompSz) + " -> " + fmtSize(sBlkCompSz));
        continue;
    }

    // ── Dummy Header ──
    if (magic === SIG.DUMMY) {
        pos = await parseDummyField(pos);
        eggEnd = pos;
        continue;
    }

    // ── Skip Header ──
    if (magic === SIG.SKIP) {
        pos = await skipUnknownExtra(pos, magic);
        eggEnd = pos;
        continue;
    }

    // ── Another EGGA header (split volume) ──
    if (magic === SIG.EGGA) {
        // Split volumes have repeated EGG headers
        if (pos + 14 > fileSize) break;
        hf.template.seek(pos);
        hf.template.beginStruct("EGG_Header_Vol");
        await hf.template.addField("Magic", "bytes:4", { color: CLR.HEADER, display: "EGGA (split volume)" });
        await hf.template.addField("Version", "u16", { color: CLR.HEADER });
        await hf.template.addField("HeaderID", "u32", { color: CLR.HEADER });
        await hf.template.addField("Reserved", "u32", { color: CLR.GREY });
        pos += 14;

        // Parse extra fields for this volume header
        while (pos + 4 <= fileSize) {
            var vm = await readMagic(pos);
            if (vm === SIG.EOFARC) {
                hf.template.seek(pos);
                await hf.template.addField("EOFARC", "bytes:4", { color: CLR.END });
                pos += 4;
                break;
            }
            if (vm === SIG.SPLIT) {
                hf.template.seek(pos);
                await hf.template.addField("SplitMagic", "bytes:4", { color: CLR.SPLIT });
                pos += 4;
                var vsEf = await readExtraFieldHeader(pos);
                if (!vsEf) break;
                await hf.template.addField("S_BitFlag", "u8", { color: CLR.SPLIT });
                if (vsEf.sizeLen === 2) await hf.template.addField("S_Size", "u16", { color: CLR.SPLIT });
                else await hf.template.addField("S_Size", "u32", { color: CLR.SPLIT });
                pos += vsEf.totalHeader;
                if (pos + 8 <= fileSize) {
                    await hf.template.addField("PrevFileID", "u32", { color: CLR.SPLIT });
                    await hf.template.addField("NextFileID", "u32", { color: CLR.SPLIT });
                    pos += 8;
                }
                continue;
            }
            if (vm === SIG.DUMMY) { pos = await parseDummyField(pos); continue; }
            break;
        }
        hf.template.endStruct();
        eggEnd = pos;
        continue;
    }

    // Unknown — stop
    hf.warn("Unknown signature " + fmtHex(magic, 8) + " at " + fmtHex(pos, 8));
    break;
}

if (fileCount > 30) hf.log("  ... +" + (fileCount - 30) + " more files");
if (dirCount > 20) hf.log("  ... +" + (dirCount - 20) + " more dirs");

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (eggEnd < fileSize) {
    var overlaySize = fileSize - eggEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after EGG end");
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("EGG Summary");
hf.log("==============================");
hf.log("  Files: " + fileCount + ", Dirs: " + dirCount);
hf.log("  Blocks: " + blockCount);
hf.log("  Packed: " + fmtSize(totalPacked) + ", Unpacked: " + fmtSize(totalUnpacked));
if (totalUnpacked > 0) hf.log("  Ratio: " + (totalPacked * 100 / totalUnpacked).toFixed(1) + "%");
if (isEncrypted) hf.log("  Encrypted: yes");
if (isSplit) hf.log("  Split volume: yes");
if (isSolid) hf.log("  Solid compression: yes");
hf.log("  Compression: " + Object.values(COMP_METHODS).join(" / "));
hf.log("  EGG data ends at: " + fmtHex(eggEnd, 8) + " (" + eggEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (eggEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - eggEnd).toLocaleString() + " bytes");
}

await hf.template.end();