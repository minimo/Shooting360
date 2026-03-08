import * as THREE from 'three'
import { GameObject } from './GameObject'

/**
 * ダメージ付き爆発クラス
 */
export class HomingExplosion extends GameObject {
  private maxLife: number
  private life: number
  private maxRadius: number
  public damage: number = 1
  private hitObjects: Set<GameObject> = new Set()
  private readonly velocityDecay = 0.95
  private mainMat: THREE.MeshBasicMaterial
  private coreMat: THREE.MeshBasicMaterial

  constructor(
    x: number,
    y: number,
    scale: number = 2.25,
    duration: number = 30,
    vx: number = 0,
    vy: number = 0,
  ) {
    super(x, y)
    this.velocity.x = vx
    this.velocity.y = vy
    this.maxLife = duration
    this.life = duration
    this.maxRadius = 60 * scale
    this.radius = this.maxRadius
    this.mesh.position.z = 3

    const mainGeo = new THREE.CircleGeometry(this.maxRadius, 16)
    this.mainMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, opacity: 0.6, transparent: true })
    this.mesh.add(new THREE.Mesh(mainGeo, this.mainMat))

    const coreGeo = new THREE.CircleGeometry(this.maxRadius * 0.5, 16)
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true })
    const coreMesh = new THREE.Mesh(coreGeo, this.coreMat)
    coreMesh.position.z = 0.1
    this.mesh.add(coreMesh)
  }

  public override update(delta: number, ..._args: any[]): void {
    this.life -= delta
    if (this.life <= 0) {
      this.isAlive = false
      return
    }

    this.velocity.x *= this.velocityDecay
    this.velocity.y *= this.velocityDecay

    const progress = 1 - this.life / this.maxLife
    const scale = 0.2 + progress * 0.8
    this.mesh.scale.set(scale, scale, 1)
    this.mainMat.opacity = (1 - progress) * 0.6
    this.coreMat.opacity = (1 - progress) * 0.8

    this.updatePosition(delta)
  }

  /**
   * 特定の対象にダメージを一度だけ与えるためのチェック
   */
  public canDealDamage(target: GameObject): boolean {
    if (this.hitObjects.has(target)) return false
    this.hitObjects.add(target)
    return true
  }
}
