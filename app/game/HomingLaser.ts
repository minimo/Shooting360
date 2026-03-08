import * as THREE from 'three'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'
import type { SpawnAfterimageFn } from './Player'
import { TrailEffect } from './TrailEffect'

/**
 * プレイヤー用のホーミングレーザー
 */
export class HomingLaser extends GameObject {
  public speed: number = 18.0
  public turnSpeed: number = 0.15
  public damage: number = 2
  public lifeTime: number = 120
  private elapsedFrames: number = 0
  private target: GameObject | null = null
  private trail: TrailEffect
  private homingDelay: number = 15

  constructor(
    x: number,
    y: number,
    angle: number,
    target: GameObject | null,
    spawnAfterimage: SpawnAfterimageFn,
  ) {
    super(x, y)
    this.side = 'player'
    this.radius = 8
    this.rotation = angle
    this.target = target
    this.trail = new TrailEffect(spawnAfterimage, 6, 25, 0xffff00, 0.7, 5)
    this.mesh.position.z = 0
    this.createMesh()
  }

  private createMesh(): void {
    // [{0,-10},{5,-5},{3,5},{-3,5},{-5,-5}] y-down → negate Y for Three.js y-up
    const shape = new THREE.Shape()
    shape.moveTo(0, 10)
    shape.lineTo(5, 5)
    shape.lineTo(3, -5)
    shape.lineTo(-3, -5)
    shape.lineTo(-5, 5)
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide })
    this.mesh.add(new THREE.Mesh(geo, mat))

    // 中心部 circle(0, -3, 3) → y-up: (0, 3)
    const coreGeo = new THREE.CircleGeometry(3, 8)
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.position.set(0, 3, 0.1)
    this.mesh.add(core)
  }

  public override update(delta: number, ..._args: any[]): void {
    this.elapsedFrames += delta
    if (this.elapsedFrames > this.lifeTime) {
      this.isAlive = false
      return
    }

    if (this.homingDelay > 0) this.homingDelay -= delta

    if (this.homingDelay <= 0 && this.target && this.target.isAlive) {
      let dx = this.target.position.x - this.position.x
      let dy = this.target.position.y - this.position.y
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

    this.velocity.x = Math.sin(this.rotation) * this.speed
    this.velocity.y = -Math.cos(this.rotation) * this.speed

    this.updatePosition(delta)
    this.trail.update(this.position.x, this.position.y, this.rotation)
  }
}
