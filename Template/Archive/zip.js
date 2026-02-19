// ZIP Archive Parser — HexForge JS Template
// Author: Kei Choi (hanul93@gmail.com)
// Category: Archive

hf.template.begin('ZIP Archive')
hf.template.setFormat('zip', 'ZIP Archive (JS)', ['.zip'])

// === Enum Maps ===

const COMPTYPE_MAP = {
  0: 'COMP_STORED',
  1: 'COMP_SHRUNK',
  2: 'COMP_REDUCED1',
  3: 'COMP_REDUCED2',
  4: 'COMP_REDUCED3',
  5: 'COMP_REDUCED4',
  6: 'COMP_IMPLODED',
  7: 'COMP_TOKEN',
  8: 'COMP_DEFLATE',
  9: 'COMP_DEFLATE64'
}

const HOSTSYSTEM_MAP = {
  0: 'MS-DOS/OS2',
  1: 'Amiga',
  2: 'OpenVMS',
  3: 'UNIX',
  4: 'VM/CMS',
  5: 'Atari ST',
  6: 'OS/2 HPFS',
  7: 'Macintosh',
  8: 'Z-System',
  9: 'CP/M',
  10: 'Windows NTFS',
  11: 'MVS',
  12: 'VSE',
  13: 'Acorn Risc',
  14: 'VFAT',
  15: 'Alternate MVS',
  16: 'BeOS',
  17: 'Tandem',
  18: 'OS/400',
  19: 'OS X (Darwin)'
}

// === Helpers ===

function decodeDosTime(raw) {
  const seconds = (raw & 0x1F) * 2
  const minutes = (raw >> 5) & 0x3F
  const hours = (raw >> 11) & 0x1F
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`
}

function decodeDosDate(raw) {
  const day = raw & 0x1F
  const month = (raw >> 5) & 0x0F
  const year = ((raw >> 9) & 0x7F) + 1980
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

async function readTag() {
  const pos = hf.template.tell()
  const b = await hf.read(pos, 4)
  return (b[0] | (b[1] << 8) | (b[2] << 16) | ((b[3] << 24) >>> 0)) >>> 0
}

// === Struct Parsers ===

async function parseVersionMadeBy(label) {
  hf.template.beginStruct(label)
    const version = await hf.template.addField('version', 'u8')
    const hostSystem = await hf.template.addField('hostSystem', 'u8', { enumMap: HOSTSYSTEM_MAP })
  hf.template.endStruct()
  return { version, hostSystem }
}

async function parseZipFileRecord(index) {
  hf.template.beginStruct(`ZIPFILERECORD [${index}]`)
    await hf.template.addField('frSignature', 'string:4', { color: '#ff8888' })
    await parseVersionMadeBy('frVersion')
    const frFlags = await hf.template.addField('frFlags', 'u16')
    await hf.template.addField('frCompression', 'i16', { enumMap: COMPTYPE_MAP })
    const frFileTimeRaw = await hf.template.addField('frFileTime', 'u16', { color: '#44cccc' })
    const frFileDateRaw = await hf.template.addField('frFileDate', 'u16', { color: '#44cccc' })
    await hf.template.addField('frCrc', 'u32', { color: '#ffcc44' })
    const frCompressedSize = await hf.template.addField('frCompressedSize', 'u32')
    const frUncompressedSize = await hf.template.addField('frUncompressedSize', 'u32')
    const frFileNameLength = await hf.template.addField('frFileNameLength', 'u16')
    const frExtraFieldLength = await hf.template.addField('frExtraFieldLength', 'u16')

    let frFileName = ''
    if (frFileNameLength > 0) {
      frFileName = await hf.template.addField('frFileName', `string:${frFileNameLength}`)
    }
    if (frExtraFieldLength > 0) {
      await hf.template.addField('frExtraField', `bytes:${frExtraFieldLength}`)
    }
    if (frCompressedSize > 0) {
      await hf.template.addField('frData', `bytes:${frCompressedSize}`, { color: '#88ff88' })
    }

    if (frFileName) {
      hf.log(`  File: ${frFileName} (${frCompressedSize} / ${frUncompressedSize} bytes, ${decodeDosDate(frFileDateRaw)} ${decodeDosTime(frFileTimeRaw)})`)
    }
  hf.template.endStruct()
}

async function parseZipDataDescr(index) {
  hf.template.beginStruct(`ZIPDATADESCR [${index}]`)
    await hf.template.addField('ddSignature', 'string:4', { color: '#4488ff' })
    await hf.template.addField('ddCRC', 'u32', { color: '#ffcc44' })
    await hf.template.addField('ddCompressedSize', 'u32')
    await hf.template.addField('ddUncompressedSize', 'u32')
  hf.template.endStruct()
}

async function parseZipDirEntry(index) {
  hf.template.beginStruct(`ZIPDIRENTRY [${index}]`)
    await hf.template.addField('deSignature', 'string:4', { color: '#ff88ff' })
    await parseVersionMadeBy('deVersionMadeBy')
    await hf.template.addField('deVersionToExtract', 'u16')
    await hf.template.addField('deFlags', 'u16')
    await hf.template.addField('deCompression', 'i16', { enumMap: COMPTYPE_MAP })
    const deFileTimeRaw = await hf.template.addField('deFileTime', 'u16', { color: '#44cccc' })
    const deFileDateRaw = await hf.template.addField('deFileDate', 'u16', { color: '#44cccc' })
    await hf.template.addField('deCrc', 'u32', { color: '#ffcc44' })
    await hf.template.addField('deCompressedSize', 'u32')
    await hf.template.addField('deUncompressedSize', 'u32')
    const deFileNameLength = await hf.template.addField('deFileNameLength', 'u16')
    const deExtraFieldLength = await hf.template.addField('deExtraFieldLength', 'u16')
    const deFileCommentLength = await hf.template.addField('deFileCommentLength', 'u16')
    await hf.template.addField('deDiskNumberStart', 'u16')
    await hf.template.addField('deInternalAttributes', 'u16')
    await hf.template.addField('deExternalAttributes', 'u32')
    await hf.template.addField('deHeaderOffset', 'u32')

    let deFileName = ''
    if (deFileNameLength > 0) {
      deFileName = await hf.template.addField('deFileName', `string:${deFileNameLength}`)
    }
    if (deExtraFieldLength > 0) {
      await hf.template.addField('deExtraField', `bytes:${deExtraFieldLength}`)
    }
    if (deFileCommentLength > 0) {
      await hf.template.addField('deFileComment', `bytes:${deFileCommentLength}`)
    }

    if (deFileName) {
      hf.log(`  Dir: ${deFileName} (${decodeDosDate(deFileDateRaw)} ${decodeDosTime(deFileTimeRaw)})`)
    }
  hf.template.endStruct()
}

async function parseZipDigitalSig(index) {
  hf.template.beginStruct(`ZIPDIGITALSIG [${index}]`)
    await hf.template.addField('dsSignature', 'string:4', { color: '#cc44cc' })
    const dsDataLength = await hf.template.addField('dsDataLength', 'u16')
    if (dsDataLength > 0) {
      await hf.template.addField('dsData', `bytes:${dsDataLength}`)
    }
  hf.template.endStruct()
}

async function parseZipEndLocator(index) {
  hf.template.beginStruct(`ZIPENDLOCATOR [${index}]`)
    await hf.template.addField('elSignature', 'string:4', { color: '#88ffff' })
    await hf.template.addField('elDiskNumber', 'u16')
    await hf.template.addField('elStartDiskNumber', 'u16')
    await hf.template.addField('elEntriesOnDisk', 'u16')
    const elEntriesInDirectory = await hf.template.addField('elEntriesInDirectory', 'u16')
    await hf.template.addField('elDirectorySize', 'u32')
    await hf.template.addField('elDirectoryOffset', 'u32')
    const elCommentLength = await hf.template.addField('elCommentLength', 'u16')
    if (elCommentLength > 0) {
      await hf.template.addField('elComment', `string:${elCommentLength}`)
    }
    hf.log(`  End of Central Directory: ${elEntriesInDirectory} entries`)
  hf.template.endStruct()
}

// === Main Parsing ===

const fileSize = await hf.fileSize
let recordCount = 0
let dataDescrCount = 0
let dirEntryCount = 0
let digitalSigCount = 0
let endLocatorCount = 0

while (hf.template.tell() < fileSize) {
  const tag = await readTag()

  if (tag === 0x04034b50) {
    await parseZipFileRecord(recordCount++)
  } else if (tag === 0x08074b50) {
    await parseZipDataDescr(dataDescrCount++)
  } else if (tag === 0x02014b50) {
    await parseZipDirEntry(dirEntryCount++)
  } else if (tag === 0x05054b50) {
    await parseZipDigitalSig(digitalSigCount++)
  } else if (tag === 0x06054b50) {
    await parseZipEndLocator(endLocatorCount++)
  } else {
    hf.warn(`Unknown ZIP tag 0x${tag.toString(16).padStart(8, '0')} at offset ${hf.template.tell()}. Stopping.`)
    break
  }
}

await hf.template.end()
hf.log(`ZIP template applied: ${recordCount} files, ${dirEntryCount} dir entries, ${endLocatorCount} end locator(s)`)
