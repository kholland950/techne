// Import using shorter names from import map
import p5 from 'p5'

// import generateNoise from './generateNoise.js'
import generateFunction from './generateFunction.js'
import './post5.js'
import uniqolor from 'uniqolor'

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

// Generated vector field function: ƒ getVelocity(p) {
//     return {
//       x: (Math.log(Math.abs(Math.sin(Math.cos(Math.tan(p.y)))))-Math.sin(p.x/Math.sqrt(p.x*p.x + p.y * p.y)))*p.y,
//       y: p.x
//     };
// }

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

// Current function storage
let currentFunctionCode = null
let currentFunctionName = null

// Global reference to createEnhancedVectorField function
let createEnhancedVectorFieldGlobal = null

new p5((p) => {
  function initFn() {
    p.stroke(uniqolor.random().color)
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
        x: p.random(p.width),
        y: p.random(p.height),
        trail: [],
        color: uniqolor.random().color,
        speed: p.random(0.6, 2.5),
        life: p.random(0.7, 1.0),
        age: 0,
      })
    }

    state = {
      fn,
      functionCode,
      particles: particles,
      time: 0,
    }
  }

  function createEnhancedVectorField(baseFn) {
    return function (x, y) {
      if (!baseFn) return { x: 0, y: 0 }

      // Convert screen coordinates to normalized coordinates for the function
      const normX = (x - p.width / 2) / (p.width * 0.005)
      const normY = (y - p.height / 2) / (p.height * 0.005)

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
          baseVec.x = p.constrain(baseVec.x, -10, 10)
          baseVec.y = p.constrain(baseVec.y, -10, 10)
        }
      } catch (e) {
        baseVec = { x: 0, y: 0 }
      }

      // Enhanced time-based influences with multiple frequencies
      const time = p.millis() * 0.001
      const slowTime = time * 0.2
      const fastTime = time * 1.5

      // Multi-layered Perlin noise for organic ebb and flow
      const noiseScale = 0.003
      const noiseX = x * noiseScale
      const noiseY = y * noiseScale

      // Large-scale flow patterns (slow, sweeping changes)
      const perlinFlow1X = (p.noise(noiseX + slowTime, noiseY) - 0.5) * 0.4
      const perlinFlow1Y = (p.noise(noiseX, noiseY + slowTime) - 0.5) * 0.4

      // Medium-scale turbulence
      const perlinFlow2X =
        (p.noise(noiseX * 3 + time * 0.7, noiseY * 3) - 0.5) * 0.25
      const perlinFlow2Y =
        (p.noise(noiseX * 3, noiseY * 3 + time * 0.7) - 0.5) * 0.25

      // Fine-scale detail (faster, more chaotic)
      const perlinFlow3X =
        (p.noise(noiseX * 8 + fastTime, noiseY * 8) - 0.5) * 0.15
      const perlinFlow3Y =
        (p.noise(noiseX * 8, noiseY * 8 + fastTime) - 0.5) * 0.15

      // Sinusoidal waves with varying frequencies and phases
      const wave1X = Math.sin(time * 0.3 + normX * 0.05 + normY * 0.02) * 0.2
      const wave1Y = Math.cos(time * 0.4 + normY * 0.05 + normX * 0.02) * 0.2

      const wave2X =
        Math.sin(time * 0.8 + normX * 0.2 + p.noise(time * 0.1) * 2) * 0.15
      const wave2Y =
        Math.cos(time * 0.6 + normY * 0.2 + p.noise(time * 0.1 + 100) * 2) *
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
      const mouseX = p.mouseX || p.width / 2
      const mouseY = p.mouseY || p.height / 2
      const distToMouse = p.dist(x, y, mouseX, mouseY)
      const maxMouseInfluence = p.min(p.width, p.height) * 0.4

      // Modulate mouse influence with noise for more organic feel
      const mouseNoiseInfluence =
        p.noise(time * 0.3, distToMouse * 0.01) * 0.5 + 0.5
      const mouseInfluenceStrength = p.map(
        p.constrain(distToMouse, 0, maxMouseInfluence),
        0,
        maxMouseInfluence,
        0.9 * mouseNoiseInfluence,
        0.1 * mouseNoiseInfluence
      )

      // Create attractive and swirling motion around mouse with noise variation
      const mouseVecX = (mouseX - x) * 0.0005
      const mouseVecY = (mouseY - y) * 0.0005
      // Add perpendicular component for swirling with noise modulation
      const swirl = p.noise(time * 0.5, x * 0.001, y * 0.001) * 2 - 1
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
      resultX = p.constrain(resultX, -60, 60)
      resultY = p.constrain(resultY, -60, 60)

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
          particle.x = p.random(p.width)
          particle.y = p.random(p.height)
          particle.trail = []
        }

        // Remove particles that go too far off-screen for performance
        const offScreenBuffer = 100
        const farOffScreen =
          particle.x < -offScreenBuffer ||
          particle.x > p.width + offScreenBuffer ||
          particle.y < -offScreenBuffer ||
          particle.y > p.height + offScreenBuffer

        // If particle is far off-screen, don't keep it
        if (farOffScreen) {
          continue // Skip this particle (don't add to particlesToKeep)
        }

        // Add to trail only if position is valid
        if (
          isFinite(particle.x) &&
          isFinite(particle.y) &&
          particle.x >= -100 &&
          particle.x <= p.width + 100 &&
          particle.y >= -100 &&
          particle.y <= p.height + 100
        ) {
          particle.trail.push({
            x: particle.x,
            y: particle.y,
            birthTime: p.millis(), // Record when this trail point was created
          })
          if (particle.trail.length > maxTrailLength) {
            particle.trail.shift()
          }
        }

        // Age and remove old trail points more aggressively
        const currentTime = p.millis()
        const maxTrailAge = 2000 // Reduced from 3000ms to 2000ms for faster cleanup

        // Filter out old trail points
        const oldTrailLength = particle.trail.length
        particle.trail = particle.trail.filter(
          (point) =>
            point.birthTime && currentTime - point.birthTime < maxTrailAge
        )

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
          particle.x = p.random(p.width)
          particle.y = p.random(p.height)
          particle.trail = [] // Completely clear trail array
          particle.color = uniqolor.random().color
          particle.life = p.random(0.7, 1.0)
          particle.speed = p.random(0.6, 2.5)
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
        x: p.random(p.width),
        y: p.random(p.height),
        trail: [],
        color: uniqolor.random().color,
        speed: p.random(0.6, 2.5),
        life: p.random(0.7, 1.0),
        age: 0,
      })
    }
  }

  function drawVectorField() {
    // Draw vector field as arrows (sparsely for performance)
    const step = 60
    p.stroke(80, 120, 160, 40)
    p.strokeWeight(1)

    for (let x = step; x < p.width; x += step) {
      for (let y = step; y < p.height; y += step) {
        if (vectorField) {
          const force = vectorField(x, y)
          const magnitude = Math.sqrt(force.x * force.x + force.y * force.y)

          if (magnitude > 0.5) {
            const arrowLength = p.constrain(magnitude * 0.1, 3, 15)
            const endX = x + (force.x / magnitude) * arrowLength
            const endY = y + (force.y / magnitude) * arrowLength

            // Vary arrow opacity based on magnitude
            const alpha = p.map(magnitude, 0, 50, 20, 80)
            p.stroke(80, 120, 160, alpha)

            p.line(x, y, endX, endY)

            // Draw arrowhead
            const arrowSize = 2
            const angle = Math.atan2(force.y, force.x)
            p.line(
              endX,
              endY,
              endX - arrowSize * Math.cos(angle - 0.4),
              endY - arrowSize * Math.sin(angle - 0.4)
            )
            p.line(
              endX,
              endY,
              endX - arrowSize * Math.cos(angle + 0.4),
              endY - arrowSize * Math.sin(angle + 0.4)
            )
          }
        }
      }
    }
  }

  function drawParticles() {
    // Draw particle trails with fading effect
    const currentTime = p.millis()
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
        const col = p.color(particle.color)

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
            const distance = p.dist(prev.x, prev.y, curr.x, curr.y)

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
              const combinedAlpha = positionFade * particle.life * ageFade * 180

              const weight = p.map(i, 0, particle.trail.length, 0.3, 2.5)

              // Only draw if alpha is significant enough to be visible
              if (combinedAlpha > 8) {
                // Increased threshold from 5 to 8
                p.stroke(p.red(col), p.green(col), p.blue(col), combinedAlpha)
                p.strokeWeight(weight)
                p.line(prev.x, prev.y, curr.x, curr.y)
              }
            }
          }
        }
      }

      // Draw particle as a glowing dot only if position is valid
      if (
        isFinite(particle.x) &&
        isFinite(particle.y) &&
        particle.x >= -100 &&
        particle.x <= p.width + 100 &&
        particle.y >= -100 &&
        particle.y <= p.height + 100
      ) {
        const col = p.color(particle.color)
        const glowAlpha = particle.life * 180

        // Outer glow
        p.fill(p.red(col), p.green(col), p.blue(col), glowAlpha * 0.3)
        p.noStroke()
        p.circle(particle.x, particle.y, 6)

        // Inner bright core
        p.fill(p.red(col), p.green(col), p.blue(col), glowAlpha)
        p.circle(particle.x, particle.y, 2)
      }
    }
  }

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight)
    p.background(8, 12, 20)
    p.addChannels(null, null)

    p.addEffects(
      p.bloom(0.1, 1.9, 1, 1.2, undefined, 13, 2),
      p.motionBlur(undefined, 0.3)
    )
    initFn()

    // Add custom event listeners for UI controls
    document.addEventListener('newField', () => {
      const functionCode = generateFunction()
      const fn = compileVectorFieldFunction(functionCode)
      console.log('Generated vector field function:', fn)
      vectorField = createEnhancedVectorField(fn)
      state.fn = fn
      state.functionCode = functionCode
      currentFunctionCode = functionCode
      currentFunctionName = null
      p.background(8, 12, 20)
    })

    document.addEventListener('clearScreen', () => {
      p.background(8, 12, 20)
      for (let particle of particles) {
        particle.trail = []
      }
    })
  }

  p.draw = () => {
    // Clear background with stronger fade to prevent streak artifacts
    p.fill(8, 12, 20, 25) // Increased from 12 to 25 for better cleanup
    p.noStroke()
    p.rect(0, 0, p.width, p.height)

    // Update simulation
    updateParticles()

    // Draw vector field arrows
    drawVectorField()

    // Draw particles and their trails
    drawParticles()

    // Update global time
    state.time++
  }

  function spawnParticlesAtMouse(numToSpawn = 8) {
    // Add particles at mouse location
    for (let i = 0; i < numToSpawn; i++) {
      particles.push({
        x: p.mouseX + p.random(-20, 20),
        y: p.mouseY + p.random(-20, 20),
        trail: [],
        color: uniqolor.random().color,
        speed: p.random(0.8, 3.0),
        life: p.random(0.8, 1.0),
        age: 0,
      })
    }

    // Remove oldest particles to maintain performance
    if (particles.length > numParticles * 3) {
      particles.splice(0, particles.length - numParticles * 2)
    }
  }

  p.mousePressed = () => {
    // Add initial burst of particles at mouse location
    spawnParticlesAtMouse(15)
  }

  p.mouseDragged = () => {
    // Continuously spawn particles while dragging
    spawnParticlesAtMouse(5)
  }

  p.keyPressed = () => {
    if (p.key === ' ') {
      // Generate new vector field but keep existing particles
      const functionCode = generateFunction()
      const fn = compileVectorFieldFunction(functionCode)
      console.log('Generated vector field function:', fn)
      vectorField = createEnhancedVectorField(fn)
      state.fn = fn
      state.functionCode = functionCode
      currentFunctionCode = functionCode
      currentFunctionName = null
      p.background(8, 12, 20)
    } else if (p.key === 'r') {
      // Reset all particles
      for (let particle of particles) {
        particle.x = p.random(p.width)
        particle.y = p.random(p.height)
        particle.trail = []
        particle.life = p.random(0.7, 1.0)
        particle.age = 0
      }
    } else if (p.key === 'c') {
      // Clear screen completely
      p.background(8, 12, 20)
      // Also clear all particle trails to prevent streaks
      for (let particle of particles) {
        particle.trail = []
      }
    } else if (p.key === 'h' || p.key === 'H') {
      // Toggle controls visibility
      toggleControls()
    }
  }

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight)
    p.background(8, 12, 20)
  }

  // Setup UI controls
  p.setup = p.setup // Keep existing setup, but add controls after
})

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
    particle.x = Math.random() * window.innerWidth
    particle.y = Math.random() * window.innerHeight
    particle.trail = []
    particle.life = Math.random() * 0.3 + 0.7
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
    if (typeof p !== 'undefined' && p.background) {
      p.background(8, 12, 20)
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
