/**
 * (C) 2018 by Gerard Ferrandez (https://codepen.io/ge1doot/pen/GQobbq)
 * Released under MIT license
 */
function Noise() {
  const octaves =
    arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1

  this.p = new Uint8Array(512)
  this.octaves = octaves
  this.init()
}

Noise.prototype.init = function init() {
  for (let i = 0; i < 512; ++i) {
    this.p[i] = Math.random() * 256
  }
}

Noise.prototype.lerp = function lerp(t, a, b) {
  return a + t * (b - a)
}

Noise.prototype.grad2d = function grad2d(i, x, y) {
  const v = (i & 1) === 0 ? x : y
  return (i & 2) === 0 ? -v : v
}

Noise.prototype.noise2d = function noise2d(x2d, y2d) {
  const X = Math.floor(x2d) & 255
  const Y = Math.floor(y2d) & 255
  const x = x2d - Math.floor(x2d)
  const y = y2d - Math.floor(y2d)
  const fx = (3 - 2 * x) * x * x
  const fy = (3 - 2 * y) * y * y
  const p0 = this.p[X] + Y
  const p1 = this.p[X + 1] + Y
  return this.lerp(
    fy,
    this.lerp(
      fx,
      this.grad2d(this.p[p0], x, y),
      this.grad2d(this.p[p1], x - 1, y)
    ),
    this.lerp(
      fx,
      this.grad2d(this.p[p0 + 1], x, y - 1),
      this.grad2d(this.p[p1 + 1], x - 1, y - 1)
    )
  )
}

Noise.prototype.noise = function noise(x, y) {
  let e = 1
  let k = 1
  let s = 0
  for (let i = 0; i < this.octaves; ++i) {
    e *= 0.5
    s += (e * (1 + this.noise2d(k * x, k * y))) / 2
    k *= 2
  }
  return s
}

export default function generateNoise() {
  const perlin = new Noise(Math.round(Math.random() * 5 + 1))
  const freq = Math.random() * 20 + 1

  const vectorField = choose(vectorField0, vectorField1)

  return {
    vectorField,
  }

  function vectorField0(p) {
    const n = perlin.noise(p.x, p.y)
    return {
      x: Math.cos(n * freq),
      y: Math.sin(n * freq),
    }
  }

  function vectorField1(p) {
    const n = perlin.noise(p.x, p.y)
    return {
      x: Math.tan(n * freq),
      y: Math.sin(n * freq),
    }
  }
}

function choose(...choices) {
  const randomIndex = Math.floor(Math.random() * choices.length)
  return choices[randomIndex]
}
