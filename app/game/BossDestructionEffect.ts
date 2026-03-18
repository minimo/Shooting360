import * as THREE from 'three'
import { GameObject } from './GameObject'
import { Explosion } from './Explosion'
import { Particle } from './Particle'

export class BossDestructionEffect extends GameObject {
  private timer: number = 150
  private hasTriggeredMassive: boolean = false
  private spawnObject: (obj: GameObject) => void
  private shakeCamera: (frames: number) => void

  constructor(
    x: number,
    y: number,
    spawnObject: (obj: GameObject) => void,
    shakeCamera: (frames: number) => void
  ) {
    super(x, y)
    this.spawnObject = spawnObject
    this.shakeCamera = shakeCamera
    // 最初の小揺れ
    this.shakeCamera(10)
  }

  public override update(delta: number): void {
    if (this.timer > 60) {
      // 連鎖的な小～中爆発
      if (Math.random() < 0.4) {
        const exX = this.position.x + (Math.random() - 0.5) * 300
        const exY = this.position.y + (Math.random() - 0.5) * 300
        const colors = [0xff8800, 0xffaa00, 0xff3300, 0xffffff]
        const color = colors[Math.floor(Math.random() * colors.length)]
        this.spawnObject(new Explosion(exX, exY, color, 1.5 + Math.random() * 2.0, 30, false))
        this.shakeCamera(5)
      }
    } else if (!this.hasTriggeredMassive) {
      this.hasTriggeredMassive = true
      
      // 大爆発と画面の激しい揺れ
      this.shakeCamera(60)
      this.spawnObject(new Explosion(this.position.x, this.position.y, 0xffffff, 15.0, 90, true))
      
      // 大量のパーティクル飛散
      for (let i = 0; i < 150; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 5 + Math.random() * 25
        const color = Math.random() < 0.2 ? 0xffffff : (Math.random() < 0.5 ? 0xffaa00 : 0xff3300)
        this.spawnObject(new Particle(
          this.position.x,
          this.position.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          40 + Math.random() * 40,
          color,
          4 + Math.random() * 4
        ))
      }
      
      // 複数の重なる大爆発
      for (let i = 0; i < 8; i++) {
        const exX = this.position.x + (Math.random() - 0.5) * 200
        const exY = this.position.y + (Math.random() - 0.5) * 200
        const color = i % 2 === 0 ? 0xffffff : 0xffaa00
        this.spawnObject(new Explosion(exX, exY, color, 4.0 + Math.random() * 4.0, 50 + Math.random() * 30, true))
      }
    }

    this.timer -= delta
    if (this.timer <= 0) {
      this.isAlive = false
    }
  }
}
