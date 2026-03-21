import * as THREE from 'three'

/**
 * ワールド設定
 */
export const WORLD_SIZE = 4000
export const WORLD_HALF = WORLD_SIZE / 2

/**
 * Three.js メッシュのリソースを再帰的に解放してシーンから削除するユーティリティ
 */
export function disposeMesh(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m: THREE.Material) => m.dispose())
      } else {
        ;(child.material as THREE.Material).dispose()
      }
    }
  })
  if (obj.parent) obj.parent.remove(obj)
}

/**
 * 全ゲームオブジェクトの抽象基底クラス
 *
 * ワールド座標・速度・回転・メッシュ・生存フラグを共通管理し、
 * update / updateDisplay / destroy の標準インターフェースを提供する。
 *
 * 座標系:
 *  - ゲームロジック: x=右, y=下 (canvas 座標)
 *  - Three.js 表示: x=右, y=上 → mesh.position.set(dx, -dy, z) でマッピング
 *  - 回転: ゲームは時計回り正, Three.js は反時計回り正 → mesh.rotation.z = -rotation
 */
export abstract class GameObject {
  /** ワールド座標 */
  public position: { x: number; y: number }

  /** 速度ベクトル */
  public velocity: { x: number; y: number }

  /** 回転（ラジアン、時計回り正） */
  public rotation: number

  /** Three.js 表示オブジェクト */
  public mesh: THREE.Object3D

  /** 衝突判定用の半径 */
  public radius: number = 0

  /** 所属（味方撃ち防止・判定用） */
  public side: 'player' | 'enemy' | 'none' = 'none'

  /** 生存フラグ（false → GameManagerが次フレームで削除） */
  public isAlive: boolean

  /** 死亡演出中フラグ（true → 判定や行動は停止するが描画は継続） */
  public isDying: boolean = false

  /** レーザーヒット時のクールダウン（フレーム数） */
  public laserHitCooldown: number = 0

  constructor(x: number = 0, y: number = 0) {
    this.position = { x, y }
    this.velocity = { x: 0, y: 0 }
    this.rotation = 0
    this.mesh = new THREE.Group()
    this.isAlive = true
  }

  /**
   * @param delta フレーム補正値
   * @param args 追加のパラメータ（サブクラス用）
   */
  public abstract update(delta: number, ...args: any[]): void

  /**
   * 速度に基づいてワールド座標を更新
   */
  public updatePosition(delta: number): void {
    this.position.x += this.velocity.x * delta
    this.position.y += this.velocity.y * delta

    // --- ループ処理 (Wrap-around) ---
    if (this.position.x > WORLD_HALF) this.position.x -= WORLD_SIZE
    if (this.position.x < -WORLD_HALF) this.position.x += WORLD_SIZE
    if (this.position.y > WORLD_HALF) this.position.y -= WORLD_SIZE
    if (this.position.y < -WORLD_HALF) this.position.y += WORLD_SIZE
  }

  /**
   * カメラオフセットに基づいて表示位置を同期
   * プレイヤーはこれをオーバーライドして画面中央固定にする
   */
  public updateDisplay(cameraX: number, cameraY: number): void {
    // カメラ（自機）との相対距離を計算し、ループを考慮して最短経路をとる
    let dx = this.position.x - cameraX
    let dy = this.position.y - cameraY

    if (dx > WORLD_HALF) dx -= WORLD_SIZE
    if (dx < -WORLD_HALF) dx += WORLD_SIZE
    if (dy > WORLD_HALF) dy -= WORLD_SIZE
    if (dy < -WORLD_HALF) dy += WORLD_SIZE

    // Three.js は y-up なので Y を反転、回転も反転（CCW↔CW）
    this.mesh.position.set(dx, -dy, this.mesh.position.z)
    this.mesh.rotation.z = -this.rotation
  }

  /**
   * メッシュを破棄しリソースを解放
   */
  public destroy(): void {
    this.isAlive = false
    disposeMesh(this.mesh)
  }
}
