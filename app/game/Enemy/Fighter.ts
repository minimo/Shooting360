import * as THREE from 'three'
import { GameObject, WORLD_SIZE, WORLD_HALF } from '../GameObject'
import type { Player, SpawnBulletFn } from '../Player'

/**
 * 敵機クラス (Fighter)
 *
 * 画面外から出現し、自機を追尾しながら弾を撃ってくる。
 * プレイヤーが正面から向かってきた場合は横に回避する。
 */
export class Fighter extends GameObject {
  public speed: number = 14
  public rotationSpeed: number = 0.08
  public fireInterval: number = 60
  protected fireCooldown: number = 0
  private offsetSign: number = Math.random() < 0.5 ? 1 : -1
  public hp: number = 3
  protected player: Player
  private spawnBullet: SpawnBulletFn
  private isEvading: boolean = false
  private evadeTimer: number = 0
  private targetEvadeAngle: number = 0

  constructor(
    x: number,
    y: number,
    player: Player,
    spawnBullet: SpawnBulletFn,
    wave: number,
  ) {
    super(x, y)
    this.side = 'enemy'
    this.radius = 10
    this.player = player
    this.spawnBullet = spawnBullet
    this.fireInterval = Math.max(30, 120 - (wave - 1) * 10)
    this.mesh.position.z = 1

    this.lookAtPlayer()
    this.createMesh()
    this.fireCooldown = Math.random() * this.fireInterval
  }

  protected createMesh(): void {
    // PixiJS: [{0,-10},{-9,7},{9,7}] y-down → Three.js y-up: negate Y
    const shape = new THREE.Shape()
    shape.moveTo(0, 10)
    shape.lineTo(-9, -7)
    shape.lineTo(9, -7)
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geo, mat)
    this.mesh.add(mesh)
  }

  private lookAtPlayer(): void {
    let dx = this.player.position.x - this.position.x
    let dy = this.player.position.y - this.position.y
    if (dx > WORLD_HALF) dx -= WORLD_SIZE
    if (dx < -WORLD_HALF) dx += WORLD_SIZE
    if (dy > WORLD_HALF) dy -= WORLD_SIZE
    if (dy < -WORLD_HALF) dy += WORLD_SIZE
    this.rotation = Math.atan2(dx, -dy)
  }

  public takeDamage(amount: number): void {
    this.hp -= amount
    if (this.hp <= 0) this.isAlive = false
  }

  public override update(delta: number, ..._args: any[]): void {
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

    if (this.isEvading) {
      this.evadeTimer -= delta
      if (this.evadeTimer <= 0) this.isEvading = false
    }

    let fighterAimDiff = angleToPlayer - this.rotation
    while (fighterAimDiff > Math.PI) fighterAimDiff -= Math.PI * 2
    while (fighterAimDiff < -Math.PI) fighterAimDiff += Math.PI * 2

    if (!this.isEvading) {
      let shouldEvade = false
      if (dist < 300 && Math.abs(arcDiff) < Math.PI / 3) shouldEvade = true
      if (dist < 250 && Math.abs(fighterAimDiff) < Math.PI / 4) shouldEvade = true
      if (dist < 100) shouldEvade = true

      if (shouldEvade) {
        this.isEvading = true
        this.evadeTimer = 45
        const dodgeDir = arcDiff > 0 ? -1 : 1
        this.targetEvadeAngle = playerHeading + (Math.PI / 2) * dodgeDir
      }
    }

    let targetAngle: number
    if (this.isEvading) {
      targetAngle = this.targetEvadeAngle
    } else {
      targetAngle = angleToPlayer
      if (dist < 150) {
        const offsetWidth = 0.3 * (1 - dist / 150)
        targetAngle += this.offsetSign * offsetWidth
      }
    }

    let angleDiff = targetAngle - this.rotation
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

    if (Math.abs(angleDiff) < this.rotationSpeed * delta) {
      this.rotation = targetAngle
    } else {
      this.rotation += Math.sign(angleDiff) * this.rotationSpeed * delta
    }

    const targetVelX = Math.sin(this.rotation) * this.speed
    const targetVelY = -Math.cos(this.rotation) * this.speed
    const lerpFactor = this.isEvading ? 0.15 : 0.1
    this.velocity.x += (targetVelX - this.velocity.x) * lerpFactor
    this.velocity.y += (targetVelY - this.velocity.y) * lerpFactor

    this.updatePosition(delta)

    if (!this.isEvading) {
      this.fireCooldown -= delta
      if (this.fireCooldown <= 0) {
        const aimDiff = angleToPlayer - this.rotation
        let normalizedAimDiff = aimDiff
        while (normalizedAimDiff > Math.PI) normalizedAimDiff -= Math.PI * 2
        while (normalizedAimDiff < -Math.PI) normalizedAimDiff += Math.PI * 2
        if (Math.abs(normalizedAimDiff) < 0.2) {
          this.shoot()
          this.fireCooldown = this.fireInterval
        }
      }
    }
  }

  protected shoot(): void {
    this.spawnBullet(this.position.x, this.position.y, this.rotation, 'enemy')
  }
}
