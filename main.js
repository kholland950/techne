// Import using shorter names from import map
import * as PIXI from 'pixi.js'
import { BloomFilter } from '@pixi/filter-bloom'
import { AdjustmentFilter } from '@pixi/filter-adjustment'
import uniqolor from 'uniqolor'

import { createNoise2D } from 'simplex-noise'

// import generateNoise from './generateNoise.js'
import generateFunction from './generateFunction.js'

// Custom Long Exposure Filter
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
          
          // Apply threshold to prevent infinite trails
          // If the blended result is below threshold, clear it to background color
          float luminance = dot(blended.rgb, vec3(0.299, 0.587, 0.114));
          if (luminance < uThreshold) {
            // Background color: 0x080c14 = rgb(8, 12, 20)
            // blended = vec4(0.0, 0.0, 0.0, 0.0);
            blended = vec4(4.0 / 255.0, 4.0 / 255.0, 12.0 / 255.0, 1.0);
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
      lightness: [30, 55],
    }).color
  },
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

function getVelocity(p) {
  return {
    x:
      (Math.log(Math.abs(Math.sin(Math.cos(Math.tan(p.y))))) -
        Math.sin(p.x / Math.sqrt(p.x * p.x + p.y * p.y))) *
      p.y,
    y: p.x,
  }
}

/**
 * @typedef {{x: number, y: number}} Point
 */

let state = {}
let vectorField = null
let particles = []
let numParticles = 1000
let maxTrailLength = 3

// Control variables
let flowIntensity = 4.0
let controlsVisible = true
let showVectorField = true

// Long exposure effect controls
let longExposureFilter = null
let longExposureDecay = 0.8 // How much the previous frame persists
let longExposureIntensity = 1 // How much the current frame contributes
let longExposureThreshold = 0.2 // Luminance threshold for clearing trails

// Current function storage
let currentFunctionCode = null
let currentFunctionName
let currentSeed = null
let currentScale = 5.0 // Default scale value

// Global reference to createEnhancedVectorField function
let createEnhancedVectorFieldGlobal = null

// Graphics containers
let particleContainer = null
let vectorFieldContainer = null
let backgroundGraphics = null

// Persistent graphics objects to avoid memory leaks
let particleGraphics = null
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

  // Add canvas to DOM (v7 uses app.view instead of app.canvas)
  document.body.appendChild(app.view)

  // Create containers for different elements
  backgroundGraphics = new PIXI.Graphics()
  vectorFieldContainer = new PIXI.Container()
  particleContainer = new PIXI.Container()

  // Create persistent graphics objects to avoid memory leaks
  particleGraphics = new PIXI.Graphics()
  vectorFieldGraphics = new PIXI.Graphics()

  app.stage.addChild(backgroundGraphics)
  app.stage.addChild(vectorFieldContainer)
  app.stage.addChild(particleContainer)

  // Add persistent graphics to their containers
  vectorFieldContainer.addChild(vectorFieldGraphics)
  particleContainer.addChild(particleGraphics)

  // Initialize the simulation
  // Load from URL if available, otherwise generate random function
  if (!loadFromURL()) {
    initSimulation()
  }

  loadFromStorage()

  // Add filters for visual effects
  try {
    const bloomFilter = new BloomFilter()
    bloomFilter.blur = 20
    bloomFilter.quality = 30
    bloomFilter.resolution = 32

    // Create long exposure filter
    longExposureFilter = new LongExposureFilter()
    longExposureFilter.decay = longExposureDecay
    longExposureFilter.intensity = longExposureIntensity
    longExposureFilter.threshold = longExposureThreshold

    // Apply general filters to the entire stage
    const stageFilters = [
      longExposureFilter,
      bloomFilter,
      new AdjustmentFilter({
        brightness: 1.2,
        saturation: 1.3,
        contrast: 1.05,
      }),
    ]

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

  // Setup event handlers
  setupEventHandlers()

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
  currentFunctionName = null

  // Create the enhanced vector field function
  vectorField = createEnhancedVectorField(fn)

  // Initialize particles
  particles = []
  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: utils.random(app.screen.width),
      y: utils.random(app.screen.height),
      trail: [],
      color: utils.generateBrightColor(),
      speed: utils.random(0.6, 2.5),
      life: utils.random(0.7, 1.0),
      age: 0,
    })
  }

  state = {
    fn,
    functionCode,
    particles: particles,
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

    const time = utils.millis() * 0.001

    // Global ebb and flow breathing effect
    const breathe = Math.sin(time * 0.15) * 0.3 + 0.7 // Oscillates between 0.4 and 1.0

    // Create organic time influence with breathing
    // const timeInfluenceX = (totalNoiseX + totalWaveX + breathePhase) * breathe
    // const timeInfluenceY = (totalNoiseY + totalWaveY + breathePhase) * breathe
    const timeInfluenceX = 1
    const timeInfluenceY = 1

    // Add mouse influence with noise-based variation
    const mouseX = mousePos.x || app.screen.width / 2
    const mouseY = mousePos.y || app.screen.height / 2
    const distToMouse = utils.dist(x, y, mouseX, mouseY)
    const maxMouseInfluence = Math.min(app.screen.width, app.screen.height) * 2

    // Modulate mouse influence with noise for more organic feel
    const mouseNoiseInfluence =
      utils.noise(time * 0.3, distToMouse * 0.01) * 0.5 + 0.5
    const mouseInfluenceStrength = utils.map(
      utils.constrain(distToMouse, 0, maxMouseInfluence),
      0,
      maxMouseInfluence,
      0.9 * mouseNoiseInfluence,
      0.1 * mouseNoiseInfluence
    )

    // Create attractive and swirling motion around mouse with noise variation
    const mouseVecX = (mouseX - x) * 0.0005
    const mouseVecY = (mouseY - y) * 0.0005
    // Add perpendicular component for swirling with noise modulation
    const swirl = utils.noise(time * 0.5, x * 0.001, y * 0.001) * 2 - 1
    const perpMouseX = -mouseVecY * (0.5 + swirl * 0.3)
    const perpMouseY = mouseVecX * (0.5 + swirl * 0.3)

    // Dynamic scaling based on global activity
    const globalActivity = Math.sin(time * 0.1) * 0.2 + 0.8
    const scale = 8 * globalActivity * breathe * flowIntensity

    // Combine all influences
    let resultX =
      (baseVec.x +
        timeInfluenceX +
        (mouseVecX + perpMouseX) * mouseInfluenceStrength) *
      scale
    let resultY =
      (baseVec.y +
        timeInfluenceY +
        (mouseVecY + perpMouseY) * mouseInfluenceStrength) *
      scale

    // Final safety clamp to prevent extreme velocities
    resultX = utils.constrain(resultX, -60, 60)
    resultY = utils.constrain(resultY, -60, 60)

    return { x: resultX, y: resultY }
  }
}

// Make createEnhancedVectorField available globally
createEnhancedVectorFieldGlobal = createEnhancedVectorField

async function updateParticles(deltaTime = 1) {
  // Mark particles for removal instead of updating in-place
  const particlesToKeep = []

  // Convert deltaTime to seconds and create a consistent time multiplier
  // PIXI's deltaTime is in milliseconds at 60fps = ~16.67ms, so we normalize to 60fps
  const timeMultiplier = deltaTime / 16.67 // Normalize to 60fps baseline

  for (let particle of particles) {
    if (vectorField) {
      const force = vectorField(particle.x, particle.y)

      // Store previous position for discontinuity detection
      const prevX = particle.x
      const prevY = particle.y

      // Update position with delta time compensation
      particle.x += force.x * particle.speed * 0.5 * timeMultiplier
      particle.y += force.y * particle.speed * 0.5 * timeMultiplier

      // Check for extreme position changes that would cause long lines
      const deltaX = Math.abs(particle.x - prevX)
      const deltaY = Math.abs(particle.y - prevY)
      const maxDelta = 60 // Maximum allowed movement per frame

      if (deltaX > maxDelta || deltaY > maxDelta) {
        // Reset particle position and clear trail to prevent drawing lines
        particle.x = utils.random(app.screen.width)
        particle.y = utils.random(app.screen.height)
        particle.trail = []
      }

      // Remove particles that go too far off-screen for performance
      const offScreenBuffer = 100
      const farOffScreen =
        particle.x < -offScreenBuffer ||
        particle.x > app.screen.width + offScreenBuffer ||
        particle.y < -offScreenBuffer ||
        particle.y > app.screen.height + offScreenBuffer

      // If particle is far off-screen, don't keep it
      if (farOffScreen) {
        continue // Skip this particle (don't add to particlesToKeep)
      }

      // Add to trail only if position is valid
      if (
        isFinite(particle.x) &&
        isFinite(particle.y) &&
        particle.x >= -100 &&
        particle.x <= app.screen.width + 100 &&
        particle.y >= -100 &&
        particle.y <= app.screen.height + 100
      ) {
        particle.trail.push({
          x: particle.x,
          y: particle.y,
          birthTime: utils.millis(), // Record when this trail point was created
        })
        if (particle.trail.length > maxTrailLength) {
          particle.trail.shift()
        }
      }

      // Update age and life with delta time compensation
      particle.age++
      particle.life -= 0.001 * timeMultiplier
      if (particle.life <= 0) {
        // Respawn particle and ensure trail is completely cleared
        particle.x = utils.random(app.screen.width)
        particle.y = utils.random(app.screen.height)
        particle.color = utils.generateBrightColor()
        particle.life = utils.random(0.7, 1.0)
        particle.speed = utils.random(0.6, 2.5)
        particle.age = 0
      }

      // Keep this particle since it's still valid
      particlesToKeep.push(particle)
    }
  }

  // Update particles array with only the particles we want to keep
  particles = particlesToKeep

  // Spawn new particles to maintain the target count if we're below minimum
  while (particles.length < numParticles) {
    particles.push({
      x: utils.random(app.screen.width),
      y: utils.random(app.screen.height),
      trail: [],
      color: utils.generateBrightColor(),
      speed: utils.random(0.6, 2.5),
      life: utils.random(0.7, 1.0),
      age: 0,
    })
  }
}

function drawBackground() {
  backgroundGraphics.clear()
  backgroundGraphics.beginFill(0x080c14, 0.1)
  backgroundGraphics.drawRect(0, 0, app.screen.width, app.screen.height)
  backgroundGraphics.endFill()
}

function drawVectorField() {
  // Clear the persistent graphics object instead of creating new ones

  vectorFieldGraphics.clear()

  if (!showVectorField) return

  // Draw vector field as arrows (sparsely for performance)
  const step = 60

  for (let x = step; x < app.screen.width; x += step) {
    for (let y = step; y < app.screen.height; y += step) {
      if (vectorField) {
        const force = vectorField(x, y)
        const magnitude = Math.sqrt(force.x * force.x + force.y * force.y)

        if (magnitude > 0.5) {
          const arrowLength = utils.constrain(magnitude * 0.1, 3, 15)
          const endX = x + (force.x / magnitude) * arrowLength
          const endY = y + (force.y / magnitude) * arrowLength

          // Vary arrow opacity based on magnitude
          const alpha = utils.map(magnitude, 0, 50, 20, 80) / 255

          vectorFieldGraphics.lineStyle(1, 0x5078a0, alpha)
          vectorFieldGraphics.moveTo(x, y)
          vectorFieldGraphics.lineTo(endX, endY)

          // Draw arrowhead
          const arrowSize = 2
          const angle = Math.atan2(force.y, force.x)

          vectorFieldGraphics.moveTo(endX, endY)
          vectorFieldGraphics.lineTo(
            endX - arrowSize * Math.cos(angle - 0.4),
            endY - arrowSize * Math.sin(angle - 0.4)
          )

          vectorFieldGraphics.moveTo(endX, endY)
          vectorFieldGraphics.lineTo(
            endX - arrowSize * Math.cos(angle + 0.4),
            endY - arrowSize * Math.sin(angle + 0.4)
          )
        }
      }
    }
  }
}

function drawParticles() {
  // Clear the persistent graphics object instead of creating new ones
  particleGraphics.clear()

  for (let particle of particles) {
    if (particle.trail.length > 1) {
      const col = utils.hexToRgb(particle.color)

      for (let i = 1; i < particle.trail.length; i++) {
        const prev = particle.trail[i - 1]
        const curr = particle.trail[i]

        // Check if both points are valid and the distance between them is reasonable
        if (
          prev &&
          curr &&
          isFinite(prev.x) &&
          isFinite(prev.y) &&
          isFinite(curr.x) &&
          isFinite(curr.y)
        ) {
          const distance = utils.dist(prev.x, prev.y, curr.x, curr.y)

          // Only draw line if distance is reasonable (prevents long lines across screen)
          if (distance < 50 && distance > 0) {
            const weight = utils.map(i, 0, particle.trail.length, 1.5, 4.5) // Increased thickness from 0.3-2.5 to 1.5-4.5

            particleGraphics.lineStyle(weight, col)
            particleGraphics.moveTo(prev.x, prev.y)
            particleGraphics.lineTo(curr.x, curr.y)
          }
        }
      }
    }

    // Trails only - no particle circles
  }
}

// Main game loop
let frameCounter = 0
function gameLoop(deltaTime) {
  frameCounter++

  // Clear background with fade effect
  if (frameCounter % 1 === 0) {
    drawBackground()
  }

  // Update simulation with delta time
  updateParticles(deltaTime)

  // Draw vector field arrows (less frequently to reduce CPU usage)
  if (frameCounter % 3 === 0) {
    drawVectorField()
  }

  // Draw particles and their trails
  drawParticles()

  // Update global time
  state.time++
}
// Event handling functions
let mousePos = { x: 0, y: 0 }

function spawnParticlesAtMouse(numToSpawn = 8) {
  // Add particles at mouse location
  for (let i = 0; i < numToSpawn; i++) {
    particles.push({
      x: mousePos.x + utils.random(-20, 20),
      y: mousePos.y + utils.random(-20, 20),
      trail: [],
      color: utils.generateBrightColor(),
      speed: utils.random(0.8, 3.0),
      life: utils.random(0.8, 1.0),
      age: 0,
    })
  }

  // Remove oldest particles to maintain performance
  if (particles.length > numParticles * 3) {
    particles.splice(0, particles.length - numParticles * 2)
  }
}

function setupEventHandlers() {
  // Mouse events
  app.view.addEventListener('mousedown', () => {
    spawnParticlesAtMouse(15)
  })

  app.view.addEventListener('mousemove', (event) => {
    const rect = app.view.getBoundingClientRect()
    mousePos.x = event.clientX - rect.left
    mousePos.y = event.clientY - rect.top

    if (event.buttons === 1) {
      // Left mouse button held down
      spawnParticlesAtMouse(5)
    }
  })

  // Custom events for UI controls
  document.addEventListener('newField', () => {
    currentSeed = Math.floor(Math.random() * 1000000)

    const functionCode = generateFunction(currentSeed)
    const fn = compileVectorFieldFunction(functionCode)
    console.log(
      'Generated vector field function with seed:',
      currentSeed,
      'scale:',
      currentScale,
      fn
    )
    vectorField = createEnhancedVectorField(fn)
    state.fn = fn
    state.functionCode = functionCode
    currentFunctionCode = functionCode
    currentFunctionName = null
    drawBackground()
    updateURL() // Update URL with new seed
  })

  document.addEventListener('clearScreen', () => {
    drawBackground()
    for (let particle of particles) {
      particle.trail = []
    }
  })
}

// Initialize the application
initPixiApp()

// Global functions for UI controls
function toggleControls() {
  controlsVisible = !controlsVisible
  const controls = document.getElementById('controls')
  if (controlsVisible) {
    controls.classList.remove('hidden')
  } else {
    controls.classList.add('hidden')
  }
}

function resetParticles() {
  // Trigger 'r' key functionality
  for (let particle of particles) {
    particle.x = utils.random(app.screen.width)
    particle.y = utils.random(app.screen.height)
    particle.trail = []
    particle.life = utils.random(0.7, 1.0)
    particle.age = 0
  }
}

function newField() {
  // Trigger space key functionality - need to access the p5 instance
  // This will be handled by a custom event
  document.dispatchEvent(new CustomEvent('newField'))
}

function clearScreen() {
  // Trigger 'c' key functionality
  document.dispatchEvent(new CustomEvent('clearScreen'))
}

// Make functions available globally for onclick handlers
window.toggleControls = toggleControls
window.resetParticles = resetParticles
window.newField = newField
window.clearScreen = clearScreen

// Save/Load functions management
function getSavedFunctions() {
  const saved = localStorage.getItem('techne-saved-functions')
  return saved ? JSON.parse(saved) : {}
}

function saveFunctionToStorage(name, functionCode) {
  const savedFunctions = getSavedFunctions()
  savedFunctions[name] = {
    code: functionCode,
    savedAt: new Date().toISOString(),
    name: name,
  }
  localStorage.setItem('techne-saved-functions', JSON.stringify(savedFunctions))
  updateFunctionDropdown()
}

function deleteFunctionFromStorage(name) {
  const savedFunctions = getSavedFunctions()
  delete savedFunctions[name]
  localStorage.setItem('techne-saved-functions', JSON.stringify(savedFunctions))
  updateFunctionDropdown()
}

function updateFunctionDropdown() {
  const dropdown = document.getElementById('saved-functions-dropdown')
  const loadButton = document.getElementById('load-button')
  const deleteButton = document.getElementById('delete-button')

  if (!dropdown) return

  // Clear existing options except the first one
  dropdown.innerHTML = '<option value="">Select a saved function...</option>'

  const savedFunctions = getSavedFunctions()
  const functionNames = Object.keys(savedFunctions).sort()

  functionNames.forEach((name) => {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    dropdown.appendChild(option)
  })

  // Update button states
  const hasSelection = dropdown.value !== ''
  loadButton.disabled = !hasSelection
  deleteButton.disabled = !hasSelection
}

function saveCurrentFunction() {
  const nameInput = document.getElementById('function-name-input')
  const functionName = nameInput.value.trim()

  if (!functionName) {
    alert('Please enter a name for the function.')
    return
  }

  if (!currentFunctionCode) {
    alert('No function to save. Generate a new field first.')
    return
  }

  // Check if name already exists
  const savedFunctions = getSavedFunctions()
  if (savedFunctions[functionName]) {
    if (!confirm(`Function "${functionName}" already exists. Overwrite?`)) {
      return
    }
  }

  saveFunctionToStorage(functionName, currentFunctionCode)
  currentFunctionName = functionName
  nameInput.value = ''

  // Show success feedback
  const originalText = nameInput.placeholder
  nameInput.placeholder = `Saved "${functionName}"!`
  setTimeout(() => {
    nameInput.placeholder = originalText
  }, 2000)
}

function loadSelectedFunction() {
  const dropdown = document.getElementById('saved-functions-dropdown')
  const functionName = dropdown.value

  if (!functionName) {
    alert('Please select a function to load.')
    return
  }

  const savedFunctions = getSavedFunctions()
  const savedFunction = savedFunctions[functionName]

  if (!savedFunction) {
    alert('Function not found.')
    return
  }

  // Load the function
  const fn = compileVectorFieldFunction(savedFunction.code)
  if (fn && createEnhancedVectorFieldGlobal) {
    // Generate a new seed for loaded functions
    currentSeed = Math.floor(Math.random() * 1000000)

    vectorField = createEnhancedVectorFieldGlobal(fn)
    currentFunctionCode = savedFunction.code
    currentFunctionName = functionName

    // Update state if it exists
    if (typeof state !== 'undefined') {
      state.fn = fn
      state.functionCode = savedFunction.code
    }

    console.log(`Loaded function: ${functionName} with scale: ${currentScale}`)

    // Clear background to show the new field
    if (typeof app !== 'undefined' && app) {
      drawBackground()
    }
  } else if (!createEnhancedVectorFieldGlobal) {
    alert('Vector field system not ready yet. Please try again in a moment.')
  } else {
    alert('Failed to load function. The saved data may be corrupted.')
  }
}

function deleteSelectedFunction() {
  const dropdown = document.getElementById('saved-functions-dropdown')
  const functionName = dropdown.value

  if (!functionName) {
    alert('Please select a function to delete.')
    return
  }

  if (!confirm(`Are you sure you want to delete "${functionName}"?`)) {
    return
  }

  deleteFunctionFromStorage(functionName)
  dropdown.value = ''

  // Update button states
  const loadButton = document.getElementById('load-button')
  const deleteButton = document.getElementById('delete-button')
  loadButton.disabled = true
  deleteButton.disabled = true
}

// Make save/load functions available globally for onclick handlers
window.saveCurrentFunction = saveCurrentFunction
window.loadSelectedFunction = loadSelectedFunction
window.deleteSelectedFunction = deleteSelectedFunction

// Seed-based URL Sharing functionality
function generateShareableURL() {
  if (currentSeed === null) {
    alert('No function to share. Generate a new field first.')
    return ''
  }

  try {
    // Format: #seed,particles,trail,flow,scale
    const params = [
      currentSeed,
      numParticles,
      flowIntensity,
      currentScale,
      longExposureDecay,
    ].join(',')

    const url = `${window.location.origin}${window.location.pathname}#${params}`
    return url
  } catch (error) {
    console.error('Failed to generate shareable URL:', error)
    alert('Failed to generate shareable URL')
    return ''
  }
}

function copyShareableURL() {
  const url = generateShareableURL()
  if (!url) return

  navigator.clipboard
    .writeText(url)
    .then(() => {
      // Show temporary feedback
      const button = document.getElementById('share-button')
      if (button) {
        const originalText = button.textContent
        button.textContent = 'Copied!'
        button.style.background = 'rgba(80, 160, 120, 0.4)'

        setTimeout(() => {
          button.textContent = originalText
          button.style.background = ''
        }, 2000)
      }
    })
    .catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)

      alert('URL copied to clipboard!')
    })
}

function loadFromStorage() {
  showVectorField = localStorage.getItem('showVectorField') === 'true'
}

function loadFromURL() {
  const hash = window.location.hash.slice(1)
  if (!hash) return false

  try {
    // Check if it's the old format (just a seed) or new format (comma-separated)
    if (hash.includes(',')) {
      // New format: seed,particles,flow,mouse,scale
      const params = hash.split(',')
      if (params.length >= 5) {
        const seed = parseInt(params[0])
        const particles = parseInt(params[1])
        const flow = parseFloat(params[2])
        const scale = parseFloat(params[3])
        const exposure = parseFloat(params[4])

        if (isNaN(seed)) return false

        numParticles = !isNaN(particles) ? particles : 300
        flowIntensity = !isNaN(flow) ? flow : 4.0
        longExposureDecay = !isNaN(exposure) ? exposure : 0.95
        currentScale = !isNaN(scale) ? scale : 4.0

        console.log('Loading from URL with parameters:', {
          seed,
          particles,
          flow,
          scale,
        })

        // Update UI sliders
        updateSlidersFromValues()

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

// Update slider UI elements to match current values
function updateSlidersFromValues() {
  // Particle count slider
  const countSlider = document.getElementById('count-slider')
  const countValue = document.getElementById('count-value')
  if (countSlider && countValue) {
    countSlider.value = numParticles
    countValue.textContent = numParticles.toString()
  }

  // Exposure
  const exposureSlider = document.getElementById('exposure-slider')
  const exposureValue = document.getElementById('exposure-value')
  if (exposureSlider && exposureValue) {
    exposureSlider.value = longExposureDecay
    exposureValue.textContent = longExposureDecay.toFixed(2)
  }

  // Flow intensity slider
  const flowSlider = document.getElementById('flow-slider')
  const flowValue = document.getElementById('flow-value')
  if (flowSlider && flowValue) {
    flowSlider.value = flowIntensity
    flowValue.textContent = flowIntensity.toFixed(1) + 'x'
  }

  // Scale slider
  const scaleSlider = document.getElementById('scale-slider')
  const scaleValue = document.getElementById('scale-value')
  if (scaleSlider && scaleValue) {
    scaleSlider.value = currentScale
    scaleValue.textContent = currentScale.toFixed(1)
  }

  // Show vector field toggle
  const showFieldToggle = document.getElementById('show-field-toggle')
  if (showFieldToggle) {
    showFieldToggle.checked = showVectorField
  }
}

function updateURL() {
  if (currentSeed === null) return

  try {
    // Format: #seed,particles,flow,scale
    const params = [
      currentSeed,
      numParticles,
      flowIntensity,
      currentScale,
      longExposureDecay,
    ].join(',')

    const newURL = `${window.location.pathname}#${params}`
    history.replaceState(null, '', newURL)
  } catch (error) {
    console.error('Failed to update URL:', error)
  }
}

// Make URL sharing functions available globally
window.copyShareableURL = copyShareableURL
window.generateShareableURL = generateShareableURL

// Setup control listeners
document.addEventListener('DOMContentLoaded', () => {
  // Particle count control
  const countSlider = document.getElementById('count-slider')
  const countValue = document.getElementById('count-value')
  if (countSlider && countValue) {
    countSlider.addEventListener('input', (e) => {
      numParticles = parseInt(e.target.value)
      countValue.textContent = numParticles.toString()
      updateURL()
    })
  } else {
    console.error('Count slider elements not found')
  }

  // Flow intensity control
  const flowSlider = document.getElementById('flow-slider')
  const flowValue = document.getElementById('flow-value')
  if (flowSlider && flowValue) {
    flowSlider.addEventListener('input', (e) => {
      flowIntensity = parseFloat(e.target.value)
      flowValue.textContent = flowIntensity.toFixed(1) + 'x'
      updateURL()
    })
  } else {
    console.error('Flow slider elements not found')
  }

  // Exposure control
  const exposureSlider = document.getElementById('exposure-slider')
  const exposureValue = document.getElementById('exposure-value')
  if (exposureSlider && exposureValue) {
    exposureSlider.addEventListener('input', (e) => {
      longExposureDecay = parseFloat(e.target.value)
      exposureValue.textContent = longExposureDecay.toFixed(2)
      longExposureFilter.decay = longExposureDecay
      updateURL()
    })
  } else {
    console.error('Exposure slider elements not found')
  }

  // Scale control
  const scaleSlider = document.getElementById('scale-slider')
  const scaleValue = document.getElementById('scale-value')
  if (scaleSlider && scaleValue) {
    scaleSlider.addEventListener('input', (e) => {
      currentScale = parseFloat(e.target.value)
      scaleValue.textContent = currentScale.toFixed(1)
      // Regenerate the vector field with the new scale
      if (vectorField && state.fn) {
        vectorField = createEnhancedVectorField(state.fn)
      }
      updateURL()
    })
  } else {
    console.error('Scale slider elements not found')
  }

  // Show vector field toggle
  const showFieldToggle = document.getElementById('show-field-toggle')
  if (showFieldToggle) {
    showFieldToggle.addEventListener('change', (e) => {
      showVectorField = e.target.checked
      localStorage.setItem('showVectorField', showVectorField)
    })
  } else {
    console.error('Show field toggle element not found')
  }

  // Save/Load controls
  const functionNameInput = document.getElementById('function-name-input')
  const savedFunctionsDropdown = document.getElementById(
    'saved-functions-dropdown'
  )
  const loadButton = document.getElementById('load-button')
  const deleteButton = document.getElementById('delete-button')

  // Handle Enter key in function name input
  if (functionNameInput) {
    functionNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveCurrentFunction()
      }
    })
  }

  // Handle dropdown selection changes
  if (savedFunctionsDropdown) {
    savedFunctionsDropdown.addEventListener('change', (e) => {
      const hasSelection = e.target.value !== ''
      if (loadButton) loadButton.disabled = !hasSelection
      if (deleteButton) deleteButton.disabled = !hasSelection
    })
  }

  // Initialize the dropdown
  updateFunctionDropdown()

  // Initialize slider UI with current values
  updateSlidersFromValues()
})
