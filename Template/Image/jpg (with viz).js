// JPEG Image Parser — HexForge JS Template
// Author: Kei Choi (hanul93@gmail.com)
// Category: Image

hf.template.begin('JPEG Image', { le: false })
hf.template.setFormat('jpg', 'JPEG Image (JS)', ['.jpg', '.jpeg'])

// === Enum Maps ===

const M_ID_MAP = {
  0xFFC0: 'SOF0', 0xFFC1: 'SOF1', 0xFFC2: 'SOF2', 0xFFC3: 'SOF3',
  0xFFC4: 'DHT', 0xFFC5: 'SOF5', 0xFFC6: 'SOF6', 0xFFC7: 'SOF7',
  0xFFC8: 'JPG', 0xFFC9: 'SOF9', 0xFFCA: 'SOF10', 0xFFCB: 'SOF11',
  0xFFCC: 'DAC', 0xFFCD: 'SOF13', 0xFFCE: 'SOF14', 0xFFCF: 'SOF15',
  0xFFD0: 'RST0', 0xFFD1: 'RST1', 0xFFD2: 'RST2', 0xFFD3: 'RST3',
  0xFFD4: 'RST4', 0xFFD5: 'RST5', 0xFFD6: 'RST6', 0xFFD7: 'RST7',
  0xFFD8: 'SOI', 0xFFD9: 'EOI', 0xFFDA: 'SOS', 0xFFDB: 'DQT',
  0xFFDC: 'DNL', 0xFFDD: 'DRI', 0xFFDE: 'DHP', 0xFFDF: 'EXP',
  0xFFE0: 'APP0', 0xFFE1: 'APP1', 0xFFE2: 'APP2', 0xFFE3: 'APP3',
  0xFFE4: 'APP4', 0xFFE5: 'APP5', 0xFFE6: 'APP6', 0xFFE7: 'APP7',
  0xFFE8: 'APP8', 0xFFE9: 'APP9', 0xFFEA: 'APP10', 0xFFEB: 'APP11',
  0xFFEC: 'APP12', 0xFFED: 'APP13', 0xFFEE: 'APP14', 0xFFEF: 'APP15',
  0xFFF0: 'JPG0', 0xFFF7: 'JPGLS',
  0xFFFE: 'COMM'
}

const COMPTYPE_MAP = {
  1: 'uByte', 2: 'ascString', 3: 'uShort', 4: 'uLong', 5: 'uRatio',
  6: 'sByte', 7: 'undefined', 8: 'sShort', 9: 'sLong', 10: 'sRatio',
  11: 'sFloat', 12: 'dFloat'
}

const DATA_FORMAT_LENGTH = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8]

const EXIF_TAG_MAP = {
  0x0100: 'ImageWidth', 0x0101: 'ImageHeight', 0x0102: 'BitsPerSample',
  0x0103: 'Compression', 0x0106: 'PhotometricInterpretation',
  0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model',
  0x0111: 'StripOffsets', 0x0112: 'Orientation',
  0x0115: 'SamplesPerPixel', 0x0116: 'RowsPerStrip',
  0x0117: 'StripByteCounts', 0x011a: 'XResolution', 0x011b: 'YResolution',
  0x011c: 'PlanarConfiguration', 0x0128: 'ResolutionUnit',
  0x012d: 'TransferFunction', 0x0131: 'Software', 0x0132: 'ModifyDate',
  0x013b: 'Artist', 0x013e: 'WhitePoint', 0x013f: 'PrimaryChromaticities',
  0x0201: 'ThumbnailOffset', 0x0202: 'ThumbnailLength',
  0x0211: 'YCbCrCoefficients', 0x0212: 'YCbCrSubSampling',
  0x0213: 'YCbCrPositioning', 0x0214: 'ReferenceBlackWhite',
  0x8298: 'Copyright', 0x829a: 'ExposureTime', 0x829d: 'FNumber',
  0x8769: 'ExifOffset', 0x8822: 'ExposureProgram',
  0x8825: 'GPSInfo', 0x8827: 'ISO',
  0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal', 0x9004: 'CreateDate',
  0x9101: 'ComponentsConfiguration', 0x9102: 'CompressedBitsPerPixel',
  0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue',
  0x9203: 'BrightnessValue', 0x9204: 'ExposureCompensation',
  0x9205: 'MaxApertureValue', 0x9206: 'SubjectDistance',
  0x9207: 'MeteringMode', 0x9208: 'LightSource', 0x9209: 'Flash',
  0x920a: 'FocalLength', 0x927c: 'MakerNote', 0x9286: 'UserComment',
  0x9290: 'SubSecTime', 0x9291: 'SubSecTimeOriginal',
  0xa000: 'FlashpixVersion', 0xa001: 'ColorSpace',
  0xa002: 'ExifImageWidth', 0xa003: 'ExifImageLength',
  0xa005: 'InteropOffset',
  0xa20e: 'FocalPlaneXResolution', 0xa20f: 'FocalPlaneYResolution',
  0xa210: 'FocalPlaneResolutionUnit',
  0xa401: 'CustomRendered', 0xa402: 'ExposureMode',
  0xa403: 'WhiteBalance', 0xa404: 'DigitalZoomRatio',
  0xa405: 'FocalLengthIn35mmFormat', 0xa406: 'SceneCaptureType',
  0xa407: 'GainControl', 0xa408: 'Contrast', 0xa409: 'Saturation',
  0xa40a: 'Sharpness', 0xa40c: 'SubjectDistanceRange',
  0xa420: 'ImageUniqueID',
  0xc4a5: 'PrintIM'
}

const GPS_TAG_MAP = {
  0: 'GPSVersionID', 1: 'GPSLatitudeRef', 2: 'GPSLatitude',
  3: 'GPSLongitudeRef', 4: 'GPSLongitude', 5: 'GPSAltitudeRef',
  6: 'GPSAltitude', 7: 'GPSTimeStamp', 8: 'GPSSatellites',
  9: 'GPSStatus', 10: 'GPSMeasureMode', 11: 'GPSDOP',
  12: 'GPSSpeedRef', 13: 'GPSSpeed', 14: 'GPSTrackRef', 15: 'GPSTrack',
  16: 'GPSImgDirectionRef', 17: 'GPSImgDirection',
  18: 'GPSMapDatum', 29: 'GPSDateStamp', 30: 'GPSDifferential'
}

// === Structure View Data ===

const _seg = []
const _vd = {
  sof: null,
  app0: null,
  exif: {},
  exifSubIFDs: [],
  dqt: [],
  dht: [],
  sos: null,
  scanDataSize: 0,
}

const _SEGCOLORS = {
  SOI: '#ef4444', EOI: '#ef4444',
  APP0: '#3b82f6', APP1: '#a855f7', APP2: '#ec4899',
  DQT: '#22d3ee', SOF0: '#34d399', SOF1: '#34d399', SOF2: '#34d399', SOF3: '#34d399',
  DHT: '#fbbf24', SOS: '#f97316', ECS: '#f97316',
  DRI: '#94a3b8', COMM: '#94a3b8',
}

function _segColor(type) {
  if (_SEGCOLORS[type]) return _SEGCOLORS[type]
  if (type.startsWith('APP')) return '#6366f1'
  if (type.startsWith('SOF')) return '#34d399'
  return '#64748b'
}

// === Helpers ===

async function readU16BE(offset) {
  const b = await hf.read(offset, 2)
  return (b[0] << 8) | b[1]
}

async function readU8(offset) {
  const b = await hf.read(offset, 1)
  return b[0]
}

async function readStringAt(offset, len) {
  const b = await hf.read(offset, len)
  let s = ''
  for (let i = 0; i < len; i++) {
    if (b[i] === 0) break
    s += String.fromCharCode(b[i])
  }
  return s
}

async function readU32(offset, littleEndian) {
  const b = await hf.read(offset, 4)
  if (littleEndian) {
    return (b[0] | (b[1] << 8) | (b[2] << 16) | ((b[3] << 24) >>> 0)) >>> 0
  }
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0
}

// === Segment Parsers ===

async function parseSOFx(label) {
  hf.template.beginStruct(label)
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const precision = await hf.template.addField('precision', 'u8', { le: false })
    const Y = await hf.template.addField('Y_image', 'u16', { le: false })
    const X = await hf.template.addField('X_image', 'u16', { le: false })
    const nrComp = await hf.template.addField('nr_comp', 'u8', { le: false })
    _vd.sof = { precision, width: X, height: Y, nrComp, components: [] }
    for (let c = 0; c < nrComp; c++) {
      hf.template.beginStruct(`component [${c}]`)
        const compId = await hf.template.addField('compId', 'u8', { le: false })
        const sampFact = await hf.template.addField('samplingFactor', 'u8', { le: false })
        const quantTableNr = await hf.template.addField('quantTableNr', 'u8', { le: false })
        _vd.sof.components.push({ id: compId, sampH: (sampFact >> 4) & 0xF, sampV: sampFact & 0xF, qt: quantTableNr })
      hf.template.endStruct()
    }
    hf.log(`  SOF: ${X}x${Y}, ${precision}-bit, ${nrComp} components`)
  hf.template.endStruct()
}

async function parseDHT() {
  hf.template.beginStruct('DHT')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const endOff = hf.template.tell() + szSection - 2
    let tableIdx = 0
    while (hf.template.tell() < endOff) {
      hf.template.beginStruct(`HuffmanTable [${tableIdx}]`)
        const htInfo = await hf.template.addField('htInfo', 'u8', { le: false, color: '#88ff88' })
        const tableClass = (htInfo >> 4) & 0x0F
        const tableId = htInfo & 0x0F
        // Read 16 length bytes
        const lengthBytes = await hf.read(hf.template.tell(), 16)
        await hf.template.addField('lengths', 'bytes:16')
        let sumLen = 0
        for (let i = 0; i < 16; i++) sumLen += lengthBytes[i]
        if (sumLen > 0) {
          await hf.template.addField('values', `bytes:${sumLen}`, { color: '#8888ff' })
        }
        _vd.dht.push({ tableClass, tableId, lengths: Array.from(lengthBytes), nSymbols: sumLen })
        hf.log(`  DHT: class=${tableClass} id=${tableId}, ${sumLen} codes`)
      hf.template.endStruct()
      tableIdx++
    }
  hf.template.endStruct()
}

async function parseDQT() {
  hf.template.beginStruct('DQT')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const endOff = hf.template.tell() + szSection - 2
    let tableIdx = 0
    while (hf.template.tell() < endOff) {
      hf.template.beginStruct(`QuantTable [${tableIdx}]`)
        const info = await hf.template.addField('PqTq', 'u8', { le: false, color: '#88ff88' })
        const pq = (info >> 4) & 0x0F
        const _qPos = hf.template.tell()
        if (pq === 0) {
          const _qRaw = await hf.read(_qPos, 64)
          await hf.template.addField('qTable', 'bytes:64', { color: '#ffcc44' })
          _vd.dqt.push({ id: info & 0x0F, precision: 0, values: _qRaw })
        } else {
          const _qRaw = await hf.read(_qPos, 128)
          await hf.template.addField('qTable', 'bytes:128', { color: '#ffcc44' })
          _vd.dqt.push({ id: info & 0x0F, precision: 1, values: _qRaw })
        }
      hf.template.endStruct()
      tableIdx++
    }
  hf.template.endStruct()
}

async function parseDRI() {
  hf.template.beginStruct('DRI')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    await hf.template.addField('szSection', 'u16', { le: false })
    const ri = await hf.template.addField('Ri', 'u16', { le: false })
    hf.log(`  DRI: restart interval = ${ri}`)
  hf.template.endStruct()
}

async function parseDHP() {
  hf.template.beginStruct('DHP')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    await hf.template.addField('P', 'u8', { le: false })
    const Y = await hf.template.addField('Y', 'u16', { le: false })
    const X = await hf.template.addField('X', 'u16', { le: false })
    const Nf = await hf.template.addField('Nf', 'u8', { le: false })
    for (let c = 0; c < Nf; c++) {
      hf.template.beginStruct(`component [${c}]`)
        await hf.template.addField('id', 'u8', { le: false })
        await hf.template.addField('factors', 'u8', { le: false })
        await hf.template.addField('Tq', 'u8', { le: false })
      hf.template.endStruct()
    }
  hf.template.endStruct()
}

async function parseSOS() {
  hf.template.beginStruct('SOS')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const nrComp = await hf.template.addField('nr_comp', 'u8', { le: false })
    for (let c = 0; c < nrComp; c++) {
      hf.template.beginStruct(`comp [${c}]`)
        await hf.template.addField('compId', 'u8', { le: false })
        await hf.template.addField('DC_AC', 'u8', { le: false })
      hf.template.endStruct()
    }
    const Ss = await hf.template.addField('Ss', 'u8', { le: false })
    const Se = await hf.template.addField('Se', 'u8', { le: false })
    await hf.template.addField('AhAl', 'u8', { le: false })
    _vd.sos = { nComp: nrComp, ss: Ss, se: Se }
    hf.log(`  SOS: ${nrComp} components`)
  hf.template.endStruct()
}

async function parseScanData(fileEnd) {
  // After SOS header, scan forward for next marker (0xFF not followed by 0x00 or 0xD0-0xD7)
  const scanStart = hf.template.tell()
  const fileSize = await hf.fileSize
  const limit = fileEnd < fileSize ? fileEnd : fileSize
  let pos = scanStart
  const CHUNK = 4096

  while (pos < limit) {
    const readLen = Math.min(CHUNK, limit - pos)
    const chunk = await hf.read(pos, readLen)
    for (let i = 0; i < chunk.length - 1; i++) {
      if (chunk[i] === 0xFF) {
        const next = chunk[i + 1]
        if (next === 0x00 || (next >= 0xD0 && next <= 0xD7)) {
          continue // stuffed byte or RST marker — skip
        }
        // Found a real marker
        const dataLen = (pos + i) - scanStart
        if (dataLen > 0) {
          await hf.template.addField('scanData', `bytes:${dataLen}`, { color: '#44cc44' })
        }
        return
      }
    }
    pos += readLen - 1 // overlap by 1 for boundary
  }
  // Reached end without marker
  const dataLen = limit - scanStart
  if (dataLen > 0) {
    await hf.template.addField('scanData', `bytes:${dataLen}`, { color: '#44cc44' })
  }
}

async function parseComment() {
  hf.template.beginStruct('COMMENT')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const dataLen = szSection - 2
    if (dataLen > 0) {
      const commentVal = await hf.template.addField('comment', `string:${dataLen}`, { color: '#88ffff' })
      hf.log(`  Comment: ${commentVal.substring(0, 80)}${commentVal.length > 80 ? '...' : ''}`)
    }
  hf.template.endStruct()
}

async function parseJPGLS() {
  hf.template.beginStruct('JPGLS')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    await hf.template.addField('precision', 'u8', { le: false })
    await hf.template.addField('Y_numlines', 'u16', { le: false })
    await hf.template.addField('X_numcols', 'u16', { le: false })
    await hf.template.addField('Nf', 'u8', { le: false })
    await hf.template.addField('C_compID', 'u8', { le: false })
    await hf.template.addField('sub_sampling', 'u8', { le: false })
    await hf.template.addField('Tq', 'u8', { le: false })
    if (szSection > 11) {
      await hf.template.addField('unknown', `bytes:${szSection - 11}`)
    }
  hf.template.endStruct()
}

async function parseUnknownSection(fileEnd) {
  hf.template.beginStruct('UnknownSection')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#808080' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const pos = hf.template.tell()
    const dataLen = szSection - 2
    if (pos + dataLen > fileEnd) {
      const safeLen = fileEnd - pos
      if (safeLen > 0) {
        await hf.template.addField('data', `bytes:${safeLen}`, { color: '#c0c0c0' })
      }
    } else if (dataLen > 0) {
      await hf.template.addField('data', `bytes:${dataLen}`, { color: '#c0c0c0' })
    }
  hf.template.endStruct()
}

// === EXIF IFD Parser ===

async function parseIFD(label, tiffBase, isBigEndian, dirType) {
  hf.template.beginStruct(label)
    const nEntries = await hf.template.addField('nDirEntry', 'u16', { le: !isBigEndian, color: '#ffcc44' })
    const entries = []

    for (let i = 0; i < nEntries; i++) {
      hf.template.beginStruct(`entry [${i}]`)
        const tagMap = dirType === 'gps' ? GPS_TAG_MAP : EXIF_TAG_MAP
        const tagNum = await hf.template.addField('tag', 'u16', { le: !isBigEndian, enumMap: tagMap })
        const dataFmt = await hf.template.addField('dataFormat', 'u16', { le: !isBigEndian, enumMap: COMPTYPE_MAP })
        const nComp = await hf.template.addField('nComponent', 'u32', { le: !isBigEndian })

        let length = -1
        if (dataFmt >= 1 && dataFmt < 13) {
          length = DATA_FORMAT_LENGTH[dataFmt] * nComp
        }

        let offsetOrValue = undefined
        if (dataFmt >= 1 && dataFmt < 13 && length >= 0 && length <= 4) {
          // Value stored inline (4 bytes)
          await hf.template.addField('value', 'bytes:4', { color: '#88ff88' })
        } else {
          offsetOrValue = await hf.template.addField('offsetData', 'u32', { le: !isBigEndian })
        }

        entries.push({ tagNum, dataFmt, nComp, length, offsetOrValue })
      hf.template.endStruct()
    }

    const nextIFD = await hf.template.addField('nextIFDoffset', 'u32', { le: !isBigEndian })
    const afterEntriesPos = hf.template.tell()

    // Parse out-of-line data for entries with length > 4
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (e.offsetOrValue === undefined) continue
      if (e.dataFmt < 1 || e.dataFmt >= 13) continue
      if (e.length <= 4) continue

      const dataOffset = tiffBase + e.offsetOrValue
      hf.template.seek(dataOffset)

      const tagName = EXIF_TAG_MAP[e.tagNum] || GPS_TAG_MAP[e.tagNum] || `Tag_0x${e.tagNum.toString(16)}`

      if (e.dataFmt === 2) {
        // ASCII string
        const val = await hf.template.addField(`${tagName}_data`, `string:${e.nComp}`, { color: '#88ffff' })
        if (e.tagNum === 0x010f) { _vd.exif.make = val.replace(/\0/g, ''); hf.log(`  Make: ${val}`) }
        else if (e.tagNum === 0x0110) { _vd.exif.model = val.replace(/\0/g, ''); hf.log(`  Model: ${val}`) }
        else if (e.tagNum === 0x0131) { _vd.exif.software = val.replace(/\0/g, ''); hf.log(`  Software: ${val}`) }
        else if (e.tagNum === 0x0132) { _vd.exif.modifyDate = val.replace(/\0/g, ''); hf.log(`  ModifyDate: ${val}`) }
        else if (e.tagNum === 0x9003) { _vd.exif.dateTimeOriginal = val.replace(/\0/g, ''); hf.log(`  DateTimeOriginal: ${val}`) }
      } else if (e.dataFmt === 5) {
        // uRatio
        hf.template.beginStruct(`${tagName}_data`)
          for (let r = 0; r < e.nComp; r++) {
            const num = await hf.template.addField('numerator', 'u32', { le: !isBigEndian })
            const den = await hf.template.addField('denominator', 'u32', { le: !isBigEndian })
          }
        hf.template.endStruct()
      } else if (e.dataFmt === 10) {
        // sRatio
        hf.template.beginStruct(`${tagName}_data`)
          for (let r = 0; r < e.nComp; r++) {
            await hf.template.addField('numerator', 'i32', { le: !isBigEndian })
            await hf.template.addField('denominator', 'i32', { le: !isBigEndian })
          }
        hf.template.endStruct()
      } else if (e.nComp > 0 && e.length > 0) {
        await hf.template.addField(`${tagName}_data`, `bytes:${e.length}`, { color: '#c0c0c0' })
      }
    }

    // Parse sub-IFDs (ExifOffset, GPSInfo, InteropOffset)
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (e.tagNum === 0x8769 && e.offsetOrValue === undefined) {
        // ExifOffset stored inline — read from entry value area
        // Already 4 bytes inline. We'd need to re-read. Skip for simplicity.
      }
      if (e.tagNum === 0x8769 && e.offsetOrValue !== undefined) {
        // ExifOffset sub-IFD
        _vd.exifSubIFDs.push('ExifIFD')
        hf.template.seek(tiffBase + e.offsetOrValue)
        await parseIFD('ExifSubIFD', tiffBase, isBigEndian, 'exif')
      } else if (e.tagNum === 0x8825 && e.offsetOrValue !== undefined) {
        // GPSInfo sub-IFD
        _vd.exifSubIFDs.push('GPS IFD')
        hf.template.seek(tiffBase + e.offsetOrValue)
        await parseIFD('GPSInfoIFD', tiffBase, isBigEndian, 'gps')
      } else if (e.tagNum === 0xa005 && e.offsetOrValue !== undefined) {
        // InteropOffset sub-IFD
        _vd.exifSubIFDs.push('InteropIFD')
        hf.template.seek(tiffBase + e.offsetOrValue)
        await parseIFD('InteropIFD', tiffBase, isBigEndian, 'exif')
      }
    }

    hf.template.seek(afterEntriesPos)
  hf.template.endStruct()

  return { nextIFD }
}

// === APP Segment Parsers ===

async function parseAPP0() {
  hf.template.beginStruct('APP0')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const secStart = hf.template.tell()
    const secEnd = secStart + szSection - 2

    const ident = await readStringAt(hf.template.tell(), 5)

    if (ident === 'JFIF\0' || ident === 'JFIF') {
      await hf.template.addField('identifier', 'string:5', { color: '#88ffff' })
      const vMajor = await hf.template.addField('versionMajor', 'u8', { le: false })
      const vMinor = await hf.template.addField('versionMinor', 'u8', { le: false })
      const units = await hf.template.addField('units', 'u8', { le: false })
      const xDensity = await hf.template.addField('Xdensity', 'u16', { le: false })
      const yDensity = await hf.template.addField('Ydensity', 'u16', { le: false })
      const xThumb = await hf.template.addField('xThumbnail', 'u8', { le: false })
      const yThumb = await hf.template.addField('yThumbnail', 'u8', { le: false })
      _vd.app0 = { version: `${vMajor}.${vMinor < 10 ? '0' + vMinor : vMinor}`, units: units === 1 ? 'DPI' : units === 2 ? 'DPCM' : 'None', xDensity, yDensity, xThumb, yThumb }
      const thumbSize = xThumb * yThumb * 3
      if (xThumb > 0 && yThumb > 0 && thumbSize > 0) {
        await hf.template.addField('thumbnailRGB', `bytes:${thumbSize}`, { color: '#88ff88' })
      }
      hf.log(`  JFIF: ${xDensity}x${yDensity}`)
    } else if (ident === 'JFXX\0' || ident === 'JFXX') {
      await hf.template.addField('identifier', 'string:5', { color: '#88ffff' })
      await hf.template.addField('extensionCode', 'u8', { le: false })
      const remaining = secEnd - hf.template.tell()
      if (remaining > 0) {
        await hf.template.addField('extensionData', `bytes:${remaining}`, { color: '#c0c0c0' })
      }
      hf.log('  JFXX extension')
    } else {
      const remaining = secEnd - hf.template.tell()
      if (remaining > 0) {
        await hf.template.addField('data', `bytes:${remaining}`, { color: '#c0c0c0' })
      }
      hf.log('  APP0: unknown format')
    }

    // Ensure we're at section end
    if (hf.template.tell() < secEnd) {
      const skip = secEnd - hf.template.tell()
      if (skip > 0) hf.template.skip(skip)
    }
  hf.template.endStruct()
}

async function parseAPP1() {
  hf.template.beginStruct('APP1')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const secStart = hf.template.tell()
    const secEnd = secStart + szSection - 2

    const ident = await readStringAt(hf.template.tell(), 6)

    if (ident.startsWith('Exif')) {
      await hf.template.addField('EXIF', 'string:6', { color: '#88ffff' })
      const tiffBase = hf.template.tell()

      // Read byte order
      const alignBytes = await hf.read(tiffBase, 2)
      await hf.template.addField('byteOrder', 'string:2')
      const isBigEndian = (alignBytes[0] === 0x4D) // 'M' = big endian

      await hf.template.addField('tagMark', 'u16', { le: !isBigEndian })
      const offsetFirstIFD = await hf.template.addField('offsetFirstIFD', 'u32', { le: !isBigEndian })

      if (offsetFirstIFD !== 8) {
        hf.template.seek(tiffBase + offsetFirstIFD)
      }

      const mainIFD = await parseIFD('IFD0 (Main)', tiffBase, isBigEndian, 'exif')

      if (mainIFD.nextIFD > 0) {
        hf.template.seek(tiffBase + mainIFD.nextIFD)
        await parseIFD('IFD1 (Thumbnail)', tiffBase, isBigEndian, 'exif')
      }

      hf.log('  APP1: EXIF data parsed')
    } else {
      const xapIdent = await readStringAt(hf.template.tell(), 29)
      if (xapIdent === 'http://ns.adobe.com/xap/1.0/') {
        await hf.template.addField('XAP', 'string:29', { color: '#88ffff' })
        const remaining = secEnd - hf.template.tell()
        if (remaining > 0) {
          await hf.template.addField('xmpData', `string:${remaining}`, { color: '#c0c0c0' })
        }
        hf.log('  APP1: XMP data')
      } else {
        const remaining = secEnd - hf.template.tell()
        if (remaining > 0) {
          await hf.template.addField('data', `bytes:${remaining}`, { color: '#c0c0c0' })
        }
        hf.log('  APP1: unknown format')
      }
    }

    // Ensure we're at section end
    hf.template.seek(secEnd)
  hf.template.endStruct()
}

async function parseAPP2() {
  hf.template.beginStruct('APP2')
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const secStart = hf.template.tell()
    const secEnd = secStart + szSection - 2

    const ident = await readStringAt(hf.template.tell(), 12)

    if (ident === 'ICC_PROFILE\0' || ident.startsWith('ICC_PROFILE')) {
      await hf.template.addField('identifier', 'string:12', { color: '#88ffff' })
      await hf.template.addField('blockNum', 'u8', { le: false })
      await hf.template.addField('blockTotal', 'u8', { le: false })
      const remaining = secEnd - hf.template.tell()
      if (remaining > 0) {
        await hf.template.addField('iccData', `bytes:${remaining}`, { color: '#cc44cc' })
      }
      hf.log('  APP2: ICC Profile')
    } else {
      const remaining = secEnd - hf.template.tell()
      if (remaining > 0) {
        await hf.template.addField('data', `bytes:${remaining}`, { color: '#c0c0c0' })
      }
      hf.log('  APP2: unknown format')
    }

    hf.template.seek(secEnd)
  hf.template.endStruct()
}

async function parseAPPGeneric(label) {
  hf.template.beginStruct(label)
    await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    const szSection = await hf.template.addField('szSection', 'u16', { le: false })
    const dataLen = szSection - 2
    if (dataLen > 0) {
      await hf.template.addField('data', `bytes:${dataLen}`, { color: '#c0c0c0' })
    }
    hf.log(`  ${label}: ${dataLen} bytes`)
  hf.template.endStruct()
}

// === Main JPEG Parsing ===

const fileSize = await hf.fileSize
let segmentCount = 0

// Validate JPEG signature
var magic = await readU16BE(0)
if (magic !== 0xFFD8) {
  hf.error('Not a JPEG file (expected FFD8, got ' + magic.toString(16).toUpperCase() + ')')
  await hf.template.end()
  throw new Error('Not a valid JPEG')
}

while (hf.template.tell() < fileSize) {
  // Skip optional 0xFF padding bytes
  while (hf.template.tell() < fileSize - 1) {
    const peek2 = await readU16BE(hf.template.tell())
    if (peek2 === 0xFFFF) {
      hf.template.skip(1)
    } else {
      break
    }
  }

  if (hf.template.tell() >= fileSize) break

  const _ss = hf.template.tell()
  const marker = await readU16BE(hf.template.tell())
  const _mHex = marker.toString(16).toUpperCase().padStart(4, '0')
  const _mStr = `${_mHex.slice(0,2)} ${_mHex.slice(2)}`

  if (marker === 0xFFD8) {
    // SOI
    hf.template.beginStruct('SOI')
      await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    hf.template.endStruct()
    _seg.push({ type: 'SOI', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
    hf.log('Start of Image (SOI)')
  } else if (marker === 0xFFD9) {
    // EOI
    hf.template.beginStruct('EOI')
      await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    hf.template.endStruct()
    _seg.push({ type: 'EOI', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
    hf.log('End of Image (EOI)')
    const remaining = fileSize - hf.template.tell()
    if (remaining > 0) {
      hf.warn('Overlay data: ' + remaining + ' byte(s) after EOI marker')
    }
    break
  } else if (marker === 0xFFDA) {
    // SOS + scan data
    await parseSOS()
    _seg.push({ type: 'SOS', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
    const _scanStart = hf.template.tell()
    await parseScanData(fileSize)
    const _scanSize = hf.template.tell() - _scanStart
    if (_scanSize > 0) {
      _seg.push({ type: 'ECS', offset: _scanStart, size: _scanSize, marker: '' })
      _vd.scanDataSize = _scanSize
    }
  } else if (marker === 0xFFE0) {
    await parseAPP0()
    _seg.push({ type: 'APP0', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFE1) {
    await parseAPP1()
    _seg.push({ type: 'APP1', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFE2) {
    await parseAPP2()
    _seg.push({ type: 'APP2', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker >= 0xFFE3 && marker <= 0xFFEF) {
    // APP3-APP15
    const appNum = marker - 0xFFE0
    await parseAPPGeneric(`APP${appNum}`)
    _seg.push({ type: `APP${appNum}`, offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFC4) {
    await parseDHT()
    _seg.push({ type: 'DHT', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFDB) {
    await parseDQT()
    _seg.push({ type: 'DQT', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFDD) {
    await parseDRI()
    _seg.push({ type: 'DRI', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFDE) {
    await parseDHP()
    _seg.push({ type: 'DHP', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFC0 || marker === 0xFFC1 || marker === 0xFFC2 || marker === 0xFFC3) {
    const sofNames = { 0xFFC0: 'SOF0', 0xFFC1: 'SOF1', 0xFFC2: 'SOF2', 0xFFC3: 'SOF3' }
    await parseSOFx(sofNames[marker])
    _seg.push({ type: sofNames[marker], offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFFE) {
    await parseComment()
    _seg.push({ type: 'COMM', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if (marker === 0xFFF7) {
    await parseJPGLS()
    _seg.push({ type: 'JPGLS', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else if ((marker & 0xFF00) === 0xFF00) {
    // Unknown but valid marker
    await parseUnknownSection(fileSize)
    _seg.push({ type: M_ID_MAP[marker] || 'UNK', offset: _ss, size: hf.template.tell() - _ss, marker: _mStr })
  } else {
    // Garbage byte
    await hf.template.addField('garbage', 'u8', { color: '#808080' })
  }

  segmentCount++
  if (segmentCount > 500) {
    hf.warn('Too many segments (>500), stopping to prevent infinite loop')
    break
  }
}

await hf.template.end()

// === Structure View Renderer ===

const _SEGDESC = {
  SOI: 'Start of Image', EOI: 'End of Image',
  APP0: 'JFIF Identifier', APP1: 'EXIF Metadata', APP2: 'ICC Profile',
  DQT: 'Quantization Tables', DHT: 'Huffman Tables', DRI: 'Restart Interval',
  SOF0: 'Baseline DCT', SOF1: 'Extended Sequential', SOF2: 'Progressive', SOF3: 'Lossless',
  SOS: 'Start of Scan', ECS: 'Entropy-Coded Segment', COMM: 'Comment',
  DHP: 'Hierarchical Progression', JPGLS: 'JPEG-LS',
}

const _SEGICONS = {
  SOI: '▶', EOI: '⏹', APP0: '◆', APP1: '◎', APP2: '◈',
  DQT: '⊞', SOF0: '◧', SOF1: '◧', SOF2: '◧', SOF3: '◧',
  DHT: '⊟', SOS: '≫', ECS: '░', COMM: '¶', DRI: '↻',
  DHP: '◇', JPGLS: '◇',
}

function _hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function _fmtSz(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

function _hx(n) {
  return '0x' + n.toString(16).toUpperCase()
}

function _renderFields(fields, cols) {
  const style = cols
    ? `display:grid;grid-template-columns:repeat(${cols},1fr);gap:2px 12px`
    : 'display:flex;flex-direction:column;gap:1px'
  return `<div style="${style}">` + fields.map(f =>
    `<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:2px 4px;border-radius:3px;cursor:pointer"` +
    `${f.offset !== undefined ? ` data-hf-offset="${f.offset}"` : ''}>` +
    `<span style="color:var(--color-text-muted);font-family:var(--font-mono)">${f.name}</span>` +
    `<span style="color:${f.color || 'var(--color-text)'};font-family:var(--font-mono)">${f.value}</span></div>`
  ).join('') + '</div>'
}

function _renderDQTGrid(table) {
  const isLuma = table.id === 0
  const rgb = isLuma ? '34,211,238' : '249,115,22'
  const label = isLuma ? 'Luminance (Y)' : 'Chrominance (Cb/Cr)'
  const labelColor = isLuma ? 'rgba(34,211,238,0.7)' : 'rgba(249,115,22,0.7)'
  const vals = []
  if (table.precision === 0) {
    for (let i = 0; i < 64 && i < table.values.length; i++) vals.push(table.values[i])
  } else {
    for (let i = 0; i + 1 < table.values.length && vals.length < 64; i += 2)
      vals.push((table.values[i] << 8) | table.values[i + 1])
  }
  let maxVal = 0
  for (const v of vals) if (v > maxVal) maxVal = v
  let cells = ''
  for (const v of vals) {
    const alpha = maxVal > 0 ? ((1 - v / maxVal) * 0.55 + 0.05) : 0.3
    cells += `<div style="background:rgba(${rgb},${alpha.toFixed(2)});aspect-ratio:1;border-radius:2px"></div>`
  }
  return `<div>` +
    `<div style="font-size:9px;font-family:var(--font-mono);color:${labelColor};margin-bottom:3px">Table ${table.id} — ${label}</div>` +
    `<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:1px">${cells}</div></div>`
}

function _renderDHTHisto(table) {
  const cls = table.tableClass === 0 ? 'DC' : 'AC'
  const id = table.tableId
  let maxLen = 0
  for (const l of table.lengths) if (l > maxLen) maxLen = l
  if (maxLen === 0) maxLen = 1
  let bars = ''
  for (let i = 0; i < 16; i++) {
    const pct = table.lengths[i] / maxLen * 100
    const alpha = (0.2 + pct / 250).toFixed(2)
    bars += `<div style="flex:1;background:rgba(251,191,36,${alpha});` +
      `height:${Math.max(2, pct)}%;border-radius:1px 1px 0 0"></div>`
  }
  return `<div style="padding:8px;border-radius:6px;background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.15)">` +
    `<div style="font-size:9px;font-family:var(--font-mono);color:rgba(251,191,36,0.7);margin-bottom:4px">${cls} (Class ${table.tableClass}, ID ${id})</div>` +
    `<div style="display:flex;gap:1px;align-items:flex-end;height:28px">${bars}</div>` +
    `<div style="font-size:7px;font-family:var(--font-mono);color:var(--color-text-muted);margin-top:3px">` +
    `${table.nSymbols} symbols · Codes by bit length</div></div>`
}

function _renderSOFComponents(sof) {
  const names = { 1: 'Y', 2: 'Cb', 3: 'Cr', 4: 'I', 5: 'Q' }
  const colors = { 1: '#34d399', 2: '#60a5fa', 3: '#f87171' }
  let html = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--color-border)">'
  html += '<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Color Components</div>'
  for (const comp of sof.components) {
    const name = names[comp.id] || `C${comp.id}`
    const color = colors[comp.id] || '#94a3b8'
    html += `<div style="display:flex;align-items:center;gap:8px;font-size:11px;font-family:var(--font-mono);margin-bottom:3px">`
    html += `<div style="width:3px;height:16px;border-radius:2px;background:${color}99"></div>`
    html += `<span style="color:var(--color-text-muted);width:24px">${name}</span>`
    html += `<span style="color:${color}">ID:${comp.id} · Sampling ${comp.sampH}×${comp.sampV} · QT:${comp.qt}</span>`
    html += `</div>`
  }
  html += '</div>'
  return html
}

function _renderSegDetail(seg) {
  switch (seg.type) {
    case 'SOI':
    case 'EOI':
      return ''

    case 'APP0': {
      if (!_vd.app0) return ''
      const a = _vd.app0
      const c = '#93c5fd'
      return _renderFields([
        { name: 'Identifier', value: 'JFIF\\0', color: c },
        { name: 'Version', value: a.version, color: c },
        { name: 'Units', value: a.units, color: c },
        { name: 'X Density', value: String(a.xDensity), color: c },
        { name: 'Y Density', value: String(a.yDensity), color: c },
        { name: 'Thumbnail', value: `${a.xThumb} × ${a.yThumb}`, color: c },
      ], 3)
    }

    case 'APP1': {
      let html = ''
      const ex = _vd.exif
      const c = '#d8b4fe'
      const fields = []
      if (ex.make) fields.push({ name: 'Make', value: ex.make, color: c })
      if (ex.model) fields.push({ name: 'Model', value: ex.model, color: c })
      if (ex.dateTimeOriginal) fields.push({ name: 'DateTime', value: ex.dateTimeOriginal, color: c })
      else if (ex.modifyDate) fields.push({ name: 'DateTime', value: ex.modifyDate, color: c })
      if (ex.software) fields.push({ name: 'Software', value: ex.software, color: c })
      if (fields.length > 0) html += _renderFields(fields, 2)
      if (_vd.exifSubIFDs.length > 0) {
        html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--color-border)">`
        html += `<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">TIFF IFD Structure</div>`
        html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px">`
        const ifds = ['IFD0', ..._vd.exifSubIFDs]
        for (const ifd of ifds) {
          html += `<div style="height:22px;border-radius:3px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);` +
            `display:flex;align-items:center;justify-content:center;font-size:8px;font-family:var(--font-mono);color:#a855f7">${ifd}</div>`
        }
        html += `</div></div>`
      }
      return html
    }

    case 'DQT':
      if (_vd.dqt.length === 0) return ''
      return `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${_vd.dqt.map(t => _renderDQTGrid(t)).join('')}</div>` +
        `<div style="font-size:9px;color:var(--color-text-muted);margin-top:4px;text-align:center;font-family:var(--font-mono)">Brighter = lower quantization value = higher quality</div>`

    case 'SOF0': case 'SOF1': case 'SOF2': case 'SOF3': {
      if (!_vd.sof) return ''
      const s = _vd.sof
      const c = '#6ee7b7'
      let html = _renderFields([
        { name: 'Precision', value: `${s.precision} bits`, color: c },
        { name: 'Height', value: `${s.height} px`, color: c },
        { name: 'Width', value: `${s.width} px`, color: c },
        { name: 'Components', value: `${s.nrComp} (${s.nrComp === 3 ? 'YCbCr' : s.nrComp === 1 ? 'Grayscale' : s.nrComp + ' ch'})`, color: c },
      ], 2)
      if (s.components.length > 0) html += _renderSOFComponents(s)
      return html
    }

    case 'DHT':
      if (_vd.dht.length === 0) return ''
      return `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">${_vd.dht.map(t => _renderDHTHisto(t)).join('')}</div>`

    case 'SOS': {
      if (!_vd.sos) return ''
      const c = '#fdba74'
      return _renderFields([
        { name: 'Components', value: String(_vd.sos.nComp), color: c },
        { name: 'Ss', value: String(_vd.sos.ss), color: c },
        { name: 'Se', value: String(_vd.sos.se), color: c },
      ], 3)
    }

    case 'ECS': {
      const pct = fileSize > 0 ? (_vd.scanDataSize / fileSize * 100).toFixed(1) : '?'
      return `<div style="padding:8px;border-radius:6px;background:rgba(249,115,22,0.05);border:1px solid rgba(249,115,22,0.1)">` +
        `<div style="font-size:9px;font-family:var(--font-mono);color:rgba(249,115,22,0.6);margin-bottom:5px">` +
        `Entropy-Coded Segment (${_fmtSz(_vd.scanDataSize)} · ${pct}% of file)</div>` +
        `<div style="height:7px;border-radius:3px;background:linear-gradient(90deg,rgba(249,115,22,0.5),rgba(239,68,68,0.3));width:100%"></div>` +
        `<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted)">` +
        `<span>MCU 0</span><span>DCT → Quantize → Zigzag → Huffman</span><span>MCU end</span></div>` +
        `</div>`
    }

    default:
      return ''
  }
}

function _estimateQuality() {
  // Estimate JPEG quality from luminance quantization table (table 0)
  const luma = _vd.dqt.find(t => t.id === 0)
  if (!luma) return null
  const vals = []
  if (luma.precision === 0) {
    for (let i = 0; i < 64 && i < luma.values.length; i++) vals.push(luma.values[i])
  } else {
    for (let i = 0; i + 1 < luma.values.length && vals.length < 64; i += 2)
      vals.push((luma.values[i] << 8) | luma.values[i + 1])
  }
  if (vals.length === 0) return null
  const avg = vals.reduce((a, v) => a + v, 0) / vals.length
  // Approximate: lower avg quantization → higher quality
  if (avg <= 2) return 99
  if (avg <= 4) return 95
  if (avg <= 8) return 90
  if (avg <= 15) return 80
  if (avg <= 25) return 70
  if (avg <= 40) return 50
  if (avg <= 60) return 30
  return 10
}

function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b) }

function _renderInsightPanel() {
  const sof = _vd.sof
  const total = _seg.reduce((a, s) => a + s.size, 0) || 1
  const _secTitle = (text) =>
    `<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted);` +
    `text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">${text}</div>`
  const _divider = `<div style="height:1px;background:var(--color-border);margin:12px 0"></div>`

  let html = ''

  // ── Image Summary ──
  if (sof) {
    html += `<div style="padding:4px 0">`
    html += _secTitle('Image Summary')
    html += `<div style="display:flex;flex-direction:column;gap:8px">`

    // Resolution
    const mp = (sof.width * sof.height / 1000000).toFixed(1)
    const g = _gcd(sof.width, sof.height)
    const aspect = g > 0 ? `${sof.width / g}:${sof.height / g}` : ''
    html += `<div style="display:flex;align-items:center;gap:8px">`
    html += `<div style="width:24px;height:24px;border-radius:5px;background:rgba(52,211,153,0.12);display:flex;align-items:center;justify-content:center;font-size:12px;color:#34d399;flex-shrink:0">◧</div>`
    html += `<div><div style="font-size:12px;color:#34d399;font-weight:600">${sof.width} × ${sof.height}</div>`
    html += `<div style="color:var(--color-text-muted);font-size:10px">${mp} MP${aspect ? ' · ' + aspect + ' aspect' : ''}</div></div></div>`

    // Color
    const colorName = sof.nrComp === 3 ? 'YCbCr' : sof.nrComp === 1 ? 'Grayscale' : `${sof.nrComp} ch`
    let subsampling = ''
    if (sof.nrComp >= 3) {
      const y = sof.components[0]
      const maxH = y.sampH, maxV = y.sampV
      if (maxH === 2 && maxV === 2) subsampling = '4:2:0'
      else if (maxH === 2 && maxV === 1) subsampling = '4:2:2'
      else if (maxH === 1 && maxV === 1) subsampling = '4:4:4'
      else subsampling = `${maxH}×${maxV}`
    }
    html += `<div style="display:flex;align-items:center;gap:8px">`
    html += `<div style="width:24px;height:24px;border-radius:5px;background:rgba(96,165,250,0.12);display:flex;align-items:center;justify-content:center;font-size:12px;color:#60a5fa;flex-shrink:0">◈</div>`
    html += `<div><div style="font-size:12px;color:#60a5fa;font-weight:600">${colorName} · ${sof.precision}-bit</div>`
    html += `<div style="color:var(--color-text-muted);font-size:10px">${sof.nrComp} components${subsampling ? ', ' + subsampling + ' subsampling' : ''}</div></div></div>`

    // Compression
    const sofSeg = _seg.find(s => s.type.startsWith('SOF'))
    const sofType = sofSeg ? sofSeg.type : 'SOF0'
    const compDesc = { SOF0: 'Baseline DCT', SOF1: 'Extended Sequential', SOF2: 'Progressive', SOF3: 'Lossless' }
    const quality = _estimateQuality()
    html += `<div style="display:flex;align-items:center;gap:8px">`
    html += `<div style="width:24px;height:24px;border-radius:5px;background:rgba(251,191,36,0.12);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fbbf24;flex-shrink:0">⊞</div>`
    html += `<div><div style="font-size:12px;color:#fbbf24;font-weight:600">${compDesc[sofType] || sofType}</div>`
    html += `<div style="color:var(--color-text-muted);font-size:10px">${quality !== null ? 'Quality ≈ ' + quality + ' (estimated)' : 'Quality unknown'}</div></div></div>`

    html += `</div></div>`
    html += _divider
  }

  // ── File Composition ──
  html += `<div style="padding:4px 0">`
  html += _secTitle('File Composition')

  let ecsSize = 0, exifSize = 0, tableSize = 0, headerSize = 0
  for (const s of _seg) {
    if (s.type === 'ECS') ecsSize += s.size
    else if (s.type === 'APP1') exifSize += s.size
    else if (s.type === 'DQT' || s.type === 'DHT') tableSize += s.size
    else headerSize += s.size
  }

  const items = [
    { label: 'Image Data', size: ecsSize, c1: '#f97316', c2: '#ea580c' },
    { label: 'EXIF Metadata', size: exifSize, c1: '#a855f7', c2: '#7c3aed' },
    { label: 'Tables (DQT+DHT)', size: tableSize, c1: '#22d3ee', c2: '#06b6d4' },
    { label: 'Headers & Markers', size: headerSize, c1: '#64748b', c2: '#475569' },
  ]

  html += `<div style="display:flex;flex-direction:column;gap:6px">`
  for (const item of items) {
    if (item.size === 0) continue
    const pct = (item.size / total * 100)
    const pctStr = pct >= 1 ? pct.toFixed(1) : pct.toFixed(2)
    const barW = Math.max(3, Math.min(100, pct))
    html += `<div>`
    html += `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">`
    html += `<span style="color:${item.c1};font-family:var(--font-mono)">${item.label}</span>`
    html += `<span style="color:var(--color-text-muted);font-family:var(--font-mono)">${pctStr}%</span></div>`
    html += `<div style="height:5px;border-radius:3px;background:linear-gradient(90deg,${item.c1},${item.c2});width:${barW}%"></div>`
    html += `</div>`
  }
  html += `</div></div>`

  html += _divider

  // ── Decode Pipeline ──
  const pipeline = [
    { step: 1, label: 'Huffman Decode', c: '#f97316' },
    { step: 2, label: 'Inverse Zigzag', c: '#fbbf24' },
    { step: 3, label: 'Dequantize (DQT)', c: '#22d3ee' },
    { step: 4, label: 'Inverse DCT (IDCT)', c: '#34d399' },
    { step: 5, label: 'YCbCr → RGB', c: '#60a5fa' },
  ]

  html += `<div style="padding:4px 0">`
  html += _secTitle('Decode Pipeline')
  html += `<div style="display:flex;flex-direction:column;gap:2px">`
  for (let i = 0; i < pipeline.length; i++) {
    const p = pipeline[i]
    const [r, g, b] = _hexRgb(p.c)
    html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:4px;` +
      `background:rgba(${r},${g},${b},0.05);border:1px solid rgba(${r},${g},${b},0.1)">` +
      `<span style="font-size:10px;font-family:var(--font-mono);color:${p.c};font-weight:600">${p.step}</span>` +
      `<span style="font-size:11px;color:var(--color-text)">${p.label}</span></div>`
    if (i < pipeline.length - 1) {
      html += `<div style="text-align:center;font-size:9px;color:var(--color-text-muted);line-height:1">▼</div>`
    }
  }
  html += `</div></div>`

  return html
}

function _renderView() {
  const total = _seg.reduce((a, s) => a + s.size, 0) || 1

  // === LEFT: Segment Map (100% height, proportional with min-height) ===
  let mapHtml = `<div style="font-size:8px;font-family:var(--font-mono);color:var(--color-text-muted);` +
    `text-transform:uppercase;letter-spacing:0.08em;text-align:center;flex-shrink:0;margin-bottom:2px">Segments</div>`

  for (const s of _seg) {
    const c = _segColor(s.type)
    const [r, g, b] = _hexRgb(c)
    const isECS = s.type === 'ECS'
    const isMarker = s.type === 'SOI' || s.type === 'EOI'
    const grow = Math.max(1, s.size)
    const minH = isMarker ? 12 : 18

    if (isECS) {
      mapHtml += `<div class="hf-seg-block" style="flex:${grow} 0 0px;min-height:${minH}px;border-radius:2px;` +
        `background:linear-gradient(180deg,rgba(${r},${g},${b},0.08),rgba(239,68,68,0.05));` +
        `border:1px solid rgba(${r},${g},${b},0.12);--glow:rgba(${r},${g},${b},0.3);` +
        `display:flex;flex-direction:column;align-items:center;justify-content:center" ` +
        `data-hf-select="${s.offset}:${s.size}" title="${s.type}: ${_fmtSz(s.size)}">` +
        `<div style="font-size:7px;font-family:var(--font-mono);color:rgba(${r},${g},${b},0.4)">${s.type}</div>` +
        `<div style="font-size:6px;font-family:var(--font-mono);color:var(--color-text-muted)">(data)</div></div>`
    } else {
      const bgA = isMarker ? 0.3 : 0.15
      const bdA = isMarker ? 0.5 : 0.3
      mapHtml += `<div class="hf-seg-block" style="flex:${grow} 0 0px;min-height:${minH}px;border-radius:2px;` +
        `background:rgba(${r},${g},${b},${bgA});border:1px solid rgba(${r},${g},${b},${bdA});` +
        `--glow:rgba(${r},${g},${b},0.3);` +
        `display:flex;align-items:center;justify-content:center;` +
        `font-size:${isMarker ? 6 : 7}px;font-family:var(--font-mono);color:rgba(${r},${g},${b},0.8);` +
        `line-height:1" ` +
        `data-hf-select="${s.offset}:${s.size}" title="${s.type}: ${_fmtSz(s.size)}">${s.type}</div>`
    }
  }

  // === CENTER: Node Cards with Connection Arrows ===
  let cardsHtml = ''
  for (let i = 0; i < _seg.length; i++) {
    const s = _seg[i]
    const c = _segColor(s.type)
    const [r, g, b] = _hexRgb(c)
    const desc = _SEGDESC[s.type] || s.type
    const icon = _SEGICONS[s.type] || '◇'
    const end = s.offset + s.size
    const detail = _renderSegDetail(s)

    // ── Connection arrow ──
    if (i > 0) {
      const pc = _segColor(_seg[i - 1].type)
      const [pr, pg, pb] = _hexRgb(pc)
      cardsHtml += `<div style="display:flex;flex-direction:column;align-items:center;margin:1px 0">` +
        `<div style="width:1px;height:14px;background:linear-gradient(180deg,rgba(${pr},${pg},${pb},0.4),rgba(${r},${g},${b},0.4))"></div>` +
        `<div style="font-size:9px;color:var(--color-text-muted);line-height:1">▼</div>` +
        `</div>`
    }

    // ── Node Card ──
    cardsHtml += `<div class="hf-node" style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:10px;padding:12px;` +
      `box-shadow:0 0 0 1px rgba(${r},${g},${b},0.1),0 0 12px rgba(${r},${g},${b},0.03);` +
      `--glow:rgba(${r},${g},${b},0.5);--glow-soft:rgba(${r},${g},${b},0.12)">`

    // Header row: icon box + title block + marker badge
    cardsHtml += `<div style="display:flex;align-items:center;gap:10px${detail ? ';margin-bottom:10px' : ''}" ` +
      `data-hf-select="${s.offset}:${s.size}">`

    // Icon box
    cardsHtml += `<div style="width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;` +
      `background:rgba(${r},${g},${b},0.12);flex-shrink:0;font-size:14px;color:${c}">${icon}</div>`

    // Title + subtitle
    cardsHtml += `<div style="flex:1;min-width:0">`
    cardsHtml += `<div style="font-size:13px;font-weight:600;color:var(--color-text)">${s.type} — ${desc}</div>`
    cardsHtml += `<div style="font-size:10px;font-family:var(--font-mono);color:var(--color-text-muted)">${_hx(s.offset)} – ${_hx(end - 1)} · ${_fmtSz(s.size)}</div>`
    cardsHtml += `</div>`

    // Marker badge
    if (s.marker) {
      cardsHtml += `<div style="padding:2px 8px;border-radius:4px;background:rgba(${r},${g},${b},0.15);` +
        `color:${c};font-size:10px;font-weight:700;font-family:var(--font-mono);letter-spacing:0.05em;flex-shrink:0">${s.marker}</div>`
    }
    cardsHtml += `</div>`

    // Detail content
    if (detail) cardsHtml += detail
    cardsHtml += `</div>`
  }

  // === Assemble Layout ===
  const insightHtml = _renderInsightPanel()

  return `<div style="display:flex;height:100%">` +
    // Left segment map
    `<div style="width:52px;flex-shrink:0;display:flex;flex-direction:column;gap:1.5px;padding:4px;` +
    `background:var(--color-bg-secondary);border-right:1px solid var(--color-border);overflow-y:auto">` +
    mapHtml + `</div>` +
    // Center: cards + insight panel (responsive flex-wrap)
    `<div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start">` +
      // Cards column
      `<div style="flex:1 1 200px;min-width:200px;display:flex;flex-direction:column">` +
      cardsHtml + `</div>` +
      // Insight side panel (right when wide, bottom when narrow via flex-wrap)
      `<div style="flex:0 0 210px;display:flex;flex-direction:column;gap:0;` +
      `border-left:1px solid var(--color-border);padding-left:10px">` +
      insightHtml + `</div>` +
    `</div>` +
    `</div>`
}

if (_seg.length > 0) {
  await hf.template.setView(_renderView())
}
hf.log(`JPEG template applied: ${segmentCount} segments parsed`)