import * as THREE from 'three'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'

/**
 * 弾クラス
 *
 * 発射方向へ高速直進し、一定距離を超えたら自動消滅する。
 */
export class Bullet extends GameObject {
  /** 弾速 */
  public speed: number = 25

  /** 最大飛距離 */
  public maxDistance: number = 1580

  /** ダメージ */
  public damage: number = 1

  /** 貫通弾かどうか */
  public isPiercing: boolean = false

  /** 発射地点（距離計算用） */
  private origin: { x: number; y: number }

  private mat: THREE.MeshBasicMaterial

  constructor(
    x: number,
    y: number,
    angle: number,
    side: 'player' | 'enemy' = 'player',
    speedMultiplier: number = 1,
    damage: number = 1,
    isPiercing: boolean = false,
  ) {
    super(x, y)
    this.side = side
    this.radius = side === 'player' ? 6 : 3
    this.rotation = angle
    this.origin = { x, y }
    this.damage = damage
    this.isPiercing = isPiercing
    this.mesh.position.z = 1

    this.velocity.x = Math.sin(angle) * this.speed * speedMultiplier
    this.velocity.y = -Math.cos(angle) * this.speed * speedMultiplier

    this.mat = new THREE.MeshBasicMaterial({ color: 0xffff00 })
    this.createMesh()
  }

  private createMesh(): void {
    // PixiJS: rect(-1, -3, 2, 7) → center (0, 0.5) in y-down → (0, -0.5) in y-up
    const geo = new THREE.PlaneGeometry(2, 7)
    const mesh = new THREE.Mesh(geo, this.mat)
    mesh.position.set(0, -0.5, 0)
    this.mesh.add(mesh)
  }

  public override update(delta: number, ..._args: any[]): void {
    this.updatePosition(delta)

    let dx = this.position.x - this.origin.x
    let dy = this.position.y - this.origin.y

    if (dx > WORLD_HALF) dx -= WORLD_SIZE
    if (dx < -WORLD_HALF) dx += WORLD_SIZE
    if (dy > WORLD_HALF) dy -= WORLD_SIZE
    if (dy < -WORLD_HALF) dy += WORLD_SIZE

    if (dx * dx + dy * dy > this.maxDistance * this.maxDistance) {
      this.isAlive = false
    }
  }
}
