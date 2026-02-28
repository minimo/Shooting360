import { Graphics } from 'pixi.js'
import { GameObject, WORLD_SIZE, WORLD_HALF } from '../GameObject'
import type { Player, SpawnBulletFn } from '../Player'

/**
 * 敵機クラス (Fighter)
 *
 * 画面外から出現し、自機を追尾しながら弾を撃ってくる。
 * プレイヤーが正面から向かってきた場合は横に回避する。
 */
export class Fighter extends GameObject {
    /** 移動速度 */
    public speed: number = 14

    /** 回転速度（ラジアン/フレーム） */
    public rotationSpeed: number = 0.08

    /** 射撃間隔 */
    public fireInterval: number = 60
    protected fireCooldown: number = 0

    /** 自機を掠める際のオフセット方向 (1 or -1) */
    private offsetSign: number = Math.random() < 0.5 ? 1 : -1

    /** 耐久力 */
    public hp: number = 3

    /** 自機への参照 */
    protected player: Player

    /** 弾生成コールバック */
    private spawnBullet: SpawnBulletFn

    /** 回避行動用ステータス */
    private isEvading: boolean = false
    private evadeTimer: number = 0
    private targetEvadeAngle: number = 0

    constructor(x: number, y: number, player: Player, spawnBullet: SpawnBulletFn, wave: number) {
        super(x, y)
        this.side = 'enemy'
        this.radius = 10
        this.player = player
        this.spawnBullet = spawnBullet

        // 射撃間隔の計算：初期は長く、Waveが進むにつれて短くする
        // Wave 1: 120 (2.0s), Wave 10: 30 (0.5s)
        this.fireInterval = Math.max(30, 120 - (wave - 1) * 10)

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
            { x: 0, y: -10 },
            { x: -9, y: 7 },
            { x: 9, y: 7 },
        ])
        g.fill({ color: 0xff3333, alpha: 1 })
        this.display.addChild(g)
    }

    /**
     * 自機の方向を向く
     */
    private lookAtPlayer(): void {
        let dx = this.player.position.x - this.position.x
        let dy = this.player.position.y - this.position.y
        // 最短経路補正
        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE
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
        // 自機との距離を計算（ワールドラップ対応）
        let dx = this.player.position.x - this.position.x
        let dy = this.player.position.y - this.position.y
        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE
        const dist = Math.sqrt(dx * dx + dy * dy)

        const angleToPlayer = Math.atan2(dx, -dy)

        // --- プレイヤーの進行方向を取得 ---
        const playerSpeedSq = this.player.velocity.x ** 2 + this.player.velocity.y ** 2
        const playerHeading = playerSpeedSq > 0.1
            ? Math.atan2(this.player.velocity.x, -this.player.velocity.y)
            : this.player.rotation

        // プレイヤーから見たFighterの方向
        const angleFromPlayerToEnemy = Math.atan2(-dx, dy)

        // プレイヤーの進行方向と、プレイヤーから見たFighterの角度差
        let arcDiff = playerHeading - angleFromPlayerToEnemy
        while (arcDiff > Math.PI) arcDiff -= Math.PI * 2
        while (arcDiff < -Math.PI) arcDiff += Math.PI * 2

        // --- 回避タイマー更新 ---
        if (this.isEvading) {
            this.evadeTimer -= delta
            if (this.evadeTimer <= 0) {
                this.isEvading = false
            }
        }

        // --- Fighter自身の進行方向とプレイヤーへの角度差 ---
        let fighterAimDiff = angleToPlayer - this.rotation
        while (fighterAimDiff > Math.PI) fighterAimDiff -= Math.PI * 2
        while (fighterAimDiff < -Math.PI) fighterAimDiff += Math.PI * 2

        // --- 回避判定（3条件） ---
        if (!this.isEvading) {
            let shouldEvade = false

            // 条件1: プレイヤーが正面からFighterに向かっている（距離300px以内、前方60度）
            if (dist < 300 && Math.abs(arcDiff) < Math.PI / 3) {
                shouldEvade = true
            }

            // 条件2: Fighter自身がプレイヤーに向かって突進中（距離250px以内、正面45度以内）
            if (dist < 250 && Math.abs(fighterAimDiff) < Math.PI / 4) {
                shouldEvade = true
            }

            // 条件3: 非常に近い場合は無条件で回避（100px未満）
            if (dist < 100) {
                shouldEvade = true
            }

            if (shouldEvade) {
                this.isEvading = true
                this.evadeTimer = 45 // 0.75秒回避

                // プレイヤーの進行方向に対して垂直方向に避ける
                // arcDiffの符号でどちら側にいるか判断し、反対方向に逃げる
                const dodgeDir = arcDiff > 0 ? -1 : 1
                this.targetEvadeAngle = playerHeading + (Math.PI / 2) * dodgeDir
            }
        }

        // --- 追尾・回避ロジック ---
        let targetAngle: number
        if (this.isEvading) {
            // 回避中：回避方向へ旋回
            targetAngle = this.targetEvadeAngle
        } else {
            // 通常追尾
            targetAngle = angleToPlayer

            // 掠める挙動：近距離 (150px未満)
            if (dist < 150) {
                const offsetWidth = 0.3 * (1 - dist / 150)
                targetAngle += this.offsetSign * offsetWidth
            }
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
        const targetVelX = Math.sin(this.rotation) * this.speed
        const targetVelY = -Math.cos(this.rotation) * this.speed

        // 回避中はより素早く方向転換する
        const lerpFactor = this.isEvading ? 0.15 : 0.1
        this.velocity.x += (targetVelX - this.velocity.x) * lerpFactor
        this.velocity.y += (targetVelY - this.velocity.y) * lerpFactor

        this.updatePosition(delta)

        // --- 射撃（回避中は射撃しない） ---
        if (!this.isEvading) {
            this.fireCooldown -= delta
            if (this.fireCooldown <= 0) {
                // 自機がおおよそ正面（角度差が小さい）にいる時のみ撃つ
                const aimDiff = angleToPlayer - this.rotation
                let normalizedAimDiff = aimDiff
                while (normalizedAimDiff > Math.PI) normalizedAimDiff -= Math.PI * 2
                while (normalizedAimDiff < -Math.PI) normalizedAimDiff += Math.PI * 2
                if (Math.abs(normalizedAimDiff) < 0.2) {
                    this.shoot()
                    this.fireCooldown = this.fireInterval
                }
            }
        }
    }

    /**
     * 自機に向けて弾を発射
     */
    protected shoot(): void {
        // 現在の向きに弾を発射（敵弾であることを指定）
        this.spawnBullet(this.position.x, this.position.y, this.rotation, 'enemy')
    }
}
