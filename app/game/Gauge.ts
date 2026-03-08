import * as THREE from 'three'

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
 * 汎用ゲージクラス（HP・パワーなど）
 * THREE.Group を継承し、自機の mesh に直接 add できる。
 * HP ゲージは Vue 側で表示するため、このクラスはプレイヤー機体上の
 * パワーゲージ専用として使用する。
 */
export class Gauge extends THREE.Group {
  private bgMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private barMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private options: Required<GaugeOptions>
  private targetValue: number
  private visualValue: number

  constructor(options: GaugeOptions) {
    super()
    this.options = {
      width: options.width,
      height: options.height,
      maxValue: options.maxValue,
      initialValue: options.initialValue ?? options.maxValue,
      backgroundColor: options.backgroundColor ?? 0x333333,
      backgroundAlpha: options.backgroundAlpha ?? 0.8,
      colorThresholds: options.colorThresholds ?? [],
    }
    this.targetValue = this.options.initialValue
    this.visualValue = this.options.initialValue

    // 背景
    const bgGeo = new THREE.PlaneGeometry(this.options.width, this.options.height)
    const bgMat = new THREE.MeshBasicMaterial({
      color: this.options.backgroundColor,
      opacity: this.options.backgroundAlpha,
      transparent: true,
    })
    this.bgMesh = new THREE.Mesh(bgGeo, bgMat)
    this.bgMesh.position.z = 10
    this.add(this.bgMesh)

    // バー
    const barGeo = new THREE.PlaneGeometry(this.options.width, this.options.height)
    const barMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true })
    this.barMesh = new THREE.Mesh(barGeo, barMat)
    this.barMesh.position.z = 10.1
    this.add(this.barMesh)

    this.renderBar()
  }

  public setValue(value: number): void {
    this.targetValue = Math.max(0, Math.min(value, this.options.maxValue))
  }

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

  private updateColor(): void {
    const ratio = this.visualValue / this.options.maxValue
    if (isNaN(ratio) || this.options.colorThresholds.length === 0) return
    const sorted = [...this.options.colorThresholds].sort((a, b) => a.threshold - b.threshold)
    let targetColor = sorted[sorted.length - 1]?.color ?? 0x00ffff
    for (const ct of sorted) {
      if (ratio < ct.threshold) {
        targetColor = ct.color
        break
      }
    }
    this.barMesh.material.color.setHex(targetColor)
  }

  private renderBar(): void {
    const ratio = Math.max(0, this.visualValue / this.options.maxValue)
    if (ratio <= 0) {
      this.barMesh.visible = false
      return
    }
    this.barMesh.visible = true
    this.barMesh.scale.x = ratio
    // 左端揃えにするため左方向にオフセット
    this.barMesh.position.x = (ratio - 1) * this.options.width * 0.5
  }

  public setBarOpacity(opacity: number): void {
    this.barMesh.material.opacity = opacity
    this.bgMesh.material.opacity = opacity * this.options.backgroundAlpha
  }

  public dispose(): void {
    this.bgMesh.geometry.dispose()
    this.bgMesh.material.dispose()
    this.barMesh.geometry.dispose()
    this.barMesh.material.dispose()
  }
}
