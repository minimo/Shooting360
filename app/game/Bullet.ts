import { Graphics } from 'pixi.js'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'

/**
 * 弾クラス
 *
 * 発射方向へ高速直進し、一定距離を超えたら自動消滅する。
 */
export class Bullet extends GameObject {
    /** 弾速 */
    public speed: number = 25

    /** 最大飛距離 (画面横幅1317pxの約1.2倍) */
    public maxDistance: number = 1580

    /** ダメージ */
    public damage: number = 1

    /** 貫通弾かどうか */
    public isPiercing: boolean = false

    /** 発射地点（距離計算用） */
    private origin: { x: number; y: number }

    constructor(x: number, y: number, angle: number, side: 'player' | 'enemy' = 'player', speedMultiplier: number = 1, damage: number = 1, isPiercing: boolean = false) {
        super(x, y)
        this.side = side
        this.radius = 3
        this.rotation = angle
        this.origin = { x, y }
        this.damage = damage
        this.isPiercing = isPiercing

        // 速度ベクトルを設定
        this.velocity.x = Math.sin(angle) * this.speed * speedMultiplier
        this.velocity.y = -Math.cos(angle) * this.speed * speedMultiplier

        this.createGraphics()
    }

    /**
     * 小さな弾のグラフィックスを生成
     */
    private createGraphics(): void {
        const g = new Graphics()
        // 細長い長方形の弾形状
        g.rect(-1, -3, 2, 7)
        g.fill({ color: 0xffff00, alpha: 1 })
        this.display.addChild(g)
    }

    /**
     * 毎フレーム更新：直進 + 距離チェック
     */
    public override update(delta: number, ..._args: any[]): void {
        this.updatePosition(delta)

        // 発射地点からの距離チェック（ループを考慮した最短距離）
        let dx = this.position.x - this.origin.x
        let dy = this.position.y - this.origin.y

        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE

        const distSq = dx * dx + dy * dy

        if (distSq > this.maxDistance * this.maxDistance) {
            this.isAlive = false
        }
    }
}
