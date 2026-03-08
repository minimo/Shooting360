import * as THREE from 'three'
import { GameObject } from '../GameObject'
import type { Player } from '../Player'
import { HomingMissile } from '../HomingMissile'

export type SpawnHomingMissileFn = (x: number, y: number, angle: number) => void

/**
 * ミサイルフラワー
 *
 * 自機から一定距離を保ちながら、8方向に誘導ミサイルを発射する。
 */
export class MissileFlower extends GameObject {
  public speed: number = 6
  public rotationSpeed: number = 0.05
  public fireInterval: number = 180
  private fireCooldown: number = 0
  private orbitDirection: number = Math.random() < 0.5 ? 1 : -1
  private minDistance: number = 300
  private maxDistance: number = 500
  public hp: number = 10
  private player: Player
  private spawnHomingMissile: SpawnHomingMissileFn

  constructor(
    x: number,
    y: number,
    player: Player,
    spawnHomingMissile: SpawnHomingMissileFn,
    wave: number,
  ) {
    super(x, y)
    this.side = 'enemy'
    this.radius = 27
    this.player = player
    this.spawnHomingMissile = spawnHomingMissile
    this.fireInterval = Math.max(60, 300 - (wave - 1) * 20)
    this.mesh.position.z = 1

    this.lookAtPlayer()
    this.createMesh()
    this.fireCooldown = this.fireInterval
  }

  private createMesh(): void {
    const geo = new THREE.PlaneGeometry(36, 36)
    const mat = new THREE.MeshBasicMaterial({ color: 0x3333ff })
    this.mesh.add(new THREE.Mesh(geo, mat))
  }

  private lookAtPlayer(): void {
    const dx = this.player.position.x - this.position.x
    const dy = this.player.position.y - this.position.y
    this.rotation = Math.atan2(dx, -dy)
  }

  public takeDamage(amount: number): void {
    this.hp -= amount
    if (this.hp <= 0) this.isAlive = false
  }

  public override update(delta: number, ..._args: any[]): void {
    if (!this.isAlive) return

    const dx = this.player.position.x - this.position.x
    const dy = this.player.position.y - this.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angleToPlayer = Math.atan2(dx, -dy)

    let angleDiff = angleToPlayer - this.rotation
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

    if (Math.abs(angleDiff) < this.rotationSpeed * delta) {
      this.rotation = angleToPlayer
    } else {
      this.rotation += Math.sign(angleDiff) * this.rotationSpeed * delta
    }

    let targetMoveAngle = angleToPlayer
    if (dist > this.maxDistance) {
      targetMoveAngle = angleToPlayer
    } else if (dist < this.minDistance) {
      targetMoveAngle = angleToPlayer + Math.PI
    } else {
      targetMoveAngle = angleToPlayer + (Math.PI / 2) * this.orbitDirection
    }

    const targetVelX = Math.sin(targetMoveAngle) * this.speed
    const targetVelY = -Math.cos(targetMoveAngle) * this.speed
    this.velocity.x += (targetVelX - this.velocity.x) * 0.03
    this.velocity.y += (targetVelY - this.velocity.y) * 0.03

    this.updatePosition(delta)

    this.fireCooldown -= delta
    if (this.fireCooldown <= 0) {
      this.shoot8Waves()
      this.fireCooldown = this.fireInterval
    }
  }

  private shoot8Waves(): void {
    for (let i = 0; i < 8; i++) {
      const angle = ((Math.PI * 2) / 8) * i
      this.spawnHomingMissile(this.position.x, this.position.y, angle)
    }
  }
}
