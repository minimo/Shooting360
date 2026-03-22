import * as THREE from 'three'
import type { PowerUp } from './GameManager'

const OVERLAY_Z = 500
const TEXT_Z = 501

// カード配置設定
const CARD_W = 340
const CARD_H = 390
const CARD_GAP = 30

/**
 * パワーアップ選択画面をThree.jsシーン内で描画するクラス
 */
export class PowerUpScreen {
  private scene: THREE.Scene
  private group: THREE.Group

  // 背景オーバーレイ
  private overlayMesh: THREE.Mesh

  // タイトル
  private titleSprite: THREE.Sprite

  // カードSprite（最大3枚 + スキップボタン1つ）
  private cardSprites: THREE.Sprite[] = []
  private skipSprite: THREE.Sprite | null = null

  // 内部状態
  private visible: boolean = false
  private options: PowerUp[] = []
  private mainOptions: PowerUp[] = []
  private skipOption: PowerUp | null = null
  private selectedIndex: number = 0
  private reason: 'wave' | 'level' | null = null
  private currentWave: number = 0

  // アニメーション
  private pulseTimer: number = 0

  // カードのクリック判定用領域（シーン座標）
  private cardBounds: { x: number; y: number; w: number; h: number }[] = []
  private skipBounds: { x: number; y: number; w: number; h: number } | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    // 背景オーバーレイ
    const geo = new THREE.PlaneGeometry(1920, 1080)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
    this.overlayMesh = new THREE.Mesh(geo, mat)
    this.overlayMesh.position.set(0, 0, OVERLAY_Z)
    this.group.add(this.overlayMesh)

    const UI_SCALE = 1.25

    // タイトルSprite
    this.titleSprite = this.createSprite(700, 90, UI_SCALE)
    this.titleSprite.position.set(0, 280 * UI_SCALE, TEXT_Z)
    this.group.add(this.titleSprite)

    this.group.visible = false
  }

  private createSprite(width: number, height: number, scale: number = 1.0): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const texture = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(width * scale, height * scale, 1)
    return sprite
  }

  private getCanvas(sprite: THREE.Sprite): HTMLCanvasElement {
    return (sprite.material as THREE.SpriteMaterial).map!.image as HTMLCanvasElement
  }

  private markNeedsUpdate(sprite: THREE.Sprite): void {
    ;(sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  /** カード群のSprite一式を準備 */
  private prepareCards(): void {
    // 既存カードを破棄
    for (const s of this.cardSprites) {
      ;(s.material as THREE.SpriteMaterial).map?.dispose()
      s.material.dispose()
      this.group.remove(s)
    }
    this.cardSprites = []

    if (this.skipSprite) {
      ;(this.skipSprite.material as THREE.SpriteMaterial).map?.dispose()
      this.skipSprite.material.dispose()
      this.group.remove(this.skipSprite)
      this.skipSprite = null
    }

    this.cardBounds = []
    this.skipBounds = null

    const UI_SCALE = 1.25
    // メインカードを中央配置
    const n = this.mainOptions.length
    const totalW = n * CARD_W + (n - 1) * CARD_GAP
    const startX = -totalW / 2 + CARD_W / 2
    const baseCardY = 20

    for (let i = 0; i < n; i++) {
      const sprite = this.createSprite(CARD_W, CARD_H, UI_SCALE)
      const x = (startX + i * (CARD_W + CARD_GAP)) * UI_SCALE
      const y = baseCardY * UI_SCALE
      sprite.position.set(x, y, TEXT_Z)
      this.group.add(sprite)
      this.cardSprites.push(sprite)
      this.cardBounds.push({
        x: x - (CARD_W * UI_SCALE) / 2,
        y: y - (CARD_H * UI_SCALE) / 2,
        w: CARD_W * UI_SCALE,
        h: CARD_H * UI_SCALE,
      })
    }

    // スキップボタン
    if (this.skipOption) {
      const sprite = this.createSprite(340, 60, UI_SCALE)
      const y = (baseCardY - CARD_H / 2 - 55) * UI_SCALE
      sprite.position.set(0, y, TEXT_Z)
      this.group.add(sprite)
      this.skipSprite = sprite
      this.skipBounds = {
        x: -170 * UI_SCALE,
        y: y - (60 * UI_SCALE) / 2,
        w: 340 * UI_SCALE,
        h: 60 * UI_SCALE,
      }
    }
  }

  /** タイトルを描画 */
  private drawTitle(): void {
    const canvas = this.getCanvas(this.titleSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const text =
      this.reason === 'level'
        ? 'LEVEL UP!'
        : `WAVE ${this.currentWave} CLEAR!`

    ctx.font = 'bold 118px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255,255,0,0.7)'
    ctx.shadowBlur = 30
    ctx.fillStyle = '#ffff00'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
    ctx.shadowBlur = 0

    this.markNeedsUpdate(this.titleSprite)
  }

  /** カードを描画 */
  private drawCard(sprite: THREE.Sprite, option: PowerUp, isSelected: boolean, pulse: number): void {
    const canvas = this.getCanvas(sprite)
    const ctx = canvas.getContext('2d')!
    const cw = canvas.width
    const ch = canvas.height
    ctx.clearRect(0, 0, cw, ch)

    // 背景
    if (isSelected) {
      ctx.fillStyle = 'rgba(0,255,204,0.18)'
      ctx.strokeStyle = `rgba(0,255,204,${0.6 + pulse * 0.4})`
      ctx.lineWidth = 4
      ctx.shadowColor = `rgba(0,255,204,${0.4 + pulse * 0.3})`
      ctx.shadowBlur = 20 + pulse * 15
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.strokeStyle = 'rgba(0,255,204,0.25)'
      ctx.lineWidth = 2
      ctx.shadowBlur = 0
    }
    ctx.beginPath()
    ctx.roundRect(6, 6, cw - 12, ch - 12, 20)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    // レアリティ星
    const rarity = option.rarity ?? 0
    if (rarity > 0) {
      ctx.font = '36px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#ffd700'
      ctx.shadowColor = 'rgba(255,215,0,0.6)'
      ctx.shadowBlur = 8
      ctx.fillText('★'.repeat(rarity), cw / 2, 22)
      ctx.shadowBlur = 0
    }

    // 名前
    ctx.font = 'bold 44px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#00ffcc'
    ctx.shadowBlur = 0
    // テキストが長い場合は縮小
    const nameY = rarity > 0 ? 70 : 36
    ctx.save()
    const nameMaxW = cw - 40
    const nameW = ctx.measureText(option.name).width
    if (nameW > nameMaxW) {
      ctx.scale(nameMaxW / nameW, 1)
      ctx.fillText(option.name, (cw * nameW) / (2 * nameMaxW), nameY)
    } else {
      ctx.fillText(option.name, cw / 2, nameY)
    }
    ctx.restore()

    // レベルバッジ
    const maxLv = option.maxLevel ?? 1
    const curLv = option.currentLevel ?? 0
    if (maxLv > 1) {
      const badgeText = `Lv ${curLv}/${maxLv}`
      ctx.font = 'bold 28px Orbitron, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const badgeY = nameY + 56
      const badgeW = ctx.measureText(badgeText).width + 24
      const badgeH = 36
      const badgeX = cw / 2 - badgeW / 2
      ctx.fillStyle = 'rgba(0,255,204,0.18)'
      ctx.strokeStyle = 'rgba(0,255,204,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 10)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#00ffcc'
      ctx.fillText(badgeText, cw / 2, badgeY + 4)
    }

    // 説明テキスト（折り返し）
    ctx.font = '30px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#eeeeee'
    const descY = ch - 190
    this.wrapText(ctx, option.description, cw / 2, descY, cw - 40, 38)

    this.markNeedsUpdate(sprite)
  }

  /** スキップボタンを描画 */
  private drawSkipButton(pulse: number): void {
    if (!this.skipSprite || !this.skipOption) return
    const canvas = this.getCanvas(this.skipSprite)
    const ctx = canvas.getContext('2d')!
    const cw = canvas.width
    const ch = canvas.height
    ctx.clearRect(0, 0, cw, ch)

    const isSelected = this.selectedIndex === this.mainOptions.length
    if (isSelected) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.3})`
      ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(255,255,255,0.4)'
      ctx.shadowBlur = 10 * pulse
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.shadowBlur = 0
    }
    ctx.beginPath()
    ctx.roundRect(4, 4, cw - 8, ch - 8, 20)
    ctx.fill()
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.font = 'bold 36px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = isSelected ? '#ffffff' : '#aaaaaa'
    ctx.fillText(this.skipOption.name, cw / 2, ch / 2)
    this.markNeedsUpdate(this.skipSprite)
  }

  /** テキスト折り返し描画ヘルパー */
  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): void {
    const words = text.split('')
    let line = ''
    let currentY = y
    // 日本語は文字単位で折り返し
    for (let i = 0; i < text.length; i++) {
      const testLine = line + text[i]
      if (ctx.measureText(testLine).width > maxWidth && line !== '') {
        ctx.fillText(line, x, currentY)
        line = text[i]!
        currentY += lineHeight
      } else {
        line = testLine
      }
    }
    if (line) ctx.fillText(line, x, currentY)
  }

  /** 全カードを再描画 */
  private redrawAll(pulse: number = 1.0): void {
    this.drawTitle()
    for (let i = 0; i < this.cardSprites.length; i++) {
      this.drawCard(this.cardSprites[i]!, this.mainOptions[i]!, i === this.selectedIndex, pulse)
    }
    if (this.skipOption) this.drawSkipButton(pulse)
  }

  /**
   * 画面を表示する。
   */
  show(options: PowerUp[], reason: 'wave' | 'level' | null, currentWave: number): void {
    this.options = options
    this.mainOptions = options.filter((o) => o.id !== 'skip')
    this.skipOption = options.find((o) => o.id === 'skip') ?? null
    this.reason = reason
    this.currentWave = currentWave
    this.selectedIndex = 0
    this.pulseTimer = 0
    this.visible = true
    this.group.visible = true

    this.prepareCards()
    this.redrawAll(1.0)
  }

  hide(): void {
    this.visible = false
    this.group.visible = false
  }

  setSelectedIndex(index: number): void {
    if (this.selectedIndex === index) return
    this.selectedIndex = index
    this.redrawAll(1.0)
  }

  /**
   * マウス座標（シーン座標系）でヒットしたカードのインデックスを返す。
   * ヒットなし: -1
   * スキップ: mainOptions.length
   */
  hitTestCard(sceneX: number, sceneY: number): number {
    for (let i = 0; i < this.cardBounds.length; i++) {
      const b = this.cardBounds[i]!
      if (sceneX >= b.x && sceneX <= b.x + b.w && sceneY >= b.y && sceneY <= b.y + b.h) {
        return i
      }
    }
    if (this.skipBounds) {
      const b = this.skipBounds
      if (sceneX >= b.x && sceneX <= b.x + b.w && sceneY >= b.y && sceneY <= b.y + b.h) {
        return this.mainOptions.length
      }
    }
    return -1
  }

  update(delta: number): void {
    if (!this.visible) return
    this.pulseTimer += delta
    const pulse = (Math.sin((this.pulseTimer / 90) * Math.PI * 2) + 1) / 2
    this.redrawAll(pulse)
  }

  destroy(): void {
    for (const s of this.cardSprites) {
      ;(s.material as THREE.SpriteMaterial).map?.dispose()
      s.material.dispose()
    }
    if (this.skipSprite) {
      ;(this.skipSprite.material as THREE.SpriteMaterial).map?.dispose()
      this.skipSprite.material.dispose()
    }
    ;(this.titleSprite.material as THREE.SpriteMaterial).map?.dispose()
    this.titleSprite.material.dispose()
    ;(this.overlayMesh.material as THREE.MeshBasicMaterial).dispose()
    ;(this.overlayMesh.geometry as THREE.PlaneGeometry).dispose()
    this.scene.remove(this.group)
  }
}
