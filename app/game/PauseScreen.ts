import * as THREE from 'three'

const OVERLAY_Z = 500
const TEXT_Z = 501

/**
 * ポーズ画面をThree.jsシーン内で描画するクラス
 */
export class PauseScreen {
  private scene: THREE.Scene
  private group: THREE.Group
  private overlayMesh: THREE.Mesh
  private textSprite: THREE.Sprite

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    // 半透明オーバーレイ
    const geo = new THREE.PlaneGeometry(1920, 1080)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    })
    this.overlayMesh = new THREE.Mesh(geo, mat)
    this.overlayMesh.position.set(0, 0, OVERLAY_Z)
    this.group.add(this.overlayMesh)

    const UI_SCALE = 1.25

    // テキスト
    this.textSprite = this.createSprite(500, 160, UI_SCALE)
    this.textSprite.position.set(0, 0, TEXT_Z)
    this.group.add(this.textSprite)

    this.group.visible = false
    this.drawText()
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

  private drawText(): void {
    const canvas = (this.textSprite.material as THREE.SpriteMaterial).map!
      .image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 「PAUSE」
    ctx.font = 'bold 130px Orbitron, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(255,255,255,0.3)'
    ctx.shadowBlur = 20
    ctx.fillStyle = '#aaaaaa'
    ctx.fillText('PAUSE', canvas.width / 2, canvas.height / 2 - 24)
    ctx.shadowBlur = 0

    // 「ESC キーで再開」
    ctx.font = '36px Orbitron, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('ESC キーで再開', canvas.width / 2, canvas.height / 2 + 58)

    ;(this.textSprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  show(): void {
    this.group.visible = true
  }

  hide(): void {
    this.group.visible = false
  }

  destroy(): void {
    ;(this.textSprite.material as THREE.SpriteMaterial).map?.dispose()
    this.textSprite.material.dispose()
    ;(this.overlayMesh.material as THREE.MeshBasicMaterial).dispose()
    ;(this.overlayMesh.geometry as THREE.PlaneGeometry).dispose()
    this.scene.remove(this.group)
  }
}
