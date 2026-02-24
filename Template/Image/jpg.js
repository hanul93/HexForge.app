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
    for (let c = 0; c < nrComp; c++) {
      hf.template.beginStruct(`component [${c}]`)
        await hf.template.addField('compId', 'u8', { le: false })
        const sampFact = await hf.template.addField('samplingFactor', 'u8', { le: false })
        await hf.template.addField('quantTableNr', 'u8', { le: false })
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
        if (pq === 0) {
          await hf.template.addField('qTable', 'bytes:64', { color: '#ffcc44' })
        } else {
          await hf.template.addField('qTable', 'bytes:128', { color: '#ffcc44' })
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
    await hf.template.addField('Ss', 'u8', { le: false })
    await hf.template.addField('Se', 'u8', { le: false })
    await hf.template.addField('AhAl', 'u8', { le: false })
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
        if (e.tagNum === 0x010f) hf.log(`  Make: ${val}`)
        else if (e.tagNum === 0x0110) hf.log(`  Model: ${val}`)
        else if (e.tagNum === 0x0131) hf.log(`  Software: ${val}`)
        else if (e.tagNum === 0x0132) hf.log(`  ModifyDate: ${val}`)
        else if (e.tagNum === 0x9003) hf.log(`  DateTimeOriginal: ${val}`)
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
        hf.template.seek(tiffBase + e.offsetOrValue)
        await parseIFD('ExifSubIFD', tiffBase, isBigEndian, 'exif')
      } else if (e.tagNum === 0x8825 && e.offsetOrValue !== undefined) {
        // GPSInfo sub-IFD
        hf.template.seek(tiffBase + e.offsetOrValue)
        await parseIFD('GPSInfoIFD', tiffBase, isBigEndian, 'gps')
      } else if (e.tagNum === 0xa005 && e.offsetOrValue !== undefined) {
        // InteropOffset sub-IFD
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
      await hf.template.addField('versionMajor', 'u8', { le: false })
      await hf.template.addField('versionMinor', 'u8', { le: false })
      await hf.template.addField('units', 'u8', { le: false })
      const xDensity = await hf.template.addField('Xdensity', 'u16', { le: false })
      const yDensity = await hf.template.addField('Ydensity', 'u16', { le: false })
      const xThumb = await hf.template.addField('xThumbnail', 'u8', { le: false })
      const yThumb = await hf.template.addField('yThumbnail', 'u8', { le: false })
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

  const marker = await readU16BE(hf.template.tell())

  if (marker === 0xFFD8) {
    // SOI
    hf.template.beginStruct('SOI')
      await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    hf.template.endStruct()
    hf.log('Start of Image (SOI)')
  } else if (marker === 0xFFD9) {
    // EOI
    hf.template.beginStruct('EOI')
      await hf.template.addField('marker', 'u16', { le: false, enumMap: M_ID_MAP, color: '#ff4444' })
    hf.template.endStruct()
    hf.log('End of Image (EOI)')
    const remaining = fileSize - hf.template.tell()
    if (remaining > 0) {
      hf.warn('Overlay data: ' + remaining + ' byte(s) after EOI marker')
    }
    break
  } else if (marker === 0xFFDA) {
    // SOS + scan data
    await parseSOS()
    await parseScanData(fileSize)
  } else if (marker === 0xFFE0) {
    await parseAPP0()
  } else if (marker === 0xFFE1) {
    await parseAPP1()
  } else if (marker === 0xFFE2) {
    await parseAPP2()
  } else if (marker >= 0xFFE3 && marker <= 0xFFEF) {
    // APP3-APP15
    const appNum = marker - 0xFFE0
    await parseAPPGeneric(`APP${appNum}`)
  } else if (marker === 0xFFC4) {
    await parseDHT()
  } else if (marker === 0xFFDB) {
    await parseDQT()
  } else if (marker === 0xFFDD) {
    await parseDRI()
  } else if (marker === 0xFFDE) {
    await parseDHP()
  } else if (marker === 0xFFC0 || marker === 0xFFC1 || marker === 0xFFC2 || marker === 0xFFC3) {
    const sofNames = { 0xFFC0: 'SOF0', 0xFFC1: 'SOF1', 0xFFC2: 'SOF2', 0xFFC3: 'SOF3' }
    await parseSOFx(sofNames[marker])
  } else if (marker === 0xFFFE) {
    await parseComment()
  } else if (marker === 0xFFF7) {
    await parseJPGLS()
  } else if ((marker & 0xFF00) === 0xFF00) {
    // Unknown but valid marker
    await parseUnknownSection(fileSize)
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
hf.log(`JPEG template applied: ${segmentCount} segments parsed`)