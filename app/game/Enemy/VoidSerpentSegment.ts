import * as THREE from 'three'
import { GameObject } from '../GameObject'
import type { Player } from '../Player'

export class VoidSerpentSegment extends GameObject {
  public hp: number = 1000
  public maxHp: number = 1000
  public segmentIndex: number
  public isDestroyed: boolean = false
  public justDestroyed: boolean = false
  public isMissilePod: boolean

  private addObject: (obj: GameObject) => void
  private player: Player
  private spawnMissile: (x: number, y: number, angle: number) => void
  private fireTimer: number = 0
  private bodyMat!: THREE.MeshStandardMaterial
  private rotatingMesh!: THREE.Mesh

  constructor(
    index: number,
    isMissilePod: boolean,
    addObject: (obj: GameObject) => void,
    player: Player,
    spawnMissile: (x: number, y: number, angle: number) => void
  ) {
    super()
    this.segmentIndex = index
    this.isMissilePod = isMissilePod
    this.addObject = addObject
    this.player = player
    this.spawnMissile = spawnMissile
    this.radius = 60
    
    this.createMesh()
  }

  private createMesh(): void {
    const group = new THREE.Group()
    
    // 直方体ボディ (長辺200, 短辺80, 80)
    const bodyGeometry = new THREE.BoxGeometry(200, 80, 80)
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0x112288,
      roughness: 0.8,
      metalness: 0.2,
      emissive: 0x000000
    })
    this.rotatingMesh = new THREE.Mesh(bodyGeometry, this.bodyMat)
    group.add(this.rotatingMesh)

    this.mesh = group
    this.mesh.position.z = 5
  }

  public takeDamage(amount: number): void {
    if (!this.isAlive || this.isDestroyed) return
    this.hp -= amount
    
    if (this.bodyMat) {
      this.bodyMat.emissive.setHex(0xffffff)
      setTimeout(() => {
        if (this.bodyMat) {
          this.bodyMat.emissive.setHex(0x000000)
        }
      }, 50)
    }
  }

  public override update(delta: number, ..._args: any[]): void {
    if (this.isDestroyed || !this.isAlive) return

    if (this.isMissilePod) {
      this.fireTimer += delta
      if (this.fireTimer >= 180) { // 3 seconds
        this.fireTimer = 0
        // ミサイル発射（左右に展開）
        const angle1 = this.rotation + Math.PI / 2
        const angle2 = this.rotation - Math.PI / 2
        this.spawnMissile(this.position.x, this.position.y, angle1)
        this.spawnMissile(this.position.x, this.position.y, angle2)
      }
    }
    
    if (this.rotatingMesh) {
      this.rotatingMesh.rotation.x += delta * 0.05
    }
  }

  // 頭部が管理する履歴位置に同期する
  public syncPosition(x: number, y: number, rotation: number): void {
    if (this.isDestroyed) return
    this.position.x = x
    this.position.y = y
    this.rotation = rotation
  }

  // 破壊処理。完全消滅して次から連鎖させるためのフラグ設定。
  public destroySegment(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true
    this.justDestroyed = true
    this.isAlive = false
    if (this.mesh) {
      this.mesh.visible = false
    }
  }
}
