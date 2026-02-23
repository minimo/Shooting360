import { Container, Graphics } from 'pixi.js'
import type { Player } from './Player'
import type { GameObject } from './GameObject'
import { Bullet } from './Bullet'
import { Enemy } from './Enemy'
import { SniperEnemy } from './SniperEnemy'
import { HomingMissile } from './HomingMissile'

/**
 * 全体マップ（ミニマップ）表示クラス
 */
export class Minimap {
    public display: Container = new Container()
    private bg: Graphics = new Graphics()
    private mapGraphics: Graphics = new Graphics()
    private size: number = 160 // 表示サイズ (px)
    private range: number = 4000 // マップでカバーするワールド範囲 (+/- range)

    constructor() {
        this.display.addChild(this.bg)
        this.display.addChild(this.mapGraphics)
        this.drawBackground()
    }

    private drawBackground(): void {
        this.bg.clear()
        // 半透明の背景
        this.bg.roundRect(0, 0, this.size, this.size, 8)
        this.bg.fill({ color: 0x000000, alpha: 0.5 })
        // 枠線
        this.bg.stroke({ color: 0xffffff, width: 1, alpha: 0.3 })
    }

    /**
     * 描画更新
     */
    public update(player: Player, objects: GameObject[]): void {
        this.mapGraphics.clear()

        // 座標変換ヘルパー (ワールド座標 -> ミニマップのローカル座標)
        const toMap = (x: number, y: number) => {
            const mx = ((x / (this.range * 2)) + 0.5) * this.size
            const my = ((y / (this.range * 2)) + 0.5) * this.size
            return { x: mx, y: my }
        }

        // 1. 弾・誘導弾 (1x1) - レーザーは除外
        for (const obj of objects) {
            if (!obj.isAlive) continue

            if (obj instanceof Bullet) {
                const pos = toMap(obj.position.x, obj.position.y)
                if (this.isInMap(pos.x, pos.y)) {
                    this.mapGraphics.rect(pos.x, pos.y, 1, 1)
                    this.mapGraphics.fill({ color: 0xffffff })
                }
            } else if (obj instanceof HomingMissile) {
                const pos = toMap(obj.position.x, obj.position.y)
                if (this.isInMap(pos.x, pos.y)) {
                    this.mapGraphics.rect(pos.x, pos.y, 1, 1)
                    this.mapGraphics.fill({ color: 0x00ffff }) // 誘導弾はシアン
                }
            }
        }

        // 2. 敵機 (2x2, 赤)
        for (const obj of objects) {
            if ((obj instanceof Enemy || obj instanceof SniperEnemy) && obj.isAlive) {
                const pos = toMap(obj.position.x, obj.position.y)
                if (this.isInMap(pos.x, pos.y)) {
                    this.mapGraphics.rect(pos.x - 1, pos.y - 1, 2, 2)
                    this.mapGraphics.fill({ color: 0xff3333 })
                }
            }
        }

        // 3. 自機 (2x2, シアン)
        const pPos = toMap(player.position.x, player.position.y)
        if (this.isInMap(pPos.x, pPos.y)) {
            this.mapGraphics.rect(pPos.x - 1, pPos.y - 1, 2, 2)
            this.mapGraphics.fill({ color: 0x00ffff })
        }
    }

    private isInMap(x: number, y: number): boolean {
        return x >= 0 && x <= this.size && y >= 0 && y <= this.size
    }

    public setPosition(x: number, y: number): void {
        this.display.x = x
        this.display.y = y
    }
}
