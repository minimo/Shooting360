import { Graphics } from 'pixi.js'
import { Fighter } from './Fighter'
import { GameObject, WORLD_SIZE, WORLD_HALF } from '../GameObject'
import type { Player, SpawnBulletFn } from '../Player'

/**
 * エース機クラス (AceFighter)
 * 
 * 非常に高い機動力を持つエリート敵機。
 * 自機の最高速度(16)をわずかに上回る速度(16.8)と高い旋回性能を持つ。
 * プレイヤーに追いつきそうになった場合は減速して背後を取り、
 * 正面に捉えた際に強力な5連バースト射撃を行う。
 */
export class AceFighter extends Fighter {
    /** 移動速度 (Player: 16, Fighter: 14 -> Ace: 16.8) */
    public override speed: number = 16.8

    /** 回転速度 (Fighter: 0.08 -> Ace: 0.15) */
    public override rotationSpeed: number = 0.15

    /** 耐久力 (Fighter: 3 -> Ace: 10) */
    public override hp: number = 10

    /** 射撃間隔（バースト間のクールダウン） */
    public override fireInterval: number = 60

    /** 回避行動用ステータス（正面衝突回避） */
    public isRepositioning: boolean = false
    private repositionTimer: number = 0
    private targetRepositionAngle: number = 0

    /** バースト射撃用ステータス */
    private isBurstFiring: boolean = false
    private burstCount: number = 0
    private burstTimer: number = 0
    private readonly maxBurstCount: number = 5
    private readonly burstInterval: number = 6 // バースト内の発射間隔（フレーム）

    constructor(x: number, y: number, player: Player, spawnBullet: SpawnBulletFn, _addObject: (obj: GameObject) => void) {
        super(x, y, player, spawnBullet)

        // 初回射撃までのランダムなディレイ
        this.fireCooldown = Math.random() * this.fireInterval

        // 見た目の変更（独自の赤い機体）
        this.updateGraphics()
    }

    private updateGraphics(): void {
        this.display.removeChildren()

        const g = new Graphics()
        // 自機と同じ鏃（やじり）型の形状
        g.poly([
            0, -22,
            16, 18,
            0, 8,
            -16, 18
        ])
        // 赤色
        g.fill({ color: 0xff3333, alpha: 1 })

        this.display.addChild(g)
    }

    public override update(delta: number, ..._args: any[]): void {
        if (!this.isAlive) {
            return
        }

        // --- 移動・追尾・回避ロジック ---
        let dx = this.player.position.x - this.position.x
        let dy = this.player.position.y - this.position.y

        // 最短経路補正
        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE

        const dist = Math.sqrt(dx * dx + dy * dy)
        const angleToPlayer = Math.atan2(dx, -dy)

        // 自機の進行方向 (velocityから計算。止まっている場合はrotationを使用)
        const playerSpeedSq = this.player.velocity.x ** 2 + this.player.velocity.y ** 2
        const playerHeading = playerSpeedSq > 0.1 ? Math.atan2(this.player.velocity.x, -this.player.velocity.y) : this.player.rotation

        // プレイヤーから見たAceFighterの角度（プレイヤー視点での敵の位置方向）
        const angleFromPlayerToEnemy = Math.atan2(-dx, dy)

        // プレイヤーの進行方向と、プレイヤーから見たAceFighterの角度差（AceFighterが視界の正面にいるか）
        let arcDiff = playerHeading - angleFromPlayerToEnemy
        while (arcDiff > Math.PI) arcDiff -= Math.PI * 2
        while (arcDiff < -Math.PI) arcDiff += Math.PI * 2

        // AceFighter自身の向きとプレイヤーの進行方向の差（追従減速用）
        let headingDiffToPlayer = playerHeading - this.rotation
        while (headingDiffToPlayer > Math.PI) headingDiffToPlayer -= Math.PI * 2
        while (headingDiffToPlayer < -Math.PI) headingDiffToPlayer += Math.PI * 2

        // 特殊行動（正面衝突回避）のタイマー更新
        if (this.isRepositioning) {
            this.repositionTimer -= delta
            if (this.repositionTimer <= 0) {
                this.isRepositioning = false
            }
        }

        // 通常状態なら衝突回避（リポジショニング）を判定
        if (!this.isRepositioning) {
            // 距離が近く、かつAceFighterがプレイヤーの正面方向（前方約90度の扇状範囲内）にいる場合
            if (dist < 180 && Math.abs(arcDiff) < Math.PI / 4) {
                this.isRepositioning = true
                this.repositionTimer = 45 // 0.75秒回避
                // プレイヤーの進行方向に対して左右どちらかに避ける
                const dodgeDir = arcDiff > 0 ? -1 : 1
                this.targetRepositionAngle = playerHeading + (Math.PI / 2) * dodgeDir
            }
        }
        // 行動ベクトルと速度の決定
        let targetAngle = this.rotation
        let currentSpeed = this.speed

        if (this.isRepositioning) {
            // 回避中のターゲット角度（横方向）
            targetAngle = this.targetRepositionAngle
            currentSpeed = this.speed
        } else {
            // 通常の追尾
            targetAngle = angleToPlayer
            currentSpeed = this.speed

            if (dist < 200 && Math.abs(headingDiffToPlayer) < Math.PI / 2) {
                // 距離が近いほど急減速。プレイヤーの速度に合わせるか、それより遅くする。
                const playerSpeed = Math.sqrt(playerSpeedSq)
                // 速度の下限を10に設定（遅くなりすぎないようにする）
                currentSpeed = Math.max(10, playerSpeed * (dist / 150))
            }

            // ターゲット角度に向かって回転
            let angleDiff = targetAngle - this.rotation
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

            if (Math.abs(angleDiff) < this.rotationSpeed * delta) {
                this.rotation = targetAngle
            } else {
                this.rotation += Math.sign(angleDiff) * this.rotationSpeed * delta
            }
        }

        // 移動適用
        const targetVelX = Math.sin(this.rotation) * currentSpeed
        const targetVelY = -Math.cos(this.rotation) * currentSpeed

        const lerpFactor = this.isRepositioning ? 0.2 : 0.15
        this.velocity.x += (targetVelX - this.velocity.x) * lerpFactor
        this.velocity.y += (targetVelY - this.velocity.y) * lerpFactor

        this.updatePosition(delta)

        // --- 射撃ロジック (三連〜五連バースト) ---
        // プレイヤーに対する現在の角度差
        let aimDiff = angleToPlayer - this.rotation
        while (aimDiff > Math.PI) aimDiff -= Math.PI * 2
        while (aimDiff < -Math.PI) aimDiff += Math.PI * 2

        if (this.isBurstFiring) {
            // バースト射撃中
            this.burstTimer -= delta
            if (this.burstTimer <= 0) {
                this.shoot()
                this.burstCount--

                if (this.burstCount <= 0) {
                    // バースト終了、クールダウンへ
                    this.isBurstFiring = false
                    this.fireCooldown = this.fireInterval
                } else {
                    // 次の弾の発射待ち
                    this.burstTimer = this.burstInterval
                }
            }
        } else if (!this.isRepositioning) {
            // クールダウン消化
            this.fireCooldown -= delta
            if (this.fireCooldown <= 0) {
                // プレイヤーがおおよそ正面（角度差が小さい）にいる時のみバースト開始
                const distThreshold = 400 // あまり遠いと撃たない
                if (Math.abs(aimDiff) < 0.15 && dist < distThreshold) {
                    this.isBurstFiring = true
                    this.burstCount = this.maxBurstCount
                    this.burstTimer = 0 // すぐに1発目を撃つ
                }
            }
        }
    }
}
