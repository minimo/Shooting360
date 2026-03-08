import { Graphics } from 'pixi.js'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'
import type { SpawnAfterimageFn } from './Player'
import { TrailEffect } from './TrailEffect'

/**
 * プレイヤー用のホーミングレーザー
 */
export class HomingLaser extends GameObject {
    public speed: number = 18.0
    public turnSpeed: number = 0.15
    public damage: number = 2
    public lifeTime: number = 120 // 2秒
    private elapsedFrames: number = 0

    private target: GameObject | null = null
    private trail: TrailEffect
    private homingDelay: number = 15 // 0.25秒間 (60fps想定)

    constructor(x: number, y: number, angle: number, target: GameObject | null, spawnAfterimage: SpawnAfterimageFn) {
        super(x, y)
        this.side = 'player'
        this.radius = 8
        this.rotation = angle
        this.target = target

        // 黄色の軌跡 (0xffff00)
        this.trail = new TrailEffect(spawnAfterimage, 6, 25, 0xffff00, 0.7, 5)

        this.createGraphics()
    }

    private createGraphics(): void {
        const g = new Graphics()

        // 彗星の頭部（先端が太い）
        // 前方が太く、後方が細い形状
        g.poly([
            { x: 0, y: -10 },  // 先端
            { x: 5, y: -5 },
            { x: 3, y: 5 },
            { x: -3, y: 5 },
            { x: -5, y: -5 }
        ])
        g.fill({ color: 0xffff00, alpha: 1 })

        // 中心部は白く光らせる
        const core = new Graphics()
        core.circle(0, -3, 3)
        core.fill({ color: 0xffffff, alpha: 0.8 })

        this.display.addChild(g)
        this.display.addChild(core)
    }

    public override update(delta: number, ..._args: any[]): void {
        this.elapsedFrames += delta
        if (this.elapsedFrames > this.lifeTime) {
            this.isAlive = false
            return
        }

        // ホーミング遅延の更新
        if (this.homingDelay > 0) {
            this.homingDelay -= delta
        }

        // 誘導ロジック (ディレイ終了後かつターゲット生存中)
        if (this.homingDelay <= 0 && this.target && this.target.isAlive) {
            let dx = this.target.position.x - this.position.x
            let dy = this.target.position.y - this.position.y

            // ワールドラップ考慮
            if (dx > WORLD_HALF) dx -= WORLD_SIZE
            if (dx < -WORLD_HALF) dx += WORLD_SIZE
            if (dy > WORLD_HALF) dy -= WORLD_SIZE
            if (dy < -WORLD_HALF) dy += WORLD_SIZE

            const targetAngle = Math.atan2(dx, -dy)

            let angleDiff = targetAngle - this.rotation
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

            if (Math.abs(angleDiff) < this.turnSpeed * delta) {
                this.rotation = targetAngle
            } else {
                this.rotation += Math.sign(angleDiff) * this.turnSpeed * delta
            }
        }

        this.velocity.x = Math.sin(this.rotation) * this.speed
        this.velocity.y = -Math.cos(this.rotation) * this.speed

        this.updatePosition(delta)
        this.trail.update(this.position.x, this.position.y, this.rotation)
    }
}
