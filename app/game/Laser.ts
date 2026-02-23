import { Graphics, Container } from 'pixi.js'
import { GameObject } from './GameObject'

export enum LaserState {
    IDLE,
    CHARGING,
    FIRING
}

/**
 * レーザー武器クラス
 */
export class Laser extends GameObject {
    private maxLength: number = 1000
    private color: number

    public state: LaserState = LaserState.IDLE
    public chargeProgress: number = 0 // 0 to 1
    private chargeDuration: number = 15 // 0.25 second at 60fps
    private chargeTimer: number = 0

    private afterimageCount: number = 5
    private rotationHistory: number[] = []

    private coreGraphics: Graphics = new Graphics()
    private glowGraphics: Graphics = new Graphics()
    // 残像用のグラフィックスリスト
    private afterimages: Graphics[] = []

    constructor(x: number, y: number, color: number = 0x00ffff) {
        super(x, y)
        this.color = color

        // 残像レイヤー
        for (let i = 0; i < this.afterimageCount; i++) {
            const ag = new Graphics()
            this.afterimages.push(ag)
            this.display.addChild(ag)
        }

        this.display.addChild(this.glowGraphics)
        this.display.addChild(this.coreGraphics)

        this.display.visible = false
    }

    private redraw(): void {
        this.coreGraphics.clear()
        this.glowGraphics.clear()
        for (const ag of this.afterimages) {
            ag.clear()
        }

        if (this.state === LaserState.IDLE) return

        if (this.state === LaserState.CHARGING) {
            // チャージ中は自機先端に光が収束するような演出
            const size = 30 * (1 - this.chargeProgress)
            this.coreGraphics.circle(0, 0, size + 5)
            this.coreGraphics.fill({ color: 0xffffff, alpha: 0.5 * this.chargeProgress })

            this.glowGraphics.circle(0, 0, size + 10)
            this.glowGraphics.fill({ color: this.color, alpha: 0.3 * this.chargeProgress })
            return
        }

        if (this.state === LaserState.FIRING) {
            // 残像の描画
            for (let i = 0; i < this.rotationHistory.length; i++) {
                const ag = this.afterimages[i]
                if (!ag) continue

                const rot = this.rotationHistory[i]
                if (rot === undefined) continue

                const alpha = (1 - (i / this.afterimageCount)) * 0.15
                const relRot = rot - this.rotation

                ag.rotation = relRot
                ag.rect(-8, -this.maxLength, 16, this.maxLength)
                ag.fill({ color: this.color, alpha: alpha })
            }

            // メインレーザー
            // 外側の光
            this.glowGraphics.rect(-8, -this.maxLength, 16, this.maxLength)
            this.glowGraphics.fill({ color: this.color, alpha: 0.4 })

            // 内側の芯
            this.coreGraphics.rect(-3, -this.maxLength, 6, this.maxLength)
            this.coreGraphics.fill({ color: 0xffffff, alpha: 1.0 })
        }
    }

    /**
     * トリガー（キー入力）の状態をセット
     */
    public setTrigger(active: boolean): void {
        if (active) {
            if (this.state === LaserState.IDLE) {
                this.state = LaserState.CHARGING
                this.chargeTimer = 0
                this.display.visible = true
            }
        } else {
            this.state = LaserState.IDLE
            this.display.visible = false
            this.rotationHistory = []
            this.chargeProgress = 0
        }
    }

    /**
     * 後方互換性（GameManager用）
     */
    public setVisible(visible: boolean): void {
        this.setTrigger(visible)
    }

    public updateFromPlayer(x: number, y: number, rotation: number): void {
        this.position.x = x
        this.position.y = y
        this.rotation = rotation

        if (this.state === LaserState.FIRING) {
            this.rotationHistory.unshift(rotation)
            if (this.rotationHistory.length > this.afterimageCount) {
                this.rotationHistory.pop()
            }
        }
    }

    public getEndPoint(): { x: number; y: number } {
        return {
            x: this.position.x + Math.sin(this.rotation) * this.maxLength,
            y: this.position.y - Math.cos(this.rotation) * this.maxLength
        }
    }

    public override update(delta: number, ..._args: any[]): void {
        if (this.state === LaserState.CHARGING) {
            this.chargeTimer += delta
            this.chargeProgress = Math.min(1, this.chargeTimer / this.chargeDuration)
            if (this.chargeTimer >= this.chargeDuration) {
                this.state = LaserState.FIRING
            }
        }
        this.redraw()
    }
}
