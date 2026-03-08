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
  private target: GameObject
  private origin: { x: number; y: number }
  private trail: TrailEffect
  public shouldExplode: boolean = false
  public isMaxDistanceExplosion: boolean = false

  constructor(
    x: number,
    y: number,
    angle: number,
    playerOrTarget: GameObject, // Renamed from 'player' and type changed to GameObject
    spawnAfterimage: SpawnAfterimageFn, // Assuming SpawnAfterimageFn is the correct type, not SpawnHomingMissileFn
    side: 'player' | 'enemy' = 'enemy', // Added new parameter
  ) {
    super(x, y)
    this.side = side // Assign side from constructor argument
    this.radius = 6
    this.rotation = angle
    this.target = playerOrTarget // Assign target from constructor argument
    this.origin = { x, y }
    this.velocity.x = Math.sin(angle) * this.currentSpeed
    this.velocity.y = -Math.cos(angle) * this.currentSpeed
    this.trail = new TrailEffect(spawnAfterimage, 8, 30, 0xffffff, 0.8, 8)
    this.mesh.position.z = 0
    this.createMesh()
  }

  private createMesh(): void {
    // 胴体: 直方体 (6x15x6)
    const bodyGeo = new THREE.BoxGeometry(6, 15, 6)
    const bodyColor = this.side === 'player' ? 0x00ffff : 0x33ccff
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      flatShading: true,
      emissive: bodyColor,
      emissiveIntensity: 0.5,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.set(0, -0.5, 0)
    this.mesh.add(body)

    // 先端: 四角錐 (底面 6x6, 高さ 5)
    const noseGeo = new THREE.BufferGeometry()
    const vertices = new Float32Array([
      // 四角錐の側面 (4つの三角形)
      -3, 7.5, 3, 3, 7.5, 3, 0, 12.5, 0,
      3, 7.5, 3, 3, 7.5, -3, 0, 12.5, 0,
      3, 7.5, -3, -3, 7.5, -3, 0, 12.5, 0,
      -3, 7.5, -3, -3, 7.5, 3, 0, 12.5, 0,
    ])
    noseGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    noseGeo.computeVertexNormals()

    const noseMat = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      flatShading: true,
      emissive: 0xff3333,
      emissiveIntensity: 0.5,
    })
    const nose = new THREE.Mesh(noseGeo, noseMat)
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

      if (!this.target.isAlive) {
        // ターゲットが死んでいる場合は直進するか、必要なら GameManager 側で爆発させる
        this.velocity.x = Math.sin(this.rotation) * this.currentSpeed
        this.velocity.y = -Math.cos(this.rotation) * this.currentSpeed
        this.updatePosition(delta)
        return
      }

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

    const pdx = this.target.position.x - this.position.x
    const pdy = this.target.position.y - this.position.y
    if (this.target.isAlive && pdx * pdx + pdy * pdy < 40 * 40) {
      this.isAlive = false
      this.shouldExplode = true
    }
  }
}
