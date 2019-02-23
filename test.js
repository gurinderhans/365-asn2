document.getElementById('jpg').onchange = draw;
function draw(e) {
  var canvas = document.getElementById('canvas')
  var ctx = canvas.getContext('2d')
  var img = new Image()
  img.onload = function() {
    canvas.setAttribute('width', img.width)
    canvas.setAttribute('height', img.height)
    ctx.drawImage(img, 0,0)

    var imgd = ctx.getImageData(0,0, img.width, img.height)
    processData(imgd)
    ctx.putImageData(imgd, 0,0)
  }
  img.src = URL.createObjectURL(e.target.files[0])
}

function drawImage(image, width, height) {
  const outerdiv = document.createElement("div")
  const canvas = document.createElement("canvas")

  canvas.setAttribute('width', width)
  canvas.setAttribute('height', height)
  canvas.setAttribute('style', 'border:1px dotted #3f3f3f; padding: 4px')

  outerdiv.appendChild(canvas)

  document.getElementById("images").appendChild(outerdiv)

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

  let yuvSampled = [yuv[0], ...uvChroma]

  drawImage(channelToRGBA(yuvSampled[0]), width, height)
  drawImage(channelToRGBA(yuvSampled[1]), width/2, height/2)
  drawImage(channelToRGBA(yuvSampled[2]), width/2, height/2)


  // 3. dct transformation
  let TMatrix = new Array(8).fill().map(_ => [])
  for (let i=0; i<8; ++i) {
    for (let j=0; j<8; j++) {
      TMatrix[i][j] = dct(i,j)
    }
  }

  // 3a. block DCT for Y channel
  let yDCT = []
  for (let i=0; i<height/8; ++i) {
    for (let j=0; j<width/8; ++j) {
      r=blockDCT(yuvSampled[0], TMatrix, width, height, i,j)
      yDCT.push(r)
    }
  }
  drawImage(channelToRGBA(yDCT.flat(2)), width, height)

  let uvDCT = [[],[]]
  // 3b. block DCT for U&V channels
  for (let i=0; i<height/16; ++i) {
    for (let j=0; j<width/16; ++j) {
      r=blockDCT(yuvSampled[1], TMatrix, width/2, height/2, i,j)
      r1=blockDCT(yuvSampled[2], TMatrix, width/2, height/2, i,j)
      uvDCT[0].push(r)
      uvDCT[1].push(r1)
    }
  }

  drawImage(channelToRGBA(uvDCT[0].flat(2)), width/2, height/2)
  drawImage(channelToRGBA(uvDCT[1].flat(2)), width/2, height/2)

}

function blockDCT(channel, TMatrix, width, height, i,j) {
  
  let block = new Array(8).fill().map(_ => [])
  for (let y=0; y<8; ++y) {
    for (let x=0; x<8; x++) {
      let idx = (height*i*8) + y*width + x + (j*8)
      if (idx >= channel.length) console.log("ERR")
      block[y][x] = channel[idx] - 128
    }
  }

  let dctOut = 
    matrixMultiply(
      matrixMultiply(TMatrix, block),
      transpose(TMatrix))

  return dctOut
}

function channelToRGBA(chan) {
  let rgba = []
  for (let i=0; i<chan.length; ++i) {
    const val = chan[i]
    rgba.push(val,val,val,255)
  }
  return rgba
}

// ---------------- util funcs below

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
      return A[i].reduce((sum, elm, k) => sum + (elm*B[k][j]) ,0)
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
