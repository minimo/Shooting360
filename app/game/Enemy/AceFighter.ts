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
    externalModel?: THREE.Object3D,
  ) {
    super(x, y, player, spawnBullet, wave, externalModel)
    this.trail = new TrailEffect(spawnAfterimage, 10, 40, 0xffffff, 1.0, 10)
    this.fireInterval = Math.max(30, 120 - (wave - 1) * 10)
    this.fireCooldown = Math.random() * this.fireInterval
    if (externalModel) {
      externalModel.scale.set(24, 24, 24) // AceFighter は通常の Fighter より少し大きめ
      externalModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.material && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.color.setHex(0xffff00) // エース機は黄色
            child.material.emissive.setHex(0xffff00)
          }
        }
      })
    }
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
