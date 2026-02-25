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

await hf.template.end();