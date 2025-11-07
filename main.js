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

/**
 * @typedef {{x: number, y: number}} Point
 */

let state = {}
let vectorField = null
let particles = []
const numParticles = 300
const maxTrailLength = 20

new p5((p) => {
  function initFn() {
    p.stroke(uniqolor.random().color)
    const fn = compileVectorFieldFunction(generateFunction())
    console.log('Generated vector field function:', fn)

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

      // Add time-based oscillation for ebb and flow
      const time = p.millis() * 0.001
      const timeInfluenceX = Math.sin(time * 0.5 + normX * 0.1) * 0.2
      const timeInfluenceY = Math.cos(time * 0.3 + normY * 0.1) * 0.2

      // Add mouse influence
      const mouseX = p.mouseX || p.width / 2
      const mouseY = p.mouseY || p.height / 2
      const distToMouse = p.dist(x, y, mouseX, mouseY)
      const maxMouseInfluence = p.min(p.width, p.height) * 0.4
      const mouseInfluenceStrength = p.map(
        p.constrain(distToMouse, 0, maxMouseInfluence),
        0,
        maxMouseInfluence,
        0.8,
        0.1
      )

      // Create attractive and swirling motion around mouse
      const mouseVecX = (mouseX - x) * 0.0005
      const mouseVecY = (mouseY - y) * 0.0005
      // Add perpendicular component for swirling
      const perpMouseX = -mouseVecY * 0.5
      const perpMouseY = mouseVecX * 0.5

      // Combine all influences with scaling
      const scale = 8 // Reduced scale to prevent extreme values
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
      resultX = p.constrain(resultX, -50, 50)
      resultY = p.constrain(resultY, -50, 50)

      return { x: resultX, y: resultY }
    }
  }

  function updateParticles() {
    for (let particle of particles) {
      if (vectorField) {
        const force = vectorField(particle.x, particle.y)

        // Store previous position for discontinuity detection
        const prevX = particle.x
        const prevY = particle.y

        // Update position with some damping and speed variation
        particle.x += force.x * particle.speed * 0.035
        particle.y += force.y * particle.speed * 0.035

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

        // Handle screen wrapping by clearing trail when wrapping occurs
        let wrapped = false
        if (particle.x < -50) {
          particle.x = p.width + 50
          wrapped = true
        }
        if (particle.x > p.width + 50) {
          particle.x = -50
          wrapped = true
        }
        if (particle.y < -50) {
          particle.y = p.height + 50
          wrapped = true
        }
        if (particle.y > p.height + 50) {
          particle.y = -50
          wrapped = true
        }

        // Clear trail when wrapping to prevent drawing across screen
        if (wrapped) {
          particle.trail = []
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
            age: particle.age,
          })
          if (particle.trail.length > maxTrailLength) {
            particle.trail.shift()
          }
        }

        // Update age and life
        particle.age++
        particle.life -= 0.001
        if (particle.life <= 0) {
          // Respawn particle
          particle.x = p.random(p.width)
          particle.y = p.random(p.height)
          particle.trail = []
          particle.color = uniqolor.random().color
          particle.life = p.random(0.7, 1.0)
          particle.speed = p.random(0.6, 2.5)
          particle.age = 0
        }
      }
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
    for (let particle of particles) {
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
              const trailAlpha =
                (i / particle.trail.length) * particle.life * 150
              const weight = p.map(i, 0, particle.trail.length, 0.3, 2.5)

              p.stroke(p.red(col), p.green(col), p.blue(col), trailAlpha)
              p.strokeWeight(weight)
              p.line(prev.x, prev.y, curr.x, curr.y)
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
  }

  p.draw = () => {
    // Clear background with subtle fade for trailing effect
    p.fill(8, 12, 20, 12)
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
      // Generate new vector field
      initFn()
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
      // Clear screen
      p.background(8, 12, 20)
    }
  }

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight)
    p.background(8, 12, 20)
  }
})
