document.getElementById('jpg').onchange = draw;
function draw(e) {
  var canvas = document.getElementById('canvas')
  var ctx = canvas.getContext('2d')
  var img = new Image()
  img.onload = function() {

    const titleEl = document.createElement("h2")
    titleEl.innerText = "Original"
    document.getElementById("original").prepend(titleEl)

    canvas.setAttribute('width', img.width)
    canvas.setAttribute('height', img.height)
    ctx.drawImage(img, 0,0)

    var imgd = ctx.getImageData(0,0, img.width, img.height)
    processData(imgd)
    ctx.putImageData(imgd, 0,0)
  }
  img.src = URL.createObjectURL(e.target.files[0])
}

function drawImage(title, image, width, height, prepend=false) {
  const outerdiv = document.createElement("div")
  outerdiv.setAttribute("class", "imageDiv")

  const titleEl = document.createElement("h2")
  titleEl.innerText = title
  outerdiv.appendChild(titleEl)

  const canvas = document.createElement("canvas")
  canvas.setAttribute('width', width)
  canvas.setAttribute('height', height)
  canvas.setAttribute('style', 'border:1px dotted #3f3f3f; padding: 4px')

  outerdiv.appendChild(canvas)


  if (prepend == true) {
    document.getElementById("images").prepend(outerdiv)
  } else {
    document.getElementById("images").appendChild(outerdiv)
  }

  const context = canvas.getContext('2d')
  const imgd = context.createImageData(width, height);

  let pixels = imgd.data
  for (let i=0; i<image.length; ++i) {
    pixels[i] = image[i];
  }

  context.putImageData(imgd, 0,0)
}

function processData(image) {
 
  let {data, width, height} = image

  // 1. rgb -> yuv
  let yuv = [[],[],[]]
  for(let i=0; i<data.length; i+=4) {
    let [y,u,v] = rgb2yuv(data[i], data[i+1], data[i+2])
    yuv[0].push(y)
    yuv[1].push(u)
    yuv[2].push(v)
  }

  // 2. chroma subsampling 4:2:0
  let uvChroma = [[],[]]
  for (let i=0; i<height; i+=2) {
    for (let j=0; j<width; j+=4) {
      let UtopRow = yuv[1].slice(i*width + j, i*width + j+4)
      let VtopRow = yuv[2].slice(i*width + j, i*width + j+4)

      uvChroma[0].push(...chroma420(UtopRow))
      uvChroma[1].push(...chroma420(VtopRow))
    }
  }

  let yuvSampled = [
    yuv[0],
    ...uvChroma
  ]
  drawImage("Y-channel image", channelToRGBA(yuvSampled[0]), width, height)
  drawImage("U-channel image", channelToRGBA(yuvSampled[1]), width/2, height/2)
  drawImage("V-channel image", channelToRGBA(yuvSampled[2]), width/2, height/2)


  // 3. dct transformation & quantization & inverse

  // 3a. convert all channel 1d arrays into 8x8 blocks for DCT
  let yuvBlocks = [
    chanArrayToBlocks(yuvSampled[0], width, height),
    chanArrayToBlocks(yuvSampled[1], width/2, height/2),
    chanArrayToBlocks(yuvSampled[2], width/2, height/2)
  ]

  // 3b. initialize Q-matrix and T-matrix
  const q50Matrix = [
    [16,11,10,16,24,40,51,61],
    [12,12,14,19,26,58,60,55],
    [14,13,16,24,40,57,69,56],
    [14,17,22,29,51,87,80,62],
    [18,22,37,56,68,109,103,77],
    [24,35,55,64,81,104,113,92],
    [49,64,78,87,103,121,120,101],
    [72,92,95,98,112,100,103,99]
  ]
  const q10Matrix = [
    [80,60,50,80,120,200,255,255],
    [55,60,70,95,130,255,255,255],
    [70,65,80,120,200,255,255,255],
    [70,85,110,145,255,255,255,255],
    [90,100,185,255,255,255,255,255],
    [120,175,255,255,255,255,255,255],
    [245,255,255,255,255,255,255,255],
    [255,255,255,255,255,255,255,255],
  ]

  const q90Matrix = [
    [3,2,2,3,5,8,10,12],
    [2,2,3,4,5,12,12,11],
    [3,3,3,5,8,11,14,11],
    [3,3,4,6,10,17,16,12],
    [4,4,7,11,14,22,21,15],
    [5,7,11,13,16,12,23,18],
    [10,13,16,17,21,24,24,21],
    [14,18,19,20,22,20,20,20]
  ]

  // get quantization level
  let qMatrix = null
  let qSelectVal = document.getElementById("qvals").value
  if (qSelectVal == "10") {
    qMatrix = q10Matrix
  } else if (qSelectVal == "50") {
    qMatrix = q50Matrix
  } else {
    qMatrix = q90Matrix
  }

  let Tmatrix = new Array(8).fill().map(_ => [])
  for (let i=0; i<8; ++i) {
    for (let j=0; j<8; j++) {
      Tmatrix[i][j] = dct(i,j)
    }
  }


  let dctizedBlocks=[[],[],[]]
  let unquantizedBlocks = [[],[],[]]


  // 3c. DCT -> quantize -> unquantize -> IDCT
  for (let i=0; i<yuvBlocks.length; ++i) {
    const blocks = yuvBlocks[i]
    for (let j=0; j<blocks.length; ++j) {
      // i. normal -> DCT
      let dct = blockDCT(Tmatrix, blocks[j]);
      dctizedBlocks[i].push(dct)
      // ii. DCT -> quantize
      let quantized = quantize(qMatrix, dct)
      // iii. quantize -> unquantize
      let unquantized = unquantize(qMatrix, quantized)
      unquantizedBlocks[i].push(unquantized)
      // iv. unquantize -> IDCT
      let idct = blockIDCT(Tmatrix, unquantized)
      yuvBlocks[i][j] = idct
    }
  }

  // 4. combine y/u/v channels into one
  let yChan = blocksToChanArray(yuvBlocks[0], width, height)
  let uChan = blocksToChanArray(yuvBlocks[1], width/2, height/2)
  let vChan = blocksToChanArray(yuvBlocks[2], width/2, height/2)

  drawImage("DCT Y-Channel matrix",channelToRGBA(blocksToChanArray(dctizedBlocks[0], width, height)), width, height)
  drawImage("After Quantization Y-Channel",channelToRGBA(blocksToChanArray(unquantizedBlocks[0], width, height)), width, height)

  drawImage("DCT U-Channel matrix",channelToRGBA(blocksToChanArray(dctizedBlocks[1], width/2, height/2)), width/2, height/2)
  drawImage("After Quantization U-Channel",channelToRGBA(blocksToChanArray(unquantizedBlocks[1], width/2, height/2)), width/2, height/2)

  drawImage("DCT V-Channel matrix",channelToRGBA(blocksToChanArray(dctizedBlocks[2], width/2, height/2)), width/2, height/2)
  drawImage("After Quantization V-Channel",channelToRGBA(blocksToChanArray(unquantizedBlocks[2], width/2, height/2)), width/2, height/2)


  drawImage("IDCT Y-Channel", channelToRGBA(yChan), width, height)
  drawImage("IDCT U-Channel", channelToRGBA(uChan), width/2, height/2)
  drawImage("IDCT V-Channel", channelToRGBA(vChan), width/2, height/2)


  let yuvMerged = Array(height).fill().map(_ => [])
  for (let i=0, counter=0; i<height; i+=2) {
    for (let j=0; j<width; j+=2, counter++) {
      const topRow = yChan.slice(i*width + j, i*width + j+2)
      const bottomRow = yChan.slice((i+1) * width + j, (i+1) * width + j+2)
      const Uval = uChan[counter]
      const Vval = vChan[counter]

      yuvMerged[i].push(topRow[0],Uval, Vval, topRow[1], Uval, Vval)
      yuvMerged[i+1].push(bottomRow[0],Uval, Vval, bottomRow[1], Uval, Vval)
    }
  }
  yuvMerged = yuvMerged.flat()


  // 5. yuv -> rgb
  let rgba=[]
  for (let i=0; i<yuvMerged.length; i+=3) {
    const [r,g,b] = yuv2rgb(yuvMerged[i], yuvMerged[i+1], yuvMerged[i+2])
    rgba.push(r,g,b,255)
  }

  drawImage("Final image", rgba, width, height, prepend=true)
}

function chanArrayToBlocks(chan, width, height, blockSize = 8) {
  let blocks = []
  for (let i=0; i<height/blockSize; ++i) {
    for (let j=0; j<width/blockSize; j++) {
      let block = Array(blockSize).fill().map(_ => [])
      for (let y=0; y<blockSize; ++y) {
        for (let x=0; x<blockSize; x++) {
          const idx = (width * i * blockSize) + (y * width) + x + (j * blockSize)
          block[y][x] = chan[idx]
        }
      }
      blocks.push(block)
    }
  }
  return blocks
}

function blocksToChanArray(blocks, width, height, blockSize = 8) {
  let chanArray = []
  for (let i=0; i<blocks.length; i+=width/blockSize) {
    let blockRow = blocks.slice(i, i+(width/blockSize))
    for (let y=0; y<blockSize; ++y) {
      for (let j=0; j<(width/blockSize); j++) {
        for (let x=0; x<blockSize; ++x) {
          const val = blockRow[j][y][x]
          chanArray.push(val)
        }
      }
    }
  }
  return chanArray
}

function quantize(qMatrix, channel) {
  let res = new Array(8).fill().map(_ => [])
  for (let y=0; y<8; ++y) {
    for (let x=0; x<8; x++) {
      res[y][x] = Math.round(channel[y][x] / qMatrix[y][x])
    }
  }
  return res
}

function unquantize(qMatrix, channel) {
  let res = new Array(8).fill().map(_ => [])
  for (let y=0; y<8; ++y) {
    for (let x=0; x<8; x++) {
      res[y][x] = qMatrix[y][x] * channel[y][x]
    }
  }
  return res
}

function blockDCT(Tmatrix, block) {
  for (let y=0; y<8; ++y) {
    for (let x=0; x<8; x++) {
      block[y][x] = block[y][x] - 128
    }
  }

  return matrixMultiply(
          matrixMultiply(
            Tmatrix,
            block),
          transpose(Tmatrix))
}

function blockIDCT(Tmatrix, block) {
  let idctMatrix = matrixMultiply(
          matrixMultiply(
            transpose(Tmatrix),
            block),
          Tmatrix)

  for (let y=0; y<8; ++y) {
    for (let x=0; x<8; x++) {
      idctMatrix[y][x] = idctMatrix[y][x] + 128
    }
  }

  return idctMatrix
}

function channelToRGBA(chan) {
  let rgba = []
  for (let i=0; i<chan.length; ++i) {
    const val = chan[i]
    rgba.push(val,val,val,255)
  }
  return rgba
}

function dct(i,j) {
  if (i == 0) {
    return 1/Math.sqrt(8)
  } else {
    return Math.sqrt(2/8) * Math.cos(((2*j+1) * i*Math.PI)/16)
  }
}

function matrixMultiply(A, B) {
  var result = new Array(A.length).fill(0).map(row => new Array(B[0].length).fill(0));
  
  return result.map((row, i) => {
    return row.map((val, j) => {
      return A[i].reduce((sum, elm, k) => sum + (elm*B[k][j]), 0)
    })
  })
}

function transpose(array) {
  return array[0].map((col, i) => array.map(row => row[i]));
}

function rgb2yuv(r,g,b) {
  y = r *  .299000 + g *  .587000 + b *  .114000
  u = r * -.168736 + g * -.331264 + b *  .500000 + 128
  v = r *  .500000 + g * -.418688 + b * -.081312 + 128
  return [y,u,v]
}

function yuv2rgb(y,u,v) {
  r = y + 1.4075 * (v - 128)
  g = y - 0.3455 * (u - 128) - (0.7169 * (v - 128))
  b = y + 1.7790 * (u - 128)
  return [r,g,b]
}

function chroma420(frame) {
  let ret = []
  for (let i=0; i<4; i+=2) {
    const val = (frame[i] + frame[i+1] +1) / 2
    ret.push(val)
  }
  return ret
}
