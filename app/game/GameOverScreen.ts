import * as THREE from 'three'

const OVERLAY_Z = 500
const TEXT_Z = 501

/**
 * ゲームオーバー画面をThree.jsシーン内に描画するクラス。
 * CanvasTexture を使ってテキストを描画する。
 */
export class GameOverScreen {
  private scene: THREE.Scene
  private group: THREE.Group

  // 背景オーバーレイ
  private overlayMesh: THREE.Mesh

  // テキストSprite群
  private titleSprite: THREE.Sprite
  private resultSprite: THREE.Sprite
  private btn0Sprite: THREE.Sprite // コンティニュー
  private btn1Sprite: THREE.Sprite // タイトルに戻る

  // 状態
  private visible: boolean = false
  private selectedIndex: number = 0
  private wave: number = 0
  private score: string = '000000'

  // アニメーション用タイマー
  private btnTimer: number = 0
  private titleTimer: number = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    // --- 背景オーバーレイ ---
    const overlayGeo = new THREE.PlaneGeometry(1920, 1080)
    const overlayMat = new THREE.MeshBasicMaterial({
      color: 0x040410,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    })
    this.overlayMesh = new THREE.Mesh(overlayGeo, overlayMat)
    this.overlayMesh.position.set(0, 0, OVERLAY_Z)
    this.group.add(this.overlayMesh)

    const UI_SCALE = 1.25

    // --- GAME OVER タイトル ---
    this.titleSprite = this.createSprite(700, 130, UI_SCALE)
    this.titleSprite.position.set(0, 230 * UI_SCALE, TEXT_Z)
    this.group.add(this.titleSprite)

    // --- リザルト（WAVE / SCORE） ---
    this.resultSprite = this.createSprite(500, 140, UI_SCALE)
    this.resultSprite.position.set(0, 50 * UI_SCALE, TEXT_Z)
    this.group.add(this.resultSprite)

    // --- ボタン: コンティニュー ---
    this.btn0Sprite = this.createSprite(440, 70, UI_SCALE)
    this.btn0Sprite.position.set(0, -100 * UI_SCALE, TEXT_Z)
    this.group.add(this.btn0Sprite)

    // --- ボタン: タイトルに戻る ---
    this.btn1Sprite = this.createSprite(440, 70, UI_SCALE)
    this.btn1Sprite.position.set(0, -190 * UI_SCALE, TEXT_Z)
    this.group.add(this.btn1Sprite)

    this.group.visible = false
    this.drawAll()
  }

  /** Spriteを生成するヘルパー */
  private createSprite(width: number, height: number, scale: number = 1.0): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const texture = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(width * scale, height * scale, 1)
    return sprite
  }

  /** Canvasを取得するヘルパー */
  private getCanvas(sprite: THREE.Sprite): HTMLCanvasElement {
    return (sprite.material as THREE.SpriteMaterial).map!
      .image as HTMLCanvasElement
  }

  /** テクスチャを更新するヘルパー */
  private markNeedsUpdate(sprite: THREE.Sprite): void {
    ;(sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  /** 全描画 */
  private drawAll(): void {
    this.drawTitle(0)
    this.drawResult()
    this.drawButton(this.btn0Sprite, '▶  コンティニュー', 0, 1.0)
    this.drawButton(this.btn1Sprite, '⏎  タイトルに戻る', 1, 1.0)
  }

  /** "GAME OVER" テキストを描画（赤グロー、アニメ対応） */
  private drawTitle(glowScale: number): void {
    const canvas = this.getCanvas(this.titleSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const text = 'GAME OVER'
    ctx.font = `bold 130px Orbitron, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const cx = canvas.width / 2
    const cy = canvas.height / 2

    const glow = 20 + glowScale * 25
    ctx.shadowColor = 'rgba(255, 51, 51, 0.9)'
    ctx.shadowBlur = glow
    ctx.fillStyle = '#ff3333'
    ctx.fillText(text, cx, cy)
    ctx.shadowBlur = 0

    this.markNeedsUpdate(this.titleSprite)
  }

  /** リザルト（WAVE / SCORE）を描画 */
  private drawResult(): void {
    const canvas = this.getCanvas(this.resultSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const pw = canvas.width
    const ph = canvas.height

    // 背景パネル
    ctx.fillStyle = 'rgba(255, 50, 50, 0.08)'
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(10, 10, pw - 20, ph - 20, 16)
    ctx.fill()
    ctx.stroke()

    // 区切り線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, ph / 2)
    ctx.lineTo(pw - 20, ph / 2)
    ctx.stroke()

    const rows = [
      { label: 'WAVE', value: String(this.wave) },
      { label: 'SCORE', value: this.score },
    ]
    rows.forEach((row, i) => {
      const y = ph / 4 + (ph / 2) * i

      // ラベル
      ctx.font = '30px Orbitron, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#aaaaaa'
      ctx.textBaseline = 'middle'
      ctx.fillText(row.label, 40, y)

      // 値
      ctx.font = 'bold 46px Orbitron, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(255,255,255,0.3)'
      ctx.shadowBlur = 8
      ctx.fillText(row.value, pw - 40, y)
      ctx.shadowBlur = 0
    })

    this.markNeedsUpdate(this.resultSprite)
  }

  /** ボタンを描画 */
  private drawButton(
    sprite: THREE.Sprite,
    label: string,
    btnIndex: number,
    pulseAlpha: number,
  ): void {
    const canvas = this.getCanvas(sprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const pw = canvas.width
    const ph = canvas.height
    const isSelected = this.selectedIndex === btnIndex

    if (isSelected) {
      // 選択中: グロー有り背景
      const color = btnIndex === 0 ? 'rgba(0, 220, 120, 0.2)' : 'rgba(160, 160, 255, 0.15)'
      const border = btnIndex === 0 ? `rgba(0, 220, 120, ${0.6 + pulseAlpha * 0.4})` : `rgba(160, 160, 255, ${0.5 + pulseAlpha * 0.3})`
      const glow = btnIndex === 0 ? 'rgba(0, 220, 120, 0.6)' : 'rgba(160, 160, 255, 0.4)'

      ctx.fillStyle = color
      ctx.strokeStyle = border
      ctx.lineWidth = 3
      ctx.shadowColor = glow
      ctx.shadowBlur = 20 * pulseAlpha
      ctx.beginPath()
      ctx.roundRect(4, 4, pw - 8, ph - 8, 10)
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0
    } else {
      // 非選択: 地味な背景
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(4, 4, pw - 8, ph - 8, 10)
      ctx.fill()
      ctx.stroke()
    }

    // テキスト
    ctx.font = `bold 38px Orbitron, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (isSelected) {
      const textColor = btnIndex === 0 ? '#00dc78' : '#b4b4ff'
      ctx.fillStyle = textColor
      ctx.shadowColor = textColor
      ctx.shadowBlur = 10
    } else {
      ctx.fillStyle = '#888888'
      ctx.shadowBlur = 0
    }
    ctx.fillText(label, pw / 2, ph / 2)
    ctx.shadowBlur = 0

    this.markNeedsUpdate(sprite)
  }

  /**
   * 画面を表示する。
   * @param wave 到達Wave数
   * @param score スコア（ゼロ埋め文字列）
   */
  show(wave: number, score: string): void {
    this.wave = wave
    this.score = score
    this.selectedIndex = 0
    this.btnTimer = 0
    this.titleTimer = 0
    this.visible = true
    this.group.visible = true
    this.drawAll()
  }

  /** 非表示にする */
  hide(): void {
    this.visible = false
    this.group.visible = false
  }

  /**
   * 選択インデックスを変更する（キー操作時に呼ぶ）。
   * @param index 0=コンティニュー, 1=タイトルに戻る
   */
  setSelectedIndex(index: number): void {
    if (this.selectedIndex === index) return
    this.selectedIndex = index
    this.drawButton(this.btn0Sprite, '▶  コンティニュー', 0, 1.0)
    this.drawButton(this.btn1Sprite, '⏎  タイトルに戻る', 1, 1.0)
  }

  /**
   * 毎フレーム呼ぶ更新処理。
   * @param delta PixiJS互換デルタ（60fps基準）
   */
  update(delta: number): void {
    if (!this.visible) return

    this.btnTimer += delta
    this.titleTimer += delta

    // ボタン点滅（選択ハイライトのパルス）
    const pulse = (Math.sin((this.btnTimer / 90) * Math.PI * 2) + 1) / 2
    this.drawButton(this.btn0Sprite, '▶  コンティニュー', 0, pulse)
    this.drawButton(this.btn1Sprite, '⏎  タイトルに戻る', 1, pulse)

    // タイトルグロー揺らぎ
    const glowPulse = (Math.sin((this.titleTimer / 120) * Math.PI * 2) + 1) / 2
    this.drawTitle(glowPulse)
  }

  /** 後片付け */
  destroy(): void {
    for (const sprite of [
      this.titleSprite,
      this.resultSprite,
      this.btn0Sprite,
      this.btn1Sprite,
    ]) {
      ;(sprite.material as THREE.SpriteMaterial).map?.dispose()
      sprite.material.dispose()
    }
    ;(this.overlayMesh.material as THREE.MeshBasicMaterial).dispose()
    ;(this.overlayMesh.geometry as THREE.PlaneGeometry).dispose()

    this.scene.remove(this.group)
  }
}
