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

const graphSize = 10

new p5((p) => {
  function initFn() {
    p.stroke(uniqolor.random().color)
    const fn = compileVectorFieldFunction(generateFunction())
    console.log('fn', fn)
    state = {
      fn,
      seed: { x: 0, y: 0 },
      position: { x: 0, y: 0 },
      step: 0,
      lineLength: 0,
      running: false,
    }
  }
  function toScreenSpace(point) {
    return {
      x: (point.x * p.width) / graphSize + p.width / 2,
      y: (point.y * p.height) / graphSize + p.height / 2,
    }
  }

  function nextLine() {
    state.lineLength = 0
    state.seed = {
      // x: (Math.abs(state.seed.x) + 5) * (state.step / -state.step),
      // y: 0,
      x: Math.random() * graphSize - graphSize / 2,
      y: Math.random() * graphSize - graphSize / 2,
    }
    state.position = { x: state.seed.x, y: state.seed.y }
  }

  function run() {
    state.step++

    const velocity = state.fn(state.position)
    if (
      velocity.x === NaN ||
      velocity.y === NaN ||
      (velocity.x === 0 && velocity.y === 0)
    ) {
      return nextLine()
    }

    const nextPoint = {
      x: state.position.x + velocity.x / 10,
      y: state.position.y + velocity.y / 10,
    }
    p.line(
      toScreenSpace(state.position).x,
      toScreenSpace(state.position).y,
      toScreenSpace(nextPoint).x,
      toScreenSpace(nextPoint).y
    )

    if (
      nextPoint.x < -(p.width / 2) ||
      nextPoint.x > p.width / 2 ||
      nextPoint.y < -p.height / 2 ||
      nextPoint.y > p.height / 2 ||
      isNaN(nextPoint.x) ||
      isNaN(nextPoint.y) ||
      state.lineLength > 50
    ) {
      nextLine()
    } else {
      state.position = nextPoint
      state.lineLength++
    }
  }

  p.setup = () => {
    // smooth()
    p.createCanvas(p.windowWidth, p.windowHeight)
    p.background(50)
    p.addChannels(null, null)

    p.addEffects(
      p.bloom(0.1, 1.9, 1, 1.2, undefined, 13, 2)
      // p.motionBlur(undefined, 0.3)
    )
    initFn()
  }

  p.mouseClicked = () => {
    p.background(50)
    initFn()

    state.running = !state.running

    function batchRun() {
      for (let i = 0; i < 30; i++) {
        run()
      }
    }

    if (state.running) {
      state.interval = setInterval(batchRun, 5)
    } else {
      clearInterval(state.interval)
    }
  }

  p.draw = () => {
    // Draw a circle that follows the mouse
    // Circles accumulate to create a drawing/painting effect
    // if (p.mouseIsPressed) {
    //   p.fill(p.random(255), p.random(255), p.random(255), 100)
    //   p.noStroke()
    //   p.circle(p.mouseX, p.mouseY, 50)
    // }
  }

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight)
  }
})
