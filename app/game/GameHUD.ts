import * as THREE from 'three'

const GAME_WIDTH = 1920
const GAME_HEIGHT = 1080
const HUD_Z = 490     // ゲームオブジェクトより手前・オーバーレイより奥
const MINIMAP_SIZE = 240

export interface MinimapDot {
  nx: number
  ny: number
  color: string
  size: number
}

export interface HUDData {
  wave: number
  score: number
  playerLevel: number
  energy: number
  energyForNextLevel: number
  powerUpListText: string
  hpPercent: number
  isBossActive: boolean
  bossHpPercent: number
  minimapDots: MinimapDot[]
  announcementText: string
  announcementAlpha: number
  bossWarningText: string
  isBossWarningActive: boolean
  isVisible: boolean  // ゲームプレイ中のみtrue（タイトル・ゲームオーバーは false）
}

/**
 * ゲーム中のHUDをThree.jsシーン内で描画するクラス。
 * スコア・Wave・HP・ミニマップ・アナウンス・ボス警告を管理する。
 */
export class GameHUD {
  private scene: THREE.Scene
  private group: THREE.Group

  // --- スコアエリア（左上） ---
  private scoreSprite: THREE.Sprite

  // --- HPゲージ（上部中央） ---
  private hpBarSprite: THREE.Sprite

  // --- ミニマップ（左下） ---
  private minimapSprite: THREE.Sprite

  // --- Waveアナウンス（中央上部） ---
  private announcementSprite: THREE.Sprite

  // --- ボス警告（中央） ---
  private bossWarningSprite: THREE.Sprite

  // --- ボス警告アニメーション ---
  private warningTimer: number = 0
  private warningVisible: boolean = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    const UI_SCALE = 1.25

    // スコアエリア: 左上 (原点がシーン中心なので、左上は -GAME_WIDTH/2, +GAME_HEIGHT/2)
    this.scoreSprite = this.createSprite(720, 130, UI_SCALE)
    this.scoreSprite.position.set(-GAME_WIDTH / 2 + 450 * UI_SCALE, GAME_HEIGHT / 2 - 75 * UI_SCALE, HUD_Z)
    this.group.add(this.scoreSprite)

    // HPゲージ: 上部中央
    this.hpBarSprite = this.createSprite(500, 90, UI_SCALE)
    this.hpBarSprite.position.set(0, GAME_HEIGHT / 2 - 55 * UI_SCALE, HUD_Z)
    this.group.add(this.hpBarSprite)

    // ミニマップ: 左下
    this.minimapSprite = this.createSprite(MINIMAP_SIZE, MINIMAP_SIZE, UI_SCALE)
    this.minimapSprite.position.set(
      -GAME_WIDTH / 2 + (MINIMAP_SIZE / 2 + 20) * UI_SCALE,
      -GAME_HEIGHT / 2 + (MINIMAP_SIZE / 2 + 20) * UI_SCALE,
      HUD_Z,
    )
    this.group.add(this.minimapSprite)

    // Waveアナウンス: 中央上部
    this.announcementSprite = this.createSprite(900, 90, UI_SCALE)
    this.announcementSprite.position.set(0, GAME_HEIGHT / 2 - 200 * UI_SCALE, HUD_Z)
    this.group.add(this.announcementSprite)

    // ボス警告: 中央上部
    this.bossWarningSprite = this.createSprite(700, 120, UI_SCALE)
    this.bossWarningSprite.position.set(0, GAME_HEIGHT / 2 - 220 * UI_SCALE, HUD_Z)
    this.group.add(this.bossWarningSprite)

    this.group.visible = false
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

  private getCanvas(sprite: THREE.Sprite): HTMLCanvasElement {
    return (sprite.material as THREE.SpriteMaterial).map!.image as HTMLCanvasElement
  }

  private markNeedsUpdate(sprite: THREE.Sprite): void {
    ;(sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  /** スコアエリアを描画 */
  private drawScore(data: HUDData): void {
    const canvas = this.getCanvas(this.scoreSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const score = data.score.toString().padStart(6, '0')
    const wave = data.wave

    // WAVE + SCORE
    ctx.font = 'bold 40px Orbitron, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.shadowColor = '#000'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`WAVE ${wave}  SCORE: ${score}`, 10, 8)

    // Lv + energy gauge
    ctx.font = '30px Orbitron, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(`Lv.${data.playerLevel}`, 10, 56)

    const gaugeX = 148
    const gaugeY = 58
    const gaugeW = 500
    const gaugeH = 24
    const energyRatio =
      data.energyForNextLevel > 0
        ? Math.max(0, Math.min(1, data.energy / data.energyForNextLevel))
        : 0

    ctx.fillStyle = 'rgba(40, 70, 90, 0.7)'
    ctx.beginPath()
    ctx.roundRect(gaugeX, gaugeY, gaugeW, gaugeH, 8)
    ctx.fill()

    const fillGrad = ctx.createLinearGradient(gaugeX, 0, gaugeX + gaugeW, 0)
    fillGrad.addColorStop(0, '#58d8ff')
    fillGrad.addColorStop(1, '#c8ffff')
    ctx.fillStyle = fillGrad
    ctx.shadowColor = 'rgba(88,216,255,0.8)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.roundRect(gaugeX + 2, gaugeY + 2, (gaugeW - 4) * energyRatio, gaugeH - 4, 7)
    ctx.fill()
    ctx.shadowBlur = 0

    // パワーアップリスト
    if (data.powerUpListText) {
      ctx.font = '22px Orbitron, sans-serif'
      ctx.fillStyle = '#ddeeff'
      ctx.globalAlpha = 0.85
      ctx.fillText(data.powerUpListText, 10, 108)
      ctx.globalAlpha = 1.0
    }

    ctx.shadowBlur = 0
    this.markNeedsUpdate(this.scoreSprite)
  }

  /** HPゲージを描画 */
  private drawHpBar(data: HUDData): void {
    const canvas = this.getCanvas(this.hpBarSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const cw = canvas.width
    const ch = canvas.height

    const barW = cw - 20
    const barH = 36
    const barX = 10
    const barY = 10

    // バートラック背景
    ctx.fillStyle = 'rgba(50, 50, 50, 0.85)'
    ctx.beginPath()
    ctx.roundRect(barX, barY, barW, barH, 7)
    ctx.fill()

    // HPバー（色変化）
    const hp = data.hpPercent
    let fillColor: string
    if (hp < 30) {
      fillColor = '#ff3333'
    } else if (hp < 50) {
      fillColor = '#ffff00'
    } else {
      fillColor = '#00ff88'
    }
    const fillW = Math.max(0, (barW - 2) * (hp / 100))
    ctx.fillStyle = fillColor
    ctx.shadowColor = fillColor
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.roundRect(barX + 1, barY + 1, fillW, barH - 2, 6)
    ctx.fill()
    ctx.shadowBlur = 0

    // ボスHPゲージ（ボスアクティブ時のみ）
    if (data.isBossActive) {
      const bossBarH = 20 // 12から20に拡大
      // Level表示(top: 56, size: 30px) の中心(約71)にゲージの中心を合わせる
      const bossBarY = 71 - bossBarH / 2
      const bossBarW = Math.round(barW * 0.9) // 幅も0.8から0.9に拡大
      const bossBarX = barX + Math.round((barW - bossBarW) / 2)

      // 「BOSS」ラベル
      ctx.font = 'bold 24px Orbitron, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ff33ff'
      ctx.shadowColor = 'rgba(255,51,255,0.5)'
      ctx.shadowBlur = 6
      ctx.fillText('BOSS', bossBarX, bossBarY + bossBarH / 2 + 2)
      ctx.shadowBlur = 0

      const labelW = 75
      const actualBarX = bossBarX + labelW + 8
      const actualBarW = bossBarW - labelW - 8

      // ボスバートラック
      ctx.fillStyle = 'rgba(40,0,40,0.7)'
      ctx.strokeStyle = 'rgba(255,51,255,0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(actualBarX, bossBarY, actualBarW, bossBarH, 3)
      ctx.fill()
      ctx.stroke()

      // ボスバー
      const bossFillW = Math.max(0, actualBarW * (data.bossHpPercent / 100))
      const grad = ctx.createLinearGradient(actualBarX, 0, actualBarX + actualBarW, 0)
      grad.addColorStop(0, '#ff00ff')
      grad.addColorStop(1, '#ff66aa')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(255,0,255,0.5)'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.roundRect(actualBarX, bossBarY, bossFillW, bossBarH, 3)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    this.markNeedsUpdate(this.hpBarSprite)
  }

  /** ミニマップを描画 */
  private drawMinimap(dots: MinimapDot[]): void {
    const canvas = this.getCanvas(this.minimapSprite)
    const ctx = canvas.getContext('2d')!
    const size = canvas.width  // 正方形

    ctx.clearRect(0, 0, size, size)

    const radius = (size / 2) * 0.9
    const cx = size / 2
    const cy = size / 2

    // クリッピング（円形）
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.clip()

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fill()

    // ドット
    for (const dot of dots) {
      const x = dot.nx * size
      const y = dot.ny * size
      ctx.fillStyle = dot.color
      ctx.beginPath()
      ctx.arc(x, y, dot.size / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()

    // 枠線
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2)
    ctx.stroke()

    this.markNeedsUpdate(this.minimapSprite)
  }

  /** Waveアナウンスを描画 */
  private drawAnnouncement(text: string, alpha: number): void {
    const canvas = this.getCanvas(this.announcementSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!text || alpha <= 0) {
      this.markNeedsUpdate(this.announcementSprite)
      return
    }

    ctx.globalAlpha = Math.min(1, alpha)
    ctx.font = 'bold 110px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255,255,255,0.5)'
    ctx.shadowBlur = 30
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
    ctx.globalAlpha = 1.0
    ctx.shadowBlur = 0

    this.markNeedsUpdate(this.announcementSprite)
  }

  /** ボス警告を描画 */
  private drawBossWarning(text: string, pulseAlpha: number): void {
    const canvas = this.getCanvas(this.bossWarningSprite)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    // WARNING ラベル
    ctx.font = 'bold 70px Orbitron, sans-serif'
    ctx.letterSpacing = '10px'
    ctx.shadowColor = 'rgba(255,50,50,0.8)'
    ctx.shadowBlur = 20 * pulseAlpha
    ctx.fillStyle = '#ff3333'
    ctx.fillText('WARNING', cx, cy - 38)

    // カウントダウンテキスト（"WARNING "を除いた部分）
    const countdown = text.replace('WARNING ', '')
    if (countdown) {
      ctx.font = 'bold 100px Orbitron, sans-serif'
      ctx.shadowColor = 'rgba(255,255,255,0.5)'
      ctx.shadowBlur = 15
      ctx.fillStyle = '#ffffff'
      ctx.fillText(countdown, cx, cy + 42)
    }

    ctx.shadowBlur = 0
    this.markNeedsUpdate(this.bossWarningSprite)
  }

  /**
   * 毎フレーム呼ぶ更新処理。
   */
  update(data: HUDData, delta: number): void {
    this.group.visible = data.isVisible

    if (!data.isVisible) return

    this.drawScore(data)
    this.drawHpBar(data)
    this.drawMinimap(data.minimapDots)
    this.drawAnnouncement(data.announcementText, data.announcementAlpha)

    // ボス警告のアニメーション
    if (data.isBossWarningActive) {
      if (!this.warningVisible) {
        this.warningTimer = 0
        this.warningVisible = true
      }
      this.warningTimer += delta
      const pulse = (Math.sin((this.warningTimer / 60) * Math.PI * 2) + 1) / 2
      this.bossWarningSprite.visible = true
      this.drawBossWarning(data.bossWarningText, pulse)
    } else {
      this.warningVisible = false
      this.bossWarningSprite.visible = false
    }
  }

  destroy(): void {
    for (const sprite of [
      this.scoreSprite,
      this.hpBarSprite,
      this.minimapSprite,
      this.announcementSprite,
      this.bossWarningSprite,
    ]) {
      ;(sprite.material as THREE.SpriteMaterial).map?.dispose()
      sprite.material.dispose()
    }
    this.scene.remove(this.group)
  }
}
