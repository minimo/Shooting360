import * as THREE from 'three'
import { Fighter } from './Fighter'
import { GameObject, WORLD_SIZE, WORLD_HALF } from '../GameObject'
import { TrailEffect } from '../TrailEffect'
import type { Player, SpawnBulletFn, SpawnAfterimageFn } from '../Player'

/**
 * エース機クラス (AceFighter)
 *
 * 非常に高い機動力を持つエリート敵機。
 */
export class AceFighter extends Fighter {
  public override speed: number = 16.8
  public override rotationSpeed: number = 0.15
  public override hp: number = 10
  public override fireInterval: number = 60

  public isRepositioning: boolean = false
  private repositionTimer: number = 0
  private targetRepositionAngle: number = 0

  private isBurstFiring: boolean = false
  private burstCount: number = 0
  private burstTimer: number = 0
  private readonly maxBurstCount: number = 5
  private readonly burstInterval: number = 6

  private trail: TrailEffect

  constructor(
    x: number,
    y: number,
    player: Player,
    spawnBullet: SpawnBulletFn,
    _addObject: (obj: GameObject) => void,
    spawnAfterimage: SpawnAfterimageFn,
    wave: number,
  ) {
    super(x, y, player, spawnBullet, wave)
    this.trail = new TrailEffect(spawnAfterimage, 10, 40, 0xffffff, 1.0, 10)
    this.fireInterval = Math.max(30, 120 - (wave - 1) * 10)
    this.fireCooldown = Math.random() * this.fireInterval
    this.updateGraphics()
  }

  private updateGraphics(): void {
    // 既存の子を削除・dispose
    while (this.mesh.children.length > 0) {
      const child = this.mesh.children[0]!
      this.mesh.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
          ; (child.material as THREE.Material).dispose()
      }
    }

    const geometry = new THREE.BufferGeometry()
    // 頂点定義 (自機と同じ鏃型楔形、サイズも同様)
    const vertices = new Float32Array([
      // 上面 (前, 右後上, 中後上, 左後上)
      0, 16, 0, 12, -13, 4, 0, -6, 4,
      0, 16, 0, 0, -6, 4, -12, -13, 4,

      // 下面 (前, 右後下, 中後下, 左後下)
      0, 16, 0, 0, -6, -4, 12, -13, -4,
      0, 16, 0, -12, -13, -4, 0, -6, -4,

      // 右側面
      0, 16, 0, 12, -13, -4, 12, -13, 4,
      12, -13, 4, 12, -13, -4, 0, -6, -4,
      12, -13, 4, 0, -6, -4, 0, -6, 4,

      // 左側面
      0, 16, 0, -12, -13, 4, -12, -13, -4,
      -12, -13, 4, 0, -6, 4, 0, -6, -4,
      -12, -13, 4, 0, -6, -4, -12, -13, -4,

      // 背面 (右)
      12, -13, 4, 12, -13, -4, 0, -6, -4,
      12, -13, 4, 0, -6, -4, 0, -6, 4,

      // 背面 (左)
      -12, -13, 4, 0, -6, 4, 0, -6, -4,
      -12, -13, 4, 0, -6, -4, -12, -13, -4,
    ])

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      flatShading: true,
      side: THREE.DoubleSide,
    })

    const mesh = new THREE.Mesh(geometry, material)
    // @ts-ignore: protected access
    this.shipBody = mesh
    this.mesh.add(mesh)

    // 発光設定
    material.emissive.setHex(0xff3333)
    material.emissiveIntensity = 0.5
  }

  public override update(delta: number, ..._args: any[]): void {
    if (!this.isAlive) return

    let dx = this.player.position.x - this.position.x
    let dy = this.player.position.y - this.position.y
    if (dx > WORLD_HALF) dx -= WORLD_SIZE
    if (dx < -WORLD_HALF) dx += WORLD_SIZE
    if (dy > WORLD_HALF) dy -= WORLD_SIZE
    if (dy < -WORLD_HALF) dy += WORLD_SIZE

    const dist = Math.sqrt(dx * dx + dy * dy)
    const angleToPlayer = Math.atan2(dx, -dy)

    const playerSpeedSq = this.player.velocity.x ** 2 + this.player.velocity.y ** 2
    const playerHeading =
      playerSpeedSq > 0.1
        ? Math.atan2(this.player.velocity.x, -this.player.velocity.y)
        : this.player.rotation

    const angleFromPlayerToEnemy = Math.atan2(-dx, dy)
    let arcDiff = playerHeading - angleFromPlayerToEnemy
    while (arcDiff > Math.PI) arcDiff -= Math.PI * 2
    while (arcDiff < -Math.PI) arcDiff += Math.PI * 2

    let headingDiffToPlayer = playerHeading - this.rotation
    while (headingDiffToPlayer > Math.PI) headingDiffToPlayer -= Math.PI * 2
    while (headingDiffToPlayer < -Math.PI) headingDiffToPlayer += Math.PI * 2

    if (this.isRepositioning) {
      this.repositionTimer -= delta
      if (this.repositionTimer <= 0) this.isRepositioning = false
    }

    if (!this.isRepositioning) {
      if (dist < 180 && Math.abs(arcDiff) < Math.PI / 4) {
        this.isRepositioning = true
        this.repositionTimer = 45
        const dodgeDir = arcDiff > 0 ? -1 : 1
        this.targetRepositionAngle = playerHeading + (Math.PI / 2) * dodgeDir
      }
    }

    let targetAngle = this.rotation
    let currentSpeed = this.speed

    if (this.isRepositioning) {
      targetAngle = this.targetRepositionAngle
    } else {
      targetAngle = angleToPlayer
      if (dist < 200 && Math.abs(headingDiffToPlayer) < Math.PI / 2) {
        const playerSpeed = Math.sqrt(playerSpeedSq)
        currentSpeed = Math.max(10, playerSpeed * (dist / 150))
      }

      let angleDiff = targetAngle - this.rotation
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
      if (Math.abs(angleDiff) < this.rotationSpeed * delta) {
        this.rotation = targetAngle
      } else {
        this.rotation += Math.sign(angleDiff) * this.rotationSpeed * delta
      }
    }

    const targetVelX = Math.sin(this.rotation) * currentSpeed
    const targetVelY = -Math.cos(this.rotation) * currentSpeed
    const lerpFactor = this.isRepositioning ? 0.2 : 0.15
    this.velocity.x += (targetVelX - this.velocity.x) * lerpFactor
    this.velocity.y += (targetVelY - this.velocity.y) * lerpFactor

    this.trail.update(this.position.x, this.position.y, this.rotation)
    this.updatePosition(delta)

    let aimDiff = angleToPlayer - this.rotation
    while (aimDiff > Math.PI) aimDiff -= Math.PI * 2
    while (aimDiff < -Math.PI) aimDiff += Math.PI * 2

    if (this.isBurstFiring) {
      this.burstTimer -= delta
      if (this.burstTimer <= 0) {
        this.shoot()
        this.burstCount--
        if (this.burstCount <= 0) {
          this.isBurstFiring = false
          this.fireCooldown = this.fireInterval
        } else {
          this.burstTimer = this.burstInterval
        }
      }
    } else if (!this.isRepositioning) {
      this.fireCooldown -= delta
      if (this.fireCooldown <= 0) {
        if (Math.abs(aimDiff) < 0.15 && dist < 400) {
          this.isBurstFiring = true
          this.burstCount = this.maxBurstCount
          this.burstTimer = 0
        }
      }
    }
  }
}
