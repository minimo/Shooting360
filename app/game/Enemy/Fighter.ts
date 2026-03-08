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
  protected shipBody: THREE.Mesh | undefined
  public speed: number = 7
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
    this.radius = 15
    this.player = player
    this.spawnBullet = spawnBullet
    this.fireInterval = Math.max(30, 120 - (wave - 1) * 10)
    this.mesh.position.z = 1

    this.lookAtPlayer()
    this.createMesh()
    this.fireCooldown = Math.random() * this.fireInterval
  }

  protected createMesh(): void {
    const geometry = new THREE.BufferGeometry()

    // 頂点定義 (三角形ベースの楔形)
    // 前端: (0, 10, 0)
    // 右後: (9, -7, 3), (9, -7, -3)
    // 左後: (-9, -7, 3), (-9, -7, -3)

    const vertices = new Float32Array([
      // 上面
      0, 15, 0, 13.5, -10.5, 4.5, -13.5, -10.5, 4.5,
      // 下面
      0, 15, 0, -13.5, -10.5, -4.5, 13.5, -10.5, -4.5,
      // 右側面
      0, 15, 0, 13.5, -10.5, -4.5, 13.5, -10.5, 4.5,
      // 左側面
      0, 15, 0, -13.5, -10.5, 4.5, -13.5, -10.5, -4.5,
      // 背面
      13.5, -10.5, 4.5, 13.5, -10.5, -4.5, -13.5, -10.5, -4.5,
      13.5, -10.5, 4.5, -13.5, -10.5, -4.5, -13.5, -10.5, 4.5,
    ])

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      flatShading: true,
      side: THREE.DoubleSide,
    })

    const mesh = new THREE.Mesh(geometry, material)
    this.shipBody = mesh
    this.mesh.add(mesh)

    // 発光設定
    material.emissive.setHex(0xff3333)
    material.emissiveIntensity = 0.5
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

  public override updateDisplay(cameraX: number, cameraY: number): void {
    super.updateDisplay(cameraX, cameraY)

    // 親の z 回転は super.updateDisplay で設定される (mesh.rotation.z = -this.rotation)

    // 子メッシュを y軸 (先端方向) を軸にロールさせる
    if (this.shipBody) {
      this.shipBody.rotation.y = this.rotation
    }
  }
}
