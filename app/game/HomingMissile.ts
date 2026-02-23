import { Graphics } from 'pixi.js'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'
import type { Player } from './Player'

/**
 * 誘導ミサイル（ロケット型）
 */
export class HomingMissile extends GameObject {
    /** 目標最大弾速 (自機16の3/4) */
    public maxSpeed: number = 12.0
    /** 現在の弾速 */
    private currentSpeed: number = 3

    /** 旋回性能（ラジアン/フレーム）従来の半分 */
    private turnSpeed: number = 0.025

    /** 最大飛距離 */
    public maxDistance: number = 2000

    /** 耐久力 */
    public hp: number = 1

    /** 展開時間（フレーム数、約1秒） */
    private expansionTime: number = 60
    private elapsedFrames: number = 0

    private player: Player
    private origin: { x: number; y: number }

    constructor(x: number, y: number, angle: number, player: Player) {
        super(x, y)
        this.side = 'enemy'
        this.radius = 8
        this.rotation = angle
        this.player = player
        this.origin = { x, y }

        // 初期速度（低速で展開）
        this.velocity.x = Math.sin(angle) * this.currentSpeed
        this.velocity.y = -Math.cos(angle) * this.currentSpeed

        this.createGraphics()
    }

    private createGraphics(): void {
        const g = new Graphics()
        g.rect(-4, -10, 8, 20)
        g.fill({ color: 0x33ccff, alpha: 1 })

        const nose = new Graphics()
        nose.poly([
            { x: -4, y: -10 },
            { x: 4, y: -10 },
            { x: 0, y: -16 }
        ])
        nose.fill({ color: 0xff3333, alpha: 1 })

        this.display.addChild(g)
        this.display.addChild(nose)
    }

    public takeDamage(amount: number): void {
        this.hp -= amount
        if (this.hp <= 0) {
            this.isAlive = false
        }
    }

    public override update(delta: number, ..._args: any[]): void {
        this.elapsedFrames += delta

        // --- 挙動フェーズ ---
        if (this.elapsedFrames < this.expansionTime) {
            // 1. 展開フェーズ: 直進のみ
            // 速度は一定（低速）
        } else {
            // 2. 追尾・加速フェーズ
            // 徐々に加速
            if (this.currentSpeed < this.maxSpeed) {
                this.currentSpeed += 0.2 * delta
                if (this.currentSpeed > this.maxSpeed) this.currentSpeed = this.maxSpeed
            }

            // 自機への方向を計算（ループ考慮）
            let dx = this.player.position.x - this.position.x
            let dy = this.player.position.y - this.position.y

            if (dx > WORLD_HALF) dx -= WORLD_SIZE
            if (dx < -WORLD_HALF) dx += WORLD_SIZE
            if (dy > WORLD_HALF) dy -= WORLD_SIZE
            if (dy < -WORLD_HALF) dy += WORLD_SIZE

            const targetAngle = Math.atan2(dx, -dy)

            // 角度差を計算
            let angleDiff = targetAngle - this.rotation
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

            // 徐々に回転（旋回性能も徐々に上げる演出も可能だが、ここでは固定）
            if (Math.abs(angleDiff) < this.turnSpeed * delta) {
                this.rotation = targetAngle
            } else {
                this.rotation += Math.sign(angleDiff) * this.turnSpeed * delta
            }
        }

        // 速度ベクトル更新
        this.velocity.x = Math.sin(this.rotation) * this.currentSpeed
        this.velocity.y = -Math.cos(this.rotation) * this.currentSpeed

        this.updatePosition(delta)

        // --- 距離・寿命チェック ---
        // dx, dy はプレイヤーとの距離計算のために再計算が必要
        // 誘導ロジック内の dx, dy はループ考慮後の相対位置であり、
        // 距離計算には絶対的な差分が必要なため、再計算する
        const dx = this.player.position.x - this.position.x
        const dy = this.player.position.y - this.position.y
        const distDx = this.position.x - this.origin.x
        const distDy = this.position.y - this.origin.y

        const distSq = distDx * distDx + distDy * distDy
        const playerDistSq = dx * dx + dy * dy

        if (distSq > this.maxDistance * this.maxDistance) {
            this.isAlive = false
            this.shouldExplode = true
            this.isMaxDistanceExplosion = true
        }

        if (playerDistSq < 40 * 40) {
            this.isAlive = false
            this.shouldExplode = true
        }
    }

    public shouldExplode: boolean = false
    /** 最大飛距離到達による爆発かどうか */
    public isMaxDistanceExplosion: boolean = false
}
