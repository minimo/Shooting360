import { Graphics } from 'pixi.js'
import { GameObject } from './GameObject'
import type { Player, SpawnBulletFn } from './Player'

/**
 * 敵機クラス
 *
 * 画面外から出現し、自機を追尾しながら弾を撃ってくる。
 */
export class Enemy extends GameObject {
    /** 移動速度 */
    public speed: number = 14

    /** 回転速度（ラジアン/フレーム） */
    public rotationSpeed: number = 0.08

    /** 射撃間隔 */
    public fireInterval: number = 60
    private fireCooldown: number = 0

    /** 自機を掠める際のオフセット方向 (1 or -1) */
    private offsetSign: number = Math.random() < 0.5 ? 1 : -1

    /** 自機との適切な距離 */
    private targetDistance: number = 250

    /** 耐久力 */
    public hp: number = 3

    /** 自機への参照 */
    private player: Player

    /** 弾生成コールバック */
    private spawnBullet: SpawnBulletFn

    constructor(x: number, y: number, player: Player, spawnBullet: SpawnBulletFn) {
        super(x, y)
        this.side = 'enemy'
        this.radius = 14
        this.player = player
        this.spawnBullet = spawnBullet

        // 初期状態では自機の方を向く
        this.lookAtPlayer()
        this.createGraphics()

        // 初回射撃までのランダムなディレイ
        this.fireCooldown = Math.random() * this.fireInterval
    }

    /**
     * 赤い三角形のグラフィックスを生成
     */
    private createGraphics(): void {
        const g = new Graphics()
        g.poly([
            { x: 0, y: -14 },
            { x: -12, y: 10 },
            { x: 12, y: 10 },
        ])
        g.fill({ color: 0xff3333, alpha: 1 })
        g.stroke({ width: 2, color: 0xff8888, alpha: 0.6 })
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
        // 自機との距離を計算
        const dx = this.player.position.x - this.position.x
        const dy = this.player.position.y - this.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // --- 追尾ロジック ---
        let targetAngle = Math.atan2(dx, -dy)

        // 回避ロジック：自機に当たりそうなほど近い場合 (80px未満)
        if (dist < 80) {
            // プレイヤーから遠ざかる方向をターゲットにする (斥力)
            // offsetSignの方向に大きくハンドルを切る
            const avoidanceStrength = 1.5 * (1 - dist / 80)
            targetAngle += this.offsetSign * avoidanceStrength
        }
        // 掠める挙動：中距離 (80px ~ 150px)
        else if (dist < 150) {
            const offsetWidth = 0.2 * (1 - dist / 150)
            targetAngle += this.offsetSign * offsetWidth
        }

        // 角度の差を計算（-PI to PI）
        let angleDiff = targetAngle - this.rotation
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

        // 徐々にターゲットの方向へ回転
        if (Math.abs(angleDiff) < this.rotationSpeed * delta) {
            this.rotation = targetAngle
        } else {
            this.rotation += Math.sign(angleDiff) * this.rotationSpeed * delta
        }

        // --- 移動 (慣性を考慮した速度更新) ---
        // 本来の目標速度
        const targetVelX = Math.sin(this.rotation) * this.speed
        const targetVelY = -Math.cos(this.rotation) * this.speed

        // 現在の速度を目標速度に近づける (0.1 = 追従の強さ)
        this.velocity.x += (targetVelX - this.velocity.x) * 0.1
        this.velocity.y += (targetVelY - this.velocity.y) * 0.1

        this.updatePosition(delta)

        // --- 射撃 ---
        this.fireCooldown -= delta
        if (this.fireCooldown <= 0) {
            // 自機がおおよそ正面（角度差が小さい）にいる時のみ撃つ
            if (Math.abs(angleDiff) < 0.2) {
                this.shoot()
                this.fireCooldown = this.fireInterval
            }
        }
    }

    /**
     * 自機に向けて弾を発射
     */
    private shoot(): void {
        // 現在の向きに弾を発射（敵弾であることを指定）
        this.spawnBullet(this.position.x, this.position.y, this.rotation, 'enemy')
    }
}
