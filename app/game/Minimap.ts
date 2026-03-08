import type { Player } from './Player'
import type { GameObject } from './GameObject'
import { Bullet } from './Bullet'
import { Fighter } from './Enemy/Fighter'
import { MissileFlower } from './Enemy/MissileFlower'
import { HomingMissile } from './HomingMissile'

export interface MinimapDot {
  /** 0–1 正規化 X */
  nx: number
  /** 0–1 正規化 Y */
  ny: number
  color: string
  size: number
}

/**
 * ミニマップデータプロバイダー
 * 描画は Vue 側の <canvas> で行うため、このクラスはデータ計算のみ担う。
 */
export class Minimap {
  public dots: MinimapDot[] = []
  private range: number = 4000 // ワールドサイズ

  /**
   * 毎フレーム呼び出してドットデータを更新する
   */
  public update(player: Player, objects: GameObject[]): void {
    this.dots = []

    const toNorm = (x: number, y: number) => ({
      nx: x / this.range + 0.5,
      ny: y / this.range + 0.5,
    })

    const inRange = (nx: number, ny: number) => nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1

    // 弾・誘導弾
    for (const obj of objects) {
      if (!obj.isAlive) continue
      if (obj instanceof Bullet) {
        const { nx, ny } = toNorm(obj.position.x, obj.position.y)
        if (inRange(nx, ny)) this.dots.push({ nx, ny, color: '#ffffff', size: 2 })
      } else if (obj instanceof HomingMissile) {
        const { nx, ny } = toNorm(obj.position.x, obj.position.y)
        if (inRange(nx, ny)) this.dots.push({ nx, ny, color: '#00ffff', size: 2 })
      }
    }

    // 敵機
    for (const obj of objects) {
      if ((obj instanceof Fighter || obj instanceof MissileFlower) && obj.isAlive) {
        const { nx, ny } = toNorm(obj.position.x, obj.position.y)
        if (inRange(nx, ny)) this.dots.push({ nx, ny, color: '#ff3333', size: 4 })
      }
    }

    // 自機
    const { nx, ny } = toNorm(player.position.x, player.position.y)
    if (inRange(nx, ny)) this.dots.push({ nx, ny, color: '#00ffff', size: 4 })
  }
}
