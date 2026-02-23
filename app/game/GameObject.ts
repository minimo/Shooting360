import { Container } from 'pixi.js'

/**
 * ワールド設定
 */
export const WORLD_SIZE = 8000
export const WORLD_HALF = WORLD_SIZE / 2

/**
 * 全ゲームオブジェクトの抽象基底クラス
 *
 * ワールド座標・速度・回転・表示オブジェクト・生存フラグを共通管理し、
 * update / updateDisplay / destroy の標準インターフェースを提供する。
 */
export abstract class GameObject {
  /** ワールド座標 */
  public position: { x: number; y: number }

  /** 速度ベクトル */
  public velocity: { x: number; y: number }

  /** 回転（ラジアン） */
  public rotation: number

  /** PixiJS 表示オブジェクト */
  public display: Container

  /** 衝突判定用の半径 */
  public radius: number = 0

  /** 所属（味方撃ち防止・判定用） */
  public side: 'player' | 'enemy' | 'none' = 'none'

  /** 生存フラグ（false → GameManagerが次フレームで削除） */
  public isAlive: boolean

  constructor(x: number = 0, y: number = 0) {
    this.position = { x, y }
    this.velocity = { x: 0, y: 0 }
    this.rotation = 0
    this.display = new Container()
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

    this.display.x = dx
    this.display.y = dy
    this.display.rotation = this.rotation
  }

  /**
   * 表示オブジェクトを破棄しリソースを解放
   */
  public destroy(): void {
    this.isAlive = false
    if (this.display) {
      this.display.destroy({ children: true })
    }
  }
}
