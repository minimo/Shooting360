import { Graphics, Container } from 'pixi.js'
import { GameObject } from './GameObject'
import { Gauge } from './Gauge'
import type { InputState } from '~/composables/useInput'

/** 弾発射コールバック型 */
export type SpawnBulletFn = (x: number, y: number, angle: number, side?: 'player' | 'enemy') => void

/**
 * 自機クラス
 */
export class Player extends GameObject {
    /** 体力 */
    public maxHp: number = 20
    public hp: number = 20

    /** レーザーパワー */
    public maxLaserPower: number = 300
    public laserPower: number = 300
    public isLaserOverheated: boolean = false
    private powerRecoveryCounter: number = 0
    private blinkTimer: number = 0
    private boostCooldown: number = 0
    private boostTimer: number = 0
    private wasBoostKeyDown: boolean = false
    public isBoosting: boolean = false
    public powerGauge: Gauge

    /** 武器タイプ */
    public weaponType: 'normal' | '3way' | '5way' | 'wide' = 'normal'

    /** ステータス倍率 */
    public laserDamageMultiplier: number = 1.0
    public laserWidthMultiplier: number = 1.0
    public laserPowerRecoveryMultiplier: number = 1.0
    public laserConsumptionMultiplier: number = 1.0

    /** 通常弾ステータス */
    public bulletSpeedMultiplier: number = 1.0
    public fireRateMultiplier: number = 1.0
    public bulletDamage: number = 1
    public bulletPiercing: boolean = false

    /** 加速度 */
    public acceleration: number = 0.675

    /** 減速係数（慣性用） */
    public deceleration: number = 0.95

    /** 最大速度 */
    public maxSpeed: number = 16

    /** 旋回速度 (ラジアン/フレーム) */
    public rotationSpeed: number = 0.075

    /** 射撃間隔 (フレーム) */
    private fireInterval: number = 6
    private fireCooldown: number = 0

    /** 画面サイズ情報 */
    public screenWidth: number = 0
    public screenHeight: number = 0

    /** 当たり判定半径 */
    public override radius: number = 16

    /** 所属サイド */
    public override side: 'player' | 'enemy' = 'player'

    private spawnBullet: SpawnBulletFn

    constructor(x: number, y: number, spawnBullet: SpawnBulletFn) {
        super(x, y)
        this.spawnBullet = spawnBullet

        this.powerGauge = new Gauge({
            width: 40,
            height: 4,
            maxValue: this.maxLaserPower,
            colorThresholds: [
                { threshold: 0.3, color: 0xff0000 },
                { threshold: 0.5, color: 0xffff00 },
                { threshold: 0.75, color: 0x00ff00 }
            ]
        })

        this.createGraphics()
        this.display.addChild(this.powerGauge)
        this.display.visible = true
    }

    /**
     * ダメージを受ける
     */
    public takeDamage(amount: number): void {
        this.hp -= amount
        if (this.hp <= 0) {
            this.hp = 0
            this.isAlive = false
        }
    }


    private createGraphics(): void {
        const body = new Graphics()
        // 鏃（やじり）型の形状
        body.poly([
            0, -22,
            16, 18,
            0, 8,
            -16, 18
        ])
        body.fill({ color: 0x00ffff })
        this.display.addChild(body)
    }

    public override update(delta: number, input: any): void {
        this.powerGauge.update(delta)

        // --- 死亡時の慣性移動 ---
        if (!this.isAlive) {
            // 入力を受け付けず、通常の減速より緩やかに流される (0.995)
            this.velocity.x *= Math.pow(0.995, delta)
            this.velocity.y *= Math.pow(0.995, delta)
            this.updatePosition(delta)
            return
        }

        // --- 回転 ---
        if (input.left) {
            this.rotation -= this.rotationSpeed * delta
        }
        if (input.right) {
            this.rotation += this.rotationSpeed * delta
        }

        // --- 移動 ---
        if (input.up) {
            // 加速
            this.velocity.x += Math.sin(this.rotation) * this.acceleration * delta
            this.velocity.y -= Math.cos(this.rotation) * this.acceleration * delta
        } else if (input.down) {
            // 減速
            this.velocity.x *= Math.pow(this.deceleration, delta)
            this.velocity.y *= Math.pow(this.deceleration, delta)
        } else {
            // 自然減速
            this.velocity.x *= Math.pow(0.98, delta)
            this.velocity.y *= Math.pow(0.98, delta)
        }

        // --- ブースト (C) ---
        // クールダウン中は入力を無視し、キーが押された瞬間だけ判定
        const isBoostJustPressed = input.boost && !this.wasBoostKeyDown
        this.isBoosting = false

        if (isBoostJustPressed && this.laserPower >= 30 && !this.isLaserOverheated && this.boostCooldown <= 0) {
            // 前方に超強力な加速 (通常の100倍の力)
            const boostForce = this.acceleration * 100
            this.velocity.x += Math.sin(this.rotation) * boostForce * delta
            this.velocity.y -= Math.cos(this.rotation) * boostForce * delta

            // 1回のブーストで固定パワー消費 (60ユニット)
            this.laserPower -= 60
            if (this.laserPower <= 0) {
                this.laserPower = 0
                this.isLaserOverheated = true
            }

            this.boostCooldown = 120 // 2秒
            this.boostTimer = 10     // 10フレーム間は演出と速度制限解除を維持
            this.isBoosting = true
        }
        this.wasBoostKeyDown = input.boost

        // クールダウンとブーストタイマーの更新
        if (this.boostCooldown > 0) this.boostCooldown -= delta
        if (this.boostTimer > 0) {
            this.boostTimer -= delta
            // タイマーが残っている間は演出用フラグを立てる
            this.isBoosting = true
        }

        // 速度制限 (ブースト中以外)
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2)
        const currentMaxSpeed = this.boostTimer > 0 ? 100 : this.maxSpeed

        if (speed > currentMaxSpeed) {
            const ratio = currentMaxSpeed / speed
            this.velocity.x *= ratio
            this.velocity.y *= ratio
        }

        this.updatePosition(delta)

        // --- 射撃 (Z) ---
        this.fireCooldown -= delta
        if (input.shoot && this.fireCooldown <= 0) {
            this.shoot()
            this.fireCooldown = this.fireInterval * this.fireRateMultiplier
        }

        // updateLaserPower は GameManager 側で呼ばれるため、ここでは不要（二重消費防止）
        // ただし、blinkTimer はここで更新する必要がある
        this.blinkTimer += delta

        this.powerGauge.setValue(this.laserPower)
        this.updatePowerUI()
    }

    /**
     * 武器タイプに応じた射撃
     */
    private shoot(): void {
        const x = this.position.x
        const y = this.position.y
        const rotation = this.rotation

        switch (this.weaponType) {
            case 'normal': {
                // 2発並列発射（自機の左右にオフセット）
                const offsetDist = 8
                const perpAngle = rotation + Math.PI / 2
                this.spawnBullet(x + Math.sin(perpAngle) * offsetDist, y - Math.cos(perpAngle) * offsetDist, rotation, 'player')
                this.spawnBullet(x - Math.sin(perpAngle) * offsetDist, y + Math.cos(perpAngle) * offsetDist, rotation, 'player')
                break
            }
            case '3way':
                for (let i = -1; i <= 1; i++) {
                    this.spawnBullet(x, y, rotation + i * 0.2, 'player')
                }
                break
            case '5way':
                for (let i = -2; i <= 2; i++) {
                    this.spawnBullet(x, y, rotation + i * 0.2, 'player')
                }
                break
            case 'wide':
                for (let i = -2; i <= 2; i++) {
                    // 少し横にずらして発射
                    const offsetX = Math.cos(rotation) * i * 10
                    const offsetY = Math.sin(rotation) * i * 10
                    this.spawnBullet(x + offsetX, y + offsetY, rotation, 'player')
                }
                break
        }
    }

    /**
     * パワーの消費と回復
     */
    public updateLaserPower(delta: number, isFiring: boolean, isBoosting: boolean): void {
        if ((isFiring || isBoosting) && !this.isLaserOverheated) {
            // 消費：秒間200 (200/60 per frame) -> 1.5秒で300消費 (以前の2倍)
            this.laserPower -= (200 / 60) * delta * this.laserConsumptionMultiplier
            if (this.laserPower <= 0) {
                this.laserPower = 0
                this.isLaserOverheated = true // オーバーヒート発生
            }
            this.powerRecoveryCounter = 0
            this.powerGauge.setValue(this.laserPower)
        } else if (this.laserPower < this.maxLaserPower) {
            // 回復：秒間20 (秒間10の2倍。60fpsなら3フレームに1回1増える)
            this.powerRecoveryCounter += delta * this.laserPowerRecoveryMultiplier
            if (this.powerRecoveryCounter >= 3) {
                this.laserPower += Math.floor(this.powerRecoveryCounter / 3)
                this.powerRecoveryCounter %= 3
                if (this.laserPower >= this.maxLaserPower) {
                    this.laserPower = this.maxLaserPower
                    this.isLaserOverheated = false // 冷却完了（最大まで溜まった）
                }
                this.powerGauge.setValue(this.laserPower)
            }
        }
    }

    /**
     * 自機上のパワーゲージ描画
     */
    private updatePowerUI(): void {
        // 最大値の時は表示しない
        if (this.laserPower >= this.maxLaserPower) {
            this.powerGauge.visible = false
            return
        }

        this.powerGauge.visible = true

        // --- ゲージの回転抑制と位置調整 ---
        // display(親)が rotation に合わせて回転しているので、逆回転をかけて常に上を向かせる
        this.powerGauge.rotation = -this.rotation

        // 自機から見て常に「画面の上(y=-35)」の位置に配置するための座標計算
        const dist = 35
        this.powerGauge.x = -Math.sin(this.rotation) * dist
        this.powerGauge.y = -Math.cos(this.rotation) * dist

        // オーバーヒート中の点滅演出
        if (this.isLaserOverheated) {
            this.powerGauge.alpha = 0.6 + Math.sin(this.blinkTimer * 0.3) * 0.4
        } else {
            this.powerGauge.alpha = 1.0
        }
    }

    /**
     * 自機は常に画面中央に表示（カメラ追従方式）
     */
    public override updateDisplay(cameraX: number, cameraY: number): void {
        this.display.x = 0
        this.display.y = 0
        this.display.rotation = this.rotation
    }
}
