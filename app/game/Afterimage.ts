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
  private mat: THREE.LineBasicMaterial | null = null

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
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(targetX, -targetY, 0)]
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    this.mat = new THREE.LineBasicMaterial({ color, opacity: alpha, transparent: true, linewidth: 4 })
    const line = new THREE.Line(geo, this.mat)
    this.mesh.add(line)
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
