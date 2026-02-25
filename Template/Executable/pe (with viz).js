// HexForge JS Template - PE.js
// Purpose: PE (Portable Executable) — Windows EXE/DLL/SYS/OCX
// Author: Kei Choi (hanul93@gmail.com)
// Category: Executable
// ID Bytes: 4D 5A (MZ)
// Reference: https://learn.microsoft.com/en-us/windows/win32/debug/pe-format

var fileSize = await hf.fileSize;

hf.template.begin("PE Executable");
hf.template.setFormat("pe", "PE Executable", [".exe", ".dll", ".sys", ".ocx", ".scr", ".drv", ".efi", ".cpl"]);

// ──────────────────────────────────────────────
// Validate MZ signature
// ──────────────────────────────────────────────
var mz = await hf.read(0, 2);
if (mz[0] !== 0x4D || mz[1] !== 0x5A) {
    hf.error("Not a PE file (expected 'MZ', got 0x" +
             mz[0].toString(16).toUpperCase() + mz[1].toString(16).toUpperCase() + ")");
    await hf.template.end();
    throw new Error("Not a valid PE");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function i32(buf, off) { var v = u32(buf, off); return v > 0x7FFFFFFF ? v - 0x100000000 : v; }
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n, "0"); }
function fmtTS(ts) {
    if (ts === 0) return "0";
    try { var d = new Date(ts * 1000); return d.toISOString().replace("T", " ").replace(".000Z", " UTC"); }
    catch (e) { return ts.toString(); }
}

var MACHINES = {
    0x0: "Unknown", 0x14c: "i386", 0x166: "MIPS_R4000",
    0x1a2: "SH3", 0x1a6: "SH4", 0x1c0: "ARM", 0x1c4: "ARM_NT",
    0x200: "IA64", 0x8664: "AMD64", 0xAA64: "ARM64",
    0x5032: "RISC-V_32", 0x5064: "RISC-V_64"
};
var SUBSYSTEMS = {
    0: "Unknown", 1: "Native", 2: "WindowsGUI", 3: "WindowsCUI",
    5: "OS2_CUI", 7: "POSIX_CUI", 9: "WinCE", 10: "EFI_Application",
    11: "EFI_BootDriver", 12: "EFI_RuntimeDriver", 13: "EFI_ROM",
    14: "XBOX", 16: "WinBoot"
};
var DIR_NAMES = [
    "Export", "Import", "Resource", "Exception", "Certificate",
    "BaseReloc", "Debug", "Architecture", "GlobalPtr", "TLS",
    "LoadConfig", "BoundImport", "IAT", "DelayImport", "CLR", "Reserved"
];
var DEBUG_TYPES = {
    0: "Unknown", 1: "COFF", 2: "CodeView", 3: "FPO", 4: "Misc",
    5: "Exception", 6: "Fixup", 7: "Borland", 9: "BBT",
    10: "CLSID", 11: "VC_FEATURE", 12: "POGO", 13: "ILTCG",
    14: "MPX", 16: "Repro", 17: "Embedded_PDB", 19: "PDBChecksum",
    20: "ExtendedDLL", 21: "R2R_PerfMap"
};

// ──────────────────────────────────────────────
// DOS Header (64 bytes)
// ──────────────────────────────────────────────
hf.template.seek(0);
hf.template.beginStruct("DOS_Header");
await hf.template.addField("e_magic", "string:2", { color: "#2196F3" });
await hf.template.addField("e_cblp", "u16");
await hf.template.addField("e_cp", "u16");
await hf.template.addField("e_crlc", "u16");
await hf.template.addField("e_cparhdr", "u16");
await hf.template.addField("e_minalloc", "u16");
await hf.template.addField("e_maxalloc", "u16");
await hf.template.addField("e_ss", "u16");
await hf.template.addField("e_sp", "u16");
await hf.template.addField("e_csum", "u16");
await hf.template.addField("e_ip", "u16");
await hf.template.addField("e_cs", "u16");
await hf.template.addField("e_lfarlc", "u16");
await hf.template.addField("e_ovno", "u16");
await hf.template.addField("e_res", "bytes:8");
await hf.template.addField("e_oemid", "u16");
await hf.template.addField("e_oeminfo", "u16");
await hf.template.addField("e_res2", "bytes:20");
var e_lfanew = await hf.template.addField("e_lfanew", "u32", { color: "#4CAF50" });
hf.template.endStruct();

hf.log("DOS Header: e_lfanew = " + fmtHex(e_lfanew, 4));

// Validate e_lfanew
if (e_lfanew + 4 > fileSize) {
    hf.error("Invalid e_lfanew offset (" + fmtHex(e_lfanew, 4) + " beyond file)");
    await hf.template.end();
    throw new Error("Invalid PE");
}

// ── DOS Stub ──
var stubSize = e_lfanew - 64;
if (stubSize > 0) {
    hf.template.beginStruct("DOS_Stub");
    await hf.template.addField("Stub", "bytes:" + stubSize, { color: "#90CAF9" });
    hf.template.endStruct();
}

// ──────────────────────────────────────────────
// PE Signature
// ──────────────────────────────────────────────
var peSig = await hf.read(e_lfanew, 4);
if (peSig[0] !== 0x50 || peSig[1] !== 0x45 || peSig[2] !== 0x00 || peSig[3] !== 0x00) {
    hf.error("Invalid PE signature at " + fmtHex(e_lfanew, 4));
    await hf.template.end();
    throw new Error("Invalid PE signature");
}

hf.template.seek(e_lfanew);
hf.template.beginStruct("PE_Signature");
await hf.template.addField("Signature", "string:4", { color: "#2196F3" });
hf.template.endStruct();

// ──────────────────────────────────────────────
// COFF File Header (20 bytes)
// ──────────────────────────────────────────────
var coffOff = e_lfanew + 4;
var coffBuf = await hf.read(coffOff, 20);

hf.template.beginStruct("COFF_FileHeader");
var machine = await hf.template.addField("Machine", "u16", { color: "#FF9800", enumMap: MACHINES });
var numSections = await hf.template.addField("NumberOfSections", "u16", { color: "#FF9800" });
var timeDateStamp = await hf.template.addField("TimeDateStamp", "u32", { color: "#FFC107" });
var symTablePtr = await hf.template.addField("PointerToSymbolTable", "u32");
var numSymbols = await hf.template.addField("NumberOfSymbols", "u32");
var optHdrSize = await hf.template.addField("SizeOfOptionalHeader", "u16", { color: "#E040FB" });
var characteristics = await hf.template.addField("Characteristics", "u16", { color: "#F44336" });
hf.template.endStruct();

var machName = MACHINES[machine] || fmtHex(machine, 4);
hf.log("COFF: " + machName + ", " + numSections + " sections, OptHdr=" + optHdrSize + "B");
hf.log("  Compiled: " + fmtTS(timeDateStamp));

// Decode characteristics
var charFlags = [];
if (characteristics & 0x0001) charFlags.push("RELOCATIONS_STRIPPED");
if (characteristics & 0x0002) charFlags.push("EXECUTABLE_IMAGE");
if (characteristics & 0x0020) charFlags.push("LARGE_ADDRESS_AWARE");
if (characteristics & 0x0100) charFlags.push("32BIT_MACHINE");
if (characteristics & 0x0200) charFlags.push("DEBUG_STRIPPED");
if (characteristics & 0x2000) charFlags.push("DLL");
if (charFlags.length > 0) hf.log("  Characteristics: " + charFlags.join(" | "));

// ──────────────────────────────────────────────
// Optional Header
// ──────────────────────────────────────────────
var optOff = coffOff + 20;
var isPE32Plus = false;

if (optHdrSize > 0) {
    var optBuf = await hf.read(optOff, Math.min(optHdrSize, 240));
    var optMagic = u16(optBuf, 0);
    isPE32Plus = (optMagic === 0x20B);

    hf.template.seek(optOff);
    hf.template.beginStruct("OptionalHeader");

    // Standard fields
    await hf.template.addField("Magic", "u16", { color: "#E040FB" });
    await hf.template.addField("MajorLinkerVersion", "u8");
    await hf.template.addField("MinorLinkerVersion", "u8");
    await hf.template.addField("SizeOfCode", "u32");
    await hf.template.addField("SizeOfInitializedData", "u32");
    await hf.template.addField("SizeOfUninitializedData", "u32");
    var entryPoint = await hf.template.addField("AddressOfEntryPoint", "u32", { color: "#F44336" });
    await hf.template.addField("BaseOfCode", "u32");

    if (!isPE32Plus) {
        await hf.template.addField("BaseOfData", "u32");
        var imageBase = await hf.template.addField("ImageBase", "u32", { color: "#4CAF50" });
    } else {
        var imageBase = await hf.template.addField("ImageBase", "u64", { color: "#4CAF50" });
    }

    await hf.template.addField("SectionAlignment", "u32");
    await hf.template.addField("FileAlignment", "u32");
    await hf.template.addField("MajorOSVersion", "u16");
    await hf.template.addField("MinorOSVersion", "u16");
    await hf.template.addField("MajorImageVersion", "u16");
    await hf.template.addField("MinorImageVersion", "u16");
    await hf.template.addField("MajorSubsystemVersion", "u16");
    await hf.template.addField("MinorSubsystemVersion", "u16");
    await hf.template.addField("Win32VersionValue", "u32");
    var sizeOfImage = await hf.template.addField("SizeOfImage", "u32", { color: "#03A9F4" });
    var sizeOfHeaders = await hf.template.addField("SizeOfHeaders", "u32", { color: "#03A9F4" });
    await hf.template.addField("CheckSum", "u32");
    var subsystem = await hf.template.addField("Subsystem", "u16", { color: "#7C4DFF", enumMap: SUBSYSTEMS });
    var dllChars = await hf.template.addField("DllCharacteristics", "u16", { color: "#F44336" });

    if (!isPE32Plus) {
        await hf.template.addField("SizeOfStackReserve", "u32");
        await hf.template.addField("SizeOfStackCommit", "u32");
        await hf.template.addField("SizeOfHeapReserve", "u32");
        await hf.template.addField("SizeOfHeapCommit", "u32");
    } else {
        await hf.template.addField("SizeOfStackReserve", "u64");
        await hf.template.addField("SizeOfStackCommit", "u64");
        await hf.template.addField("SizeOfHeapReserve", "u64");
        await hf.template.addField("SizeOfHeapCommit", "u64");
    }

    await hf.template.addField("LoaderFlags", "u32");
    var numRvaAndSizes = await hf.template.addField("NumberOfRvaAndSizes", "u32", { color: "#FF9800" });

    hf.log("  " + (isPE32Plus ? "PE32+" : "PE32") + ", Entry=" + fmtHex(entryPoint, 8) +
           ", ImageBase=" + fmtHex(imageBase, isPE32Plus ? 16 : 8));
    hf.log("  Subsystem: " + (SUBSYSTEMS[subsystem] || subsystem) +
           ", SizeOfImage=" + fmtHex(sizeOfImage, 8));

    // DllCharacteristics flags
    var dllFlags = [];
    if (dllChars & 0x0020) dllFlags.push("HIGH_ENTROPY_VA");
    if (dllChars & 0x0040) dllFlags.push("DYNAMIC_BASE");
    if (dllChars & 0x0080) dllFlags.push("FORCE_INTEGRITY");
    if (dllChars & 0x0100) dllFlags.push("NX_COMPAT");
    if (dllChars & 0x0200) dllFlags.push("NO_ISOLATION");
    if (dllChars & 0x0400) dllFlags.push("NO_SEH");
    if (dllChars & 0x0800) dllFlags.push("NO_BIND");
    if (dllChars & 0x1000) dllFlags.push("APPCONTAINER");
    if (dllChars & 0x2000) dllFlags.push("WDM_DRIVER");
    if (dllChars & 0x4000) dllFlags.push("GUARD_CF");
    if (dllChars & 0x8000) dllFlags.push("TERMINAL_SERVER_AWARE");
    if (dllFlags.length > 0) hf.log("  DllChars: " + dllFlags.join(" | "));

    // ── Data Directories ──
    var numDirs = Math.min(numRvaAndSizes, 16);
    var dirEntries = [];
    for (var di = 0; di < numDirs; di++) {
        var dirName = DIR_NAMES[di] || ("Dir_" + di);
        var rva = await hf.template.addField(dirName + "_RVA", "u32", { color: "#00BCD4" });
        var sz = await hf.template.addField(dirName + "_Size", "u32", { color: "#00BCD4" });
        dirEntries.push({ name: dirName, rva: rva, size: sz });
        if (rva > 0 && sz > 0) hf.log("  DataDir[" + di + "] " + dirName + ": RVA=" + fmtHex(rva, 8) + " Size=" + sz);
    }

    hf.template.endStruct();
}

// ──────────────────────────────────────────────
// Section Headers (40 bytes each)
// ──────────────────────────────────────────────
var secHdrOff = optOff + optHdrSize;
var sections = [];

hf.log("\n-- Sections --");
for (var si = 0; si < numSections; si++) {
    var sOff = secHdrOff + si * 40;
    if (sOff + 40 > fileSize) break;

    var sBuf = await hf.read(sOff, 40);
    var sName = "";
    for (var j = 0; j < 8; j++) {
        if (sBuf[j] === 0) break;
        sName += String.fromCharCode(sBuf[j]);
    }
    var sVirtSize = u32(sBuf, 8);
    var sVirtAddr = u32(sBuf, 12);
    var sRawSize = u32(sBuf, 16);
    var sRawPtr = u32(sBuf, 20);
    var sRelPtr = u32(sBuf, 24);
    var sLinePtr = u32(sBuf, 28);
    var sNumRel = u16(sBuf, 32);
    var sNumLine = u16(sBuf, 34);
    var sChars = u32(sBuf, 36);

    sections.push({ name: sName, virtSize: sVirtSize, virtAddr: sVirtAddr,
                     rawSize: sRawSize, rawPtr: sRawPtr, chars: sChars });

    hf.template.seek(sOff);
    hf.template.beginStruct("SectionHdr_" + sName);
    await hf.template.addField("Name", "string:8", { color: "#FF9800" });
    await hf.template.addField("VirtualSize", "u32", { color: "#FFC107" });
    await hf.template.addField("VirtualAddress", "u32", { color: "#FFC107" });
    await hf.template.addField("SizeOfRawData", "u32", { color: "#F44336" });
    await hf.template.addField("PointerToRawData", "u32", { color: "#4CAF50" });
    await hf.template.addField("PointerToRelocations", "u32");
    await hf.template.addField("PointerToLinenumbers", "u32");
    await hf.template.addField("NumberOfRelocations", "u16");
    await hf.template.addField("NumberOfLinenumbers", "u16");
    await hf.template.addField("Characteristics", "u32", { color: "#E040FB" });
    hf.template.endStruct();

    // Decode section flags
    var sf = [];
    if (sChars & 0x20) sf.push("CODE");
    if (sChars & 0x40) sf.push("IDATA");
    if (sChars & 0x80) sf.push("UDATA");
    if (sChars & 0x20000000) sf.push("X");
    if (sChars & 0x40000000) sf.push("R");
    if (sChars & 0x80000000) sf.push("W");

    hf.log("  " + sName.padEnd(8) + " VA=" + fmtHex(sVirtAddr, 8) + " VS=" + fmtHex(sVirtSize, 6) +
           " Raw=" + fmtHex(sRawPtr, 8) + " RawSz=" + fmtHex(sRawSize, 6) +
           " [" + sf.join("|") + "]");
}

// ──────────────────────────────────────────────
// Gap between headers and first section
// ──────────────────────────────────────────────
var headersEnd = secHdrOff + numSections * 40;
var firstSecOff = fileSize;
for (var si = 0; si < sections.length; si++) {
    if (sections[si].rawPtr > 0 && sections[si].rawSize > 0) {
        if (sections[si].rawPtr < firstSecOff) firstSecOff = sections[si].rawPtr;
    }
}

if (headersEnd < firstSecOff && firstSecOff < fileSize) {
    var gapSize = firstSecOff - headersEnd;
    if (gapSize > 0) {
        hf.template.seek(headersEnd);
        hf.template.beginStruct("HeaderPadding");
        await hf.template.addField("Padding", "bytes:" + gapSize, { color: "#9E9E9E" });
        hf.template.endStruct();
    }
}

// ──────────────────────────────────────────────
// Section Data
// ──────────────────────────────────────────────
var SECTION_COLORS = [
    "#F44336", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
    "#03A9F4", "#009688", "#4CAF50", "#8BC34A", "#CDDC39",
    "#FFC107", "#FF9800", "#FF5722", "#795548", "#607D8B"
];

var peEnd = headersEnd;

for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    if (sec.rawPtr === 0 || sec.rawSize === 0) continue;
    if (sec.rawPtr + sec.rawSize > fileSize) {
        var avail = fileSize - sec.rawPtr;
        if (avail <= 0) continue;
        sec.rawSize = avail;
    }

    var sColor = SECTION_COLORS[si % SECTION_COLORS.length];

    hf.template.seek(sec.rawPtr);
    hf.template.beginStruct("Section_" + sec.name);
    await hf.template.addField(sec.name + "_data", "bytes:" + sec.rawSize, { color: sColor });
    hf.template.endStruct();

    var secEnd = sec.rawPtr + sec.rawSize;
    if (secEnd > peEnd) peEnd = secEnd;
}

// ──────────────────────────────────────────────
// Certificate Table (outside sections, at file offset)
// ──────────────────────────────────────────────
var certInfo = null;
if (dirEntries && dirEntries.length > 4) {
    var certDir = dirEntries[4]; // Certificate is special — RVA is file offset
    if (certDir.rva > 0 && certDir.size > 0 && certDir.rva + certDir.size <= fileSize) {
        hf.template.seek(certDir.rva);
        hf.template.beginStruct("CertificateTable");
        await hf.template.addField("Certificates", "bytes:" + certDir.size, { color: "#795548" });
        hf.template.endStruct();
        hf.log("\n  Certificate table: " + certDir.size + " bytes at " + fmtHex(certDir.rva, 8));
        var certEnd = certDir.rva + certDir.size;
        if (certEnd > peEnd) peEnd = certEnd;

        // Parse WIN_CERTIFICATE structure
        certInfo = { offset: certDir.rva, totalSize: certDir.size, entries: [] };
        var certPos = certDir.rva;
        var certLimit = certDir.rva + certDir.size;
        var certIdx = 0;
        while (certPos + 8 <= certLimit && certIdx < 20) {
            var certHdr = await hf.read(certPos, 8);
            var dwLength = u32(certHdr, 0);
            var wRevision = u16(certHdr, 4);
            var wCertType = u16(certHdr, 6);
            if (dwLength < 8 || certPos + dwLength > certLimit) break;

            var CERT_REVISIONS = { 0x0100: "1.0", 0x0200: "2.0" };
            var CERT_TYPES = { 1: "X.509", 2: "PKCS#7 (Authenticode)", 3: "Reserved", 4: "PKCS#1 (TS)" };

            var entry = {
                offset: certPos,
                length: dwLength,
                revision: CERT_REVISIONS[wRevision] || fmtHex(wRevision, 4),
                type: CERT_TYPES[wCertType] || ("Type " + wCertType),
                typeId: wCertType,
                subject: null,
                issuer: null,
                serial: null,
                validFrom: null,
                validTo: null,
                sigAlgo: null
            };

            // Try to extract signer info from PKCS#7 Authenticode (type 2)
            if (wCertType === 2 && dwLength > 8) {
                var pkcs7Off = certPos + 8;
                var pkcs7Len = Math.min(dwLength - 8, 8192);
                var pkcs7Buf = await hf.read(pkcs7Off, pkcs7Len);

                // Lightweight ASN.1 DER parser helpers
                function asn1Tag(buf, pos) {
                    if (pos >= buf.length) return null;
                    var tag = buf[pos];
                    var off = pos + 1;
                    if (off >= buf.length) return null;
                    var len = buf[off]; off++;
                    if (len === 0x80) return null; // indefinite - skip
                    if (len & 0x80) {
                        var nBytes = len & 0x7F;
                        if (nBytes > 4 || off + nBytes > buf.length) return null;
                        len = 0;
                        for (var b = 0; b < nBytes; b++) { len = (len << 8) | buf[off]; off++; }
                    }
                    return { tag: tag, hdrLen: off - pos, dataLen: len, dataOff: off, totalLen: (off - pos) + len };
                }

                function asn1FindTag(buf, start, end, targetTag) {
                    var pos = start;
                    while (pos < end) {
                        var t = asn1Tag(buf, pos);
                        if (!t) break;
                        if (t.tag === targetTag) return t;
                        pos += t.totalLen;
                    }
                    return null;
                }

                function asn1ReadOID(buf, off, len) {
                    if (len < 2) return "";
                    var oid = [Math.floor(buf[off] / 40), buf[off] % 40];
                    var val = 0;
                    for (var i = 1; i < len; i++) {
                        val = (val << 7) | (buf[off + i] & 0x7F);
                        if (!(buf[off + i] & 0x80)) { oid.push(val); val = 0; }
                    }
                    return oid.join(".");
                }

                function asn1ReadUTF(buf, off, len) {
                    var s = "";
                    for (var i = 0; i < len && off + i < buf.length; i++) {
                        var c = buf[off + i];
                        if (c >= 0x20 && c < 0x7F) s += String.fromCharCode(c);
                    }
                    return s;
                }

                // Known OIDs
                var OID_NAMES = {
                    "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L",
                    "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
                    "1.2.840.113549.1.1.1": "RSA",
                    "1.2.840.113549.1.1.5": "SHA1withRSA",
                    "1.2.840.113549.1.1.11": "SHA256withRSA",
                    "1.2.840.113549.1.1.12": "SHA384withRSA",
                    "1.2.840.113549.1.1.13": "SHA512withRSA",
                    "1.2.840.10045.4.3.2": "SHA256withECDSA",
                    "1.2.840.10045.4.3.3": "SHA384withECDSA"
                };

                // Parse DN (Distinguished Name) from SEQUENCE of SETs
                function parseDN(buf, off, len) {
                    var parts = [];
                    var end = off + len;
                    var pos = off;
                    while (pos < end) {
                        var setTag = asn1Tag(buf, pos);
                        if (!setTag || setTag.tag !== 0x31) { pos++; continue; }
                        var seqTag = asn1Tag(buf, setTag.dataOff);
                        if (!seqTag || seqTag.tag !== 0x30) { pos += setTag.totalLen; continue; }
                        var oidTag = asn1Tag(buf, seqTag.dataOff);
                        if (!oidTag || oidTag.tag !== 0x06) { pos += setTag.totalLen; continue; }
                        var oid = asn1ReadOID(buf, oidTag.dataOff, oidTag.dataLen);
                        var valTag = asn1Tag(buf, oidTag.dataOff + oidTag.dataLen);
                        if (valTag) {
                            var val = asn1ReadUTF(buf, valTag.dataOff, valTag.dataLen);
                            var label = OID_NAMES[oid] || oid;
                            if (val) parts.push(label + "=" + val);
                        }
                        pos += setTag.totalLen;
                    }
                    return parts.join(", ");
                }

                // Parse UTCTime/GeneralizedTime
                function parseTime(buf, off, len) {
                    var s = asn1ReadUTF(buf, off, len);
                    if (len === 13 && s.length >= 12) {
                        // UTCTime: YYMMDDHHMMSSZ
                        var yy = parseInt(s.substring(0, 2));
                        var year = yy >= 50 ? 1900 + yy : 2000 + yy;
                        return year + "-" + s.substring(2, 4) + "-" + s.substring(4, 6) +
                            " " + s.substring(6, 8) + ":" + s.substring(8, 10) + ":" + s.substring(10, 12) + " UTC";
                    }
                    if (len === 15 && s.length >= 14) {
                        // GeneralizedTime: YYYYMMDDHHMMSSZ
                        return s.substring(0, 4) + "-" + s.substring(4, 6) + "-" + s.substring(6, 8) +
                            " " + s.substring(8, 10) + ":" + s.substring(10, 12) + ":" + s.substring(12, 14) + " UTC";
                    }
                    return s;
                }

                try {
                    // PKCS#7 ContentInfo → SEQUENCE { OID, [0] content }
                    var root = asn1Tag(pkcs7Buf, 0);
                    if (root && root.tag === 0x30) {
                        // Find [0] EXPLICIT (tag 0xA0) inside root
                        var contentWrap = asn1FindTag(pkcs7Buf, root.dataOff, root.dataOff + root.dataLen, 0xA0);
                        var signedData = contentWrap ? asn1Tag(pkcs7Buf, contentWrap.dataOff) : null;
                        if (signedData && signedData.tag === 0x30) {
                            // SignedData SEQUENCE: version, digestAlgos, contentInfo, [0]certs, [1]crls, signerInfos
                            var sdOff = signedData.dataOff;
                            var sdEnd = signedData.dataOff + signedData.dataLen;

                            // Skip version (INTEGER)
                            var ver = asn1Tag(pkcs7Buf, sdOff);
                            if (ver) sdOff += ver.totalLen;

                            // Skip digestAlgorithms (SET)
                            var digestAlgos = asn1Tag(pkcs7Buf, sdOff);
                            if (digestAlgos) sdOff += digestAlgos.totalLen;

                            // Skip contentInfo (SEQUENCE)
                            var contentInfo = asn1Tag(pkcs7Buf, sdOff);
                            if (contentInfo) sdOff += contentInfo.totalLen;

                            // Look for [0] IMPLICIT certificates (tag 0xA0)
                            var certsWrap = asn1FindTag(pkcs7Buf, sdOff, sdEnd, 0xA0);
                            if (certsWrap) {
                                // First certificate inside
                                var cert = asn1Tag(pkcs7Buf, certsWrap.dataOff);
                                if (cert && cert.tag === 0x30) {
                                    // TBSCertificate
                                    var tbs = asn1Tag(pkcs7Buf, cert.dataOff);
                                    if (tbs && tbs.tag === 0x30) {
                                        var tbsOff = tbs.dataOff;
                                        var tbsEnd = tbs.dataOff + tbs.dataLen;

                                        // [0] version (skip if present)
                                        var fld = asn1Tag(pkcs7Buf, tbsOff);
                                        if (fld && fld.tag === 0xA0) { tbsOff += fld.totalLen; fld = asn1Tag(pkcs7Buf, tbsOff); }

                                        // serialNumber (INTEGER)
                                        if (fld && fld.tag === 0x02) {
                                            var serialHex = "";
                                            for (var sb = 0; sb < Math.min(fld.dataLen, 20); sb++) {
                                                serialHex += pkcs7Buf[fld.dataOff + sb].toString(16).padStart(2, "0");
                                            }
                                            entry.serial = serialHex.toUpperCase();
                                            tbsOff += fld.totalLen;
                                        }

                                        // signature algorithm (SEQUENCE with OID)
                                        fld = asn1Tag(pkcs7Buf, tbsOff);
                                        if (fld && fld.tag === 0x30) {
                                            var algOid = asn1Tag(pkcs7Buf, fld.dataOff);
                                            if (algOid && algOid.tag === 0x06) {
                                                var oid = asn1ReadOID(pkcs7Buf, algOid.dataOff, algOid.dataLen);
                                                entry.sigAlgo = OID_NAMES[oid] || oid;
                                            }
                                            tbsOff += fld.totalLen;
                                        }

                                        // issuer (SEQUENCE of SETs)
                                        fld = asn1Tag(pkcs7Buf, tbsOff);
                                        if (fld && fld.tag === 0x30) {
                                            entry.issuer = parseDN(pkcs7Buf, fld.dataOff, fld.dataLen);
                                            tbsOff += fld.totalLen;
                                        }

                                        // validity (SEQUENCE of two times)
                                        fld = asn1Tag(pkcs7Buf, tbsOff);
                                        if (fld && fld.tag === 0x30) {
                                            var t1 = asn1Tag(pkcs7Buf, fld.dataOff);
                                            if (t1 && (t1.tag === 0x17 || t1.tag === 0x18)) {
                                                entry.validFrom = parseTime(pkcs7Buf, t1.dataOff, t1.dataLen);
                                                var t2 = asn1Tag(pkcs7Buf, t1.dataOff + t1.totalLen);
                                                if (t2 && (t2.tag === 0x17 || t2.tag === 0x18)) {
                                                    entry.validTo = parseTime(pkcs7Buf, t2.dataOff, t2.dataLen);
                                                }
                                            }
                                            tbsOff += fld.totalLen;
                                        }

                                        // subject (SEQUENCE of SETs)
                                        fld = asn1Tag(pkcs7Buf, tbsOff);
                                        if (fld && fld.tag === 0x30) {
                                            entry.subject = parseDN(pkcs7Buf, fld.dataOff, fld.dataLen);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // ASN.1 parsing failed — continue with what we have
                }
            }

            certInfo.entries.push(entry);
            hf.log("  Cert[" + certIdx + "]: " + entry.type + " rev=" + entry.revision + " len=" + dwLength);
            if (entry.subject) hf.log("    Subject: " + entry.subject);
            if (entry.issuer) hf.log("    Issuer: " + entry.issuer);
            if (entry.sigAlgo) hf.log("    Algorithm: " + entry.sigAlgo);
            if (entry.validFrom) hf.log("    Valid: " + entry.validFrom + " ~ " + entry.validTo);

            // Align to 8-byte boundary
            certPos += dwLength;
            certPos = (certPos + 7) & ~7;
            certIdx++;
        }
    }
}

// ──────────────────────────────────────────────
// Debug Directory parsing
// ──────────────────────────────────────────────
if (dirEntries && dirEntries.length > 6) {
    var dbgDir = dirEntries[6];
    if (dbgDir.rva > 0 && dbgDir.size >= 28) {
        // Convert RVA to file offset
        var dbgFileOff = 0;
        for (var si = 0; si < sections.length; si++) {
            var s = sections[si];
            if (dbgDir.rva >= s.virtAddr && dbgDir.rva < s.virtAddr + s.virtSize) {
                dbgFileOff = s.rawPtr + (dbgDir.rva - s.virtAddr);
                break;
            }
        }
        if (dbgFileOff > 0 && dbgFileOff + 28 <= fileSize) {
            var numDbgEntries = Math.floor(dbgDir.size / 28);
            hf.log("\n-- Debug Directory (" + numDbgEntries + " entries) --");
            for (var di = 0; di < numDbgEntries && di < 20; di++) {
                var dOff = dbgFileOff + di * 28;
                if (dOff + 28 > fileSize) break;
                var dBuf = await hf.read(dOff, 28);
                var dChars = u32(dBuf, 0);
                var dTS = u32(dBuf, 4);
                var dMajVer = u16(dBuf, 8);
                var dMinVer = u16(dBuf, 10);
                var dType = u32(dBuf, 12);
                var dSizeData = u32(dBuf, 16);
                var dAddrRVA = u32(dBuf, 20);
                var dPtr = u32(dBuf, 24);

                var dtName = DEBUG_TYPES[dType] || ("Type_" + dType);
                hf.log("  [" + di + "] " + dtName + " v" + dMajVer + "." + dMinVer +
                       " size=" + dSizeData + " @" + fmtHex(dPtr, 8));

                // CodeView PDB reference
                if (dType === 2 && dPtr > 0 && dSizeData >= 24 && dPtr + dSizeData <= fileSize) {
                    var cvBuf = await hf.read(dPtr, Math.min(dSizeData, 512));
                    var cvSig = u32(cvBuf, 0);
                    if (cvSig === 0x53445352) { // 'RSDS'
                        var guidHex = "";
                        for (var gi = 4; gi < 20; gi++) guidHex += cvBuf[gi].toString(16).padStart(2, "0");
                        var age = u32(cvBuf, 20);
                        var pdbPath = "";
                        for (var pi = 24; pi < cvBuf.length && cvBuf[pi] !== 0; pi++) {
                            pdbPath += String.fromCharCode(cvBuf[pi]);
                        }
                        hf.log("    CodeView RSDS: age=" + age);
                        hf.log("    PDB: " + pdbPath);
                        hf.log("    GUID: " + guidHex);
                    }
                }
            }
        }
    }
}

// ──────────────────────────────────────────────
// Import Table summary
// ──────────────────────────────────────────────
var importDlls = [];
if (dirEntries && dirEntries.length > 1) {
    var impDir = dirEntries[1];
    if (impDir.rva > 0 && impDir.size >= 20) {
        var impFileOff = 0;
        for (var si = 0; si < sections.length; si++) {
            var s = sections[si];
            if (impDir.rva >= s.virtAddr && impDir.rva < s.virtAddr + s.virtSize) {
                impFileOff = s.rawPtr + (impDir.rva - s.virtAddr);
                break;
            }
        }
        if (impFileOff > 0) {
            hf.log("\n-- Imports --");
            var impOff = impFileOff;
            var impCount = 0;
            while (impOff + 20 <= fileSize && impCount < 100) {
                var impBuf = await hf.read(impOff, 20);
                var iltRVA = u32(impBuf, 0);
                var nameRVA = u32(impBuf, 12);
                if (iltRVA === 0 && nameRVA === 0) break;

                // Resolve name RVA
                var nameOff = 0;
                for (var si2 = 0; si2 < sections.length; si2++) {
                    var s2 = sections[si2];
                    if (nameRVA >= s2.virtAddr && nameRVA < s2.virtAddr + s2.virtSize) {
                        nameOff = s2.rawPtr + (nameRVA - s2.virtAddr);
                        break;
                    }
                }
                if (nameOff > 0 && nameOff < fileSize) {
                    var nameBuf = await hf.read(nameOff, Math.min(128, fileSize - nameOff));
                    var dllName = "";
                    for (var ni = 0; ni < nameBuf.length && nameBuf[ni] !== 0; ni++) {
                        dllName += String.fromCharCode(nameBuf[ni]);
                    }
                    if (dllName) importDlls.push(dllName);
                    hf.log("  " + dllName);
                }

                impOff += 20;
                impCount++;
            }
            hf.log("  Total DLLs: " + impCount);
        }
    }
}

// ──────────────────────────────────────────────
// Export Table summary
// ──────────────────────────────────────────────
if (dirEntries && dirEntries.length > 0) {
    var expDir = dirEntries[0];
    if (expDir.rva > 0 && expDir.size >= 40) {
        var expFileOff = 0;
        for (var si = 0; si < sections.length; si++) {
            var s = sections[si];
            if (expDir.rva >= s.virtAddr && expDir.rva < s.virtAddr + s.virtSize) {
                expFileOff = s.rawPtr + (expDir.rva - s.virtAddr);
                break;
            }
        }
        if (expFileOff > 0 && expFileOff + 40 <= fileSize) {
            var expBuf = await hf.read(expFileOff, 40);
            var expNameRVA = u32(expBuf, 12);
            var expNumFuncs = u32(expBuf, 20);
            var expNumNames = u32(expBuf, 24);

            var expName = "";
            var enOff = 0;
            for (var si3 = 0; si3 < sections.length; si3++) {
                var s3 = sections[si3];
                if (expNameRVA >= s3.virtAddr && expNameRVA < s3.virtAddr + s3.virtSize) {
                    enOff = s3.rawPtr + (expNameRVA - s3.virtAddr);
                    break;
                }
            }
            if (enOff > 0 && enOff < fileSize) {
                var enBuf = await hf.read(enOff, Math.min(128, fileSize - enOff));
                for (var ni = 0; ni < enBuf.length && enBuf[ni] !== 0; ni++) {
                    expName += String.fromCharCode(enBuf[ni]);
                }
            }
            hf.log("\n-- Exports --");
            hf.log("  Name: " + expName);
            hf.log("  Functions: " + expNumFuncs + ", Named: " + expNumNames);
        }
    }
}

// ──────────────────────────────────────────────
// Overlay detection
// ──────────────────────────────────────────────
if (peEnd < fileSize) {
    var overlaySize = fileSize - peEnd;
    hf.warn("Overlay data: " + overlaySize + " byte(s) after PE end at " + fmtHex(peEnd, 8));
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("PE Summary");
hf.log("==============================");
hf.log("  Format: " + (isPE32Plus ? "PE32+ (64-bit)" : "PE32 (32-bit)"));
hf.log("  Machine: " + machName);
hf.log("  Subsystem: " + (SUBSYSTEMS[subsystem] || subsystem));
hf.log("  Sections: " + numSections);
hf.log("  EntryPoint: " + fmtHex(entryPoint, 8));
hf.log("  ImageBase: " + fmtHex(imageBase, isPE32Plus ? 16 : 8));
hf.log("  Compiled: " + fmtTS(timeDateStamp));
hf.log("  PE data ends at: " + fmtHex(peEnd, 8) + " (" + peEnd.toLocaleString() + " bytes)");
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");
if (peEnd < fileSize) {
    hf.log("  Overlay: " + (fileSize - peEnd).toLocaleString() + " bytes");
}

// ══════════════════════════════════════════════
// Structure View Visualization
// ══════════════════════════════════════════════

function _hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function _fmtSz(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
    return n + " B";
}

var _SEC_COLORS = {
    ".text": "#34d399", ".code": "#34d399",
    ".rdata": "#f97316", ".rodata": "#f97316",
    ".data": "#3b82f6",
    ".bss": "#6366f1",
    ".rsrc": "#ec4899",
    ".reloc": "#a855f7",
    ".pdata": "#fbbf24",
    ".idata": "#f97316",
    ".edata": "#22d3ee",
    ".tls": "#14b8a6",
    ".debug": "#94a3b8",
    ".CRT": "#94a3b8"
};
var _SEC_FALLBACK = ["#60a5fa", "#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#e879f9", "#38bdf8", "#facc15"];

function _getSecClr(name, idx) {
    var lower = name.toLowerCase().replace(/\0/g, "");
    for (var k in _SEC_COLORS) {
        if (lower === k.toLowerCase() || lower.startsWith(k.toLowerCase())) return _SEC_COLORS[k];
    }
    return _SEC_FALLBACK[idx % _SEC_FALLBACK.length];
}

// ── Build segment list (file-offset ordered) ──
var _segs = [];

// DOS Header
_segs.push({ name: "DOS Header", offset: 0, size: 64, color: "#ef4444" });

// DOS Stub
if (stubSize > 0) {
    _segs.push({ name: "DOS Stub", offset: 64, size: stubSize, color: "#fca5a5" });
}

// PE Signature
_segs.push({ name: "PE Signature", offset: e_lfanew, size: 4, color: "#a855f7" });

// COFF Header
_segs.push({ name: "COFF Header", offset: coffOff, size: 20, color: "#3b82f6" });

// Optional Header
if (optHdrSize > 0) {
    _segs.push({ name: "Optional Header", offset: optOff, size: optHdrSize, color: "#22d3ee" });
}

// Section Table
var secTableSize = numSections * 40;
if (secTableSize > 0) {
    _segs.push({ name: "Section Table", offset: secHdrOff, size: secTableSize, color: "#fbbf24" });
}

// Header Padding
if (headersEnd < firstSecOff && firstSecOff < fileSize) {
    var padSz = firstSecOff - headersEnd;
    if (padSz > 0) {
        _segs.push({ name: "Padding", offset: headersEnd, size: padSz, color: "#4b5563" });
    }
}

// Section data
for (var _si = 0; _si < sections.length; _si++) {
    var _sec = sections[_si];
    if (_sec.rawPtr === 0 || _sec.rawSize === 0) continue;
    var _sz = _sec.rawSize;
    if (_sec.rawPtr + _sz > fileSize) _sz = fileSize - _sec.rawPtr;
    if (_sz <= 0) continue;
    _segs.push({ name: _sec.name, offset: _sec.rawPtr, size: _sz, color: _getSecClr(_sec.name, _si) });
}

// Certificate Table
if (dirEntries && dirEntries.length > 4) {
    var _cd = dirEntries[4];
    if (_cd.rva > 0 && _cd.size > 0 && _cd.rva + _cd.size <= fileSize) {
        _segs.push({ name: "Certificate", offset: _cd.rva, size: _cd.size, color: "#795548" });
    }
}

// Overlay
if (peEnd < fileSize) {
    _segs.push({ name: "Overlay", offset: peEnd, size: fileSize - peEnd, color: "#64748b" });
}

// Sort by offset
_segs.sort(function(a, b) { return a.offset - b.offset; });

// ── Helper: render field rows ──
function _renderFields(fields, cols) {
    var style = cols
        ? "display:grid;grid-template-columns:repeat(" + cols + ",1fr);gap:2px 12px"
        : "display:flex;flex-direction:column;gap:1px";
    var html = '<div style="' + style + '">';
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        html += '<div class="hf-field" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:2px 4px;border-radius:3px;cursor:pointer"' +
            (f.offset !== undefined ? ' data-hf-offset="' + f.offset + '"' : '') + '>' +
            '<span style="color:var(--color-text-muted);font-family:var(--font-mono)">' + f.name + '</span>' +
            '<span style="color:' + (f.color || 'var(--color-text)') + ';font-family:var(--font-mono)">' + f.value + '</span></div>';
    }
    html += "</div>";
    return html;
}

// ── Section flags helper ──
function _secPerms(chars) {
    var r = (chars & 0x40000000) ? "R" : "-";
    var w = (chars & 0x80000000) ? "W" : "-";
    var x = (chars & 0x20000000) ? "X" : "-";
    return r + w + x;
}

// ── Render View ──
function _renderView() {
    var totalSegs = 0;
    for (var i = 0; i < _segs.length; i++) totalSegs += _segs[i].size;
    if (totalSegs === 0) totalSegs = 1;

    // ═══ LEFT: Segment Map ═══
    var mapHtml = '<div style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted);' +
        'text-transform:uppercase;letter-spacing:0.08em;text-align:center;flex-shrink:0;margin-bottom:2px">Offset</div>';

    for (var i = 0; i < _segs.length; i++) {
        var seg = _segs[i];
        var rgb = _hexRgb(seg.color);
        var grow = Math.max(1, seg.size);
        var isPad = seg.name === "Padding" || seg.name === "Overlay";
        var isSmall = seg.size < 64;
        var bgA = isPad ? 0.08 : 0.18;
        var bdA = isPad ? 0.12 : 0.35;

        var label = seg.name.length > 6 ? seg.name.substring(0, 5) : seg.name;

        mapHtml += '<div class="hf-seg-block" style="flex:' + grow + ' 0 0px;min-height:18px;border-radius:2px;' +
            'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + bgA + ');' +
            'border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + bdA + ');' +
            '--glow:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.3);' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:7px;font-family:var(--font-mono);color:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.8);line-height:1" ' +
            'data-hf-select="' + seg.offset + ':' + seg.size + '" ' +
            'title="' + seg.name + ': ' + _fmtSz(seg.size) + ' @ ' + fmtHex(seg.offset, 8) + '">' +
            (isSmall ? "" : label) + '</div>';
    }

    // ═══ CENTER: Node Cards ═══
    var cardsHtml = "";

    // ── Arrow helper ──
    function _arrow(label, fromColor, toColor) {
        var fc = _hexRgb(fromColor);
        var tc = _hexRgb(toColor);
        var html = '<div style="display:flex;flex-direction:column;align-items:center;margin:2px 0">' +
            '<div style="width:1px;height:14px;background:linear-gradient(180deg,rgba(' + fc[0] + ',' + fc[1] + ',' + fc[2] + ',0.4),rgba(' + tc[0] + ',' + tc[1] + ',' + tc[2] + ',0.4))"></div>';
        if (label) {
            html += '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);padding:1px 6px;border-radius:3px;background:var(--color-bg-panel);border:1px solid var(--color-border)">' + label + '</div>' +
                '<div style="width:1px;height:8px;background:rgba(' + tc[0] + ',' + tc[1] + ',' + tc[2] + ',0.4)"></div>';
        }
        html += '<div style="font-size:9px;color:var(--color-text-muted);line-height:1">\u25BC</div></div>';
        return html;
    }

    // ── Card wrapper ──
    function _card(color, content) {
        var rgb = _hexRgb(color);
        return '<div class="hf-node" style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:10px;padding:12px;' +
            'box-shadow:0 0 0 1px rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.1),0 0 12px rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.03);' +
            '--glow:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.5);--glow-soft:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.12)">' +
            content + '</div>';
    }

    // ── Card header ──
    function _cardHdr(icon, color, title, subtitle, badge, selectRange) {
        var rgb = _hexRgb(color);
        var html = '<div style="display:flex;align-items:center;gap:10px" ' +
            (selectRange ? 'data-hf-select="' + selectRange + '"' : '') + '>';
        html += '<div style="width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.12);flex-shrink:0;font-size:14px;color:' + color + '">' + icon + '</div>';
        html += '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:600;color:var(--color-text)">' + title + '</div>' +
            '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted)">' + subtitle + '</div></div>';
        if (badge) {
            html += '<div style="padding:2px 8px;border-radius:4px;background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.15);' +
                'color:' + color + ';font-size:10px;font-weight:700;font-family:var(--font-mono);letter-spacing:0.05em;flex-shrink:0">' + badge + '</div>';
        }
        html += '</div>';
        return html;
    }

    // 1) DOS Header Card
    cardsHtml += _card("#ef4444",
        _cardHdr("\u25B6", "#ef4444", "DOS Header", fmtHex(0, 8) + " \u2013 " + fmtHex(63, 8) + " \xB7 64 bytes", "MZ", "0:64") +
        '<div style="margin-top:10px">' +
        _renderFields([
            { name: "e_magic", value: "0x5A4D ('MZ')", color: "#fca5a5" },
            { name: "e_lfanew", value: fmtHex(e_lfanew, 8), color: "#fca5a5" }
        ], 2) + '</div>'
    );

    // Arrow: e_lfanew
    cardsHtml += _arrow("e_lfanew \u2192 " + fmtHex(e_lfanew, 4), "#ef4444", "#a855f7");

    // 2) PE Signature Card
    cardsHtml += _card("#a855f7",
        _cardHdr("\u25C8", "#a855f7", "PE Signature",
            fmtHex(e_lfanew, 8) + " \u2013 " + fmtHex(e_lfanew + 3, 8) + " \xB7 4 bytes",
            "PE\\0\\0", e_lfanew + ":4")
    );

    // Arrow
    cardsHtml += _arrow(null, "#a855f7", "#3b82f6");

    // 3) COFF Header Card
    var coffEnd = coffOff + 20;
    cardsHtml += _card("#3b82f6",
        _cardHdr("\u229E", "#3b82f6", "COFF File Header",
            fmtHex(coffOff, 8) + " \u2013 " + fmtHex(coffEnd - 1, 8) + " \xB7 20 bytes",
            "IMAGE_FILE_HEADER", coffOff + ":20") +
        '<div style="margin-top:10px">' +
        _renderFields([
            { name: "Machine", value: machName + " (" + fmtHex(machine, 4) + ")", color: "#93c5fd" },
            { name: "Sections", value: String(numSections), color: "#93c5fd" },
            { name: "Timestamp", value: fmtTS(timeDateStamp), color: "#93c5fd" },
            { name: "OptHdrSize", value: fmtHex(optHdrSize, 4), color: "#93c5fd" },
            { name: "Characteristics", value: fmtHex(characteristics, 4), color: "#93c5fd" }
        ], 2) + '</div>'
    );

    // Arrow (branch to 2 columns)
    cardsHtml += _arrow(null, "#3b82f6", "#22d3ee");

    // 4) Two-column: Optional Header + Section Table
    cardsHtml += '<div style="display:flex;flex-wrap:wrap;gap:8px">';

    // Optional Header
    if (optHdrSize > 0) {
        var optEnd = optOff + optHdrSize;
        var optContent = _cardHdr("\u25CE", "#22d3ee", "Optional Header",
            fmtHex(optOff, 8) + " \u2013 " + fmtHex(optEnd - 1, 8) + " \xB7 " + optHdrSize + " bytes",
            isPE32Plus ? "PE32+" : "PE32", optOff + ":" + optHdrSize);

        optContent += '<div style="margin-top:10px">' +
            _renderFields([
                { name: "Magic", value: fmtHex(isPE32Plus ? 0x20B : 0x10B, 4) + " (" + (isPE32Plus ? "PE32+" : "PE32") + ")", color: "#67e8f9" },
                { name: "EntryPoint", value: fmtHex(entryPoint, 8), color: "#67e8f9" },
                { name: "ImageBase", value: fmtHex(imageBase, isPE32Plus ? 16 : 8), color: "#67e8f9" },
                { name: "SizeOfImage", value: fmtHex(sizeOfImage, 8), color: "#67e8f9" },
                { name: "Subsystem", value: (SUBSYSTEMS[subsystem] || String(subsystem)) + " (" + fmtHex(subsystem, 4) + ")", color: "#67e8f9" }
            ]) + '</div>';

        // Data Directories mini-grid
        if (dirEntries && dirEntries.length > 0) {
            optContent += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--color-border)">' +
                '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Data Directories (' + numDirs + ')</div>' +
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">';
            var dirAbbr = ["EXP", "IMP", "RSC", "EXC", "SEC", "RLC", "DBG", "ARC", "PTR", "TLS", "CFG", "BND", "IAT", "DLY", "CLR", "RSV"];
            var dirColors = {
                "EXP": "#34d399", "IMP": "#f97316", "RSC": "#ec4899", "DBG": "#3b82f6",
                "RLC": "#fbbf24", "TLS": "#14b8a6", "CFG": "#a855f7", "IAT": "#60a5fa",
                "SEC": "#795548", "CLR": "#22d3ee", "DLY": "#fb923c"
            };
            for (var di = 0; di < numDirs; di++) {
                var abbr = dirAbbr[di] || "?";
                var active = dirEntries[di] && dirEntries[di].rva > 0 && dirEntries[di].size > 0;
                var dc = dirColors[abbr] || "#64748b";
                var dcRgb = _hexRgb(dc);
                if (active) {
                    optContent += '<div style="height:20px;border-radius:3px;background:rgba(' + dcRgb[0] + ',' + dcRgb[1] + ',' + dcRgb[2] + ',0.15);' +
                        'border:1px solid rgba(' + dcRgb[0] + ',' + dcRgb[1] + ',' + dcRgb[2] + ',0.3);' +
                        'display:flex;align-items:center;justify-content:center;font-size:7px;font-family:var(--font-mono);color:' + dc + ';font-weight:600">' + abbr + '</div>';
                } else {
                    optContent += '<div style="height:20px;border-radius:3px;background:rgba(100,116,139,0.06);' +
                        'border:1px solid rgba(100,116,139,0.12);' +
                        'display:flex;align-items:center;justify-content:center;font-size:7px;font-family:var(--font-mono);color:rgba(100,116,139,0.35)">' + abbr + '</div>';
                }
            }
            optContent += '</div></div>';
        }

        cardsHtml += '<div style="flex:1 1 200px;min-width:200px">' + _card("#22d3ee", optContent) + '</div>';
    }

    // Section Table
    if (numSections > 0) {
        var secTblContent = _cardHdr("\u25E7", "#fbbf24", "Section Table",
            numSections + " sections \xB7 " + (numSections * 40) + " bytes",
            null, secHdrOff + ":" + secTableSize);

        secTblContent += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:5px">';
        for (var _si2 = 0; _si2 < sections.length; _si2++) {
            var _s = sections[_si2];
            var sc = _getSecClr(_s.name, _si2);
            var scRgb = _hexRgb(sc);
            var perm = _secPerms(_s.chars);
            var barW = sizeOfImage > 0 ? Math.max(5, Math.min(100, (_s.virtSize / sizeOfImage) * 100 * 3)) : 50;

            secTblContent += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;' +
                'background:rgba(' + scRgb[0] + ',' + scRgb[1] + ',' + scRgb[2] + ',0.04);' +
                'border:1px solid rgba(' + scRgb[0] + ',' + scRgb[1] + ',' + scRgb[2] + ',0.12)" ' +
                'data-hf-select="' + _s.rawPtr + ':' + _s.rawSize + '">' +
                '<div style="width:3px;height:28px;border-radius:2px;background:rgba(' + scRgb[0] + ',' + scRgb[1] + ',' + scRgb[2] + ',0.6);flex-shrink:0"></div>' +
                '<div style="flex:1;min-width:0">' +
                '<div style="display:flex;align-items:center;justify-content:space-between">' +
                '<span style="font-size:11px;font-family:var(--font-mono);font-weight:700;color:' + sc + '">' + _s.name + '</span>' +
                '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">' + fmtHex(_s.virtAddr, 8) + '</span></div>' +
                '<div style="height:4px;border-radius:2px;margin-top:3px;' +
                'background:linear-gradient(90deg,' + sc + ',rgba(' + scRgb[0] + ',' + scRgb[1] + ',' + scRgb[2] + ',0.3));' +
                'width:' + barW.toFixed(0) + '%"></div>' +
                '<div style="display:flex;justify-content:space-between;margin-top:2px">' +
                '<span style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted)">VSize: ' + fmtHex(_s.virtSize, 6) + '</span>' +
                '<span style="font-size:8px;font-family:var(--font-mono);color:rgba(' + scRgb[0] + ',' + scRgb[1] + ',' + scRgb[2] + ',0.6)">RWX: ' + perm + '</span></div>' +
                '</div></div>';
        }
        secTblContent += '</div>';

        cardsHtml += '<div style="flex:1 1 200px;min-width:200px">' + _card("#fbbf24", secTblContent) + '</div>';
    }

    cardsHtml += '</div>'; // end two-column flex

    // 5) Certificate Card (if present)
    if (certInfo && certInfo.entries.length > 0) {
        cardsHtml += _arrow(null, "#fbbf24", "#795548");

        var certContent = _cardHdr("\uD83D\uDD12", "#a0826d", "Certificate Table",
            fmtHex(certInfo.offset, 8) + " \xB7 " + _fmtSz(certInfo.totalSize) + " \xB7 " + certInfo.entries.length + " entry(s)",
            "Authenticode", certInfo.offset + ":" + certInfo.totalSize);

        certContent += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">';

        for (var _ce = 0; _ce < certInfo.entries.length; _ce++) {
            var ent = certInfo.entries[_ce];
            var certFields = [
                { name: "Type", value: ent.type, color: "#d4a574" },
                { name: "Revision", value: "WIN_CERT " + ent.revision, color: "#d4a574" },
                { name: "Size", value: _fmtSz(ent.length), color: "#d4a574" }
            ];
            if (ent.sigAlgo) certFields.push({ name: "Algorithm", value: ent.sigAlgo, color: "#d4a574" });
            if (ent.serial) certFields.push({ name: "Serial", value: ent.serial.length > 24 ? ent.serial.substring(0, 24) + "\u2026" : ent.serial, color: "#d4a574" });

            certContent += '<div style="padding:8px;border-radius:6px;background:rgba(121,85,72,0.06);border:1px solid rgba(121,85,72,0.15)">';

            if (certInfo.entries.length > 1) {
                certContent += '<div style="font-size:9px;font-family:var(--font-mono);color:rgba(160,130,109,0.7);margin-bottom:5px">Certificate [' + _ce + ']</div>';
            }

            certContent += _renderFields(certFields);

            // Subject / Issuer section
            if (ent.subject || ent.issuer) {
                certContent += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(121,85,72,0.12)">';

                if (ent.subject) {
                    certContent += '<div style="margin-bottom:5px">' +
                        '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Subject</div>' +
                        '<div style="font-size:11px;font-family:var(--font-mono);color:#d4a574;word-break:break-all">' + ent.subject + '</div></div>';
                }
                if (ent.issuer) {
                    certContent += '<div style="margin-bottom:5px">' +
                        '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Issuer</div>' +
                        '<div style="font-size:11px;font-family:var(--font-mono);color:#d4a574;word-break:break-all">' + ent.issuer + '</div></div>';
                }
                certContent += '</div>';
            }

            // Validity period
            if (ent.validFrom || ent.validTo) {
                certContent += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(121,85,72,0.12)">' +
                    '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Validity Period</div>' +
                    '<div style="display:flex;align-items:center;gap:6px;font-size:10px;font-family:var(--font-mono)">' +
                    '<span style="color:#34d399">' + (ent.validFrom || "?") + '</span>' +
                    '<span style="color:var(--color-text-muted)">\u2192</span>' +
                    '<span style="color:#f87171">' + (ent.validTo || "?") + '</span>' +
                    '</div></div>';
            }

            certContent += '</div>';
        }

        certContent += '</div>';
        cardsHtml += _card("#795548", certContent);
    }

    // ═══ RIGHT: Insight Panel ═══
    var _secTitle = function(text) {
        return '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);' +
            'text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">' + text + '</div>';
    };
    var _divider = '<div style="height:1px;background:var(--color-border);margin:12px 0"></div>';

    var insightHtml = "";

    // ── PE Summary ──
    insightHtml += '<div style="padding:4px 0">';
    insightHtml += _secTitle("PE Summary");
    insightHtml += '<div style="display:flex;flex-direction:column;gap:6px">';

    // Format
    insightHtml += '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="width:24px;height:24px;border-radius:5px;background:rgba(34,211,238,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#22d3ee;flex-shrink:0">\u25CE</div>' +
        '<div><div style="font-size:12px;color:#22d3ee;font-weight:600">' + (isPE32Plus ? "PE32+ (64-bit)" : "PE32 (32-bit)") + '</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">' + machName + '</div></div></div>';

    // Subsystem
    insightHtml += '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="width:24px;height:24px;border-radius:5px;background:rgba(96,165,250,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#60a5fa;flex-shrink:0">\u25C8</div>' +
        '<div><div style="font-size:12px;color:#60a5fa;font-weight:600">' + (SUBSYSTEMS[subsystem] || "Unknown") + '</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">Entry: ' + fmtHex(entryPoint, 8) + '</div></div></div>';

    // Compile time
    insightHtml += '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="width:24px;height:24px;border-radius:5px;background:rgba(251,191,36,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fbbf24;flex-shrink:0">\u229E</div>' +
        '<div><div style="font-size:12px;color:#fbbf24;font-weight:600">Compiled</div>' +
        '<div style="color:var(--color-text-muted);font-size:10px">' + fmtTS(timeDateStamp) + '</div></div></div>';

    insightHtml += '</div></div>';
    insightHtml += _divider;

    // ── Security Features ──
    insightHtml += '<div style="padding:4px 0">';
    insightHtml += _secTitle("Security Features");

    var secFeatures = [
        { name: "ASLR (Dynamic Base)", on: !!(dllChars & 0x0040) },
        { name: "DEP (NX Compat)", on: !!(dllChars & 0x0100) },
        { name: "CFG (Guard CF)", on: !!(dllChars & 0x4000) },
        { name: "No SEH", on: !!(dllChars & 0x0400) },
        { name: "High Entropy VA", on: !!(dllChars & 0x0020) },
        { name: "Force Integrity", on: !!(dllChars & 0x0080) }
    ];

    insightHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">';
    for (var _fi = 0; _fi < secFeatures.length; _fi++) {
        var feat = secFeatures[_fi];
        var fColor = feat.on ? "#34d399" : "#ef4444";
        var fIcon = feat.on ? "\u2713" : "\u2715";
        var fBg = feat.on ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.05)";
        insightHtml += '<div style="display:flex;align-items:center;gap:4px;padding:3px 6px;border-radius:4px;background:' + fBg + '">' +
            '<span style="font-size:10px;color:' + fColor + ';font-weight:700">' + fIcon + '</span>' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">' + feat.name + '</span></div>';
    }
    insightHtml += '</div></div>';
    insightHtml += _divider;

    // ── File Composition ──
    insightHtml += '<div style="padding:4px 0">';
    insightHtml += _secTitle("File Composition");

    var headersTotalSize = 0;
    var sectionsTotalSize = 0;
    var overlayTotalSize = 0;
    var certTotalSize = 0;
    for (var _ci = 0; _ci < _segs.length; _ci++) {
        var _sg = _segs[_ci];
        if (_sg.name === "Overlay") overlayTotalSize += _sg.size;
        else if (_sg.name === "Certificate") certTotalSize += _sg.size;
        else if (_sg.name === "DOS Header" || _sg.name === "DOS Stub" || _sg.name === "PE Signature" ||
                 _sg.name === "COFF Header" || _sg.name === "Optional Header" || _sg.name === "Section Table" || _sg.name === "Padding") {
            headersTotalSize += _sg.size;
        } else {
            sectionsTotalSize += _sg.size;
        }
    }

    var compItems = [
        { label: "Headers", size: headersTotalSize, c1: "#3b82f6", c2: "#1d4ed8" },
        { label: "Sections", size: sectionsTotalSize, c1: "#34d399", c2: "#059669" }
    ];
    if (certTotalSize > 0) compItems.push({ label: "Certificate", size: certTotalSize, c1: "#795548", c2: "#5d4037" });
    if (overlayTotalSize > 0) compItems.push({ label: "Overlay", size: overlayTotalSize, c1: "#64748b", c2: "#475569" });

    insightHtml += '<div style="display:flex;flex-direction:column;gap:5px">';
    for (var _cj = 0; _cj < compItems.length; _cj++) {
        var _item = compItems[_cj];
        if (_item.size === 0) continue;
        var pct = (_item.size / fileSize * 100);
        var pctStr = pct >= 1 ? pct.toFixed(1) : pct.toFixed(2);
        var bW = Math.max(3, Math.min(100, pct));
        insightHtml += '<div>' +
            '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:' + _item.c1 + ';font-family:var(--font-mono)">' + _item.label + '</span>' +
            '<span style="color:var(--color-text-muted);font-family:var(--font-mono)">' + _fmtSz(_item.size) + ' (' + pctStr + '%)</span></div>' +
            '<div style="height:5px;border-radius:3px;background:linear-gradient(90deg,' + _item.c1 + ',' + _item.c2 + ');width:' + bW.toFixed(0) + '%"></div></div>';
    }
    insightHtml += '</div></div>';
    insightHtml += _divider;

    // ── Key Imports ──
    if (importDlls.length > 0) {
        insightHtml += '<div style="padding:4px 0">';
        insightHtml += _secTitle("Key Imports (" + importDlls.length + " DLLs)");
        insightHtml += '<div style="display:flex;flex-direction:column;gap:2px">';
        var maxDlls = Math.min(importDlls.length, 8);
        for (var _di = 0; _di < maxDlls; _di++) {
            insightHtml += '<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:var(--font-mono)">' +
                '<span style="width:5px;height:5px;border-radius:50%;background:#60a5fa;flex-shrink:0"></span>' +
                '<span style="color:var(--color-text)">' + importDlls[_di] + '</span></div>';
        }
        if (importDlls.length > 8) {
            insightHtml += '<div style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);padding-left:10px">+' + (importDlls.length - 8) + ' more...</div>';
        }
        insightHtml += '</div></div>';
    }

    // ═══ Assemble 3-Panel Layout ═══
    return '<div style="display:flex;height:100%;user-select:none">' +
        // Left: segment map
        '<div style="width:52px;flex-shrink:0;display:flex;flex-direction:column;gap:1.5px;padding:4px;' +
        'background:var(--color-bg-secondary);border-right:1px solid var(--color-border);overflow-y:auto">' +
        mapHtml + '</div>' +
        // Center + right
        '<div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start">' +
        // Center: node cards
        '<div style="flex:1 1 200px;min-width:200px;display:flex;flex-direction:column">' +
        cardsHtml + '</div>' +
        // Right: insight panel
        '<div style="flex:0 0 210px;display:flex;flex-direction:column;gap:0;' +
        'border-left:1px solid var(--color-border);padding-left:10px">' +
        insightHtml + '</div>' +
        '</div></div>';
}

await hf.template.setView(_renderView());
await hf.template.end();