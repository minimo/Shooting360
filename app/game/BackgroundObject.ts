import * as THREE from 'three'
import { GameObject } from './GameObject'

/**
 * 背景オブジェクトクラス
 *
 * ランダムな位置・サイズ・色の四角形。
 * カメラ移動により流れて見える背景を演出する。
 */
export class BackgroundObject extends GameObject {
  constructor(x: number, y: number) {
    super(x, y)
    this.mesh.position.z = -10
    this.createMesh()
  }

  private createMesh(): void {
    const size = 10 + Math.random() * 40
    const colors = [
      0x4488ff, // ブルー
      0x44ff88, // グリーン
      0xff8844, // オレンジ
      0x8844ff, // パープル
      0xff44aa, // ピンク
      0x44ffff, // シアン
      0xffff44, // イエロー
    ]
    const color = colors[Math.floor(Math.random() * colors.length)] ?? 0xffffff
    const alpha = 0.3 + Math.random() * 0.4

    const geo = new THREE.PlaneGeometry(size, size)
    const mat = new THREE.MeshBasicMaterial({ color, opacity: alpha, transparent: true })
    const mesh = new THREE.Mesh(geo, mat)
    this.mesh.add(mesh)
  }

  /** 背景は静止（何もしない） */
  public override update(_delta: number, ..._args: any[]): void {}
}
