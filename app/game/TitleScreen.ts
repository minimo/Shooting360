import * as THREE from 'three'

const GAME_WIDTH = 1920
const GAME_HEIGHT = 1080

// オーバーレイ・テキスト描画用のZ深度
const OVERLAY_Z = 500
const TEXT_Z = 501

/**
 * タイトル画面をThree.jsシーン内に描画するクラス。
 * CanvasTexture を使ってテキストを描画する。
 */
export class TitleScreen {
  private scene: THREE.Scene
  private group: THREE.Group

  // 背景オーバーレイ
  private overlayMesh: THREE.Mesh

  // テキストSprite群
  private titleSprite: THREE.Sprite
  private subtitleSprite: THREE.Sprite
  private hintSprite: THREE.Sprite
  private controlsSprite: THREE.Sprite

  // アニメーション用タイマー
  private hintTimer: number = 0
  private visible: boolean = false

  // グリッチ用タイマー
  private glitchTimer: number = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    // --- 背景オーバーレイ（暗い半透明） ---
    const overlayGeo = new THREE.PlaneGeometry(GAME_WIDTH, GAME_HEIGHT)
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

    // --- タイトル ---
    this.titleSprite = this.createSprite(1200, 200, UI_SCALE)
    this.titleSprite.position.set(0, 240 * UI_SCALE, TEXT_Z)
    this.group.add(this.titleSprite)

    // --- サブタイトル ---
    this.subtitleSprite = this.createSprite(1000, 80, UI_SCALE)
    this.subtitleSprite.position.set(0, 120 * UI_SCALE, TEXT_Z)
    this.group.add(this.subtitleSprite)

    // --- スタートヒント ---
    this.hintSprite = this.createSprite(700, 100, UI_SCALE)
    this.hintSprite.position.set(0, -10 * UI_SCALE, TEXT_Z)
    this.group.add(this.hintSprite)

    // --- コントロール説明 ---
    this.controlsSprite = this.createSprite(800, 280, UI_SCALE)
    this.controlsSprite.position.set(0, -220 * UI_SCALE, TEXT_Z)
    this.group.add(this.controlsSprite)

    // 最初は非表示
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

  /** 全テキストを描画 */
  private drawAll(): void {
    this.drawTitle()
    this.drawSubtitle()
    this.drawHint(1.0)
    this.drawControls()
  }

  /** タイトル文字を描画（グリッチ風、シアン色） */
  private drawTitle(glitchOffset: number = 0): void {
    const canvas = this.getCanvas(this.titleSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const text = 'SHOOTING 360'
    const fontSize = 160
    ctx.font = `bold ${fontSize}px Orbitron, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const cx = canvas.width / 2
    const cy = canvas.height / 2

    // グリッチ: マゼンタ影
    if (glitchOffset !== 0) {
      ctx.fillStyle = 'rgba(255, 0, 255, 0.7)'
      ctx.fillText(text, cx + glitchOffset * 2, cy + glitchOffset)
    }
    // グリッチ: シアン影
    if (glitchOffset !== 0) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.7)'
      ctx.fillText(text, cx - glitchOffset * 2, cy - glitchOffset)
    }

    // メインテキスト: シアン + グロー
    ctx.shadowColor = 'rgba(0, 242, 255, 0.9)'
    ctx.shadowBlur = 30
    ctx.fillStyle = '#00f2ff'
    ctx.fillText(text, cx, cy)
    ctx.shadowBlur = 0

    this.markNeedsUpdate(this.titleSprite)
  }

  /** サブタイトルを描画 */
  private drawSubtitle(): void {
    const canvas = this.getCanvas(this.subtitleSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.font = 'bold 50px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.letterSpacing = '8px'
    ctx.shadowColor = 'rgba(102, 204, 255, 0.5)'
    ctx.shadowBlur = 10
    ctx.fillStyle = 'rgba(102, 204, 255, 0.85)'
    ctx.fillText('OMNIDIRECTIONAL 2D SHOOTING', canvas.width / 2, canvas.height / 2)
    ctx.shadowBlur = 0

    this.markNeedsUpdate(this.subtitleSprite)
  }

  /** スタートヒントを描画（alphaで点滅） */
  private drawHint(alpha: number): void {
    const canvas = this.getCanvas(this.hintSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.globalAlpha = alpha
    ctx.font = 'bold 64px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
    ctx.shadowBlur = 14
    ctx.fillStyle = '#ffffff'
    ctx.fillText('PRESS Z / X TO START', canvas.width / 2, canvas.height / 2)
    ctx.globalAlpha = 1.0
    ctx.shadowBlur = 0

    this.markNeedsUpdate(this.hintSprite)
  }

  /** コントロール説明を描画 */
  private drawControls(): void {
    const canvas = this.getCanvas(this.controlsSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 背景パネル
    const pw = canvas.width
    const ph = canvas.height
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.2)'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(0, 242, 255, 0.05)'
    ctx.beginPath()
    ctx.roundRect(10, 10, pw - 20, ph - 20, 20)
    ctx.fill()
    ctx.stroke()

    const lines = [
      { icon: '◀▶', desc: '回転' },
      { icon: '▲', desc: '前進加速 / ▼ 減速' },
      { icon: 'Z', desc: '弾丸発射' },
      { icon: 'X', desc: 'レーザー発射' },
    ]

    ctx.textBaseline = 'middle'
    const lineH = (ph - 20) / lines.length
    lines.forEach((line, i) => {
      const y = 20 + lineH * i + lineH / 2

      // アイコン
      ctx.font = 'bold 44px Orbitron, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#66ccff'
      ctx.fillText(line.icon, 80, y)

      // 説明
      ctx.font = '40px Orbitron, sans-serif'
      ctx.fillStyle = '#aaddff'
      ctx.fillText(line.desc, 240, y)
    })

    this.markNeedsUpdate(this.controlsSprite)
  }

  /** 表示する */
  show(): void {
    this.visible = true
    this.group.visible = true
    this.hintTimer = 0
    this.glitchTimer = 0
  }

  /** 非表示にする */
  hide(): void {
    this.visible = false
    this.group.visible = false
  }

  /**
   * 毎フレーム呼ぶ更新処理。
   * @param delta PixiJS互換デルタ（60fps基準）
   */
  update(delta: number): void {
    if (!this.visible) return

    // 点滅アニメーション（60fps換算 120フレームで1サイクル）
    this.hintTimer += delta
    const hintAlpha = 0.4 + 0.6 * ((Math.sin((this.hintTimer / 120) * Math.PI * 2) + 1) / 2)
    this.drawHint(hintAlpha)

    // グリッチアニメーション（不定期にオフセット）
    this.glitchTimer += delta
    let glitch = 0
    if (Math.sin(this.glitchTimer * 0.05) > 0.92) {
      glitch = (Math.random() - 0.5) * 4
    }
    this.drawTitle(glitch)
  }

  /** 後片付け */
  destroy(): void {
    // Sprite の texture + material を解放
    for (const sprite of [
      this.titleSprite,
      this.subtitleSprite,
      this.hintSprite,
      this.controlsSprite,
    ]) {
      ;(sprite.material as THREE.SpriteMaterial).map?.dispose()
      sprite.material.dispose()
    }
    ;(this.overlayMesh.material as THREE.MeshBasicMaterial).dispose()
    ;(this.overlayMesh.geometry as THREE.PlaneGeometry).dispose()

    this.scene.remove(this.group)
  }
}
