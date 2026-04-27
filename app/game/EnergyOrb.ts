import * as THREE from 'three'
import { GameObject, WORLD_HALF, WORLD_SIZE } from './GameObject'
import type { Player } from './Player'

export class EnergyOrb extends GameObject {
  public override radius: number = 14

  private static glowTexture: THREE.CanvasTexture | null = null

  private readonly player: Player
  private readonly value: number
  private readonly attractRadius: number
  private readonly collectRadius: number
  private readonly maxAttractSpeed: number
  private readonly baseDamping: number
  private readonly glowMaterial: THREE.MeshBasicMaterial
  private readonly coreMaterial: THREE.MeshBasicMaterial
  private isAttracting: boolean
  private attractTimer: number

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    player: Player,
    value: number,
  ) {
    super(x, y)
    this.player = player
    this.value = value
    this.velocity.x = vx
    this.velocity.y = vy
    this.mesh.position.z = 2.5

    this.attractRadius = 300
    this.collectRadius = 28
    this.maxAttractSpeed = 42
    this.baseDamping = 0.985
    this.isAttracting = false
    this.attractTimer = 0

    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: EnergyOrb.getGlowTexture(),
      color: 0x66ddff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xe8ffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const glow = new THREE.Mesh(new THREE.CircleGeometry(12, 16), this.glowMaterial)
    const core = new THREE.Mesh(new THREE.CircleGeometry(5, 14), this.coreMaterial)
    glow.position.z = 0
    core.position.z = 0.1
    this.mesh.add(glow)
    this.mesh.add(core)
  }

  public get energyValue(): number {
    return this.value
  }

  private static getGlowTexture(): THREE.CanvasTexture {
    if (EnergyOrb.glowTexture) return EnergyOrb.glowTexture

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.35, 'rgba(150,235,255,0.95)')
    gradient.addColorStop(0.7, 'rgba(90,200,255,0.35)')
    gradient.addColorStop(1, 'rgba(90,200,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    EnergyOrb.glowTexture = texture
    return texture
  }

  public canBeCollected(): boolean {
    let dx = this.player.position.x - this.position.x
    let dy = this.player.position.y - this.position.y
    while (dx > WORLD_HALF) dx -= WORLD_SIZE
    while (dx < -WORLD_HALF) dx += WORLD_SIZE
    while (dy > WORLD_HALF) dy -= WORLD_SIZE
    while (dy < -WORLD_HALF) dy += WORLD_SIZE
    return dx * dx + dy * dy <= this.collectRadius * this.collectRadius
  }

  public override update(delta: number, ..._args: any[]): void {
    let dx = this.player.position.x - this.position.x
    let dy = this.player.position.y - this.position.y
    while (dx > WORLD_HALF) dx -= WORLD_SIZE
    while (dx < -WORLD_HALF) dx += WORLD_SIZE
    while (dy > WORLD_HALF) dy -= WORLD_SIZE
    while (dy < -WORLD_HALF) dy += WORLD_SIZE

    const distSq = dx * dx + dy * dy
    const dist = Math.sqrt(distSq)

    this.velocity.x *= Math.pow(this.baseDamping, delta)
    this.velocity.y *= Math.pow(this.baseDamping, delta)

    if (!this.isAttracting && dist <= this.attractRadius) {
      this.isAttracting = true
      this.attractTimer = 0
    }

    if (dist > 0 && this.isAttracting) {
      this.attractTimer += delta
      const targetSpeed = Math.min(this.maxAttractSpeed, 8 + this.attractTimer * 0.6)
      const targetVx = (dx / dist) * targetSpeed
      const targetVy = (dy / dist) * targetSpeed
      const lerpFactor = Math.min(1, 0.18 * delta + this.attractTimer * 0.008)
      this.velocity.x += (targetVx - this.velocity.x) * lerpFactor
      this.velocity.y += (targetVy - this.velocity.y) * lerpFactor
    }

    this.updatePosition(delta)

    const pulse = 0.85 + Math.sin(performance.now() * 0.01 + this.position.x * 0.01) * 0.15
    this.mesh.scale.setScalar(pulse)
  }
}
