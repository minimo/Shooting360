import { Graphics } from 'pixi.js'
import { GameObject } from './GameObject'

/**
 * 残像クラス
 * 自機やエース機の移動の軌跡を表現するための演出用オブジェクト。
 */
export class Afterimage extends GameObject {
    private life: number
    private maxLife: number

    constructor(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        life: number = 20,
        color: number = 0xffffff,
        alpha: number = 1.0 // デフォルトで不透明
    ) {
        // オブジェクトの基準点をx1, y1に設定
        super(x1, y1)
        this.life = life
        this.maxLife = life

        // x1, y1 から x2, y2 への線分を描画
        this.createGraphics(x2 - x1, y2 - y1, color, alpha)
    }

    private createGraphics(targetX: number, targetY: number, color: number, alpha: number): void {
        // パラメータが不正な場合は描画をスキップ
        if (isNaN(targetX) || isNaN(targetY)) return

        const g = new Graphics()
        // はっきりとした白いラインによる航跡
        g.moveTo(0, 0)
        g.lineTo(targetX, targetY)
        // 線の太さを 4px にし、端点と継ぎ目を丸くして隙間を解消
        g.stroke({ width: 4, color: color, alpha: alpha, cap: 'round', join: 'round' })

        this.display.addChild(g)
    }

    public override update(delta: number, ..._args: any[]): void {
        if (isNaN(delta)) return

        this.life -= delta
        if (this.life <= 0) {
            this.isAlive = false
            return
        }

        const ratio = this.life / this.maxLife
        // 最初は不透明(1.0)を維持し、徐々にフェードアウト
        this.display.alpha = ratio
        // 太さを一定に保ち、隙間が出ないようにする（スケール変更を最小限に）
        this.display.scale.set(0.9 + ratio * 0.1)
    }
}
