import * as THREE from 'three'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'
import type { Player, SpawnAfterimageFn } from './Player'
import { TrailEffect } from './TrailEffect'

/**
 * 誘導ミサイル（ロケット型）
 */
export class HomingMissile extends GameObject {
  public maxSpeed: number = 12.0
  private currentSpeed: number = 3
  private turnSpeed: number = 0.025
  public maxDistance: number = 1580
  public hp: number = 1
  private expansionTime: number = 60
  private elapsedFrames: number = 0
  private player: Player
  private origin: { x: number; y: number }
  private trail: TrailEffect
  public shouldExplode: boolean = false
  public isMaxDistanceExplosion: boolean = false

  constructor(
    x: number,
    y: number,
    angle: number,
    player: Player,
    spawnAfterimage: SpawnAfterimageFn,
  ) {
    super(x, y)
    this.side = 'enemy'
    this.radius = 6
    this.rotation = angle
    this.player = player
    this.origin = { x, y }
    this.velocity.x = Math.sin(angle) * this.currentSpeed
    this.velocity.y = -Math.cos(angle) * this.currentSpeed
    this.trail = new TrailEffect(spawnAfterimage, 8, 30, 0xffffff, 0.8, 8)
    this.mesh.position.z = 0
    this.createMesh()
  }

  private createMesh(): void {
    // Body: rect(-3,-7,6,15) → center (0, 0.5) in y-down → (0,-0.5) in y-up
    const bodyGeo = new THREE.PlaneGeometry(6, 15)
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x33ccff })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.set(0, -0.5, 0)
    this.mesh.add(body)

    // Nose: [(-3,-7),(3,-7),(0,-12)] y-down → negate Y: [(-3,7),(3,7),(0,12)]
    const shape = new THREE.Shape()
    shape.moveTo(-3, 7)
    shape.lineTo(3, 7)
    shape.lineTo(0, 12)
    shape.closePath()
    const noseGeo = new THREE.ShapeGeometry(shape)
    const noseMat = new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide })
    const nose = new THREE.Mesh(noseGeo, noseMat)
    nose.position.z = 0.1
    this.mesh.add(nose)
  }

  public takeDamage(amount: number): void {
    this.hp -= amount
    if (this.hp <= 0) this.isAlive = false
  }

  public override update(delta: number, ..._args: any[]): void {
    this.elapsedFrames += delta

    if (this.elapsedFrames >= this.expansionTime) {
      if (this.currentSpeed < this.maxSpeed) {
        this.currentSpeed += 0.2 * delta
        if (this.currentSpeed > this.maxSpeed) this.currentSpeed = this.maxSpeed
      }

      let dx = this.player.position.x - this.position.x
      let dy = this.player.position.y - this.position.y
      if (dx > WORLD_HALF) dx -= WORLD_SIZE
      if (dx < -WORLD_HALF) dx += WORLD_SIZE
      if (dy > WORLD_HALF) dy -= WORLD_SIZE
      if (dy < -WORLD_HALF) dy += WORLD_SIZE

      const targetAngle = Math.atan2(dx, -dy)
      let angleDiff = targetAngle - this.rotation
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

      if (Math.abs(angleDiff) < this.turnSpeed * delta) {
        this.rotation = targetAngle
      } else {
        this.rotation += Math.sign(angleDiff) * this.turnSpeed * delta
      }
    }

    this.velocity.x = Math.sin(this.rotation) * this.currentSpeed
    this.velocity.y = -Math.cos(this.rotation) * this.currentSpeed

    this.updatePosition(delta)
    this.trail.update(this.position.x, this.position.y, this.rotation)

    const distDx = this.position.x - this.origin.x
    const distDy = this.position.y - this.origin.y
    if (distDx * distDx + distDy * distDy > this.maxDistance * this.maxDistance) {
      this.isAlive = false
      this.shouldExplode = true
      this.isMaxDistanceExplosion = true
    }

    const pdx = this.player.position.x - this.position.x
    const pdy = this.player.position.y - this.position.y
    if (pdx * pdx + pdy * pdy < 40 * 40) {
      this.isAlive = false
      this.shouldExplode = true
    }
  }
}
