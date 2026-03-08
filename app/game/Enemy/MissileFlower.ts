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
  private wave: number
  private cubeBody: THREE.Mesh | undefined
  private randomRotationSpeed: { x: number; y: number; z: number }

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
    this.wave = wave
    this.fireInterval = Math.max(60, 300 - (wave - 1) * 20)
    this.mesh.position.z = 1

    this.lookAtPlayer()
    this.createMesh()
    this.fireCooldown = this.fireInterval

    // ランダムな回転速度を設定 (-0.05 ~ 0.05)
    this.randomRotationSpeed = {
      x: (Math.random() - 0.5) * 0.1,
      y: (Math.random() - 0.5) * 0.1,
      z: (Math.random() - 0.5) * 0.1,
    }
  }

  private createMesh(): void {
    const geo = new THREE.BoxGeometry(32, 32, 32)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3333ff,
      flatShading: true,
      emissive: 0x3333ff,
      emissiveIntensity: 0.5,
    })
    this.cubeBody = new THREE.Mesh(geo, mat)
    this.mesh.add(this.cubeBody)
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

    // ランダム回転の適用
    if (this.cubeBody) {
      this.cubeBody.rotation.x += this.randomRotationSpeed.x * delta
      this.cubeBody.rotation.y += this.randomRotationSpeed.y * delta
      this.cubeBody.rotation.z += this.randomRotationSpeed.z * delta
    }

    this.updatePosition(delta)

    this.fireCooldown -= delta
    if (this.fireCooldown <= 0) {
      this.shoot8Waves()
      this.fireCooldown = this.fireInterval
    }
  }

  private shoot8Waves(): void {
    // Wave に応じた発射数の計算 (Wave 3 で 1発から開始)
    const count = Math.min(8, Math.floor(this.wave / 2))
    for (let i = 0; i < count; i++) {
      const angle = ((Math.PI * 2) / count) * i
      this.spawnHomingMissile(this.position.x, this.position.y, angle)
    }
  }
}
