import * as THREE from 'three'
import { GameObject } from './GameObject'

/**
 * 爆発エフェクトクラス
 *
 * 円が広がりながら消えていく演出。フラッシュ効果をサポート。
 */
export class Explosion extends GameObject {
  private maxLife: number
  private life: number
  private maxRadius: number
  private isFlashy: boolean
  private readonly velocityDecay = 0.95
  private mainMat: THREE.MeshBasicMaterial
  private flashMat: THREE.MeshBasicMaterial | null = null

  constructor(
    x: number,
    y: number,
    color: number = 0xffaa00,
    scale: number = 1.0,
    duration: number = 30,
    isFlashy: boolean = false,
    vx: number = 0,
    vy: number = 0,
  ) {
    super(x, y)
    this.velocity.x = vx
    this.velocity.y = vy
    this.maxLife = duration
    this.life = duration
    this.maxRadius = 40 * scale
    this.isFlashy = isFlashy
    this.mesh.position.z = 3

    // メインの爆発円
    const segments = this.maxRadius > 200 ? 64 : 32
    const geo = new THREE.CircleGeometry(this.maxRadius, segments)
    this.mainMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    const mainMesh = new THREE.Mesh(geo, this.mainMat)
    this.mesh.add(mainMesh)

    // フラッシュ効果
    if (isFlashy) {
      const fGeo = new THREE.CircleGeometry(this.maxRadius * 0.7, segments)
      this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true })
      const flash = new THREE.Mesh(fGeo, this.flashMat)
      flash.position.z = 0.1
      this.mesh.add(flash)
    }
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

    this.mainMat.opacity = 1 - progress

    if (this.flashMat) {
      this.flashMat.opacity = Math.max(0, (1 - progress * 4) * 0.8)
    }

    this.updatePosition(delta)
  }
}
