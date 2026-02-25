// HexForge JS Template - ELF.js
// Purpose: ELF (Executable and Linkable Format) — Linux executables, shared libraries, core dumps
// Author: Kei Choi (hanul93@gmail.com)
// Category: Executable
// ID Bytes: 7F 45 4C 46 (\x7FELF)
// Reference: https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html

var fileSize = await hf.fileSize;

hf.template.begin("ELF Executable");
hf.template.setFormat("elf", "ELF Executable", [".elf", ".so", ".o", ".ko", ".axf", ".bin", ".out", ""]);

// ──────────────────────────────────────────────
// Validate ELF magic
// ──────────────────────────────────────────────
var magic = await hf.read(0, 4);
if (magic[0] !== 0x7F || magic[1] !== 0x45 || magic[2] !== 0x4C || magic[3] !== 0x46) {
    hf.error("Not an ELF file (expected '\\x7FELF')");
    await hf.template.end();
    throw new Error("Not a valid ELF");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }
function u64(buf, off) {
    var lo = (buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0;
    var hi = (buf[off+4] | (buf[off+5] << 8) | (buf[off+6] << 16) | (buf[off+7] << 24)) >>> 0;
    return hi * 0x100000000 + lo;
}
function i32(buf, off) { var v = u32(buf, off); return v > 0x7FFFFFFF ? v - 0x100000000 : v; }
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n, "0"); }
function readStr(buf, off, maxLen) {
    var s = "";
    for (var i = 0; i < maxLen && off + i < buf.length; i++) {
        if (buf[off + i] === 0) break;
        s += String.fromCharCode(buf[off + i]);
    }
    return s;
}

// ──────────────────────────────────────────────
// Lookup Tables
// ──────────────────────────────────────────────
var ELF_CLASSES = { 0: "None", 1: "ELF32", 2: "ELF64" };
var ELF_DATA = { 0: "None", 1: "Little-Endian", 2: "Big-Endian" };
var ELF_OSABI = {
    0: "UNIX System V", 1: "HP-UX", 2: "NetBSD", 3: "Linux",
    6: "Solaris", 7: "AIX", 8: "IRIX", 9: "FreeBSD",
    10: "Tru64", 11: "Novell Modesto", 12: "OpenBSD",
    64: "ARM EABI", 97: "ARM", 255: "Standalone"
};
var ELF_TYPES = { 0: "ET_NONE", 1: "ET_REL", 2: "ET_EXEC", 3: "ET_DYN", 4: "ET_CORE" };
var ELF_TYPE_DESC = { 0: "None", 1: "Relocatable", 2: "Executable", 3: "Shared Object (PIE/Lib)", 4: "Core Dump" };
var MACHINES = {
    0: "None", 2: "SPARC", 3: "x86", 4: "M68K", 5: "M88K",
    7: "Intel 80860", 8: "MIPS", 20: "PowerPC", 21: "PowerPC64",
    22: "S390", 40: "ARM", 42: "SuperH", 43: "SPARC V9",
    50: "IA-64", 62: "x86-64", 183: "AArch64", 243: "RISC-V", 247: "BPF", 258: "LoongArch"
};
var PT_TYPES = {
    0: "PT_NULL", 1: "PT_LOAD", 2: "PT_DYNAMIC", 3: "PT_INTERP",
    4: "PT_NOTE", 5: "PT_SHLIB", 6: "PT_PHDR", 7: "PT_TLS",
    0x6474E550: "PT_GNU_EH_FRAME", 0x6474E551: "PT_GNU_STACK",
    0x6474E552: "PT_GNU_RELRO", 0x6474E553: "PT_GNU_PROPERTY"
};
var SHT_TYPES = {
    0: "SHT_NULL", 1: "SHT_PROGBITS", 2: "SHT_SYMTAB", 3: "SHT_STRTAB",
    4: "SHT_RELA", 5: "SHT_HASH", 6: "SHT_DYNAMIC", 7: "SHT_NOTE",
    8: "SHT_NOBITS", 9: "SHT_REL", 10: "SHT_SHLIB", 11: "SHT_DYNSYM",
    14: "SHT_INIT_ARRAY", 15: "SHT_FINI_ARRAY", 16: "SHT_PREINIT_ARRAY",
    0x6FFFFFF6: "SHT_GNU_HASH", 0x6FFFFFFD: "SHT_GNU_VERDEF",
    0x6FFFFFFE: "SHT_GNU_VERNEED", 0x6FFFFFFF: "SHT_GNU_VERSYM"
};
var DT_TAGS = {
    0: "DT_NULL", 1: "DT_NEEDED", 2: "DT_PLTRELSZ", 3: "DT_PLTGOT",
    4: "DT_HASH", 5: "DT_STRTAB", 6: "DT_SYMTAB", 7: "DT_RELA",
    8: "DT_RELASZ", 9: "DT_RELAENT", 10: "DT_STRSZ", 11: "DT_SYMENT",
    12: "DT_INIT", 13: "DT_FINI", 14: "DT_SONAME", 15: "DT_RPATH",
    16: "DT_SYMBOLIC", 17: "DT_REL", 18: "DT_RELSZ", 19: "DT_RELENT",
    20: "DT_PLTREL", 21: "DT_DEBUG", 22: "DT_TEXTREL", 23: "DT_JMPREL",
    24: "DT_BIND_NOW", 25: "DT_INIT_ARRAY", 26: "DT_FINI_ARRAY",
    29: "DT_RUNPATH", 30: "DT_FLAGS",
    0x6FFFFEF5: "DT_GNU_HASH", 0x6FFFFFFB: "DT_FLAGS_1",
    0x6FFFFFFE: "DT_VERNEED", 0x6FFFFFFF: "DT_VERNEEDNUM", 0x6FFFFFF0: "DT_VERSYM"
};

// ──────────────────────────────────────────────
// ELF Header
// ──────────────────────────────────────────────
var identBuf = await hf.read(0, 16);
var eiClass = identBuf[4];
var eiData = identBuf[5];
var eiVersion = identBuf[6];
var eiOsabi = identBuf[7];
var is64 = (eiClass === 2);
var ehdrSize = is64 ? 64 : 52;

if (ehdrSize > fileSize) {
    hf.error("File too small for ELF header");
    await hf.template.end();
    throw new Error("Invalid ELF");
}

hf.template.seek(0);
hf.template.beginStruct("ELF_Header");
await hf.template.addField("ei_mag", "string:4", { color: "#10b981" });
await hf.template.addField("ei_class", "u8", { color: "#22d3ee" });
await hf.template.addField("ei_data", "u8", { color: "#22d3ee" });
await hf.template.addField("ei_version", "u8", { color: "#22d3ee" });
await hf.template.addField("ei_osabi", "u8", { color: "#22d3ee" });
await hf.template.addField("ei_abiversion", "u8", { color: "#22d3ee" });
await hf.template.addField("ei_pad", "bytes:7", { color: "#64748b" });

var e_type = await hf.template.addField("e_type", "u16", { color: "#10b981" });
var e_machine = await hf.template.addField("e_machine", "u16", { color: "#10b981" });
await hf.template.addField("e_version", "u32", { color: "#10b981" });

var e_entry, e_phoff, e_shoff;
if (is64) {
    e_entry = await hf.template.addField("e_entry", "u64", { color: "#f59e0b" });
    e_phoff = await hf.template.addField("e_phoff", "u64", { color: "#3b82f6" });
    e_shoff = await hf.template.addField("e_shoff", "u64", { color: "#ec4899" });
} else {
    e_entry = await hf.template.addField("e_entry", "u32", { color: "#f59e0b" });
    e_phoff = await hf.template.addField("e_phoff", "u32", { color: "#3b82f6" });
    e_shoff = await hf.template.addField("e_shoff", "u32", { color: "#ec4899" });
}

var e_flags = await hf.template.addField("e_flags", "u32", { color: "#64748b" });
var e_ehsize = await hf.template.addField("e_ehsize", "u16", { color: "#10b981" });
var e_phentsize = await hf.template.addField("e_phentsize", "u16", { color: "#3b82f6" });
var e_phnum = await hf.template.addField("e_phnum", "u16", { color: "#3b82f6" });
var e_shentsize = await hf.template.addField("e_shentsize", "u16", { color: "#ec4899" });
var e_shnum = await hf.template.addField("e_shnum", "u16", { color: "#ec4899" });
var e_shstrndx = await hf.template.addField("e_shstrndx", "u16", { color: "#ec4899" });
hf.template.endStruct();

var machName = MACHINES[e_machine] || fmtHex(e_machine, 4);
var typeName = ELF_TYPES[e_type] || fmtHex(e_type, 4);
var typeDesc = ELF_TYPE_DESC[e_type] || "Unknown";

hf.log("ELF Header:");
hf.log("  Class: " + (ELF_CLASSES[eiClass] || "?") + ", Data: " + (ELF_DATA[eiData] || "?"));
hf.log("  OS/ABI: " + (ELF_OSABI[eiOsabi] || fmtHex(eiOsabi, 2)));
hf.log("  Type: " + typeName + " (" + typeDesc + ")");
hf.log("  Machine: " + machName);
hf.log("  Entry: " + fmtHex(e_entry, is64 ? 16 : 8));
hf.log("  PH: " + e_phnum + " @ " + fmtHex(e_phoff, 8) + " (" + e_phentsize + "B each)");
hf.log("  SH: " + e_shnum + " @ " + fmtHex(e_shoff, 8) + " (" + e_shentsize + "B each)");

// ──────────────────────────────────────────────
// Program Headers
// ──────────────────────────────────────────────
var phdrs = [];
var gnuStack = null;
var gnuRelro = null;
var interpStr = "";

hf.log("\n-- Program Headers --");
for (var pi = 0; pi < e_phnum; pi++) {
    var phOff = e_phoff + pi * e_phentsize;
    if (phOff + e_phentsize > fileSize) break;

    var phBuf = await hf.read(phOff, e_phentsize);
    var p_type, p_flags, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz, p_align;

    if (is64) {
        p_type = u32(phBuf, 0); p_flags = u32(phBuf, 4);
        p_offset = u64(phBuf, 8); p_vaddr = u64(phBuf, 16); p_paddr = u64(phBuf, 24);
        p_filesz = u64(phBuf, 32); p_memsz = u64(phBuf, 40); p_align = u64(phBuf, 48);
    } else {
        p_type = u32(phBuf, 0); p_offset = u32(phBuf, 4);
        p_vaddr = u32(phBuf, 8); p_paddr = u32(phBuf, 12);
        p_filesz = u32(phBuf, 16); p_memsz = u32(phBuf, 20);
        p_flags = u32(phBuf, 24); p_align = u32(phBuf, 28);
    }

    phdrs.push({ type: p_type, flags: p_flags, offset: p_offset, vaddr: p_vaddr,
                 paddr: p_paddr, filesz: p_filesz, memsz: p_memsz, align: p_align });

    hf.template.seek(phOff);
    var ptName = PT_TYPES[p_type] || ("PT_" + fmtHex(p_type, 8));
    hf.template.beginStruct("Phdr_" + pi + "_" + ptName);
    await hf.template.addField("p_type", "u32", { color: "#3b82f6" });
    if (is64) {
        await hf.template.addField("p_flags", "u32", { color: "#f59e0b" });
        await hf.template.addField("p_offset", "u64", { color: "#3b82f6" });
        await hf.template.addField("p_vaddr", "u64", { color: "#22d3ee" });
        await hf.template.addField("p_paddr", "u64", { color: "#22d3ee" });
        await hf.template.addField("p_filesz", "u64", { color: "#f97316" });
        await hf.template.addField("p_memsz", "u64", { color: "#f97316" });
        await hf.template.addField("p_align", "u64");
    } else {
        await hf.template.addField("p_offset", "u32", { color: "#3b82f6" });
        await hf.template.addField("p_vaddr", "u32", { color: "#22d3ee" });
        await hf.template.addField("p_paddr", "u32", { color: "#22d3ee" });
        await hf.template.addField("p_filesz", "u32", { color: "#f97316" });
        await hf.template.addField("p_memsz", "u32", { color: "#f97316" });
        await hf.template.addField("p_flags", "u32", { color: "#f59e0b" });
        await hf.template.addField("p_align", "u32");
    }
    hf.template.endStruct();

    var pFlags = (p_flags & 4 ? "R" : "-") + (p_flags & 2 ? "W" : "-") + (p_flags & 1 ? "X" : "-");
    hf.log("  [" + pi + "] " + ptName.padEnd(18) + " Off=" + fmtHex(p_offset, 8) +
           " FSz=" + fmtHex(p_filesz, 8) + " VA=" + fmtHex(p_vaddr, is64 ? 16 : 8) + " [" + pFlags + "]");

    if (p_type === 0x6474E551) gnuStack = { flags: p_flags };
    if (p_type === 0x6474E552) gnuRelro = { offset: p_offset, filesz: p_filesz, vaddr: p_vaddr };
    if (p_type === 3 && p_filesz > 0 && p_offset + p_filesz <= fileSize) {
        var interpBuf = await hf.read(p_offset, Math.min(p_filesz, 256));
        interpStr = readStr(interpBuf, 0, interpBuf.length);
        hf.log("    Interpreter: " + interpStr);
    }
}

// ──────────────────────────────────────────────
// Section Headers + shstrtab
// ──────────────────────────────────────────────
var sections = [];
var shstrtab = null;

if (e_shnum > 0 && e_shoff > 0 && e_shoff + e_shnum * e_shentsize <= fileSize) {
    if (e_shstrndx < e_shnum) {
        var shstrOff = e_shoff + e_shstrndx * e_shentsize;
        var shstrBuf = await hf.read(shstrOff, e_shentsize);
        var shstr_offset = is64 ? u64(shstrBuf, 24) : u32(shstrBuf, 16);
        var shstr_size = is64 ? u64(shstrBuf, 32) : u32(shstrBuf, 20);
        if (shstr_offset + shstr_size <= fileSize && shstr_size > 0) {
            shstrtab = await hf.read(shstr_offset, shstr_size);
        }
    }

    hf.log("\n-- Section Headers --");
    for (var si = 0; si < e_shnum; si++) {
        var shOff = e_shoff + si * e_shentsize;
        if (shOff + e_shentsize > fileSize) break;
        var shBuf = await hf.read(shOff, e_shentsize);

        var sh_name_idx = u32(shBuf, 0);
        var sh_type = u32(shBuf, 4);
        var sh_flags, sh_addr, sh_offset, sh_size, sh_link, sh_info, sh_addralign, sh_entsize;
        if (is64) {
            sh_flags = u64(shBuf, 8); sh_addr = u64(shBuf, 16);
            sh_offset = u64(shBuf, 24); sh_size = u64(shBuf, 32);
            sh_link = u32(shBuf, 40); sh_info = u32(shBuf, 44);
            sh_addralign = u64(shBuf, 48); sh_entsize = u64(shBuf, 56);
        } else {
            sh_flags = u32(shBuf, 8); sh_addr = u32(shBuf, 12);
            sh_offset = u32(shBuf, 16); sh_size = u32(shBuf, 20);
            sh_link = u32(shBuf, 24); sh_info = u32(shBuf, 28);
            sh_addralign = u32(shBuf, 32); sh_entsize = u32(shBuf, 36);
        }

        var secName = "";
        if (shstrtab && sh_name_idx < shstrtab.length) secName = readStr(shstrtab, sh_name_idx, 128);
        if (!secName) secName = si === 0 ? "(null)" : "(unnamed)";

        sections.push({ index: si, name: secName, type: sh_type, flags: sh_flags, addr: sh_addr,
                         offset: sh_offset, size: sh_size, link: sh_link, info: sh_info,
                         addralign: sh_addralign, entsize: sh_entsize });

        hf.template.seek(shOff);
        hf.template.beginStruct("Shdr_" + si + "_" + secName);
        await hf.template.addField("sh_name", "u32", { color: "#ec4899" });
        await hf.template.addField("sh_type", "u32", { color: "#ec4899" });
        if (is64) {
            await hf.template.addField("sh_flags", "u64", { color: "#f59e0b" });
            await hf.template.addField("sh_addr", "u64", { color: "#22d3ee" });
            await hf.template.addField("sh_offset", "u64", { color: "#4ade80" });
            await hf.template.addField("sh_size", "u64", { color: "#f97316" });
        } else {
            await hf.template.addField("sh_flags", "u32", { color: "#f59e0b" });
            await hf.template.addField("sh_addr", "u32", { color: "#22d3ee" });
            await hf.template.addField("sh_offset", "u32", { color: "#4ade80" });
            await hf.template.addField("sh_size", "u32", { color: "#f97316" });
        }
        await hf.template.addField("sh_link", "u32");
        await hf.template.addField("sh_info", "u32");
        if (is64) {
            await hf.template.addField("sh_addralign", "u64");
            await hf.template.addField("sh_entsize", "u64");
        } else {
            await hf.template.addField("sh_addralign", "u32");
            await hf.template.addField("sh_entsize", "u32");
        }
        hf.template.endStruct();

        var sfStr = "";
        if (sh_flags & 0x1) sfStr += "W";
        if (sh_flags & 0x2) sfStr += "A";
        if (sh_flags & 0x4) sfStr += "X";
        if (sh_flags & 0x10) sfStr += "M";
        if (sh_flags & 0x20) sfStr += "S";
        var shtName = SHT_TYPES[sh_type] || ("SHT_" + fmtHex(sh_type, 8));
        if (si > 0) {
            hf.log("  [" + si.toString().padStart(2) + "] " + secName.padEnd(18) + " " +
                   shtName.padEnd(16) + " Off=" + fmtHex(sh_offset, 8) +
                   " Size=" + fmtHex(sh_size, 8) + " [" + sfStr + "]");
        }
    }
}

// ──────────────────────────────────────────────
// Section Data (colored blocks)
// ──────────────────────────────────────────────
var SEC_COLORS = {
    ".text": "#22d3ee", ".init": "#22d3ee", ".fini": "#22d3ee", ".plt": "#22d3ee", ".plt.got": "#22d3ee",
    ".rodata": "#f97316", ".eh_frame": "#f97316", ".eh_frame_hdr": "#f97316",
    ".data": "#eab308", ".data.rel.ro": "#eab308",
    ".bss": "#ef4444", ".dynamic": "#f59e0b",
    ".got": "#14b8a6", ".got.plt": "#14b8a6",
    ".interp": "#a855f7",
    ".note": "#6366f1", ".note.gnu.build-id": "#6366f1", ".note.ABI-tag": "#6366f1",
    ".dynsym": "#a855f7", ".symtab": "#a855f7",
    ".dynstr": "#94a3b8", ".strtab": "#94a3b8", ".shstrtab": "#94a3b8",
    ".rela.dyn": "#fb923c", ".rela.plt": "#fb923c", ".rel.dyn": "#fb923c", ".rel.plt": "#fb923c",
    ".gnu.hash": "#60a5fa", ".hash": "#60a5fa",
    ".comment": "#64748b"
};
var SEC_FALLBACK = ["#60a5fa", "#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#e879f9", "#38bdf8", "#facc15"];

function getSecColor(name, idx) {
    var lower = name.toLowerCase();
    if (SEC_COLORS[lower]) return SEC_COLORS[lower];
    for (var k in SEC_COLORS) { if (lower.startsWith(k)) return SEC_COLORS[k]; }
    return SEC_FALLBACK[idx % SEC_FALLBACK.length];
}

for (var si = 1; si < sections.length; si++) {
    var sec = sections[si];
    if (sec.type === 8 || sec.size === 0 || sec.offset === 0) continue;
    if (sec.offset + sec.size > fileSize) continue;
    hf.template.seek(sec.offset);
    hf.template.beginStruct("Section_" + sec.name);
    await hf.template.addField(sec.name, "bytes:" + sec.size, { color: getSecColor(sec.name, si) });
    hf.template.endStruct();
}

// ──────────────────────────────────────────────
// .dynamic Section
// ──────────────────────────────────────────────
var dynamicEntries = [];
var neededLibs = [];
var dynstrtab = null;
var hasBINDNOW = false;
var hasFlags1NOW = false;

var dynstrSec = null;
for (var si = 0; si < sections.length; si++) {
    if (sections[si].name === ".dynstr" && sections[si].size > 0) { dynstrSec = sections[si]; break; }
}
if (dynstrSec && dynstrSec.offset + dynstrSec.size <= fileSize) {
    dynstrtab = await hf.read(dynstrSec.offset, dynstrSec.size);
}

var dynamicSec = null;
for (var si = 0; si < sections.length; si++) {
    if (sections[si].name === ".dynamic" || sections[si].type === 6) { dynamicSec = sections[si]; break; }
}

if (dynamicSec && dynamicSec.size > 0 && dynamicSec.offset + dynamicSec.size <= fileSize) {
    var dynBuf = await hf.read(dynamicSec.offset, dynamicSec.size);
    var dynEntSize = is64 ? 16 : 8;
    var numDynEntries = Math.floor(dynamicSec.size / dynEntSize);

    hf.log("\n-- .dynamic Section --");
    for (var di = 0; di < numDynEntries; di++) {
        var dOff = di * dynEntSize;
        var d_tag = is64 ? u64(dynBuf, dOff) : i32(dynBuf, dOff);
        var d_val = is64 ? u64(dynBuf, dOff + 8) : u32(dynBuf, dOff + 4);
        if (d_tag === 0) break;

        var tagName = DT_TAGS[d_tag] || ("DT_" + fmtHex(d_tag, 8));
        dynamicEntries.push({ tag: d_tag, tagName: tagName, val: d_val });

        if (d_tag === 1 && dynstrtab && d_val < dynstrtab.length) {
            var libName = readStr(dynstrtab, d_val, 256);
            neededLibs.push(libName);
            hf.log("  " + tagName + ": " + libName);
        } else if (d_tag === 24) {
            hasBINDNOW = true;
            hf.log("  " + tagName);
        } else if (d_tag === 0x6FFFFFFB) {
            if (d_val & 1) hasFlags1NOW = true;
            hf.log("  " + tagName + ": " + fmtHex(d_val, 8) + (d_val & 1 ? " (NOW)" : ""));
        } else {
            hf.log("  " + tagName + ": " + fmtHex(d_val, is64 ? 16 : 8));
        }
    }
}

// ──────────────────────────────────────────────
// Symbol Tables
// ──────────────────────────────────────────────
var STT_NAMES = { 0: "NOTYPE", 1: "OBJECT", 2: "FUNC", 3: "SECTION", 4: "FILE", 10: "IFUNC" };
var STB_NAMES = { 0: "LOCAL", 1: "GLOBAL", 2: "WEAK" };

async function parseSymbols(symSec, strSec, label) {
    if (!symSec || symSec.size === 0 || symSec.offset + symSec.size > fileSize) return [];
    var strtab = null;
    if (strSec && strSec.size > 0 && strSec.offset + strSec.size <= fileSize) {
        strtab = await hf.read(strSec.offset, strSec.size);
    }
    var symBuf = await hf.read(symSec.offset, symSec.size);
    var entSize = is64 ? 24 : 16;
    var numSyms = Math.floor(symSec.size / entSize);
    var result = [];

    hf.log("\n-- " + label + " (" + numSyms + " symbols) --");
    var logCount = 0;
    for (var i = 0; i < numSyms && i < 500; i++) {
        var sOff = i * entSize;
        var st_name_idx, st_info, st_other, st_shndx, st_value, st_size;
        if (is64) {
            st_name_idx = u32(symBuf, sOff); st_info = symBuf[sOff + 4];
            st_other = symBuf[sOff + 5]; st_shndx = u16(symBuf, sOff + 6);
            st_value = u64(symBuf, sOff + 8); st_size = u64(symBuf, sOff + 16);
        } else {
            st_name_idx = u32(symBuf, sOff); st_value = u32(symBuf, sOff + 4);
            st_size = u32(symBuf, sOff + 8); st_info = symBuf[sOff + 12];
            st_other = symBuf[sOff + 13]; st_shndx = u16(symBuf, sOff + 14);
        }
        var symName = (strtab && st_name_idx < strtab.length) ? readStr(strtab, st_name_idx, 256) : "";
        var stype = STT_NAMES[st_info & 0xF] || ("TYPE_" + (st_info & 0xF));
        var sbind = STB_NAMES[(st_info >> 4) & 0xF] || ("BIND_" + ((st_info >> 4) & 0xF));
        result.push({ name: symName, value: st_value, size: st_size, type: stype, bind: sbind, shndx: st_shndx });

        if (symName && logCount < 20) {
            var shndxStr = st_shndx === 0 ? "UND" : (st_shndx === 0xFFF1 ? "ABS" : String(st_shndx));
            hf.log("  " + stype.padEnd(8) + " " + sbind.padEnd(7) + " " +
                   fmtHex(st_value, is64 ? 16 : 8) + " " + shndxStr.padEnd(5) + " " + symName);
            logCount++;
        }
    }
    if (numSyms > 20) hf.log("  ... (" + (numSyms - 20) + " more)");
    return result;
}

var dynsymSec = null;
for (var si = 0; si < sections.length; si++) {
    if (sections[si].name === ".dynsym" || sections[si].type === 11) { dynsymSec = sections[si]; break; }
}
var dynSymbols = await parseSymbols(dynsymSec, dynstrSec, ".dynsym");

var symtabSec = null, strtabSec = null;
for (var si = 0; si < sections.length; si++) {
    if (sections[si].name === ".symtab" || sections[si].type === 2) symtabSec = sections[si];
    if (sections[si].name === ".strtab" && sections[si].type === 3) strtabSec = sections[si];
}
var staticSymbols = await parseSymbols(symtabSec, strtabSec, ".symtab");
var allSymbols = dynSymbols.concat(staticSymbols);

// ──────────────────────────────────────────────
// Security Analysis
// ──────────────────────────────────────────────
hf.log("\n-- Security Analysis --");
var nxEnabled = true;
if (gnuStack) nxEnabled = !(gnuStack.flags & 1);
hf.log("  NX (Stack): " + (nxEnabled ? "ENABLED" : "DISABLED"));

var isPIE = (e_type === 3);
hf.log("  PIE: " + (isPIE ? "ENABLED" : "DISABLED"));

var hasCanary = false;
for (var si = 0; si < allSymbols.length; si++) {
    if (allSymbols[si].name && allSymbols[si].name.indexOf("__stack_chk_fail") >= 0) { hasCanary = true; break; }
}
hf.log("  Stack Canary: " + (hasCanary ? "FOUND" : "NOT FOUND"));

var relroLevel = "NONE";
if (gnuRelro) relroLevel = (hasBINDNOW || hasFlags1NOW) ? "FULL" : "PARTIAL";
hf.log("  RELRO: " + relroLevel);

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
hf.log("\n==============================");
hf.log("ELF Summary");
hf.log("==============================");
hf.log("  Format: " + (is64 ? "ELF64" : "ELF32"));
hf.log("  Machine: " + machName);
hf.log("  Type: " + typeName + " (" + typeDesc + ")");
hf.log("  Entry: " + fmtHex(e_entry, is64 ? 16 : 8));
hf.log("  Sections: " + e_shnum + ", Segments: " + e_phnum);
if (interpStr) hf.log("  Interpreter: " + interpStr);
if (neededLibs.length > 0) hf.log("  Libraries: " + neededLibs.join(", "));
hf.log("  File size: " + fileSize.toLocaleString() + " bytes");

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

// ── Build segment list ──
var _segs = [];
_segs.push({ name: "ELF Header", offset: 0, size: ehdrSize, color: "#10b981" });
if (e_phnum > 0 && e_phoff > 0) {
    _segs.push({ name: "Prog Hdrs", offset: e_phoff, size: e_phnum * e_phentsize, color: "#3b82f6" });
}
for (var _si = 1; _si < sections.length; _si++) {
    var _sec = sections[_si];
    if (_sec.type === 8 || _sec.size === 0 || _sec.offset === 0) continue;
    if (_sec.offset + _sec.size > fileSize) continue;
    _segs.push({ name: _sec.name, offset: _sec.offset, size: _sec.size, color: getSecColor(_sec.name, _si) });
}
if (e_shnum > 0 && e_shoff > 0) {
    _segs.push({ name: "Sect Hdrs", offset: e_shoff, size: e_shnum * e_shentsize, color: "#ec4899" });
}
_segs.sort(function(a, b) { return a.offset - b.offset; });

// ── Viz helpers ──
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
    return html + "</div>";
}

function _arrow(label, fromColor, toColor) {
    var fc = _hexRgb(fromColor), tc = _hexRgb(toColor);
    var html = '<div style="display:flex;flex-direction:column;align-items:center;margin:2px 0">' +
        '<div style="width:1px;height:14px;background:linear-gradient(180deg,rgba(' + fc[0] + ',' + fc[1] + ',' + fc[2] + ',0.4),rgba(' + tc[0] + ',' + tc[1] + ',' + tc[2] + ',0.4))"></div>';
    if (label) {
        html += '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);padding:1px 6px;border-radius:3px;background:var(--color-bg-panel);border:1px solid var(--color-border)">' + label + '</div>' +
            '<div style="width:1px;height:8px;background:rgba(' + tc[0] + ',' + tc[1] + ',' + tc[2] + ',0.4)"></div>';
    }
    return html + '<div style="font-size:9px;color:var(--color-text-muted);line-height:1">\u25BC</div></div>';
}

function _card(color, content) {
    var rgb = _hexRgb(color);
    return '<div class="hf-node" style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:10px;padding:12px;' +
        'box-shadow:0 0 0 1px rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.1),0 0 12px rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.03)">' +
        content + '</div>';
}

function _cardHdr(icon, color, title, subtitle, badge, selectRange) {
    var rgb = _hexRgb(color);
    var html = '<div style="display:flex;align-items:center;gap:10px"' +
        (selectRange ? ' data-hf-select="' + selectRange + '"' : '') + '>';
    html += '<div style="width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.12);flex-shrink:0;font-size:14px;color:' + color + '">' + icon + '</div>';
    html += '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:var(--color-text)">' + title + '</div>' +
        '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted)">' + subtitle + '</div></div>';
    if (badge) {
        html += '<div style="padding:2px 8px;border-radius:4px;background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.15);' +
            'color:' + color + ';font-size:10px;font-weight:700;font-family:var(--font-mono);letter-spacing:0.05em;flex-shrink:0">' + badge + '</div>';
    }
    return html + '</div>';
}

function _phdrFlags(flags) {
    return (flags & 4 ? "R" : "-") + (flags & 2 ? "W" : "-") + (flags & 1 ? "X" : "-");
}
function _secFlags(flags) {
    var s = "";
    if (flags & 0x2) s += "A";
    if (flags & 0x1) s += "W";
    if (flags & 0x4) s += "X";
    return s || "-";
}

function _renderView() {
    // ═══ LEFT: Segment Map ═══
    var mapHtml = '<div style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;text-align:center;flex-shrink:0;margin-bottom:2px">Layout</div>';
    for (var i = 0; i < _segs.length; i++) {
        var seg = _segs[i];
        var rgb = _hexRgb(seg.color);
        var grow = Math.max(1, seg.size);
        var isSmall = seg.size < 64;
        var label = seg.name.length > 6 ? seg.name.substring(0, 5) : seg.name;
        mapHtml += '<div class="hf-seg-block" style="flex:' + grow + ' 0 0px;min-height:18px;border-radius:2px;' +
            'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.18);' +
            'border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.35);' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:7px;font-family:var(--font-mono);color:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.8);line-height:1" ' +
            'data-hf-select="' + seg.offset + ':' + seg.size + '" ' +
            'title="' + seg.name + ': ' + _fmtSz(seg.size) + ' @ ' + fmtHex(seg.offset, 8) + '">' +
            (isSmall ? "" : label) + '</div>';
    }

    // ═══ CENTER: Node Cards ═══
    var cardsHtml = "";

    // 1) ELF Header Card
    var ehC = _cardHdr("\u25B6", "#10b981", "ELF Header (Ehdr)",
        fmtHex(0, 8) + " \u2013 " + fmtHex(ehdrSize - 1, 8) + " \xB7 " + ehdrSize + " bytes",
        "7F 45 4C 46", "0:" + ehdrSize);
    ehC += '<div style="margin-top:10px;padding:8px;border-radius:8px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.1)">' +
        '<div style="font-size:9px;font-family:var(--font-mono);color:rgba(16,185,129,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">e_ident[16] \u2014 Magic &amp; Identification</div>' +
        '<div style="display:flex;gap:3px;flex-wrap:wrap">' +
        '<div style="padding:2px 5px;border-radius:3px;background:rgba(16,185,129,0.15);font-size:9px;font-family:var(--font-mono);color:#6ee7b7">7F 45 4C 46</div>' +
        '<div style="padding:2px 5px;border-radius:3px;background:rgba(34,211,238,0.1);font-size:9px;font-family:var(--font-mono);color:#67e8f9">' +
            (eiClass === 2 ? "02" : "01") + '<span style="color:var(--color-text-muted);margin-left:3px">' + (is64 ? "64-bit" : "32-bit") + '</span></div>' +
        '<div style="padding:2px 5px;border-radius:3px;background:rgba(34,211,238,0.1);font-size:9px;font-family:var(--font-mono);color:#67e8f9">' +
            (eiData === 1 ? "01" : "02") + '<span style="color:var(--color-text-muted);margin-left:3px">' + (eiData === 1 ? "LE" : "BE") + '</span></div>' +
        '<div style="padding:2px 5px;border-radius:3px;background:rgba(34,211,238,0.1);font-size:9px;font-family:var(--font-mono);color:#67e8f9">' +
            "0" + eiVersion + '<span style="color:var(--color-text-muted);margin-left:3px">' + (eiVersion === 1 ? "current" : "?") + '</span></div>' +
        '<div style="padding:2px 5px;border-radius:3px;background:rgba(34,211,238,0.1);font-size:9px;font-family:var(--font-mono);color:#67e8f9">' +
            fmtHex(eiOsabi, 2).slice(2) + '<span style="color:var(--color-text-muted);margin-left:3px">' + (ELF_OSABI[eiOsabi] || "?") + '</span></div>' +
        '<div style="padding:2px 5px;border-radius:3px;background:rgba(100,116,139,0.08);font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">00 00 00 00 00 00 00</div>' +
        '</div></div>';
    ehC += '<div style="margin-top:10px">' + _renderFields([
        { name: "e_type", value: typeName + " (" + fmtHex(e_type, 4) + ")", color: "#6ee7b7" },
        { name: "e_machine", value: machName + " (" + fmtHex(e_machine, 4) + ")", color: "#6ee7b7" },
        { name: "e_entry", value: fmtHex(e_entry, is64 ? 16 : 8), color: "#fbbf24" },
        { name: "e_phoff", value: fmtHex(e_phoff, is64 ? 16 : 8), color: "#93c5fd" },
        { name: "e_shoff", value: fmtHex(e_shoff, is64 ? 16 : 8), color: "#f9a8d4" },
        { name: "e_phnum", value: String(e_phnum), color: "#93c5fd" },
        { name: "e_shnum", value: String(e_shnum), color: "#f9a8d4" },
        { name: "e_shstrndx", value: String(e_shstrndx), color: "#f9a8d4" }
    ], 2) + '</div>';
    cardsHtml += _card("#10b981", ehC);

    // Arrow: two pointers
    cardsHtml += '<div style="display:flex;flex-direction:column;align-items:center;margin:2px 0">' +
        '<div style="width:1px;height:10px;background:rgba(16,185,129,0.3)"></div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);padding:1px 6px;border-radius:3px;background:var(--color-bg-panel);border:1px solid var(--color-border)">e_phoff \u2192 ' + fmtHex(e_phoff, 4) + '</div>' +
        '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);padding:1px 6px;border-radius:3px;background:var(--color-bg-panel);border:1px solid var(--color-border)">e_shoff \u2192 ' + fmtHex(e_shoff, 4) + '</div>' +
        '</div><div style="width:1px;height:10px;background:rgba(59,130,246,0.3)"></div>' +
        '<div style="font-size:9px;color:var(--color-text-muted);line-height:1">\u25BC</div></div>';

    // 2) Two-column: Program Headers + Section Headers
    cardsHtml += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    var PT_COLORS = { 1: "#22d3ee", 2: "#f59e0b", 3: "#a855f7", 6: "#3b82f6",
        0x6474E550: "#94a3b8", 0x6474E551: "#ef4444", 0x6474E552: "#10b981", 0x6474E553: "#6366f1" };

    if (e_phnum > 0) {
        var phC = _cardHdr("\u25E7", "#3b82f6", "Program Headers (Phdr)",
            e_phnum + " entries \xB7 " + e_phentsize + "B each \xB7 Runtime view",
            null, e_phoff + ":" + (e_phnum * e_phentsize));
        phC += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:5px">';
        for (var _pi = 0; _pi < phdrs.length; _pi++) {
            var ph = phdrs[_pi];
            var ptN = PT_TYPES[ph.type] || ("PT_" + fmtHex(ph.type, 8));
            var ptC = PT_COLORS[ph.type] || "#94a3b8";
            var ptR = _hexRgb(ptC);
            phC += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;' +
                'background:rgba(' + ptR[0] + ',' + ptR[1] + ',' + ptR[2] + ',0.04);' +
                'border:1px solid rgba(' + ptR[0] + ',' + ptR[1] + ',' + ptR[2] + ',0.12)"' +
                (ph.filesz > 0 ? ' data-hf-select="' + ph.offset + ':' + ph.filesz + '"' : '') + '>' +
                '<div style="width:3px;height:28px;border-radius:2px;background:rgba(' + ptR[0] + ',' + ptR[1] + ',' + ptR[2] + ',0.6);flex-shrink:0"></div>' +
                '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;justify-content:space-between">' +
                '<span style="font-size:11px;font-family:var(--font-mono);font-weight:700;color:' + ptC + '">' + ptN + '</span>' +
                '<span style="font-size:9px;font-family:var(--font-mono);padding:1px 5px;border-radius:3px;background:rgba(' + ptR[0] + ',' + ptR[1] + ',' + ptR[2] + ',0.1);color:' + ptC + '">' + _phdrFlags(ph.flags) + '</span></div>';
            if (ph.type === 3 && interpStr) {
                phC += '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);margin-top:2px">' + interpStr + '</div>';
            } else if (ph.type === 0x6474E551) {
                phC += '<div style="font-size:9px;font-family:var(--font-mono);color:' + ((ph.flags & 1) ? '#f87171' : 'var(--color-text-muted)') + ';margin-top:2px">Stack' + ((ph.flags & 1) ? ' \u2014 executable!' : '') + '</div>';
            } else {
                phC += '<div style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted);margin-top:2px">' +
                    fmtHex(ph.offset, 8) + ' \xB7 VA: ' + fmtHex(ph.vaddr, is64 ? 12 : 8) + ' \xB7 ' + _fmtSz(ph.filesz) + '</div>';
            }
            if (ph.type === 1 && fileSize > 0) {
                var bW = Math.max(3, Math.min(100, (ph.filesz / fileSize) * 100 * 3));
                phC += '<div style="height:4px;border-radius:2px;margin-top:3px;background:linear-gradient(90deg,' + ptC + ',rgba(' + ptR[0] + ',' + ptR[1] + ',' + ptR[2] + ',0.3));width:' + bW.toFixed(0) + '%"></div>';
            }
            phC += '</div></div>';
        }
        phC += '</div>';
        cardsHtml += '<div style="flex:1 1 200px;min-width:200px">' + _card("#3b82f6", phC) + '</div>';
    }

    if (e_shnum > 0) {
        var shC = _cardHdr("\u25A6", "#ec4899", "Section Headers (Shdr)",
            e_shnum + " entries \xB7 " + e_shentsize + "B each \xB7 Link-time view",
            null, e_shoff + ":" + (e_shnum * e_shentsize));
        shC += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">';
        var maxSec = Math.min(sections.length, 15);
        for (var _si2 = 1; _si2 < maxSec; _si2++) {
            var _s = sections[_si2];
            var sc = getSecColor(_s.name, _si2);
            var scR = _hexRgb(sc);
            var shtN = SHT_TYPES[_s.type] || ("SHT_" + fmtHex(_s.type, 8));
            shC += '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;' +
                'background:rgba(' + scR[0] + ',' + scR[1] + ',' + scR[2] + ',0.04);' +
                'border:1px solid rgba(' + scR[0] + ',' + scR[1] + ',' + scR[2] + ',0.12)"' +
                (_s.offset > 0 && _s.size > 0 && _s.type !== 8 ? ' data-hf-select="' + _s.offset + ':' + _s.size + '"' : '') + '>' +
                '<div style="width:3px;height:24px;border-radius:2px;background:rgba(' + scR[0] + ',' + scR[1] + ',' + scR[2] + ',0.6);flex-shrink:0"></div>' +
                '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;justify-content:space-between">' +
                '<span style="font-size:11px;font-family:var(--font-mono);font-weight:700;color:' + sc + '">' + _s.name + '</span>' +
                '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">' + shtN + '</span></div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">' +
                '<span style="font-size:9px;font-family:var(--font-mono);color:var(--color-text-muted)">Off: ' + fmtHex(_s.offset, 8) + ' \xB7 ' + _fmtSz(_s.size) + '</span>';
            var sfS = _secFlags(_s.flags);
            if (sfS !== "-") {
                shC += '<span style="font-size:8px;font-family:var(--font-mono);padding:1px 4px;border-radius:3px;background:rgba(' + scR[0] + ',' + scR[1] + ',' + scR[2] + ',0.1);color:' + sc + '">' + sfS + '</span>';
            }
            shC += '</div>';
            if (_s.size > 0 && _s.type !== 8 && fileSize > 0) {
                var bW2 = Math.max(3, Math.min(100, (_s.size / fileSize) * 100 * 5));
                shC += '<div style="height:3px;border-radius:2px;margin-top:2px;background:linear-gradient(90deg,' + sc + ',rgba(' + scR[0] + ',' + scR[1] + ',' + scR[2] + ',0.3));width:' + bW2.toFixed(0) + '%"></div>';
            }
            shC += '</div></div>';
        }
        if (sections.length > 15) {
            shC += '<div style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);text-align:center;padding:4px">+' + (sections.length - 15) + ' more...</div>';
        }
        shC += '</div>';
        cardsHtml += '<div style="flex:1 1 200px;min-width:200px">' + _card("#ec4899", shC) + '</div>';
    }
    cardsHtml += '</div>';

    // 3) .dynamic Card
    if (dynamicEntries.length > 0) {
        cardsHtml += _arrow(null, "#ec4899", "#f59e0b");
        var dynC = _cardHdr("\u2699", "#f59e0b", ".dynamic \u2014 Dynamic Linking",
            dynamicEntries.length + " entries \xB7 Libraries, symbols, relocations",
            null, dynamicSec ? (dynamicSec.offset + ":" + dynamicSec.size) : null);
        dynC += '<div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">';
        dynC += '<div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:9px;font-family:var(--font-mono);color:rgba(245,158,11,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Key Entries</div>';
        var keyC = 0;
        for (var _de = 0; _de < dynamicEntries.length && keyC < 8; _de++) {
            var de = dynamicEntries[_de];
            if (de.tag === 1) {
                var ln = (dynstrtab && de.val < dynstrtab.length) ? readStr(dynstrtab, de.val, 256) : fmtHex(de.val, 8);
                dynC += '<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:var(--font-mono)">' +
                    '<span style="width:5px;height:5px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span>' +
                    '<span style="color:var(--color-text-muted);width:70px;flex-shrink:0">DT_NEEDED</span>' +
                    '<span style="color:#fbbf24">' + ln + '</span></div>';
                keyC++;
            } else if (de.tag === 5 || de.tag === 6 || de.tag === 14) {
                dynC += '<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:var(--font-mono)">' +
                    '<span style="width:5px;height:5px;border-radius:50%;background:#94a3b8;flex-shrink:0"></span>' +
                    '<span style="color:var(--color-text-muted);width:70px;flex-shrink:0">' + de.tagName + '</span>' +
                    '<span style="color:var(--color-text)">' + fmtHex(de.val, 8) + '</span></div>';
                keyC++;
            }
        }
        dynC += '</div>';
        dynC += '<div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:9px;font-family:var(--font-mono);color:rgba(245,158,11,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Relocations</div>';
        var relC = 0;
        for (var _de2 = 0; _de2 < dynamicEntries.length && relC < 6; _de2++) {
            var de2 = dynamicEntries[_de2];
            if (de2.tag === 7 || de2.tag === 17 || de2.tag === 23 || de2.tag === 3) {
                dynC += '<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:var(--font-mono)">' +
                    '<span style="width:5px;height:5px;border-radius:50%;background:#fbbf24;flex-shrink:0"></span>' +
                    '<span style="color:var(--color-text-muted);width:70px;flex-shrink:0">' + de2.tagName + '</span>' +
                    '<span style="color:#fde68a">' + fmtHex(de2.val, 8) + '</span></div>';
                relC++;
            }
        }
        dynC += '</div></div>';
        cardsHtml += _card("#f59e0b", dynC);
    }

    // 4) Symbol Table Card
    var notableSyms = [];
    for (var _ss = 0; _ss < allSymbols.length; _ss++) {
        var sym = allSymbols[_ss];
        if (sym.name && sym.name.length > 0 && sym.type !== "NOTYPE" && sym.type !== "SECTION" && sym.type !== "FILE") notableSyms.push(sym);
    }
    if (notableSyms.length > 0) {
        cardsHtml += _arrow(null, dynamicEntries.length > 0 ? "#f59e0b" : "#ec4899", "#a855f7");
        var symC = _cardHdr("\u0192", "#a855f7", ".symtab + .dynsym \u2014 Symbols",
            (dynSymbols.length + staticSymbols.length) + " symbols \xB7 Functions, globals, imports", null, null);
        symC += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">';
        var maxSym = Math.min(notableSyms.length, 12);
        for (var _ssi = 0; _ssi < maxSym; _ssi++) {
            var s = notableSyms[_ssi];
            var isUnd = (s.shndx === 0);
            var sClr = isUnd ? "#f87171" : (s.type === "FUNC" ? "#a78bfa" : "#94a3b8");
            var sBg = isUnd ? "rgba(248,113,113,0.04)" : "rgba(167,139,250,0.04)";
            var sBd = isUnd ? "rgba(248,113,113,0.1)" : "rgba(167,139,250,0.1)";
            var bClr = s.bind === "GLOBAL" ? "#34d399" : (s.bind === "WEAK" ? "#fbbf24" : "#94a3b8");
            var bBg = s.bind === "GLOBAL" ? "rgba(52,211,153,0.1)" : (s.bind === "WEAK" ? "rgba(251,191,36,0.1)" : "rgba(100,116,139,0.1)");
            symC += '<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;background:' + sBg + ';border:1px solid ' + sBd + ';font-size:11px;font-family:var(--font-mono)">' +
                '<span style="color:' + (isUnd ? '#f87171' : '#34d399') + ';width:35px;text-align:right;flex-shrink:0">' + s.type + '</span>' +
                '<span style="color:' + sClr + ';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + s.name + '</span>' +
                '<span style="color:var(--color-text-muted);flex-shrink:0">' + (isUnd ? "UND" : fmtHex(s.value, is64 ? 12 : 8)) + '</span>' +
                '<span style="padding:1px 4px;border-radius:3px;background:' + bBg + ';color:' + bClr + ';font-size:9px;flex-shrink:0">' + (isUnd ? "IMPORT" : s.bind) + '</span></div>';
        }
        if (notableSyms.length > 12) {
            symC += '<div style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);text-align:center;padding:4px">+' + (notableSyms.length - 12) + ' more...</div>';
        }
        symC += '</div>';
        cardsHtml += _card("#a855f7", symC);
    }

    // ═══ RIGHT: Insight Panel ═══
    var _st = function(t) { return '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">' + t + '</div>'; };
    var _dv = '<div style="height:1px;background:var(--color-border);margin:12px 0"></div>';
    var ins = "";

    ins += '<div style="padding:4px 0">' + _st("Binary Summary") + '<div style="display:flex;flex-direction:column;gap:6px">';
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(16,185,129,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#10b981;flex-shrink:0">\u25CE</div>' +
        '<div><div style="font-size:12px;color:#10b981;font-weight:600">' + (is64 ? "ELF64" : "ELF32") + ' \xB7 ' + machName + '</div><div style="color:var(--color-text-muted);font-size:10px">' + typeDesc + '</div></div></div>';
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(96,165,250,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#60a5fa;flex-shrink:0">\u25C8</div>' +
        '<div><div style="font-size:12px;color:#60a5fa;font-weight:600">' + (ELF_OSABI[eiOsabi] || "Unknown") + '</div><div style="color:var(--color-text-muted);font-size:10px">OS/ABI: ' + fmtHex(eiOsabi, 2) + '</div></div></div>';
    ins += '<div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;border-radius:5px;background:rgba(251,191,36,0.12);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fbbf24;flex-shrink:0">\u25B6</div>' +
        '<div><div style="font-size:12px;color:#fbbf24;font-weight:600">Entry: ' + fmtHex(e_entry, is64 ? 12 : 8) + '</div><div style="color:var(--color-text-muted);font-size:10px">' + (interpStr ? "Dynamic" : "Static") + ' linking</div></div></div>';
    ins += '</div></div>' + _dv;

    ins += '<div style="padding:4px 0">' + _st("Security Checks") + '<div style="display:flex;flex-direction:column;gap:3px">';
    var cks = [
        { n: "NX (Stack)", on: nxEnabled, d: nxEnabled ? "ENABLED" : "DISABLED" },
        { n: "PIE", on: isPIE, d: isPIE ? "ENABLED" : "DISABLED" },
        { n: "Stack Canary", on: hasCanary, d: hasCanary ? "FOUND" : "NOT FOUND" },
        { n: "RELRO", on: relroLevel !== "NONE", d: relroLevel }
    ];
    for (var _fi = 0; _fi < cks.length; _fi++) {
        var ck = cks[_fi];
        ins += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:4px;background:' + (ck.on ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)') + ';border:1px solid ' + (ck.on ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)') + '">' +
            '<div style="display:flex;align-items:center;gap:4px"><span style="font-size:10px;color:' + (ck.on ? '#34d399' : '#ef4444') + ';font-weight:700">' + (ck.on ? '\u2713' : '\u2715') + '</span>' +
            '<span style="font-size:10px;color:' + (ck.on ? '#6ee7b7' : '#fca5a5') + '">' + ck.n + '</span></div>' +
            '<span style="font-size:9px;font-family:var(--font-mono);color:' + (ck.on ? '#34d399' : '#ef4444') + '">' + ck.d + '</span></div>';
    }
    ins += '</div></div>' + _dv;

    ins += '<div style="padding:4px 0">' + _st("File Composition");
    var hdrT = ehdrSize + (e_phnum > 0 ? e_phnum * e_phentsize : 0) + (e_shnum > 0 ? e_shnum * e_shentsize : 0);
    var codeT = 0, dataT = 0, otherT = 0;
    for (var _ci = 1; _ci < sections.length; _ci++) {
        var _s2 = sections[_ci]; if (_s2.type === 8 || _s2.size === 0) continue;
        var lo = _s2.name.toLowerCase();
        if (lo === ".text" || lo === ".init" || lo === ".fini" || lo === ".plt" || lo === ".plt.got") codeT += _s2.size;
        else if (lo === ".data" || lo === ".rodata" || lo === ".data.rel.ro" || lo === ".got" || lo === ".got.plt") dataT += _s2.size;
        else otherT += _s2.size;
    }
    var comp = [{ l: "Headers", s: hdrT, c: "#10b981", c2: "#059669" }, { l: "Code", s: codeT, c: "#22d3ee", c2: "#0891b2" },
        { l: "Data", s: dataT, c: "#eab308", c2: "#a16207" }, { l: "Other", s: otherT, c: "#94a3b8", c2: "#64748b" }];
    ins += '<div style="display:flex;flex-direction:column;gap:5px">';
    for (var _cj = 0; _cj < comp.length; _cj++) {
        var it = comp[_cj]; if (it.s === 0) continue;
        var pct = (it.s / fileSize * 100); var pctS = pct >= 1 ? pct.toFixed(1) : pct.toFixed(2);
        ins += '<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:' + it.c + ';font-family:var(--font-mono)">' + it.l + '</span>' +
            '<span style="color:var(--color-text-muted);font-family:var(--font-mono)">' + _fmtSz(it.s) + ' (' + pctS + '%)</span></div>' +
            '<div style="height:5px;border-radius:3px;background:linear-gradient(90deg,' + it.c + ',' + it.c2 + ');width:' + Math.max(3, Math.min(100, pct)).toFixed(0) + '%"></div></div>';
    }
    ins += '</div></div>';

    if (neededLibs.length > 0) {
        ins += _dv + '<div style="padding:4px 0">' + _st("Libraries (" + neededLibs.length + ")") + '<div style="display:flex;flex-direction:column;gap:2px">';
        for (var _li = 0; _li < Math.min(neededLibs.length, 8); _li++) {
            ins += '<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:var(--font-mono)"><span style="width:5px;height:5px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span><span style="color:var(--color-text)">' + neededLibs[_li] + '</span></div>';
        }
        if (neededLibs.length > 8) ins += '<div style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);padding-left:10px">+' + (neededLibs.length - 8) + ' more...</div>';
        ins += '</div></div>';
    }

    return '<div style="display:flex;height:100%;user-select:none">' +
        '<div style="width:52px;flex-shrink:0;display:flex;flex-direction:column;gap:1.5px;padding:4px;background:var(--color-bg-secondary);border-right:1px solid var(--color-border);overflow-y:auto">' + mapHtml + '</div>' +
        '<div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start">' +
        '<div style="flex:1 1 200px;min-width:200px;display:flex;flex-direction:column">' + cardsHtml + '</div>' +
        '<div style="flex:0 0 210px;display:flex;flex-direction:column;gap:0;border-left:1px solid var(--color-border);padding-left:10px">' + ins + '</div></div></div>';
}

await hf.template.setView(_renderView());
await hf.template.end();
