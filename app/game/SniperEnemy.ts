import { Graphics } from 'pixi.js'
import { GameObject } from './GameObject'
import type { Player, SpawnBulletFn } from './Player'
import { HomingMissile } from './HomingMissile'

export type SpawnHomingMissileFn = (x: number, y: number, angle: number) => void

/**
 * 青四角の敵（旧スナイパー型）
 *
 * 自機から一定距離を保ちながら、8方向に誘導ミサイルを発射する。
 */
export class SniperEnemy extends GameObject {
    /** 移動速度 */
    public speed: number = 6

    /** 回転速度（ラジアン/フレーム） */
    public rotationSpeed: number = 0.05

    /** 射撃間隔（3秒 = 180フレーム） */
    public fireInterval: number = 180
    private fireCooldown: number = 0

    /** 旋回方向 (1 or -1) */
    private orbitDirection: number = Math.random() < 0.5 ? 1 : -1

    /** 理想的な距離 */
    private minDistance: number = 300
    private maxDistance: number = 500

    /** 耐久力 */
    public hp: number = 10

    /** 自機への参照 */
    private player: Player

    /** 誘導ミサイル生成コールバック */
    private spawnHomingMissile: SpawnHomingMissileFn

    constructor(x: number, y: number, player: Player, spawnHomingMissile: SpawnHomingMissileFn) {
        super(x, y)
        this.side = 'enemy'
        this.radius = 24
        this.player = player
        this.spawnHomingMissile = spawnHomingMissile

        this.lookAtPlayer()
        this.createGraphics()

        // 初回射撃までのディレイ
        this.fireCooldown = this.fireInterval
    }

    /**
     * 青い正方形のグラフィックスを生成
     */
    private createGraphics(): void {
        const g = new Graphics()
        // 正方形（半径24相当）
        g.rect(-24, -24, 48, 48)
        g.fill({ color: 0x3333ff, alpha: 1 })
        g.stroke({ width: 3, color: 0x8888ff, alpha: 0.8 })
        this.display.addChild(g)
    }

    /**
     * 自機の方向を向く
     */
    private lookAtPlayer(): void {
        const dx = this.player.position.x - this.position.x
        const dy = this.player.position.y - this.position.y
        this.rotation = Math.atan2(dx, -dy)
    }

    /**
     * ダメージを受ける
     */
    public takeDamage(amount: number): void {
        this.hp -= amount
        if (this.hp <= 0) {
            this.isAlive = false
        }
    }

    /**
     * 毎フレームの更新
     */
    public override update(delta: number, ..._args: any[]): void {
        if (!this.isAlive) return

        // 自機との距離と角度を計算
        const dx = this.player.position.x - this.position.x
        const dy = this.player.position.y - this.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const angleToPlayer = Math.atan2(dx, -dy)

        // 常にプレイヤーの方向を向く
        let angleDiff = angleToPlayer - this.rotation
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

        if (Math.abs(angleDiff) < this.rotationSpeed * delta) {
            this.rotation = angleToPlayer
        } else {
            this.rotation += Math.sign(angleDiff) * this.rotationSpeed * delta
        }

        // --- 移動ロジック ---
        let targetMoveAngle = angleToPlayer
        if (dist > this.maxDistance) {
            targetMoveAngle = angleToPlayer
        } else if (dist < this.minDistance) {
            targetMoveAngle = angleToPlayer + Math.PI
        } else {
            targetMoveAngle = angleToPlayer + (Math.PI / 2) * this.orbitDirection
        }

        const targetVelX = Math.sin(targetMoveAngle) * this.speed
        const targetVelY = -Math.cos(targetMoveAngle) * this.speed

        this.velocity.x += (targetVelX - this.velocity.x) * 0.03
        this.velocity.y += (targetVelY - this.velocity.y) * 0.03

        this.updatePosition(delta)

        // --- 射撃 (8方向誘導ミサイル) ---
        this.fireCooldown -= delta
        if (this.fireCooldown <= 0) {
            this.shoot8Waves()
            this.fireCooldown = this.fireInterval
        }
    }

    /**
     * 8方向に誘導ミサイルを発射
     */
    private shoot8Waves(): void {
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i
            this.spawnHomingMissile(this.position.x, this.position.y, angle)
        }
    }
}
