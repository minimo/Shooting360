import { Graphics } from 'pixi.js'
import { GameObject } from './GameObject'

/**
 * ダメージ判定付き爆発クラス
 */
export class HomingExplosion extends GameObject {
    private maxLife: number
    private life: number
    private maxRadius: number
    public damage: number = 1
    private hitObjects: Set<GameObject> = new Set()

    private readonly velocityDecay = 0.95

    constructor(
        x: number,
        y: number,
        scale: number = 2.25,
        duration: number = 30,
        vx: number = 0,
        vy: number = 0
    ) {
        super(x, y)
        this.velocity.x = vx
        this.velocity.y = vy
        this.maxLife = duration
        this.life = duration
        this.maxRadius = 60 * scale
        this.radius = this.maxRadius // 当たり判定用
        this.createGraphics()
    }

    private createGraphics(): void {
        const g = new Graphics()
        // 爆発のグラデーション風（外側オレンジ、内側白）
        g.circle(0, 0, this.maxRadius)
        g.fill({ color: 0xffaa00, alpha: 0.6 })

        const core = new Graphics()
        core.circle(0, 0, this.maxRadius * 0.5)
        core.fill({ color: 0xffffff, alpha: 0.8 })

        this.display.addChild(g)
        this.display.addChild(core)
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
        this.display.scale.set(0.2 + progress * 0.8)
        this.display.alpha = 1 - progress

        this.updatePosition(delta)
    }

    /**
     * 特定の対象にダメージを一度だけ与えるためのチェック
     */
    public canDealDamage(target: GameObject): boolean {
        if (this.hitObjects.has(target)) return false
        this.hitObjects.add(target)
        return true
    }
}
