import { WORLD_SIZE, WORLD_HALF } from './GameObject'
import type { SpawnAfterimageFn } from './Player'

/**
 * 軌跡演出を管理するヘルパークラス
 */
export class TrailEffect {
    private spawnAfterimage: SpawnAfterimageFn
    private lastPosition: { x: number; y: number } = { x: 0, y: 0 }
    private lastEndPosition: { x: number; y: number } = { x: 0, y: 0 }
    private hasInitialPoint: boolean = false
    private trailInterval: number
    private trailLife: number
    private color: number
    private alpha: number
    private offsetDist: number

    /**
     * @param spawnAfterimage 残像生成用コールバック
     * @param trailInterval 生成間隔(px)
     * @param trailLife 各残像の寿命(フレーム)
     * @param color 色
     * @param alpha 透明度
     * @param offsetDist 中心点から後方へのオフセット距離
     */
    constructor(
        spawnAfterimage: SpawnAfterimageFn,
        trailInterval: number = 10,
        trailLife: number = 40,
        color: number = 0xffffff,
        alpha: number = 1.0,
        offsetDist: number = 10
    ) {
        this.spawnAfterimage = spawnAfterimage
        this.trailInterval = trailInterval
        this.trailLife = trailLife
        this.color = color
        this.alpha = alpha
        this.offsetDist = offsetDist
    }

    /**
     * 状態をリセットする（描画を途切れさせる場合など）
     */
    public reset(): void {
        this.hasInitialPoint = false
    }

    /**
     * 軌跡を更新する
     * @param x 現在のX座標
     * @param y 現在のY座標
     * @param rotation 現在の回転角(ラジアン)
     * @param forceInterval インターバルを強制的に上書きする場合（ブースト時など）
     */
    public update(x: number, y: number, rotation: number, forceInterval?: number): void {
        // 現在の「終点」となる座標（機体後方 offsetDist px）を計算
        const offX = -Math.sin(rotation) * this.offsetDist
        const offY = Math.cos(rotation) * this.offsetDist
        const currentEndX = x + offX
        const currentEndY = y + offY

        if (!this.hasInitialPoint) {
            this.lastPosition.x = x
            this.lastPosition.y = y
            this.lastEndPosition.x = currentEndX
            this.lastEndPosition.y = currentEndY
            this.hasInitialPoint = true
            return
        }

        // 前回の生成判定用中心点からの距離を計算（ワールドラップを考慮）
        const rawDx = x - this.lastPosition.x
        const rawDy = y - this.lastPosition.y
        let tdx = rawDx
        let tdy = rawDy

        let wrapped = false
        if (tdx > WORLD_HALF) { tdx -= WORLD_SIZE; wrapped = true; }
        if (tdx < -WORLD_HALF) { tdx += WORLD_SIZE; wrapped = true; }
        if (tdy > WORLD_HALF) { tdy -= WORLD_SIZE; wrapped = true; }
        if (tdy < -WORLD_HALF) { tdy += WORLD_SIZE; wrapped = true; }

        if (wrapped) {
            // 境界を跨いだ場合は、前の点と繋ぐと巨大な線になるためリセット
            this.lastPosition.x = x
            this.lastPosition.y = y
            this.lastEndPosition.x = currentEndX
            this.lastEndPosition.y = currentEndY
            return
        }

        const distSinceLast = Math.sqrt(tdx * tdx + tdy * tdy)
        const interval = forceInterval ?? this.trailInterval

        if (distSinceLast >= interval) {
            // ここに来る時点で wrapped は false なので、通常通り描画
            this.spawnAfterimage(
                this.lastEndPosition.x,
                this.lastEndPosition.y,
                currentEndX,
                currentEndY,
                this.trailLife,
                this.color,
                this.alpha
            )

            // 次回の始点として現在の情報を保存
            this.lastPosition.x = x
            this.lastPosition.y = y
            this.lastEndPosition.x = currentEndX
            this.lastEndPosition.y = currentEndY
        }
    }
}
