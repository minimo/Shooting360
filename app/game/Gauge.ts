import { Container, Graphics } from 'pixi.js'

export interface ColorThreshold {
    threshold: number
    color: number
}

export interface GaugeOptions {
    width: number
    height: number
    maxValue: number
    initialValue?: number
    backgroundColor?: number
    backgroundAlpha?: number
    colorThresholds?: ColorThreshold[]
}

/**
 * 汎用的なゲージクラス（HP、パワーなど）
 * 値の変動に対してイージングを行い、色しきい値をサポートする
 */
export class Gauge extends Container {
    private bg: Graphics = new Graphics()
    private bar: Graphics = new Graphics()
    private options: Required<GaugeOptions>

    private targetValue: number
    private visualValue: number
    private drawColor: number = 0x00ffff

    constructor(options: GaugeOptions) {
        super()
        this.options = {
            width: options.width,
            height: options.height,
            maxValue: options.maxValue,
            initialValue: options.initialValue ?? options.maxValue,
            backgroundColor: options.backgroundColor ?? 0x333333,
            backgroundAlpha: options.backgroundAlpha ?? 0.8,
            colorThresholds: options.colorThresholds ?? []
        }

        this.targetValue = this.options.initialValue
        this.visualValue = this.options.initialValue

        this.addChild(this.bg)
        this.addChild(this.bar)

        this.renderBackground()
        this.updateColor()
        this.renderBar()
    }

    /**
     * 現在値を設定する
     */
    public setValue(value: number): void {
        this.targetValue = Math.max(0, Math.min(value, this.options.maxValue))
    }

    /**
     * 更新処理（イージング）
     * 1秒で全量を移動する速度でターゲット値に近づく
     */
    public update(delta: number): void {
        const step = (this.options.maxValue / 60) * delta
        const diff = this.targetValue - this.visualValue

        if (Math.abs(diff) < step) {
            this.visualValue = this.targetValue
        } else {
            this.visualValue += Math.sign(diff) * step
        }

        this.updateColor()
        this.renderBar()
    }

    private renderBackground(): void {
        this.bg.clear()
        this.bg.rect(-this.options.width / 2, -this.options.height / 2, this.options.width, this.options.height)
        this.bg.fill({ color: this.options.backgroundColor, alpha: this.options.backgroundAlpha })
    }

    private updateColor(): void {
        const ratio = this.visualValue / this.options.maxValue
        if (isNaN(ratio) || this.options.colorThresholds.length === 0) return

        // 昇順にソート（一応）
        const sorted = [...this.options.colorThresholds].sort((a, b) => a.threshold - b.threshold)

        let targetColor = sorted.length > 0 ? sorted[sorted.length - 1].color : this.drawColor
        for (const ct of sorted) {
            if (ratio < ct.threshold) {
                targetColor = ct.color
                break
            }
        }
        this.drawColor = targetColor
    }

    private renderBar(): void {
        this.bar.clear()
        const ratio = Math.max(0, this.visualValue / this.options.maxValue)
        const barWidth = this.options.width * ratio

        // 左端から描画するために座標計算
        const x = -this.options.width / 2
        const y = -this.options.height / 2

        this.bar.rect(x, y, barWidth, this.options.height)
        this.bar.fill({ color: this.drawColor, alpha: 1 })
    }
}
