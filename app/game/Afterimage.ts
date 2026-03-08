import * as THREE from 'three'
import { GameObject } from './GameObject'

/**
 * 残像クラス
 * 自機やエース機の移動の軌跡を表現するための演出用オブジェクト。
 * Three.js の Line を使用して線分を描画する。
 */
export class Afterimage extends GameObject {
  private life: number
  private maxLife: number
  private mat: THREE.MeshBasicMaterial | null = null

  constructor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    life: number = 20,
    color: number = 0xffffff,
    alpha: number = 1.0,
  ) {
    super(x1, y1)
    this.life = life
    this.maxLife = life
    this.mesh.position.z = -1

    this.createMesh(x2 - x1, y2 - y1, color, alpha)
  }

  private createMesh(targetX: number, targetY: number, color: number, alpha: number): void {
    if (isNaN(targetX) || isNaN(targetY)) return

    // Three.js は y-up なので Y を反転
    const dx = targetX
    const dy = -targetY
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance === 0) return

    const angle = Math.atan2(dy, dx)
    const thickness = 4 // 軌跡の太さ

    // 距離分の長さを持つ板を作成
    const geo = new THREE.PlaneGeometry(distance, thickness)
    this.mat = new THREE.MeshBasicMaterial({
      color,
      opacity: alpha,
      transparent: true,
      side: THREE.DoubleSide
    })

    const mesh = new THREE.Mesh(geo, this.mat)

    // 中点に配置して回転させる
    mesh.position.set(dx / 2, dy / 2, 0)
    mesh.rotation.z = angle

    this.mesh.add(mesh)
  }

  public override update(delta: number, ..._args: any[]): void {
    if (isNaN(delta)) return

    this.life -= delta
    if (this.life <= 0) {
      this.isAlive = false
      return
    }

    if (this.mat) {
      this.mat.opacity = this.life / this.maxLife
    }
  }
}
