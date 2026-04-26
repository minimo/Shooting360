import type { Player } from './Player'
import { GameObject, WORLD_SIZE } from './GameObject'
import { Bullet } from './Bullet'
import { Fighter } from './Enemy/Fighter'
import { AceFighter } from './Enemy/AceFighter'
import { MissileFlower } from './Enemy/MissileFlower'
import { CoreDestroyer } from './Enemy/CoreDestroyer'
import { VoidSerpent } from './Enemy/VoidSerpent'
import { VoidSerpentSegment } from './Enemy/VoidSerpentSegment'
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
  private readonly DISPLAY_RADIUS: number = 1000 // ミニマップに表示する半径（ワールド座標単位）

  /**
   * 毎フレーム呼び出してドットデータを更新する
   */
  public update(player: Player, objects: GameObject[]): void {
    this.dots = []

    const pX = player.position.x
    const pY = player.position.y

    const toRelativeNorm = (x: number, y: number) => {
      // プレイヤーからの相対座標（回り込み考慮）
      let dx = x - pX
      let dy = y - pY

      const worldSize = WORLD_SIZE
      const halfSize = worldSize / 2

      while (dx > halfSize) dx -= worldSize
      while (dx < -halfSize) dx += worldSize
      while (dy > halfSize) dy -= worldSize
      while (dy < -halfSize) dy += worldSize

      return {
        nx: dx / this.DISPLAY_RADIUS,
        ny: dy / this.DISPLAY_RADIUS,
      }
    }

    const inCircle = (nx: number, ny: number) => {
      // 半径 1 の円内かどうか
      return nx * nx + ny * ny <= 1
    }

    // 弾・誘導弾
    for (const obj of objects) {
      if (!obj.isAlive) continue
      if (obj instanceof Bullet) {
        const { nx, ny } = toRelativeNorm(obj.position.x, obj.position.y)
        if (inCircle(nx, ny)) {
          // ミニマップ上の座標 (0.5中心)
          this.dots.push({ nx: nx * 0.5 + 0.5, ny: ny * 0.5 + 0.5, color: '#ffffff', size: 2 })
        }
      } else if (obj instanceof HomingMissile) {
        const { nx, ny } = toRelativeNorm(obj.position.x, obj.position.y)
        if (inCircle(nx, ny)) {
          this.dots.push({ nx: nx * 0.5 + 0.5, ny: ny * 0.5 + 0.5, color: '#00ffff', size: 2 })
        }
      }
    }

    // 敵機
    for (const obj of objects) {
      if (!obj.isAlive || obj.isDying) continue

      if (obj instanceof CoreDestroyer || obj instanceof VoidSerpent) {
        const { nx, ny } = toRelativeNorm(obj.position.x, obj.position.y)
        if (inCircle(nx, ny)) {
          // ボスは大きく表示
          this.dots.push({ nx: nx * 0.5 + 0.5, ny: ny * 0.5 + 0.5, color: '#ff0000', size: 8 })
        }
      } else if (obj instanceof Fighter || obj instanceof AceFighter || obj instanceof MissileFlower || obj instanceof VoidSerpentSegment) {
        const { nx, ny } = toRelativeNorm(obj.position.x, obj.position.y)
        if (inCircle(nx, ny)) {
          const isAce = obj instanceof AceFighter
          const isSeg = obj instanceof VoidSerpentSegment
          const color = isAce ? '#ffaa00' : (isSeg ? '#ff5555' : '#ff3333')
          const size = isSeg ? 6 : (isAce ? 5 : 4)
          this.dots.push({ nx: nx * 0.5 + 0.5, ny: ny * 0.5 + 0.5, color, size })
        }
      }
    }

    // 自機（常に中心）
    this.dots.push({ nx: 0.5, ny: 0.5, color: '#00ffff', size: 4 })
  }
}
