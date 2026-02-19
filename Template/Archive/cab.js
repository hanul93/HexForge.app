// Microsoft Cabinet (CAB) Parser — HexForge JS Template
// Author: Kei Choi (hanul93@gmail.com)
// Category: Archive

hf.template.begin('Microsoft Cabinet')
hf.template.setFormat('cab-parser', 'Microsoft Cabinet (JS)', ['.cab'])

// === Helpers ===

async function readCString(name) {
  const startOff = hf.template.tell()
  let len = 0
  while (true) {
    const b = await hf.read(startOff + len, 1)
    len++
    if (b[0] === 0) break
    if (len > 4096) break
  }
  return await hf.template.addField(name, `string:${len}`)
}

// === CFHEADER ===
hf.template.beginStruct('CFHEADER')
  const signature = await hf.template.addField('signature', 'string:4', { color: '#44cc44' })
  await hf.template.addField('reserved1', 'u32', { color: '#808080' })
  const cbCabinet = await hf.template.addField('cbCabinet', 'u32', { color: '#4488ff' })
  await hf.template.addField('reserved2', 'u32', { color: '#808080' })
  const coffFiles = await hf.template.addField('coffFiles', 'u32', { color: '#ff8844' })
  await hf.template.addField('reserved3', 'u32', { color: '#808080' })
  const versionMinor = await hf.template.addField('versionMinor', 'u8')
  const versionMajor = await hf.template.addField('versionMajor', 'u8')
  const cFolders = await hf.template.addField('cFolders', 'u16', { color: '#cc44cc' })
  const cFiles = await hf.template.addField('cFiles', 'u16', { color: '#cc44cc' })
  const flags = await hf.template.addField('flags', 'u16', { color: '#ffcc44' })
  await hf.template.addField('setID', 'u16')
  await hf.template.addField('iCabinet', 'u16')

  let cbCFFolder = undefined
  let cbCFData = undefined

  // cfhdrRESERVE_PRESENT (0x0004)
  if (flags & 0x0004) {
    const cbCFHeader = await hf.template.addField('cbCFHeader', 'u16')
    cbCFFolder = await hf.template.addField('cbCFFolder', 'u8')
    cbCFData = await hf.template.addField('cbCFData', 'u8')
    if (cbCFHeader > 0) {
      await hf.template.addField('abReserve', `bytes:${cbCFHeader}`)
    }
  }

  // cfhdrPREV_CABINET (0x0001)
  if (flags & 0x0001) {
    await readCString('szCabinetPrev')
    await readCString('szDiskPrev')
  }

  // cfhdrNEXT_CABINET (0x0002)
  if (flags & 0x0002) {
    await readCString('szCabinetNext')
    await readCString('szDiskNext')
  }
hf.template.endStruct()

// === CFFOLDER entries ===
let lastCFDataCount = 0
for (let i = 0; i < cFolders; i++) {
  hf.template.beginStruct(`CFFOLDER [${i}]`)
    await hf.template.addField('coffCabStart', 'u32', { color: '#ff8844' })
    const cCFDataVal = await hf.template.addField('cCFData', 'u16', { color: '#cc44cc' })
    await hf.template.addField('typeCompress', 'u16', {
      enumMap: { 0: 'None', 1: 'MSZIP', 2: 'Quantum', 3: 'LZX' }
    })
    if (cbCFFolder !== undefined && cbCFFolder > 0) {
      await hf.template.addField('abReserve', `bytes:${cbCFFolder}`)
    }
    lastCFDataCount = cCFDataVal
  hf.template.endStruct()
}

// === CFFILE entries ===
for (let i = 0; i < cFiles; i++) {
  hf.template.beginStruct(`CFFILE [${i}]`)
    await hf.template.addField('cbFile', 'u32', { color: '#4488ff' })
    await hf.template.addField('uoffFolderStart', 'u32')
    await hf.template.addField('iFolder', 'u16')
    const dateRaw = await hf.template.addField('date (DOSDATE)', 'u16', { color: '#44cccc' })
    const timeRaw = await hf.template.addField('time (DOSTIME)', 'u16', { color: '#44cccc' })
    await hf.template.addField('attribs', 'u16', { color: '#ffcc44' })
    await readCString('szName')
  hf.template.endStruct()
}

// === CFDATA blocks (last folder) ===
for (let i = 0; i < lastCFDataCount; i++) {
  hf.template.beginStruct(`CFDATA [${i}]`)
    await hf.template.addField('csum', 'u32', { color: '#808080' })
    const cbData = await hf.template.addField('cbData', 'u16', { color: '#ff4444' })
    await hf.template.addField('cbUncomp', 'u16', { color: '#88ff88' })
    if (cbCFData !== undefined && cbCFData > 0) {
      await hf.template.addField('abReserve', `bytes:${cbCFData}`)
    }
    if (cbData > 0) {
      await hf.template.addField('ab', `bytes:${cbData}`, { color: '#6666ff' })
    }
  hf.template.endStruct()
}

await hf.template.end()
hf.log('CAB template applied successfully')
hf.log(`Version: ${versionMajor}.${versionMinor}`)
hf.log(`Folders: ${cFolders}, Files: ${cFiles}`)
hf.log(`Cabinet size: ${cbCabinet} bytes`)
