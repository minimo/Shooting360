import * as THREE from 'three'
import { GameObject } from './GameObject'

/**
 * パーティクルクラス
 *
 * 散らばる火花などの小さな演出用。
 */
export class Particle extends GameObject {
  private life: number
  private maxLife: number
  private mat: THREE.MeshBasicMaterial

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number = 20,
    color: number = 0xffaa00,
    size: number = 2,
  ) {
    super(x, y)
    this.velocity.x = vx
    this.velocity.y = vy
    this.life = life
    this.maxLife = life
    this.mesh.position.z = 3

    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    const geo = new THREE.PlaneGeometry(size, size)
    const mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.add(mesh)
  }

  public override update(delta: number, ..._args: any[]): void {
    this.life -= delta
    if (this.life <= 0) {
      this.isAlive = false
      return
    }

    this.mat.opacity = this.life / this.maxLife

    this.velocity.x *= 0.92
    this.velocity.y *= 0.92

    this.updatePosition(delta)
  }
}
