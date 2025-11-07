// Import using shorter names from import map
import * as PIXI from 'pixi.js'
import { BloomFilter } from '@pixi/filter-bloom'
import { MotionBlurFilter } from '@pixi/filter-motion-blur'
import { AdjustmentFilter } from '@pixi/filter-adjustment'

import { createNoise2D } from 'simplex-noise'

// import generateNoise from './generateNoise.js'
import generateFunction from './generateFunction.js'
import uniqolor from 'uniqolor'

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
    const brightColors = [
      '#FF6B6B', // Bright red
      '#4ECDC4', // Bright teal
      '#45B7D1', // Bright blue
      '#96CEB4', // Bright green
      '#FFEAA7', // Bright yellow
      '#DDA0DD', // Bright purple
      '#98D8C8', // Bright mint
      '#F7DC6F', // Bright gold
      '#BB8FCE', // Bright lavender
      '#85C1E9', // Bright sky blue
      '#F8C471', // Bright orange
      '#82E0AA', // Bright light green
      '#F1948A', // Bright salmon
      '#85C1E9', // Bright cyan
      '#D7BDE2', // Bright pink
    ]
    return brightColors[Math.floor(Math.random() * brightColors.length)]
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
let numParticles = 300
let maxTrailLength = 20

// Control variables
let speedMultiplier = 1.0
let flowIntensity = 1.0
let mouseInfluence = 1.0
let controlsVisible = true

// Camera/viewport variables
let camera = { x: 0, y: 0, zoom: 1.0 }
let isPanning = false
let lastPanPosition = { x: 0, y: 0 }

// Current function storage
let currentFunctionCode = null
let currentFunctionName = null

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

  // Add bloom effect
  try {
    const bloomFilter = new BloomFilter()
    bloomFilter.blur = 20
    bloomFilter.quality = 8
    bloomFilter.kernelSize = 5

    app.stage.filters = [
      new AdjustmentFilter({
        brightness: 1.7,
        saturation: 1.4,
      }),
      bloomFilter,
      new MotionBlurFilter([2, 2], 9),
    ]
    console.log('Bloom filter applied successfully')
  } catch (error) {
    console.warn('Failed to apply bloom filter:', error)
  }

  // Initialize the simulation
  initSimulation()

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

function initSimulation() {
  const functionCode = generateFunction()
  const fn = compileVectorFieldFunction(functionCode)
  console.log('Generated vector field function:', fn)

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
}

function createEnhancedVectorField(baseFn) {
  return function (x, y) {
    if (!baseFn) return { x: 0, y: 0 }

    // Convert screen coordinates to normalized coordinates for the function
    const normX = (x - app.screen.width / 2) / (app.screen.width * 0.005)
    const normY = (y - app.screen.height / 2) / (app.screen.height * 0.005)

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

    // Enhanced time-based influences with multiple frequencies
    const time = utils.millis() * 0.001
    const slowTime = time * 0.2
    const fastTime = time * 1.5

    // Multi-layered Perlin noise for organic ebb and flow
    const noiseScale = 0.003
    const noiseX = x * noiseScale
    const noiseY = y * noiseScale

    // Large-scale flow patterns (slow, sweeping changes)
    const perlinFlow1X = (utils.noise(noiseX + slowTime, noiseY) - 0.5) * 0.4
    const perlinFlow1Y = (utils.noise(noiseX, noiseY + slowTime) - 0.5) * 0.4

    // Medium-scale turbulence
    const perlinFlow2X =
      (utils.noise(noiseX * 3 + time * 0.7, noiseY * 3) - 0.5) * 0.25
    const perlinFlow2Y =
      (utils.noise(noiseX * 3, noiseY * 3 + time * 0.7) - 0.5) * 0.25

    // Fine-scale detail (faster, more chaotic)
    const perlinFlow3X =
      (utils.noise(noiseX * 8 + fastTime, noiseY * 8) - 0.5) * 0.15
    const perlinFlow3Y =
      (utils.noise(noiseX * 8, noiseY * 8 + fastTime) - 0.5) * 0.15

    // Sinusoidal waves with varying frequencies and phases
    const wave1X = Math.sin(time * 0.3 + normX * 0.05 + normY * 0.02) * 0.2
    const wave1Y = Math.cos(time * 0.4 + normY * 0.05 + normX * 0.02) * 0.2

    const wave2X =
      Math.sin(time * 0.8 + normX * 0.2 + utils.noise(time * 0.1) * 2) * 0.15
    const wave2Y =
      Math.cos(time * 0.6 + normY * 0.2 + utils.noise(time * 0.1 + 100) * 2) *
      0.15

    // Global ebb and flow breathing effect
    const breathe = Math.sin(time * 0.15) * 0.3 + 0.7 // Oscillates between 0.4 and 1.0
    const breathePhase = Math.cos(time * 0.12 + Math.PI * 0.25) * 0.2

    // Combine all noise and wave influences
    const totalNoiseX = perlinFlow1X + perlinFlow2X + perlinFlow3X
    const totalNoiseY = perlinFlow1Y + perlinFlow2Y + perlinFlow3Y
    const totalWaveX = wave1X + wave2X
    const totalWaveY = wave1Y + wave2Y

    // Create organic time influence with breathing
    const timeInfluenceX = (totalNoiseX + totalWaveX + breathePhase) * breathe
    const timeInfluenceY = (totalNoiseY + totalWaveY + breathePhase) * breathe

    // Add mouse influence with noise-based variation
    const mouseX = mousePos.x || app.screen.width / 2
    const mouseY = mousePos.y || app.screen.height / 2
    const distToMouse = utils.dist(x, y, mouseX, mouseY)
    const maxMouseInfluence =
      Math.min(app.screen.width, app.screen.height) * 0.4

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
        (mouseVecX + perpMouseX) * mouseInfluenceStrength * mouseInfluence) *
      scale
    let resultY =
      (baseVec.y +
        timeInfluenceY +
        (mouseVecY + perpMouseY) * mouseInfluenceStrength * mouseInfluence) *
      scale

    // Final safety clamp to prevent extreme velocities
    resultX = utils.constrain(resultX, -60, 60)
    resultY = utils.constrain(resultY, -60, 60)

    return { x: resultX, y: resultY }
  }
}

// Make createEnhancedVectorField available globally
createEnhancedVectorFieldGlobal = createEnhancedVectorField

function updateParticles() {
  // Mark particles for removal instead of updating in-place
  const particlesToKeep = []

  for (let particle of particles) {
    if (vectorField) {
      const force = vectorField(particle.x, particle.y)

      // Store previous position for discontinuity detection
      const prevX = particle.x
      const prevY = particle.y

      // Update position with some damping and speed variation
      particle.x += force.x * particle.speed * 0.035 * speedMultiplier
      particle.y += force.y * particle.speed * 0.035 * speedMultiplier

      // Check for extreme position changes that would cause long lines
      const deltaX = Math.abs(particle.x - prevX)
      const deltaY = Math.abs(particle.y - prevY)
      const maxDelta = 20 // Maximum allowed movement per frame

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

      // Age and remove old trail points more aggressively
      const currentTime = utils.millis()
      const maxTrailAge = 2000 // Reduced from 3000ms to 2000ms for faster cleanup

      // Filter out old trail points less frequently to reduce GC pressure
      if (particle.age % 30 === 0) {
        // Only clean up every 30 frames (~0.5 seconds)
        particle.trail = particle.trail.filter(
          (point) =>
            point.birthTime && currentTime - point.birthTime < maxTrailAge
        )
      }

      // Also remove trails from very low-life particles to clean up faster
      if (particle.life < 0.1) {
        particle.trail = particle.trail.slice(
          -Math.max(3, Math.floor(particle.trail.length * 0.3))
        )
      }

      // Update age and life
      particle.age++
      particle.life -= 0.001
      if (particle.life <= 0) {
        // Respawn particle and ensure trail is completely cleared
        particle.x = utils.random(app.screen.width)
        particle.y = utils.random(app.screen.height)
        particle.trail = [] // Completely clear trail array
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

  // Draw particle trails with fading effect
  const currentTime = utils.millis()
  const maxTrailAge = 2000 // Trail points fade out after 2 seconds (matches updateParticles)

  for (let particle of particles) {
    // Clean up any remaining old trail points during drawing as well
    if (particle.trail.length > 0) {
      particle.trail = particle.trail.filter(
        (point) =>
          point.birthTime && currentTime - point.birthTime < maxTrailAge
      )
    }

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
            // Calculate age-based fade for each trail segment
            const segmentAge = currentTime - curr.birthTime
            const ageFade = Math.max(0, 1 - segmentAge / maxTrailAge)

            // Skip drawing segments that are too old or have invalid birthTime
            if (!curr.birthTime || ageFade <= 0) {
              continue
            }

            // Combine position fade (newer segments brighter) with age fade
            const positionFade = i / particle.trail.length
            const combinedAlpha =
              (positionFade * particle.life * ageFade * 220) / 255 // Increased from 180 to 220 for brighter trails

            const weight = utils.map(i, 0, particle.trail.length, 1.5, 4.5) // Increased thickness from 0.3-2.5 to 1.5-4.5

            // Only draw if alpha is significant enough to be visible
            if (combinedAlpha > 6 / 255) {
              // Lowered threshold from 8 to 6 to show more segments
              const color = (col.r << 16) | (col.g << 8) | col.b
              particleGraphics.lineStyle(weight, color, combinedAlpha)
              particleGraphics.moveTo(prev.x, prev.y)
              particleGraphics.lineTo(curr.x, curr.y)
            }
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
  drawBackground()

  // Update simulation
  updateParticles()

  // Draw vector field arrows (less frequently to reduce CPU usage)
  if (frameCounter % 3 === 0) {
    // Only update vector field every 3 frames
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

  // Keyboard events
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault()
      // Generate new vector field but keep existing particles
      const functionCode = generateFunction()
      const fn = compileVectorFieldFunction(functionCode)
      console.log('Generated vector field function:', fn)
      vectorField = createEnhancedVectorField(fn)
      state.fn = fn
      state.functionCode = functionCode
      currentFunctionCode = functionCode
      currentFunctionName = null
      drawBackground()
    } else if (event.key === 'r') {
      // Reset all particles
      for (let particle of particles) {
        particle.x = utils.random(app.screen.width)
        particle.y = utils.random(app.screen.height)
        particle.trail = []
        particle.life = utils.random(0.7, 1.0)
        particle.age = 0
      }
    } else if (event.key === 'c') {
      // Clear screen completely
      drawBackground()
      // Also clear all particle trails to prevent streaks
      for (let particle of particles) {
        particle.trail = []
      }
    } else if (event.key === 'h' || event.key === 'H') {
      // Toggle controls visibility
      toggleControls()
    }
  })

  // Custom events for UI controls
  document.addEventListener('newField', () => {
    const functionCode = generateFunction()
    const fn = compileVectorFieldFunction(functionCode)
    console.log('Generated vector field function:', fn)
    vectorField = createEnhancedVectorField(fn)
    state.fn = fn
    state.functionCode = functionCode
    currentFunctionCode = functionCode
    currentFunctionName = null
    drawBackground()
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
    vectorField = createEnhancedVectorFieldGlobal(fn)
    currentFunctionCode = savedFunction.code
    currentFunctionName = functionName

    // Update state if it exists
    if (typeof state !== 'undefined') {
      state.fn = fn
      state.functionCode = savedFunction.code
    }

    console.log(`Loaded function: ${functionName}`)

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

// Setup control listeners
document.addEventListener('DOMContentLoaded', () => {
  // Speed control
  const speedSlider = document.getElementById('speed-slider')
  const speedValue = document.getElementById('speed-value')
  speedSlider.addEventListener('input', (e) => {
    speedMultiplier = parseFloat(e.target.value)
    speedValue.textContent = speedMultiplier.toFixed(1) + 'x'
  })

  // Particle count control
  const countSlider = document.getElementById('count-slider')
  const countValue = document.getElementById('count-value')
  countSlider.addEventListener('input', (e) => {
    numParticles = parseInt(e.target.value)
    countValue.textContent = numParticles.toString()
  })

  // Trail length control
  const trailSlider = document.getElementById('trail-slider')
  const trailValue = document.getElementById('trail-value')
  trailSlider.addEventListener('input', (e) => {
    maxTrailLength = parseInt(e.target.value)
    trailValue.textContent = maxTrailLength.toString()
  })

  // Flow intensity control
  const flowSlider = document.getElementById('flow-slider')
  const flowValue = document.getElementById('flow-value')
  flowSlider.addEventListener('input', (e) => {
    flowIntensity = parseFloat(e.target.value)
    flowValue.textContent = flowIntensity.toFixed(1) + 'x'
  })

  // Mouse influence control
  const mouseSlider = document.getElementById('mouse-slider')
  const mouseValue = document.getElementById('mouse-value')
  mouseSlider.addEventListener('input', (e) => {
    mouseInfluence = parseFloat(e.target.value)
    mouseValue.textContent = mouseInfluence.toFixed(1) + 'x'
  })

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
})
