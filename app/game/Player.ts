import * as THREE from 'three'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'
import { Gauge } from './Gauge'
import { TrailEffect } from './TrailEffect'
import type { InputState } from '~/composables/useInput'

/** 弾発射コールバック型 */
export type SpawnBulletFn = (x: number, y: number, angle: number, side?: 'player' | 'enemy') => void

/** 残像生成コールバック型 */
export type SpawnAfterimageFn = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  life?: number,
  color?: number,
  alpha?: number,
) => void

/** 自機誘導弾生成コールバック型 */
export type SpawnPlayerHomingMissileFn = (x: number, y: number) => boolean

/**
 * 自機クラス
 */
export class Player extends GameObject {
  private shipBody: THREE.Object3D | undefined
  public maxHp: number = 20
  public hp: number = 20

  public maxLaserPower: number = 300
  public laserPower: number = 300
  public isLaserOverheated: boolean = false
  private powerRecoveryCounter: number = 0
  private blinkTimer: number = 0
  private boostCooldown: number = 0
  private boostTimer: number = 0
  private wasBoostKeyDown: boolean = false
  public isBoosting: boolean = false
  public powerGauge: Gauge

  public weaponType: 'normal' | '3way' | '5way' | 'wide' = 'normal'

  public laserDamageMultiplier: number = 1.0
  public laserWidthMultiplier: number = 1.0
  public laserPowerRecoveryMultiplier: number = 1.0
  public laserConsumptionMultiplier: number = 1.0

  public bulletSpeedMultiplier: number = 1.0
  public fireRateMultiplier: number = 1.0
  public bulletDamage: number = 10
  public bulletPiercing: boolean = false

  public damageReductionMultiplier: number = 1.0

  public acceleration: number = 0.675
  public deceleration: number = 0.95
  public maxSpeed: number = 16
  public rotationSpeed: number = 0.075

  private fireInterval: number = 6
  private fireCooldown: number = 0

  public screenWidth: number = 0
  public screenHeight: number = 0

  public homingCooldown: number = 0
  public currentWave: number = 1

  public override radius: number = 12
  public override side: 'player' | 'enemy' = 'player'

  private spawnBullet: SpawnBulletFn
  private spawnAfterimage: SpawnAfterimageFn
  private spawnHomingMissile: SpawnPlayerHomingMissileFn
  private trail: TrailEffect

  constructor(
    x: number,
    y: number,
    spawnBullet: SpawnBulletFn,
    spawnAfterimage: SpawnAfterimageFn,
    spawnHomingMissile: SpawnPlayerHomingMissileFn,
    externalModel?: THREE.Object3D,
  ) {
    super(x, y)
    this.spawnBullet = spawnBullet
    this.spawnAfterimage = spawnAfterimage
    this.spawnHomingMissile = spawnHomingMissile
    this.mesh.position.z = 2

    this.powerGauge = new Gauge({
      width: 40,
      height: 4,
      maxValue: this.maxLaserPower,
      colorThresholds: [
        { threshold: 0.3, color: 0xff0000 },
        { threshold: 0.5, color: 0xffff00 },
        { threshold: 0.75, color: 0x00ff00 },
      ],
    })

    this.createMesh(externalModel)
    this.mesh.add(this.powerGauge)

    this.trail = new TrailEffect(spawnAfterimage, 10, 40, 0xffffff, 1.0, 10)
  }

  public takeDamage(amount: number): void {
    const reduced = Math.max(1, Math.round(amount * this.damageReductionMultiplier))
    this.hp -= reduced
    if (this.hp <= 0) {
      this.hp = 0
      this.isAlive = false
    }
  }

  private createMesh(externalModel?: THREE.Object3D): void {
    if (externalModel) {
      this.shipBody = externalModel
      this.mesh.add(externalModel)

      externalModel.scale.set(25, 25, 25)

      // モデルの全てのメッシュに対して、ライティングがない場所でも見えるように微調整
      externalModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.material) {
            child.material.side = THREE.DoubleSide
            // MeshStandardMaterial の場合は環境光の影響を強く受けるように
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.emissiveIntensity = 0.5
            }
          }
        }
      })

      return
    }

    const geometry = new THREE.BufferGeometry()

    // 頂点定義 (楔形: 前が薄く、後が厚い)
    // 前端: (0, 16, 0)
    // 右後: (12, -13, 4), (12, -13, -4)
    // 中後: (0, -6, 4), (0, -6, -4)
    // 左後: (-12, -13, 4), (-12, -13, -4)

    // 頂点配列 [x, y, z, ...]
    const vertices = new Float32Array([
      // 上面 (前, 右後上, 中後上, 左後上)
      0, 16, 0, 12, -13, 4, 0, -6, 4,
      0, 16, 0, 0, -6, 4, -12, -13, 4,

      // 下面 (前, 右後下, 中後下, 左後下)
      0, 16, 0, 0, -6, -4, 12, -13, -4,
      0, 16, 0, -12, -13, -4, 0, -6, -4,

      // 右側面
      0, 16, 0, 12, -13, -4, 12, -13, 4,
      12, -13, 4, 12, -13, -4, 0, -6, -4,
      12, -13, 4, 0, -6, -4, 0, -6, 4,

      // 左側面
      0, 16, 0, -12, -13, 4, -12, -13, -4,
      -12, -13, 4, 0, -6, 4, 0, -6, -4,
      -12, -13, 4, 0, -6, -4, -12, -13, -4,

      // 背面 (右)
      12, -13, 4, 12, -13, -4, 0, -6, -4,
      12, -13, 4, 0, -6, -4, 0, -6, 4,

      // 背面 (左)
      -12, -13, 4, 0, -6, 4, 0, -6, -4,
      -12, -13, 4, 0, -6, -4, -12, -13, -4,
    ])

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.computeVertexNormals() // 法線計算（ライティング用）

    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      flatShading: true,
      side: THREE.DoubleSide,
    })

    const mesh = new THREE.Mesh(geometry, material)
    this.shipBody = mesh
    this.mesh.add(mesh)

    // ライティングがない場合のために、自己発光を強化して鮮やかにする
    material.emissive.setHex(0x00ffff)
    material.emissiveIntensity = 0.5
  }

  public override update(delta: number, input: any): void {
    this.powerGauge.update(delta)

    if (!this.isAlive) {
      this.velocity.x *= Math.pow(0.995, delta)
      this.velocity.y *= Math.pow(0.995, delta)
      this.updatePosition(delta)
      return
    }

    if (input.left) this.rotation -= this.rotationSpeed * delta
    if (input.right) this.rotation += this.rotationSpeed * delta

    if (input.up) {
      this.velocity.x += Math.sin(this.rotation) * this.acceleration * delta
      this.velocity.y -= Math.cos(this.rotation) * this.acceleration * delta
    } else if (input.down) {
      this.velocity.x *= Math.pow(this.deceleration, delta)
      this.velocity.y *= Math.pow(this.deceleration, delta)
    } else {
      this.velocity.x *= Math.pow(0.98, delta)
      this.velocity.y *= Math.pow(0.98, delta)
    }

    const isBoostJustPressed = input.boost && !this.wasBoostKeyDown
    this.isBoosting = false

    if (
      isBoostJustPressed &&
      this.laserPower >= 30 &&
      !this.isLaserOverheated &&
      this.boostCooldown <= 0
    ) {
      const boostForce = this.acceleration * 100
      this.velocity.x += Math.sin(this.rotation) * boostForce * delta
      this.velocity.y -= Math.cos(this.rotation) * boostForce * delta
      this.laserPower -= 60
      if (this.laserPower <= 0) {
        this.laserPower = 0
        this.isLaserOverheated = true
      }
      this.boostCooldown = 120
      this.boostTimer = 10
      this.isBoosting = true
    }
    this.wasBoostKeyDown = input.boost

    if (this.boostCooldown > 0) this.boostCooldown -= delta
    if (this.boostTimer > 0) {
      this.boostTimer -= delta
      this.isBoosting = true
    }

    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2)
    const currentMaxSpeed = this.boostTimer > 0 ? 100 : this.maxSpeed
    if (speed > currentMaxSpeed) {
      const ratio = currentMaxSpeed / speed
      this.velocity.x *= ratio
      this.velocity.y *= ratio
    }

    if (input.up || this.isBoosting) {
      const interval = this.isBoosting ? 5 : 10
      this.trail.update(this.position.x, this.position.y, this.rotation, interval)
    } else {
      this.trail.reset()
    }

    this.updatePosition(delta)

    if (this.homingCooldown > 0) {
      this.homingCooldown -= delta
    } else {
      // 周囲に敵がいるかどうかの判定は GameManager 側で行われる
      this.spawnHomingMissile(this.position.x, this.position.y)
    }

    this.fireCooldown -= delta
    if (input.shoot && this.fireCooldown <= 0) {
      this.shoot()
      this.fireCooldown = this.fireInterval * this.fireRateMultiplier
    }

    this.blinkTimer += delta
    this.powerGauge.setValue(this.laserPower)
    this.updatePowerUI()
  }

  private shoot(): void {
    const x = this.position.x
    const y = this.position.y
    const rotation = this.rotation

    switch (this.weaponType) {
      case 'normal': {
        const offsetDist = 8
        const forwardOffset = 8
        const perpAngle = rotation + Math.PI / 2
        
        // 左側の弾
        this.spawnBullet(
          x - Math.sin(perpAngle) * offsetDist,
          y + Math.cos(perpAngle) * offsetDist,
          rotation,
          'player',
        )
        // 右側の弾
        this.spawnBullet(
          x + Math.sin(perpAngle) * offsetDist,
          y - Math.cos(perpAngle) * offsetDist,
          rotation,
          'player',
        )
        // 中央少し先の弾
        this.spawnBullet(
          x + Math.sin(rotation) * forwardOffset,
          y - Math.cos(rotation) * forwardOffset,
          rotation,
          'player',
        )
        break
      }
      case '3way':
        for (let i = -1; i <= 1; i++) {
          const angle = rotation + i * 0.2
          const perp = angle + Math.PI / 2
          const off = 4
          this.spawnBullet(x + Math.sin(perp) * off, y - Math.cos(perp) * off, angle, 'player')
          this.spawnBullet(x - Math.sin(perp) * off, y + Math.cos(perp) * off, angle, 'player')
        }
        break
      case '5way':
        for (let i = -2; i <= 2; i++) {
          const angle = rotation + i * 0.2
          const perp = angle + Math.PI / 2
          const off = 4
          this.spawnBullet(x + Math.sin(perp) * off, y - Math.cos(perp) * off, angle, 'player')
          this.spawnBullet(x - Math.sin(perp) * off, y + Math.cos(perp) * off, angle, 'player')
        }
        break
      case 'wide':
        for (let i = -2; i <= 2; i++) {
          const offsetX = Math.cos(rotation) * i * 10
          const offsetY = Math.sin(rotation) * i * 10
          this.spawnBullet(x + offsetX, y + offsetY, rotation, 'player')
        }
        break
    }
  }

  public updateLaserPower(delta: number, isFiring: boolean, isBoosting: boolean): void {
    if ((isFiring || isBoosting) && !this.isLaserOverheated) {
      this.laserPower -= (200 / 60) * delta * this.laserConsumptionMultiplier
      if (this.laserPower <= 0) {
        this.laserPower = 0
        this.isLaserOverheated = true
      }
      this.powerRecoveryCounter = 0
      this.powerGauge.setValue(this.laserPower)
    } else if (this.laserPower < this.maxLaserPower) {
      this.powerRecoveryCounter += delta * this.laserPowerRecoveryMultiplier
      if (this.powerRecoveryCounter >= 3) {
        this.laserPower += Math.floor(this.powerRecoveryCounter / 3)
        this.powerRecoveryCounter %= 3
        if (this.laserPower >= this.maxLaserPower) {
          this.laserPower = this.maxLaserPower
          this.isLaserOverheated = false
        }
        this.powerGauge.setValue(this.laserPower)
      }
    }
  }

  private updatePowerUI(): void {
    if (this.laserPower >= this.maxLaserPower) {
      this.powerGauge.visible = false
      return
    }
    this.powerGauge.visible = true

    // 親グループの rotation.z = -this.rotation なので、
    // ゲージを常に水平に保つには +this.rotation で打ち消す
    this.powerGauge.rotation.z = this.rotation

    // 自機から見て常に画面上方向 (y-up) に配置
    const dist = 35
    this.powerGauge.position.x = -Math.sin(this.rotation) * dist
    this.powerGauge.position.y = Math.cos(this.rotation) * dist // y-up: 上=正

    if (this.isLaserOverheated) {
      const opacity = 0.6 + Math.sin(this.blinkTimer * 0.3) * 0.4
      this.powerGauge.setBarOpacity(opacity)
    } else {
      this.powerGauge.setBarOpacity(1.0)
    }
  }

  /**
   * 自機は常に画面中央に表示（カメラ追従方式）
   */
  public override updateDisplay(_cameraX: number, _cameraY: number): void {
    this.mesh.position.set(0, 0, 2)

    // 親グループを回転させて進行方向を決める
    // z回転により、先端 (子メッシュの y+) が常に画面上の進行方向を向く
    this.mesh.rotation.z = -this.rotation

    // 子メッシュを y軸 (先端方向) を軸にロールさせる
    // これにより、先端の向きを変えずに機体だけを傾けることができる
    if (this.shipBody) {
      this.shipBody.rotation.y = Math.PI - this.rotation
    }
  }
}
