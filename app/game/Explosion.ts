import { Graphics } from 'pixi.js'
import { GameObject } from './GameObject'

/**
 * 爆発エフェクトクラス
 * 
 * 円が広がりながら消えていく演出。フラッシュ効果をサポート。
 */
export class Explosion extends GameObject {
    private maxLife: number
    private life: number
    private maxRadius: number
    private isFlashy: boolean

    private readonly velocityDecay = 0.95

    constructor(
        x: number,
        y: number,
        color: number = 0xffaa00,
        scale: number = 1.0,
        duration: number = 30,
        isFlashy: boolean = false,
        vx: number = 0,
        vy: number = 0
    ) {
        super(x, y)
        this.velocity.x = vx
        this.velocity.y = vy
        this.maxLife = duration
        this.life = duration
        this.maxRadius = 40 * scale
        this.isFlashy = isFlashy
        this.createGraphics(color)
    }

    private createGraphics(color: number): void {
        // メインの爆発円
        const g = new Graphics()
        g.circle(0, 0, this.maxRadius)
        g.fill({ color, alpha: 1 })
        this.display.addChild(g)

        // フラッシュ効果
        if (this.isFlashy) {
            const flash = new Graphics()
            flash.circle(0, 0, this.maxRadius * 0.7)
            flash.fill({ color: 0xffffff, alpha: 0.8 })
            flash.name = 'flash'
            this.display.addChild(flash)
        }
    }

    public override update(delta: number, ..._args: any[]): void {
        this.life -= delta
        if (this.life <= 0) {
            this.isAlive = false
            return
        }

        // 慣性減衰
        this.velocity.x *= this.velocityDecay
        this.velocity.y *= this.velocityDecay

        const progress = 1 - (this.life / this.maxLife)

        // 徐々に大きく
        this.display.scale.set(0.2 + progress * 0.8)

        // フェードアウト
        this.display.alpha = 1 - progress

        // フラッシュの更新（すぐに消える）
        const flash = this.display.getChildByName('flash')
        if (flash) {
            flash.alpha = Math.max(0, 1 - progress * 4)
        }

        this.updatePosition(delta)
    }
}
