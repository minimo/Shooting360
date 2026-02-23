import { Graphics } from 'pixi.js'
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
        this.createGraphics()
    }

    /**
     * ランダムサイズ・色の四角形を生成
     */
    private createGraphics(): void {
        const g = new Graphics()
        const size = 10 + Math.random() * 40
        const color = this.randomColor()

        g.rect(-size / 2, -size / 2, size, size)
        g.fill({ color, alpha: 0.3 + Math.random() * 0.4 })
        g.stroke({ width: 1, color: 0xffffff, alpha: 0.1 })
        this.display.addChild(g)
    }

    /**
     * ランダムなパステルカラーを生成
     */
    private randomColor(): number {
        const colors = [
            0x4488ff, // ブルー
            0x44ff88, // グリーン
            0xff8844, // オレンジ
            0x8844ff, // パープル
            0xff44aa, // ピンク
            0x44ffff, // シアン
            0xffff44, // イエロー
        ]
        return colors[Math.floor(Math.random() * colors.length)] || 0xffffff
    }

    /**
     * 背景は静止（何もしない）
     */
    public override update(delta: number, ..._args: any[]): void {
        // 背景は移動しない。カメラ移動で流れて見える。
    }
}
