// HexForge JS Template - ELF.js
// Purpose: ELF (Executable and Linkable Format) — ELF32 / ELF64
// Author: Kei Choi (hanul93@gmail.com)
// Category: Executable
// ID Bytes: 7F 45 4C 46 (\x7fELF)
// Reference: System V ABI, [elf(5)]

var fileSize = await hf.fileSize;

hf.template.begin("ELF (Executable and Linkable Format)");
hf.template.setFormat("elf", "ELF Binary", [".elf", ".so", ".o", ".ko", ""]);

if (fileSize < 16) {
    hf.error("Not an ELF file (too small)");
    await hf.template.end();
    throw new Error("Invalid ELF");
}

var magic = await hf.read(0, 16);
if (magic[0] !== 0x7F || magic[1] !== 0x45 || magic[2] !== 0x4C || magic[3] !== 0x46) {
    hf.error("Not an ELF file (bad magic)");
    await hf.template.end();
    throw new Error("Invalid ELF");
}

// ── Helpers ──────────────────────────────────
function fmtHex(v, n) { return "0x" + v.toString(16).toUpperCase().padStart(n, "0"); }
function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
}

// Endian-aware readers
var isLE = true; // set after parsing ei_data
function u16(buf, off) {
    return isLE ? (buf[off] | (buf[off+1] << 8)) : ((buf[off] << 8) | buf[off+1]);
}
function u32(buf, off) {
    if (isLE) return (buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16) | (buf[off+3] << 24)) >>> 0;
    return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}
function u64(buf, off) {
    if (isLE) {
        var lo = u32(buf, off);
        var hi = u32(buf, off + 4);
        return hi * 0x100000000 + lo;
    } else {
        var hi = u32(buf, off);
        var lo = u32(buf, off + 4);
        return hi * 0x100000000 + lo;
    }
}

// ── Lookup tables ────────────────────────────
var EI_CLASS = { 1: "ELF32", 2: "ELF64" };
var EI_DATA = { 1: "LSB (Little-endian)", 2: "MSB (Big-endian)" };
var EI_OSABI = {
    0: "UNIX System V", 1: "HP-UX", 2: "NetBSD", 3: "Linux",
    6: "Solaris", 7: "AIX", 8: "IRIX", 9: "FreeBSD",
    10: "Tru64", 11: "Novell Modesto", 12: "OpenBSD",
    64: "ARM EABI", 97: "ARM", 255: "Standalone"
};
var E_TYPE = { 0: "NONE", 1: "REL (Relocatable)", 2: "EXEC (Executable)",
    3: "DYN (Shared object)", 4: "CORE (Core dump)" };
var E_MACHINE = {
    0:"None",2:"SPARC",3:"x86 (i386)",4:"M68K",5:"M88K",7:"Intel 80860",8:"MIPS",
    15:"HP PA-RISC",20:"PowerPC",21:"PowerPC64",22:"S/390",40:"ARM",
    42:"SuperH",43:"SPARC V9",50:"IA-64",62:"x86-64 (AMD64)",
    183:"AArch64",243:"RISC-V",247:"eBPF",258:"LoongArch"
};
var PT_TYPE = {
    0:"NULL",1:"LOAD",2:"DYNAMIC",3:"INTERP",4:"NOTE",5:"SHLIB",
    6:"PHDR",7:"TLS",
    0x6474E550:"GNU_EH_FRAME",0x6474E551:"GNU_STACK",
    0x6474E552:"GNU_RELRO",0x6474E553:"GNU_PROPERTY",
    0x70000001:"ARM_EXIDX"
};
var SHT_TYPE = {
    0:"NULL",1:"PROGBITS",2:"SYMTAB",3:"STRTAB",4:"RELA",5:"HASH",
    6:"DYNAMIC",7:"NOTE",8:"NOBITS",9:"REL",10:"SHLIB",11:"DYNSYM",
    14:"INIT_ARRAY",15:"FINI_ARRAY",16:"PREINIT_ARRAY",17:"GROUP",
    18:"SYMTAB_SHNDX",
    0x6FFFFFF6:"GNU_HASH",0x6FFFFFFD:"VERDEF",
    0x6FFFFFFE:"VERNEED",0x6FFFFFFF:"VERSYM",
    0x70000001:"ARM_EXIDX",0x70000003:"ARM_ATTRIBUTES"
};
var DT_TAG = {
    0:"NULL",1:"NEEDED",2:"PLTRELSZ",3:"PLTGOT",4:"HASH",
    5:"STRTAB",6:"SYMTAB",7:"RELA",8:"RELASZ",9:"RELAENT",
    10:"STRSZ",11:"SYMENT",12:"INIT",13:"FINI",14:"SONAME",
    15:"RPATH",16:"SYMBOLIC",17:"REL",18:"RELSZ",19:"RELENT",
    20:"PLTREL",21:"DEBUG",22:"TEXTREL",23:"JMPREL",24:"BIND_NOW",
    25:"INIT_ARRAY",26:"FINI_ARRAY",27:"INIT_ARRAYSZ",28:"FINI_ARRAYSZ",
    29:"RUNPATH",30:"FLAGS",
    0x6FFFFEF5:"GNU_HASH",0x6FFFFFFB:"FLAGS_1",
    0x6FFFFFFE:"VERNEED",0x6FFFFFFF:"VERNEEDNUM"
};

// ── Colors ───────────────────────────────────
var CLR = {
    HDR:     "#2196F3",
    IDENT:   "#4CAF50",
    PHDR:    "#FF9800",
    SHDR:    "#9C27B0",
    TEXT:    "#F44336",
    DATA:    "#00BCD4",
    DYN:     "#E91E63",
    NOTE:    "#795548",
    INTERP:  "#009688",
    STRTAB:  "#CDDC39",
    SYM:     "#3F51B5",
    LOAD:    "#FF5722",
    BSS:     "#607D8B",
    GREY:    "#9E9E9E",
};

// ── Parse ELF Header (e_ident + rest) ────────
var ei_class = magic[4];
var ei_data = magic[5];
var is64 = ei_class === 2;
isLE = ei_data === 1;

var ehSize = is64 ? 64 : 52;
if (fileSize < ehSize) {
    hf.error("ELF header truncated");
    await hf.template.end();
    throw new Error("Truncated ELF");
}

var ehBuf = await hf.read(0, ehSize);

var e_type, e_machine, e_version, e_entry, e_phoff, e_shoff;
var e_flags, e_ehsize, e_phentsize, e_phnum, e_shentsize, e_shnum, e_shstrndx;

if (is64) {
    e_type = u16(ehBuf, 16); e_machine = u16(ehBuf, 18); e_version = u32(ehBuf, 20);
    e_entry = u64(ehBuf, 24); e_phoff = u64(ehBuf, 32); e_shoff = u64(ehBuf, 40);
    e_flags = u32(ehBuf, 48); e_ehsize = u16(ehBuf, 52);
    e_phentsize = u16(ehBuf, 54); e_phnum = u16(ehBuf, 56);
    e_shentsize = u16(ehBuf, 58); e_shnum = u16(ehBuf, 60); e_shstrndx = u16(ehBuf, 62);
} else {
    e_type = u16(ehBuf, 16); e_machine = u16(ehBuf, 18); e_version = u32(ehBuf, 20);
    e_entry = u32(ehBuf, 24); e_phoff = u32(ehBuf, 28); e_shoff = u32(ehBuf, 32);
    e_flags = u32(ehBuf, 36); e_ehsize = u16(ehBuf, 40);
    e_phentsize = u16(ehBuf, 42); e_phnum = u16(ehBuf, 44);
    e_shentsize = u16(ehBuf, 46); e_shnum = u16(ehBuf, 48); e_shstrndx = u16(ehBuf, 50);
}

var classStr = EI_CLASS[ei_class] || "?";
var dataStr = EI_DATA[ei_data] || "?";
var osabiStr = EI_OSABI[magic[7]] || ("0x" + magic[7].toString(16));
var typeStr = E_TYPE[e_type] || ("0x" + e_type.toString(16));
var machineStr = E_MACHINE[e_machine] || ("0x" + e_machine.toString(16));

// ── Emit ELF Header ──────────────────────────
hf.template.seek(0);
hf.template.beginStruct("ELF_Header");

// e_ident[16]
hf.template.beginStruct("e_ident");
await hf.template.addField("ei_magic", "bytes:4", { color: CLR.HDR, display: "\\x7fELF" });
await hf.template.addField("ei_class", "u8", { color: CLR.IDENT, display: classStr });
await hf.template.addField("ei_data", "u8", { color: CLR.IDENT, display: dataStr });
await hf.template.addField("ei_version", "u8", { color: CLR.IDENT, display: magic[6] === 1 ? "1 (Current)" : String(magic[6]) });
await hf.template.addField("ei_osabi", "u8", { color: CLR.IDENT, display: osabiStr });
await hf.template.addField("ei_abiversion", "u8", { color: CLR.GREY });
await hf.template.addField("ei_pad", "bytes:7", { color: CLR.GREY });
hf.template.endStruct();

await hf.template.addField("e_type", "u16", { color: CLR.HDR, display: typeStr });
await hf.template.addField("e_machine", "u16", { color: CLR.HDR, display: machineStr });
await hf.template.addField("e_version", "u32", { color: CLR.HDR });

if (is64) {
    await hf.template.addField("e_entry", "u64", { color: CLR.HDR, display: fmtHex(e_entry, 16) });
    await hf.template.addField("e_phoff", "u64", { color: CLR.PHDR, display: fmtHex(e_phoff, 16) + " → Program Headers" });
    await hf.template.addField("e_shoff", "u64", { color: CLR.SHDR, display: fmtHex(e_shoff, 16) + " → Section Headers" });
} else {
    await hf.template.addField("e_entry", "u32", { color: CLR.HDR, display: fmtHex(e_entry, 8) });
    await hf.template.addField("e_phoff", "u32", { color: CLR.PHDR, display: fmtHex(e_phoff, 8) + " → Program Headers" });
    await hf.template.addField("e_shoff", "u32", { color: CLR.SHDR, display: fmtHex(e_shoff, 8) + " → Section Headers" });
}

await hf.template.addField("e_flags", "u32", { color: CLR.HDR, display: fmtHex(e_flags, 8) });
await hf.template.addField("e_ehsize", "u16", { color: CLR.HDR, display: e_ehsize + " bytes" });
await hf.template.addField("e_phentsize", "u16", { color: CLR.PHDR, display: e_phentsize + " bytes" });
await hf.template.addField("e_phnum", "u16", { color: CLR.PHDR, display: e_phnum + " program headers" });
await hf.template.addField("e_shentsize", "u16", { color: CLR.SHDR, display: e_shentsize + " bytes" });
await hf.template.addField("e_shnum", "u16", { color: CLR.SHDR, display: e_shnum + " section headers" });
await hf.template.addField("e_shstrndx", "u16", { color: CLR.STRTAB, display: "section " + e_shstrndx + " (.shstrtab)" });

hf.template.endStruct();

// ── Read shstrtab for section names ──────────
var shstrtab = null;
if (e_shstrndx > 0 && e_shstrndx < e_shnum && e_shoff > 0) {
    var strtabHdrOff = e_shoff + e_shstrndx * e_shentsize;
    if (strtabHdrOff + e_shentsize <= fileSize) {
        var stBuf = await hf.read(strtabHdrOff, e_shentsize);
        var stOff, stSize;
        if (is64) { stOff = u64(stBuf, 24); stSize = u64(stBuf, 32); }
        else { stOff = u32(stBuf, 16); stSize = u32(stBuf, 20); }
        if (stOff + stSize <= fileSize && stSize < 1048576) {
            shstrtab = await hf.read(stOff, stSize);
        }
    }
}

function getStr(strtab, idx) {
    if (!strtab || idx >= strtab.length) return "";
    var end = idx;
    while (end < strtab.length && strtab[end] !== 0) end++;
    var bytes = strtab.slice(idx, end);
    return String.fromCharCode.apply(null, bytes);
}

// ── Program Headers ──────────────────────────
if (e_phoff > 0 && e_phnum > 0 && e_phoff + e_phnum * e_phentsize <= fileSize) {
    hf.template.seek(e_phoff);
    hf.template.beginStruct("Program_Headers");

    for (var i = 0; i < e_phnum; i++) {
        var phOff = e_phoff + i * e_phentsize;
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

        var ptName = PT_TYPE[p_type] || fmtHex(p_type, 8);
        var pflags = (p_flags & 4 ? "R" : "-") + (p_flags & 2 ? "W" : "-") + (p_flags & 1 ? "X" : "-");
        var phColor = CLR.PHDR;
        if (p_type === 1) phColor = CLR.LOAD;
        else if (p_type === 2) phColor = CLR.DYN;
        else if (p_type === 3) phColor = CLR.INTERP;
        else if (p_type === 4) phColor = CLR.NOTE;

        var phDisplay = ptName + " " + pflags + " off=" + fmtHex(p_offset, is64 ? 16 : 8) +
            " vaddr=" + fmtHex(p_vaddr, is64 ? 16 : 8) +
            " fsz=" + fmtSize(p_filesz) + " msz=" + fmtSize(p_memsz);

        // Read INTERP content
        if (p_type === 3 && p_filesz > 0 && p_filesz < 256 && p_offset + p_filesz <= fileSize) {
            var interpBuf = await hf.read(p_offset, p_filesz);
            var interp = "";
            for (var ci = 0; ci < interpBuf.length && interpBuf[ci] !== 0; ci++)
                interp += String.fromCharCode(interpBuf[ci]);
            phDisplay += ' "' + interp + '"';
        }

        hf.template.seek(phOff);
        hf.template.beginStruct("PH_" + i + "_" + ptName);
        await hf.template.addField("phdr", "bytes:" + e_phentsize, { color: phColor, display: phDisplay });
        hf.template.endStruct();
    }

    hf.template.endStruct();
}

// ── Section Headers ──────────────────────────
var sections = [];
if (e_shoff > 0 && e_shnum > 0 && e_shoff + e_shnum * e_shentsize <= fileSize) {
    // First collect section data
    for (var i = 0; i < e_shnum; i++) {
        var shOff = e_shoff + i * e_shentsize;
        var shBuf = await hf.read(shOff, e_shentsize);

        var sh_name, sh_type, sh_flags, sh_addr, sh_offset, sh_size;
        var sh_link, sh_info, sh_addralign, sh_entsize;
        if (is64) {
            sh_name = u32(shBuf, 0); sh_type = u32(shBuf, 4);
            sh_flags = u64(shBuf, 8); sh_addr = u64(shBuf, 16);
            sh_offset = u64(shBuf, 24); sh_size = u64(shBuf, 32);
            sh_link = u32(shBuf, 40); sh_info = u32(shBuf, 44);
            sh_addralign = u64(shBuf, 48); sh_entsize = u64(shBuf, 56);
        } else {
            sh_name = u32(shBuf, 0); sh_type = u32(shBuf, 4);
            sh_flags = u32(shBuf, 8); sh_addr = u32(shBuf, 12);
            sh_offset = u32(shBuf, 16); sh_size = u32(shBuf, 20);
            sh_link = u32(shBuf, 24); sh_info = u32(shBuf, 28);
            sh_addralign = u32(shBuf, 32); sh_entsize = u32(shBuf, 36);
        }

        var sname = getStr(shstrtab, sh_name);
        sections.push({
            name: sname, type: sh_type, flags: sh_flags, addr: sh_addr,
            offset: sh_offset, size: sh_size, link: sh_link, info: sh_info,
            addralign: sh_addralign, entsize: sh_entsize, hdrOff: shOff
        });
    }

    // Emit section header table
    hf.template.seek(e_shoff);
    hf.template.beginStruct("Section_Headers");

    for (var i = 0; i < e_shnum; i++) {
        var s = sections[i];
        var stName = SHT_TYPE[s.type] || fmtHex(s.type, 8);
        var sf = (s.flags & 1 ? "W" : "-") + (s.flags & 2 ? "A" : "-") + (s.flags & 4 ? "X" : "-");

        var shColor = CLR.SHDR;
        if (s.name === ".text" || s.name === ".init" || s.name === ".fini" ||
            s.name === ".plt" || s.name === ".plt.sec" || s.name === ".plt.got") shColor = CLR.TEXT;
        else if (s.name === ".data" || s.name === ".rodata" || s.name === ".data.rel.ro") shColor = CLR.DATA;
        else if (s.name === ".bss") shColor = CLR.BSS;
        else if (s.name === ".dynamic") shColor = CLR.DYN;
        else if (s.type === 7) shColor = CLR.NOTE; // NOTE
        else if (s.type === 3) shColor = CLR.STRTAB; // STRTAB
        else if (s.type === 2 || s.type === 11) shColor = CLR.SYM; // SYMTAB/DYNSYM
        else if (s.name === ".interp") shColor = CLR.INTERP;
        else if (s.type === 0) shColor = CLR.GREY;

        var shDisplay = (s.name || "(null)") + " " + stName + " " + sf +
            " off=" + fmtHex(s.offset, is64 ? 16 : 8) + " sz=" + fmtSize(s.size);

        hf.template.seek(s.hdrOff);
        hf.template.beginStruct("SH_" + i + "_" + (s.name || "NULL"));
        await hf.template.addField("shdr", "bytes:" + e_shentsize, { color: shColor, display: shDisplay });
        hf.template.endStruct();
    }

    hf.template.endStruct();

    // ── Mark section data regions ────────────
    // Sort sections by offset for marking
    var dataSections = sections.filter(function(s) {
        return s.offset > 0 && s.size > 0 && s.type !== 8 && s.offset + s.size <= fileSize;
    }).sort(function(a, b) { return a.offset - b.offset; });

    for (var i = 0; i < dataSections.length; i++) {
        var s = dataSections[i];
        // Skip if overlaps ELF header, PH table, or SH table
        if (s.offset < ehSize) continue;
        if (s.offset >= e_phoff && s.offset < e_phoff + e_phnum * e_phentsize) continue;
        if (s.offset >= e_shoff && s.offset < e_shoff + e_shnum * e_shentsize) continue;

        var secColor = CLR.GREY;
        if (s.name === ".text" || s.name === ".init" || s.name === ".fini" ||
            s.name === ".plt" || s.name === ".plt.sec" || s.name === ".plt.got") secColor = CLR.TEXT;
        else if (s.name === ".data" || s.name === ".rodata" || s.name === ".data.rel.ro" ||
                 s.name === ".got" || s.name === ".got.plt") secColor = CLR.DATA;
        else if (s.name === ".dynamic") secColor = CLR.DYN;
        else if (s.type === 7) secColor = CLR.NOTE;
        else if (s.type === 3) secColor = CLR.STRTAB;
        else if (s.type === 2 || s.type === 11) secColor = CLR.SYM;
        else if (s.type === 4 || s.type === 9) secColor = CLR.DYN; // RELA/REL
        else if (s.name === ".interp") secColor = CLR.INTERP;
        else if (s.name === ".eh_frame" || s.name === ".eh_frame_hdr") secColor = CLR.PHDR;
        else if (s.name.indexOf(".init_array") >= 0 || s.name.indexOf(".fini_array") >= 0) secColor = CLR.LOAD;

        var secDisplay = s.name + " (" + (SHT_TYPE[s.type] || "?") + ") " + fmtSize(s.size);

        // Deep parse: INTERP, NOTE, DYNAMIC
        if (s.name === ".interp" && s.size < 256) {
            var interpBuf = await hf.read(s.offset, s.size);
            var interp = "";
            for (var ci = 0; ci < interpBuf.length && interpBuf[ci] !== 0; ci++)
                interp += String.fromCharCode(interpBuf[ci]);
            secDisplay += ' → "' + interp + '"';
        }

        hf.template.seek(s.offset);
        hf.template.beginStruct("Section_" + (s.name || "s" + i));
        await hf.template.addField("data", "bytes:" + s.size, { color: secColor, display: secDisplay });
        hf.template.endStruct();
    }
}

// ── Log summary ──────────────────────────────
hf.log("ELF Binary");
hf.log("  " + classStr + " " + dataStr);
hf.log("  Type: " + typeStr);
hf.log("  Machine: " + machineStr);
hf.log("  Entry point: " + fmtHex(e_entry, is64 ? 16 : 8));
hf.log("  Flags: " + fmtHex(e_flags, 8));

hf.log("\n  Program Headers (" + e_phnum + ") at " + fmtHex(e_phoff, is64 ? 16 : 8) + ":");
if (e_phoff > 0 && e_phnum > 0) {
    for (var i = 0; i < e_phnum; i++) {
        var phOff = e_phoff + i * e_phentsize;
        if (phOff + e_phentsize > fileSize) break;
        var phBuf = await hf.read(phOff, e_phentsize);
        var p_type, p_flags, p_offset, p_vaddr, p_filesz, p_memsz;
        if (is64) {
            p_type = u32(phBuf, 0); p_flags = u32(phBuf, 4);
            p_offset = u64(phBuf, 8); p_vaddr = u64(phBuf, 16);
            p_filesz = u64(phBuf, 32); p_memsz = u64(phBuf, 40);
        } else {
            p_type = u32(phBuf, 0); p_offset = u32(phBuf, 4);
            p_vaddr = u32(phBuf, 8); p_filesz = u32(phBuf, 16);
            p_memsz = u32(phBuf, 20); p_flags = u32(phBuf, 24);
        }
        var ptName = PT_TYPE[p_type] || fmtHex(p_type, 8);
        var pflags = (p_flags & 4 ? "R" : "-") + (p_flags & 2 ? "W" : "-") + (p_flags & 1 ? "X" : "-");
        hf.log("    [" + i + "] " + ptName + " " + pflags +
            " off=" + fmtHex(p_offset, 8) + " vaddr=" + fmtHex(p_vaddr, is64 ? 16 : 8) +
            " fsz=" + fmtSize(p_filesz) + " msz=" + fmtSize(p_memsz));
    }
}

hf.log("\n  Section Headers (" + e_shnum + ") at " + fmtHex(e_shoff, is64 ? 16 : 8) + ":");
for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    var stName = SHT_TYPE[s.type] || fmtHex(s.type, 8);
    var sf = (s.flags & 1 ? "W" : "-") + (s.flags & 2 ? "A" : "-") + (s.flags & 4 ? "X" : "-");
    hf.log("    [" + (i < 10 ? " " : "") + i + "] " +
        (s.name || "").padEnd(22) + stName.padEnd(14) + " " + sf +
        " off=" + fmtHex(s.offset, 8) + " sz=" + fmtSize(s.size));
}

await hf.template.end();