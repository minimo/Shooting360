import * as THREE from 'three'
import { GameObject, WORLD_SIZE, WORLD_HALF } from '../GameObject'
import { CoreDestroyer } from './CoreDestroyer'

export class CoreShield extends GameObject {
  public boss: CoreDestroyer
  public shieldIndex: number
  public maxHp: number = 300
  public hp: number = 300
  public override radius: number = 70 // Boxの長辺の半分に近い値
  public override side: 'enemy' = 'enemy'
  
  private boxMesh: THREE.Mesh

  constructor(boss: CoreDestroyer, shieldIndex: number) {
    // 初期のワールド座標はupdateで即座に上書きされるため、0,0で初期化
    super(0, 0)
    this.boss = boss
    this.shieldIndex = shieldIndex

    const geo = new THREE.BoxGeometry(140, 40, 60)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: 0x222222,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2
    })
    this.boxMesh = new THREE.Mesh(geo, mat)
    this.mesh.add(this.boxMesh)
  }

  public takeDamage(amount: number): void {
    this.hp -= amount
    if (this.boxMesh.material instanceof THREE.MeshStandardMaterial) {
      this.boxMesh.material.emissive.setHex(0xffffff)
      setTimeout(() => {
        if (this.boxMesh && this.boxMesh.material instanceof THREE.MeshStandardMaterial) {
          this.boxMesh.material.emissive.setHex(0x222222)
        }
      }, 50)
    }
    
    if (this.hp <= 0) {
      this.isAlive = false
    }
  }

  public checkHit(bulletX: number, bulletY: number, bulletRadius: number): boolean {
    let dx = bulletX - this.position.x
    let dy = bulletY - this.position.y
    if (dx > WORLD_HALF) dx -= WORLD_SIZE
    if (dx < -WORLD_HALF) dx += WORLD_SIZE
    if (dy > WORLD_HALF) dy -= WORLD_SIZE
    if (dy < -WORLD_HALF) dy += WORLD_SIZE

    const shieldHalfW = 75
    const shieldHalfH = 25
    
    // -this.rotation することでシールドのローカル空間に弾の座標を変換
    const rot = -this.rotation
    const rx = dx * Math.cos(rot) - dy * Math.sin(rot)
    const ry = dx * Math.sin(rot) + dy * Math.cos(rot)
    
    return Math.abs(rx) < shieldHalfW + bulletRadius && Math.abs(ry) < shieldHalfH + bulletRadius
  }

  public override update(delta: number): void {
    if (!this.boss.isAlive) {
      this.isAlive = false
      return
    }

    const baseAngle = (this.shieldIndex / 4) * Math.PI * 2 + this.boss.shieldAngle
    const shieldRadius = 260

    this.position.x = this.boss.position.x + Math.cos(baseAngle) * shieldRadius
    this.position.y = this.boss.position.y - Math.sin(baseAngle) * shieldRadius // Y座標系注意 (Three.jsは上がy+, 内部ロジックは下がy+)

    // ロジック上の回転（時計回りが正）
    this.rotation = -baseAngle - Math.PI / 2

    this.updatePosition(0) // wrap-aroundの適用
  }
}
