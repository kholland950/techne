// Import using shorter names from import map
import * as PIXI from 'pixi.js'
import { BloomFilter } from '@pixi/filter-bloom'
import { AdjustmentFilter } from '@pixi/filter-adjustment'
import uniqolor from 'uniqolor'

import { createNoise2D } from 'simplex-noise'

import generateNoise from './generateNoise.js'
import generateFunction from './generateFunction.js'

// Utility functions to replace p5.js functions
const utils = {
  random: (min, max) => {
    if (min === undefined) return Math.random()
    if (max === undefined) return Math.random() * min
    return Math.random() * (max - min) + min
  },

  map: (value, start1, stop1, start2, stop2) => {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1))
  },

  constrain: (n, low, high) => {
    return Math.max(Math.min(n, high), low)
  },

  dist: (x1, y1, x2, y2) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  },

  noise: (x, y) => {
    return (noise2D(x, y) + 1) / 2 // Convert from [-1, 1] to [0, 1]
  },

  millis: () => {
    return performance.now()
  },

  // Color utilities
  hexToRgb: (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null
  },

  rgbToHex: (r, g, b) => {
    return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  },

  // Generate brighter, more vibrant colors
  generateBrightColor: () => {
    return uniqolor.random({
      saturation: [30, 60],
      lightness: [10, 25],
    }).color
  },
}

class LongExposureFilter extends PIXI.Filter {
  constructor() {
    const vertex = `
      attribute vec2 aVertexPosition;
      attribute vec2 aTextureCoord;
      uniform mat3 projectionMatrix;
      varying vec2 vTextureCoord;
      
      void main(void) {
        gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
        vTextureCoord = aTextureCoord;
      }
    `

    const fragment = `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform sampler2D uAccumulator;
      uniform float uDecay;
      uniform float uIntensity;
      uniform bool uClear;
      uniform float uThreshold;
      
      void main(void) {
      vec4 currentFrame = texture2D(uSampler, vTextureCoord);
      vec4 accumulated = texture2D(uAccumulator, vTextureCoord);
      
      if (uClear) {
        gl_FragColor = currentFrame;
      } else {
        // Blend current frame with accumulated history
        vec4 blended = accumulated * uDecay + currentFrame * uIntensity;
        
        // Calculate luminance
        float luminance = dot(blended.rgb, vec3(0.299, 0.587, 0.114));
        
        // Apply threshold to prevent infinite trails
        // if (luminance < uThreshold) {
        // Background color: 0x080c14 = rgb(8, 12, 20)
        // blended = vec4(4.0 / 255.0, 4.0 / 255.0, 16.0 / 255.0, 1.0);
        // }
        
        // Clamp luminance to a reasonable maximum (e.g., 0.8)
        if (luminance > 0.8) {
        float scale = 0.8 / luminance;
        blended.rgb *= scale;
        }

        gl_FragColor = blended;
      }
      }
    `

    super(vertex, fragment)

    // Create accumulator texture
    this.accumulatorTexture = null
    this.accumulatorSprite = null
    this.tempRenderTexture = null

    // Shader uniforms
    this.uniforms.uDecay = 0.5 // How much the previous frame persists (0.0 = no persistence, 1.0 = infinite)
    this.uniforms.uIntensity = 0.5 // How much the current frame contributes
    this.uniforms.uClear = false
    this.uniforms.uThreshold = 0.01 // Luminance threshold below which pixels are cleared to black
  }

  // Initialize textures when we know the renderer size
  initTextures(renderer) {
    if (!this.accumulatorTexture) {
      this.accumulatorTexture = PIXI.RenderTexture.create({
        width: renderer.width,
        height: renderer.height,
      })
      this.tempRenderTexture = PIXI.RenderTexture.create({
        width: renderer.width,
        height: renderer.height,
      })
      this.accumulatorSprite = new PIXI.Sprite(this.accumulatorTexture)
    }
  }

  apply(filterManager, input, output, clearMode) {
    this.initTextures(filterManager.renderer)

    // Set the accumulator texture uniform
    this.uniforms.uAccumulator = this.accumulatorTexture

    // Apply the shader: blend current input frame with accumulator
    filterManager.applyFilter(this, input, this.tempRenderTexture, clearMode)

    // Update accumulator with the blended result for next frame
    filterManager.renderer.render(new PIXI.Sprite(this.tempRenderTexture), {
      renderTexture: this.accumulatorTexture,
      clear: false,
    })

    // Copy the result to output
    filterManager.renderer.render(new PIXI.Sprite(this.tempRenderTexture), {
      renderTexture: output,
      clear: true,
    })
  }

  // Setter methods for easy control
  set decay(value) {
    this.uniforms.uDecay = value
  }

  get decay() {
    return this.uniforms.uDecay
  }

  set intensity(value) {
    this.uniforms.uIntensity = value
  }

  get intensity() {
    return this.uniforms.uIntensity
  }

  set threshold(value) {
    this.uniforms.uThreshold = value
  }

  get threshold() {
    return this.uniforms.uThreshold
  }

  // Clear the accumulator
  clear() {
    this.uniforms.uClear = true
    // Reset flag after one frame
    setTimeout(() => {
      this.uniforms.uClear = false
    }, 16)
  }

  destroy() {
    if (this.accumulatorTexture) {
      this.accumulatorTexture.destroy()
    }
    if (this.tempRenderTexture) {
      this.tempRenderTexture.destroy()
    }
    if (this.accumulatorSprite) {
      this.accumulatorSprite.destroy()
    }
    super.destroy()
  }
}

// PIXI.js Application and utilities
let app = null
let noise2D = null

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

/**
 * @typedef {{x: number, y: number}} Point
 */

let state = {}
let vectorField = null

// Current function storage
let currentFunctionCode = null
let currentSeed = null
let currentScale = 0.1 // Default scale value

// Global reference to createEnhancedVectorField function
let createEnhancedVectorFieldGlobal = null

// Graphics containers
let vectorFieldContainer = null
let backgroundGraphics = null

// Persistent graphics objects to avoid memory leaks
let vectorFieldGraphics = null

// Initialize PIXI Application
function initPixiApp() {
  // Initialize noise function
  noise2D = createNoise2D()

  // Create PIXI application using v7 syntax
  app = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x080c14, // Dark blue background
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true, // Automatically adjust for high DPI displays
    powerPreference: 'high-performance', // Use high-performance GPU if available
  })

  document.body.appendChild(app.view)

  // Create containers for different elements
  backgroundGraphics = new PIXI.Graphics()
  vectorFieldContainer = new PIXI.Container()

  vectorFieldGraphics = new PIXI.Graphics()

  app.stage.addChild(backgroundGraphics)
  app.stage.addChild(vectorFieldContainer)

  vectorFieldContainer.addChild(vectorFieldGraphics)

  // Initialize the simulation
  // Load from URL if available, otherwise generate random function
  // if (!loadFromURL()) {
  initSimulation()
  // }

  // Add filters for visual effects
  try {
    const bloomFilter = new BloomFilter()
    bloomFilter.blur = 30
    bloomFilter.quality = 100
    bloomFilter.resolution = 1

    // Create long exposure filter
    const longExposureFilter = new LongExposureFilter()
    longExposureFilter.decay = 0.01
    longExposureFilter.intensity = 1.0
    longExposureFilter.threshold = 0.5

    // Apply general filters to the entire stage
    const stageFilters = [
      // longExposureFilter,
      new PIXI.BlurFilter(2, 16),
      bloomFilter,
      new AdjustmentFilter({
        brightness: 4,
        saturation: 1.4,
        contrast: 0.5,
      }),
      // new CRTFilter(),
    ]

    vectorFieldContainer.filters = [longExposureFilter]

    app.stage.filters = stageFilters
  } catch (error) {
    console.warn('Failed to apply filters:', error)
  }

  // Listen for hash changes to support back/forward navigation
  window.addEventListener('hashchange', () => {
    loadFromURL()
  })

  // Start the render loop
  app.ticker.add(gameLoop)

  // Setup resize handler
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight)
    drawBackground()
  })
}

function initSimulation(seed = null) {
  // Generate or use provided seed
  currentSeed = seed || Math.floor(Math.random() * 1000000)

  const functionCode = generateFunction(currentSeed)
  const fn = compileVectorFieldFunction(functionCode)
  console.log(
    'Generated vector field function with seed:',
    currentSeed,
    'scale:',
    currentScale,
    fn
  )

  // Store current function code for saving
  currentFunctionCode = functionCode

  // Create the enhanced vector field function
  vectorField = createEnhancedVectorField(fn)

  state = {
    fn,
    functionCode,
    time: 0,
  }

  drawBackground()
  updateURL() // Update URL with initial values
}

function createEnhancedVectorField(baseFn) {
  return function (x, y) {
    if (!baseFn) return { x: 0, y: 0 }

    // Convert screen coordinates to normalized coordinates for the function
    // Use currentScale to determine the coordinate range (default was 0.005 giving roughly -100 to 100)
    const scaleMultiplier = (currentScale || 5) / 5 // Default scale of 5 if not set
    const coordinateScale = 0.005 / scaleMultiplier
    const normX =
      (x - app.screen.width / 2) / (app.screen.width * coordinateScale)
    const normY =
      (y - app.screen.height / 2) / (app.screen.height * coordinateScale)

    // Get base vector field with safety checks
    let baseVec
    try {
      baseVec = baseFn({ x: normX, y: normY })

      // Check for invalid values and clamp them
      if (
        !baseVec ||
        typeof baseVec.x !== 'number' ||
        typeof baseVec.y !== 'number' ||
        !isFinite(baseVec.x) ||
        !isFinite(baseVec.y)
      ) {
        baseVec = { x: 0, y: 0 }
      } else {
        // Clamp base vector to reasonable range
        baseVec.x = utils.constrain(baseVec.x, -10, 10)
        baseVec.y = utils.constrain(baseVec.y, -10, 10)
      }
    } catch (e) {
      baseVec = { x: 0, y: 0 }
    }

    // Combine all influences
    let resultX = baseVec.x
    let resultY = baseVec.y

    // Final safety clamp to prevent extreme velocities
    // resultX = utils.constrain(resultX, -60, 60)
    // resultY = utils.constrain(resultY, -60, 60)

    return { x: resultX, y: resultY }
  }
}

// Make createEnhancedVectorField available globally
createEnhancedVectorFieldGlobal = createEnhancedVectorField

function drawBackground() {
  backgroundGraphics.clear()
  backgroundGraphics.beginFill(0x080c14, 1)
  backgroundGraphics.drawRect(0, 0, app.screen.width, app.screen.height)
  backgroundGraphics.endFill()
}

let elapsed = 0
let vectorDone = false
let xStart = 0
let yStart = 0
async function drawVectorField() {
  if (vectorDone) return
  vectorFieldGraphics.clear()

  // Draw vector field as arrows (sparsely for performance)
  const spacing = 5

  const chunkSize = 50

  if (xStart >= app.screen.width) {
    xStart = 0
    yStart += chunkSize
  } else if (yStart >= app.screen.height) {
    vectorDone = true
  }

  for (let x = xStart; x < xStart + chunkSize; x += spacing) {
    for (let y = yStart; y < yStart + chunkSize; y += spacing) {
      if (vectorField) {
        const force = vectorField(x, y)
        const magnitude = Math.sqrt(force.x * force.x + force.y * force.y)

        const arrowLength = utils.constrain(magnitude * 0.5, 3, 50)
        const endX = x + (force.x / magnitude) * arrowLength
        const endY = y + (force.y / magnitude) * arrowLength

        // Vary arrow opacity based on magnitude
        const alpha = Math.max(magnitude * 4, 1)

        vectorFieldGraphics.lineStyle(
          1,
          uniqolor.random({
            // excludeHue: [
            //   [0, 150],
            //   [200, 359],
            // ],
          }).color,
          alpha
        )
        vectorFieldGraphics.moveTo(x, y)
        vectorFieldGraphics.lineTo(endX, endY)
      }
    }
  }

  xStart += chunkSize
}

// Main game loop
let frameCounter = 0
async function gameLoop(deltaTime) {
  frameCounter++

  drawBackground()

  drawVectorField(frameCounter)

  // Update global time
  state.time++
}

// Initialize the application
initPixiApp()

function loadFromURL() {
  const hash = window.location.hash.slice(1)
  if (!hash) return false

  try {
    // Check if it's the old format (just a seed) or new format (comma-separated)
    if (hash.includes(',')) {
      const params = hash.split(',')
      if (params.length >= 1) {
        const seed = parseInt(params[0])

        if (isNaN(seed)) return false

        console.log('Loading from URL with parameters:', {
          seed,
        })

        // Initialize simulation with the seed
        initSimulation(seed)
        return true
      }
    } else {
      // Old format: just seed
      const seed = parseInt(hash)
      if (isNaN(seed)) return false

      console.log('Loading seed from URL (old format):', seed)
      initSimulation(seed)
      return true
    }

    return false
  } catch (error) {
    console.error('Failed to load from URL:', error)
    return false
  }
}

function updateURL() {
  if (currentSeed === null) return

  try {
    const params = [currentSeed].join(',')

    const newURL = `${window.location.pathname}#${params}`
    history.replaceState(null, '', newURL)
  } catch (error) {
    console.error('Failed to update URL:', error)
  }
}
