import streamlines from '@anvaka/streamlines'
import generateFunction from './generateFunction'
import uniqolor from 'uniqolor'
import generateNoise from './generateNoise'
import { lighten } from 'color2k'

function choose(...choices) {
  const randomIndex = Math.floor(Math.random() * choices.length)
  return choices[randomIndex]
}

function compileVectorFieldFunction(code) {
  try {
    // eslint-disable-next-line no-new-func
    const creator = new Function(code + '\nreturn getVelocity;')
    const getVelocity = creator()
    // getVelocity(selectSeedPoint(boundingBox))
    return getVelocity
  } catch (e) {
    return null
  }
}

export default function generate(canvas, { event }) {
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothQuality = true

  // NOTE: Background gradient
  const gradient = ctx.createLinearGradient(
    Math.random() * canvas.width,
    0,
    Math.random() * canvas.width,
    canvas.height
  )

  gradient.addColorStop(
    0,
    uniqolor.random({
      saturation: [10, 60],
      lightness: [5, 95],
    }).color
  )
  gradient.addColorStop(
    1,
    uniqolor.random({
      saturation: [10, 60],
      lightness: [5, 95],
    }).color
  )

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // NOTE: Bounding box range/offset
  const boxXRange = Math.round(Math.random() * 15) + 1
  const edgeX = -boxXRange + Math.round(Math.random() * boxXRange)

  const boxYRange = Math.round(Math.random() * 15) + 1
  const edgeY = -boxYRange + Math.round(Math.random() * boxYRange)

  const boundingBox = {
    left: edgeX,
    top: edgeY,
    width: boxXRange,
    height: boxYRange,
  }

  // NOTE: Color ranges
  const hueRange = getHueRange()

  const satLow = Math.round(Math.random() * 100)
  const satHigh = Math.round(Math.random() * 100 - satLow) + satLow
  const saturationRange = [satLow, satHigh]

  const lightnessLow = Math.round(Math.random() * 100)
  const lightnessHigh =
    Math.round(Math.random() * 100 - lightnessLow) + lightnessLow
  const lightnessRange = [lightnessLow, lightnessHigh]

  // NOTE: Streamline options
  const dSep = Math.random() * 0.4 + 0.01
  const dSepStep = choose((Math.random() * dSep) / 100, 0, 0)
  const dTest = dSep * (Math.random() + 0.01)
  let dWidth = dSep * (Math.random() * 2 + 1) * 30
  const dWidthStep = choose((Math.random() * dWidth) / 50, 0)

  // NOTE: Color strategy
  const colorStrategy = choose('line', 'gradient', 'solid', 'gradient line')

  // NOTE: Pick solid color for solid strategy
  const solidColor = pickColor({ hueRange, saturationRange, lightnessRange })

  // NOTE: Setup gradient for gradient strategy
  const gradPointA = {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
  }
  const gradPointB = {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
  }
  const gradColorA = pickColor({ hueRange, saturationRange, lightnessRange })
  const gradColorB = pickColor({ hueRange, saturationRange, lightnessRange })

  function pickGradientColor(a) {
    const probA = Math.pow(
      Math.pow(a.x - gradPointA.x, 2) + Math.pow(a.y - gradPointA.y, 2),
      2
    )
    const probB = Math.pow(
      Math.pow(a.x - gradPointB.x, 2) + Math.pow(a.y - gradPointB.y, 2),
      2
    )

    const isA = Math.random() * (probA + probB) < probA

    // NOTE: Lighten for variability when lines are very close together
    return isA
      ? lighten(gradColorA, Math.random() * 0.2)
      : lighten(gradColorB, Math.random() * 0.2)
  }

  // NOTE: Pick vectorField strategy (noise, function, noisy function)
  const pickNoise = () => {
    // console.log('Func: Noise')
    return generateNoise().vectorField
  }
  const pickFunc = () => {
    const code = generateFunction()
    // console.log('Func: ', code)
    return compileVectorFieldFunction(code)
  }
  const pickNoisyFunc = () => {
    // console.log('Func: Noisy Func')
    const noise = generateNoise().vectorField
    const funcCode = generateFunction()
    const func = compileVectorFieldFunction(funcCode)

    return (p) => {
      const pNoise = noise(p)
      const pFunc = func(p)
      return {
        x: pNoise.x * pFunc.x,
        y: pNoise.y * pFunc.y,
      }
    }
  }

  const vectorField = choose(pickNoise, pickFunc, pickNoisyFunc)()
  // const vectorField = (p) => {
  //   return {
  //     x: Math.sin(p.x / p.y),
  //     y: Math.sin(p.y / p.x),
  //   }
  // }

  // NOTE: Set seed point to where the user clicked
  const seedPoint = toBoundingBoxPoint(
    {
      x: event.locationX,
      y: event.locationY,
    },
    boundingBox,
    canvas
  )

  // NOTE: Generate streamline calculator
  const calculator = streamlines({
    // As usual, define your vector field:
    vectorField,
    dSep,
    dTest,
    timeStep: 0.01,
    stepsPerIteration: 5,
    seed: seedPoint,

    // And print the output to this canvas:
    onPointAdded,
    boundingBox,
  })

  const grid = calculator.getGrid()

  function onPointAdded(a, b, cfg, all) {
    // NOTE: Apply randomized dSepStep
    cfg.dSep += Math.random() * dSepStep

    if (!all.color) {
      // NOTE: Pick colors that apply to entire lines
      if (colorStrategy === 'line') {
        all.color = pickColor({ lightnessRange, hueRange, saturationRange })
      }

      if (colorStrategy === 'solid') {
        // NOTE: Randomly lighten to avoid a blob of one color
        all.color = lighten(solidColor, Math.random() * 0.2)
      }

      if (colorStrategy === 'gradient line') {
        const mid = {
          x: (all[0].x + all[1].x) / 2,
          y: (all[0].y + all[1].y) / 2,
        }
        all.color = pickGradientColor(mid)
      }
    }

    // NOTE: Pick width
    const dA = grid.findNearest(a.x, a.y)
    const dB = grid.findNearest(b.x, b.y)
    const wA = dA > dSep ? 1 : (dA - dTest) / (dSep - dTest)
    const wB = dB > dSep ? 1 : (dB - dTest) / (dSep - dTest)
    let width = (wA + wB) / 2

    width *= dWidth
    // NOTE: Clamp width to 0-40, apply randomized width step
    dWidth = Math.max(dWidth + (Math.random() - 0.5) * dWidthStep, 0)
    dWidth = Math.min(dWidth, 40)

    a = toCanvasPoint(a, boundingBox, canvas)
    b = toCanvasPoint(b, boundingBox, canvas)

    // NOTE: Apply color based on strategy
    switch (colorStrategy) {
      case 'line':
        ctx.strokeStyle = all.color
        break
      case 'draw':
        ctx.strokeStyle = pickColor({
          lightnessRange,
          hueRange,
          saturationRange,
        })
        break
      case 'gradient':
        ctx.strokeStyle = pickGradientColor(a)

        break
      case 'solid':
        ctx.strokeStyle = all.color
        break
      case 'gradient line':
        ctx.strokeStyle = all.color
        break
    }

    // NOTE: Alternative "tape" rendering mode, looks kind of bad
    // const region = new Path2D()
    // region.moveTo(a.x, a.y)
    // region.lineTo(a.x + dWidth * 2, a.y)
    // region.lineTo(b.x + dWidth * 2, b.y + dWidth * 2)
    // region.lineTo(b.x, b.y)
    // region.closePath()
    // ctx.fillStyle = ctx.strokeStyle
    // ctx.fill(region, 'nonzero')

    // NOTE: Draw line
    ctx.beginPath()
    ctx.lineCap = 'round'
    ctx.lineWidth = width
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.closePath()
  }

  return {
    run: () => {
      return calculator.run()
    },
    stop: () => {
      calculator.dispose()
    },
  }
}

// NOTE: Pick a random color within the ranges
function pickColor({ hueRange, lightnessRange, saturationRange }) {
  try {
    return uniqolor.random({
      saturation: saturationRange,
      lightness: lightnessRange,
      excludeHue: hueRange,
    }).color
  } catch {
    return uniqolor(Date.now()).color
  }
}

// NOTE: Convert bounding box point to canvas point
function toCanvasPoint(pt, boundingBox, canvas) {
  const tx = (pt.x - boundingBox.left) / boundingBox.width
  const ty = (pt.y - boundingBox.top) / boundingBox.height
  return {
    x: tx * canvas.width,
    y: (1 - ty) * canvas.height,
  }
}

// NOTE: Convert canvas point to bounding box point
function toBoundingBoxPoint({ x, y }, boundingBox, canvas) {
  const tx = (x / canvas.width) * boundingBox.width
  const ty = (1 - y / canvas.height) * boundingBox.height

  return {
    x: tx + boundingBox.left,
    y: ty + boundingBox.top,
  }
}

// NOTE: Pick a random hue range
function getHueRange() {
  const rangeStart = Math.round(Math.random() * 320) // NOTE: Limit hue min to 320
  const rangeEnd = Math.round(Math.random() * (359 - rangeStart) + rangeStart)

  return [
    [0, rangeStart],
    [rangeEnd, 359],
  ]
}
