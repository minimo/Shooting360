import { Graphics } from 'pixi.js'
import { GameObject } from './GameObject'

/**
 * パーティクルクラス
 * 
 * 散らばる火花などの小さな演出用。
 */
export class Particle extends GameObject {
    private life: number
    private maxLife: number

    constructor(
        x: number,
        y: number,
        vx: number,
        vy: number,
        life: number = 20,
        color: number = 0xffaa00,
        size: number = 2
    ) {
        super(x, y)
        this.velocity.x = vx
        this.velocity.y = vy
        this.life = life
        this.maxLife = life
        this.createGraphics(color, size)
    }

    private createGraphics(color: number, size: number): void {
        const g = new Graphics()
        g.rect(-size / 2, -size / 2, size, size)
        g.fill({ color, alpha: 1 })
        this.display.addChild(g)
    }

    public override update(delta: number, ..._args: any[]): void {
        this.life -= delta
        if (this.life <= 0) {
            this.isAlive = false
            return
        }

        // フェードアウト
        this.display.alpha = this.life / this.maxLife

        // 速度の減衰（少し強めに）
        this.velocity.x *= 0.92
        this.velocity.y *= 0.92

        // 移動
        this.updatePosition(delta)
    }
}
