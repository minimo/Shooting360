import { Graphics } from 'pixi.js'
import { Fighter } from './Fighter'
import { GameObject, WORLD_SIZE, WORLD_HALF } from '../GameObject'
import { Laser, LaserState } from '../Laser'
import type { Player, SpawnBulletFn } from '../Player'

/**
 * エース機クラス (AceFighter)
 * 
 * 強力なアルゴリズムを持つ敵機。
 * 自機の周囲を旋回しながら、自機と同じレーザーで攻撃してくる。
 */
export class AceFighter extends Fighter {
    /** 移動速度 (Fighter: 14) */
    public override speed: number = 18

    /** 回転速度 (Fighter: 0.08) */
    public override rotationSpeed: number = 0.12

    /** 耐久力 (Fighter: 3) */
    public override hp: number = 10

    /** レーザー武器 */
    public laser: Laser

    /** 旋回方向 (1 or -1) */
    private orbitDirection: number = Math.random() < 0.5 ? 1 : -1

    /** 理想的な距離 */
    private minOrbitDist: number = 300
    private maxOrbitDist: number = 400

    constructor(x: number, y: number, player: Player, spawnBullet: SpawnBulletFn, addObject: (obj: GameObject) => void) {
        super(x, y, player, spawnBullet)

        // レーザーの初期化 (色は赤)
        this.laser = new Laser(x, y, 0xff3333)
        addObject(this.laser)

        // 見た目の変更（金色のエース機）
        this.updateGraphics()
    }

    private updateGraphics(): void {
        // 既存のグラフィックスをクリアして再描画
        this.display.removeChildren()

        const g = new Graphics()
        // 少し大きめ (1.2x)
        const s = 1.2
        g.poly([
            { x: 0, y: -14 * s },
            { x: -12 * s, y: 10 * s },
            { x: 12 * s, y: 10 * s },
        ])
        // 金色
        g.fill({ color: 0xffcc00, alpha: 1 })

        // 装飾（エースの証）
        const wing = new Graphics()
        wing.poly([
            { x: -15 * s, y: 5 * s },
            { x: 15 * s, y: 5 * s },
            { x: 0, y: 0 }
        ])
        wing.stroke({ color: 0xffffff, width: 2, alpha: 0.5 })

        this.display.addChild(g)
        this.display.addChild(wing)
    }

    public override update(delta: number, ..._args: any[]): void {
        if (!this.isAlive) {
            this.laser.setTrigger(false)
            return
        }

        // --- 移動ロジック (旋回挙動) ---
        let dx = this.player.position.x - this.position.x
        let dy = this.player.position.y - this.position.y

        // 最短経路補正
        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE

        const dist = Math.sqrt(dx * dx + dy * dy)
        const angleToPlayer = Math.atan2(dx, -dy)

        let targetMoveAngle = angleToPlayer
        if (dist > this.maxOrbitDist) {
            // 遠すぎる場合は近づく
            targetMoveAngle = angleToPlayer
        } else if (dist < this.minOrbitDist) {
            // 近すぎる場合は離れる
            targetMoveAngle = angleToPlayer + Math.PI
        } else {
            // 適正距離なら旋回する (少しプレイヤー側に寄せることで包囲網を維持)
            targetMoveAngle = angleToPlayer + (Math.PI / 2 + 0.2) * this.orbitDirection
        }

        // ターゲット角度に向かって回転 (移動用)
        // 注: Fighter.update は rotation を更新するが、AceFighterは移動方向と向きを分けたい場合もあるが、
        // 今回はFighterの仕組みに乗っ取り rotation = 進行方向 とする

        // 角度の差を計算
        let angleDiff = targetMoveAngle - this.rotation
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

        if (Math.abs(angleDiff) < this.rotationSpeed * delta) {
            this.rotation = targetMoveAngle
        } else {
            this.rotation += Math.sign(angleDiff) * this.rotationSpeed * delta
        }

        // 移動
        const targetVelX = Math.sin(this.rotation) * this.speed
        const targetVelY = -Math.cos(this.rotation) * this.speed
        this.velocity.x += (targetVelX - this.velocity.x) * 0.1
        this.velocity.y += (targetVelY - this.velocity.y) * 0.1
        this.updatePosition(delta)

        // --- 射撃ロジック (レーザー) ---
        // プレイヤーが正面（角度差0.3以内）にいたらレーザー発射
        let lookAngle = Math.atan2(dx, -dy)
        let lookDiff = lookAngle - this.rotation
        while (lookDiff > Math.PI) lookDiff -= Math.PI * 2
        while (lookDiff < -Math.PI) lookDiff += Math.PI * 2

        // エース機は常にプレイヤーの方を向いて撃ちたいので、
        // 移動方向(rotation)とは別に、射撃用の向きを管理するか、
        // あるいは旋回移動自体をプレイヤーを向いたまま行うようにする。
        // ここでは「移動方向＝向き」のままだが、旋回時に少し内側を向くように調整済み。

        if (Math.abs(lookDiff) < 0.5) {
            this.laser.setTrigger(true)
        } else {
            this.laser.setTrigger(false)
        }

        // レーザーの位置と向きを更新
        this.laser.updateFromPlayer(this.position.x, this.position.y, this.rotation)
    }

    public override destroy(): void {
        super.destroy()
        if (this.laser) {
            this.laser.isAlive = false
        }
    }
}
