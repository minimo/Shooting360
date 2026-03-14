import * as THREE from 'three'
import { Player } from './Player'
import { Bullet } from './Bullet'
import { Fighter } from './Enemy/Fighter'
import { AceFighter } from './Enemy/AceFighter'
import { MissileFlower } from './Enemy/MissileFlower'
import { Explosion } from './Explosion'
import { Particle } from './Particle'
import { Minimap } from './Minimap'
import { BackgroundObject } from './BackgroundObject'
import { HomingMissile } from './HomingMissile'
import { HomingExplosion } from './HomingExplosion'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'
import { Afterimage } from './Afterimage'
import { HomingLaser } from './HomingLaser'
import type { InputState } from '~/composables/useInput'
import { Laser, LaserState } from './Laser'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'

export interface PowerUp {
  id: string
  name: string
  description: string
  effect: (gm: GameManager) => void
  rarity?: number
  maxLevel?: number
  currentLevel?: number
}

/**
 * ゲーム全体の状態を管理するマネージャー
 * Three.js 版: UI テキスト類は Vue 側で描画するため、
 * このクラスはゲームロジックと Three.js シーン管理のみ担う。
 */
export class GameManager {
  private scene: THREE.Scene | null = null
  public player: Player = new Player(0, 0, () => { }, () => { }, () => false)
  private laser: Laser = new Laser(0, 0)
  private objects: GameObject[] = []
  private screenWidth: number = 0
  private screenHeight: number = 0
  private minimap: Minimap = new Minimap()
  private sharedBaseModel: THREE.Object3D | null = null
  private enemyBaseModel: THREE.Object3D | null = null

  // 画面シェイク
  private shakeFrames: number = 0
  /** Vue 側がカメラオフセットに使うシェイク量 */
  public shakeOffset: { x: number; y: number } = { x: 0, y: 0 }

  public isGameOver: boolean = false
  private gameOverTimer: number = 0
  private hasTriggeredMassiveExplosion: boolean = false

  // スコア・レベル（Vue に公開）
  public score: number = 0
  public playerLevel: number = 0
  public scoreForNextPowerUp: number = 1000
  private currentPowerUpInterval: number = 1000
  private pendingPowerUpSelections: number = 0
  private isWaitingForNextWaveTriggerPending: boolean = false
  public powerUpListEntries: string[] = []

  // Wave アナウンス（Vue に公開）
  public announcementText: string = ''
  public announcementAlpha: number = 0

  // Wave 管理
  public currentWave: number = 0
  private waveEnemiesSpawned: number = 0
  private totalEnemiesInWave: number = 0
  private isWaveClearing: boolean = false
  private isWaitingForClearAnnouncement: boolean = false
  private isSpawningDelayed: boolean = false
  private isWaitingForNextWave: boolean = false
  private waveTransitionTimer: number = 0

  private get isInWaveTransition(): boolean {
    return (
      this.isWaitingForClearAnnouncement ||
      this.isWaveClearing ||
      this.isPowerUpSelecting ||
      this.isWaitingForNextWave
    )
  }

  // パワーアップ
  public isPowerUpSelecting: boolean = false
  public powerUpReason: 'wave' | 'level' | null = null
  public currentPowerUpOptions: PowerUp[] = []
  private availablePowerUps: PowerUp[] = []
  public rarityBonus: number = 0
  public powerUpLevels: Record<string, number> = {}

  // スポーンタイマー
  private enemySpawnTimer: number = 0
  private enemySpawnInterval: number = 120

  // ホーミングレーザー
  private homingLaserTimer: number = 0

  public isGameActive: boolean = false
  public isPaused: boolean = false

  public get powerUps(): PowerUp[] {
    return this.availablePowerUps
  }

  /**
   * 初期化
   */
  public async init(scene: THREE.Scene, screenWidth: number, screenHeight: number): Promise<void> {
    this.scene = scene
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight

    // 状態リセット
    this.objects = []
    this.isGameOver = false
    this.isGameActive = false
    this.gameOverTimer = 0
    this.score = 0
    this.playerLevel = 0
    this.scoreForNextPowerUp = 1000
    this.currentPowerUpInterval = 1000
    this.pendingPowerUpSelections = 0
    this.isWaitingForNextWaveTriggerPending = false
    this.currentWave = 0
    this.waveEnemiesSpawned = 0
    this.totalEnemiesInWave = 0
    this.isWaveClearing = false
    this.isWaitingForClearAnnouncement = false
    this.isSpawningDelayed = false
    this.isWaitingForNextWave = false
    this.waveTransitionTimer = 0
    this.hasTriggeredMassiveExplosion = false
    this.powerUpReason = null
    this.rarityBonus = 0
    this.powerUpLevels = {}
    this.powerUpListEntries = []
    this.announcementText = ''
    this.announcementAlpha = 0
    this.shakeOffset = { x: 0, y: 0 }

    this.minimap = new Minimap()

    // 弾生成コールバック
    const spawnBullet = (
      x: number,
      y: number,
      angle: number,
      side?: 'player' | 'enemy',
    ) => {
      this.spawnBullet(
        x,
        y,
        angle,
        side || 'player',
        this.player.bulletSpeedMultiplier,
        this.player.bulletDamage,
        this.player.bulletPiercing,
      )
    }

    // レーザー
    this.laser = new Laser(0, 0)
    this.addObject(this.laser)

    // モデルの読み込み
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync('/models/fighter.glb').catch((e: Error) => {
      console.error('Failed to load fighter model:', e)
      return null
    })
    const playerModel = gltf ? gltf.scene : undefined
    this.sharedBaseModel = playerModel || null

    // 敵機用モデルの読み込み
    const enemyGltf = await loader.loadAsync('/models/Enemy.glb').catch((e: Error) => {
      console.error('Failed to load enemy model:', e)
      return null
    })
    if (enemyGltf) {
      const wrapper = new THREE.Group()
      // X軸周りで90度反時計回りに回転
      enemyGltf.scene.rotation.x = Math.PI / 2
      wrapper.add(enemyGltf.scene)
      this.enemyBaseModel = wrapper
    } else {
      this.enemyBaseModel = null
    }

    // 自機
    this.player = new Player(
      0,
      0,
      spawnBullet,
      this.spawnAfterimage.bind(this),
      this.spawnPlayerHomingMissile.bind(this),
      playerModel,
    )
    this.player.screenWidth = screenWidth
    this.player.screenHeight = screenHeight
    scene.add(this.player.mesh)

    // 背景オブジェクト
    for (let i = 0; i < 50; i++) {
      const x = (Math.random() - 0.5) * WORLD_SIZE
      const y = (Math.random() - 0.5) * WORLD_SIZE
      this.addObject(new BackgroundObject(x, y))
    }

    this.initPowerUps()
  }

  public startWithDebug(powerUpLevels: Record<string, number>, startWave: number): void {
    this.currentWave = startWave - 1
    for (const [id, level] of Object.entries(powerUpLevels)) {
      const powerUp = this.availablePowerUps.find((p) => p.id === id)
      if (powerUp && level > 0) {
        for (let i = 0; i < level; i++) powerUp.effect(this)
        this.powerUpLevels[id] = level
      }
    }
    this.updatePowerUpListEntries()
    this.nextWave()
    this.isGameActive = true
  }

  private static readonly EXCLUSIVE_SHOT_IDS = ['3way', '5way', 'wide', 'piercing'] as const

  private resetExclusiveShotGroup(selectedId: string): void {
    for (const id of GameManager.EXCLUSIVE_SHOT_IDS) {
      if (id !== selectedId) delete this.powerUpLevels[id]
    }
    if (selectedId === 'piercing') {
      this.player.weaponType = 'normal'
    } else {
      this.player.bulletPiercing = false
    }
  }

  private initPowerUps(): void {
    this.availablePowerUps = [
      {
        id: 'hp_up',
        name: 'HP上限アップ',
        description: '最大HPが5増加し、全回復します',
        rarity: 1,
        maxLevel: 20,
        effect: (gm) => {
          gm.player.maxHp += 5
          gm.player.hp = gm.player.maxHp
        },
      },
      {
        id: '3way',
        name: '3-Way Shot',
        description: 'メイン武器が3方向に発射されます',
        rarity: 2,
        maxLevel: 1,
        effect: (gm) => {
          gm.resetExclusiveShotGroup('3way')
          gm.player.weaponType = '3way'
        },
      },
      {
        id: '5way',
        name: '5-Way Shot',
        description: 'メイン武器が5方向に発射されます',
        rarity: 3,
        maxLevel: 1,
        effect: (gm) => {
          gm.resetExclusiveShotGroup('5way')
          gm.player.weaponType = '5way'
        },
      },
      {
        id: 'wide',
        name: 'Wide Shot',
        description: 'メイン武器が並列に5発発射されます',
        rarity: 3,
        maxLevel: 1,
        effect: (gm) => {
          gm.resetExclusiveShotGroup('wide')
          gm.player.weaponType = 'wide'
        },
      },
      {
        id: 'laser_dmg',
        name: 'レーザー威力アップ',
        description: 'レーザーのダメージが1.2倍になります',
        rarity: 2,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.laserDamageMultiplier *= 1.2
        },
      },
      {
        id: 'laser_width',
        name: 'レーザー太さアップ',
        description: 'レーザーが太くなり、当たり判定が広がります',
        rarity: 1,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.laserWidthMultiplier *= 1.4
        },
      },
      {
        id: 'laser_power_max',
        name: 'パワー上限アップ',
        description: 'レーザーパワーの最大値が100増加します',
        rarity: 1,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.maxLaserPower += 100
          gm.player.laserPower = gm.player.maxLaserPower
        },
      },
      {
        id: 'laser_recovery',
        name: 'パワー回復量アップ',
        description: 'レーザーパワーの回復速度が1.2倍になります',
        rarity: 3,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.laserPowerRecoveryMultiplier *= 1.2
        },
      },
      {
        id: 'laser_eco',
        name: 'パワー消費量軽減',
        description: 'レーザーとブーストのパワー消費が10%軽減されます',
        rarity: 2,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.laserConsumptionMultiplier *= 0.9
        },
      },
      {
        id: 'bullet_dmg',
        name: '通常弾攻撃力アップ',
        description: '通常弾のダメージが+1增加します',
        rarity: 1,
        maxLevel: 10,
        effect: (gm) => {
          gm.player.bulletDamage += 1
        },
      },
      {
        id: 'bullet_speed',
        name: '弾速アップ',
        description: '通常弾の弾速が20%増加します',
        rarity: 1,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.bulletSpeedMultiplier *= 1.2
        },
      },
      {
        id: 'fire_rate',
        name: '連射速度アップ',
        description: 'メイン武器の発射間隔が15%短くなります',
        rarity: 2,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.fireRateMultiplier *= 0.85
        },
      },
      {
        id: 'piercing',
        name: '貫通弾',
        description: '弾丸が敵を貫通し、後方の敵にもダメージを与えます',
        rarity: 3,
        maxLevel: 1,
        effect: (gm) => {
          gm.resetExclusiveShotGroup('piercing')
          gm.player.bulletPiercing = true
        },
      },
      {
        id: 'damage_reduction',
        name: 'ダメージ軽減',
        description: '受けるダメージを10%カットします',
        rarity: 2,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.damageReductionMultiplier *= 0.9
        },
      },
      {
        id: 'speed_up',
        name: '最高速度アップ',
        description: '自機の最高速度が15%アップします',
        rarity: 1,
        maxLevel: 5,
        effect: (gm) => {
          gm.player.maxSpeed *= 1.15
        },
      },
      // {
      //   id: 'homing_laser',
      //   name: 'ホーミングレーザー',
      //   description:
      //     'メインレーザー発射中、敵を追尾するレーザーを自動で発射します',
      //   rarity: 3,
      //   maxLevel: 5,
      //   effect: (_gm) => { },
      // },
    ]
  }

  private addObject(obj: GameObject): void {
    this.objects.push(obj)
    this.scene?.add(obj.mesh)
  }

  private spawnBullet(
    x: number,
    y: number,
    angle: number,
    side: 'player' | 'enemy',
    speedMultiplier: number = 1,
    damage: number = 1,
    isPiercing: boolean = false,
  ): void {
    this.addObject(new Bullet(x, y, angle, side, speedMultiplier, damage, isPiercing))
  }

  private spawnAfterimage(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    life: number = 20,
    color: number = 0xffffff,
    alpha: number = 1.0,
  ): void {
    this.addObject(new Afterimage(x1, y1, x2, y2, life, color, alpha))
  }

  private spawnHomingMissile(x: number, y: number, angle: number): void {
    const missile = new HomingMissile(
      x,
      y,
      angle,
      this.player,
      this.spawnAfterimage.bind(this),
      'enemy',
    )
    this.addObject(missile)
  }

  private spawnPlayerHomingMissile(x: number, y: number): boolean {
    // 最も近い敵を探す
    let nearestEnemy: GameObject | null = null
    let minDist = 300 // 射程距離

    for (const obj of this.objects) {
      if (obj.isAlive && obj.side === 'enemy' && obj.radius > 0) {
        let dx = obj.position.x - x
        let dy = obj.position.y - y
        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < minDist) {
          minDist = d
          nearestEnemy = obj
        }
      }
    }

    if (!nearestEnemy) return false

    // Wave に応じた発射数とクールタイムの計算
    // 数: Wave 1-2 で 2発、Wave 2ごとに +1 (最大 8)
    const count = Math.min(8, 2 + Math.floor((this.currentWave - 1) / 2))
    // クールタイム: 10秒から 0.2秒ずつ短縮 (最小 8秒)
    const cooldownSec = Math.max(8, 10 - (this.currentWave - 1) * 0.2)
    const cooldownFrames = cooldownSec * 60

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i
      const missile = new HomingMissile(
        x,
        y,
        angle,
        nearestEnemy,
        this.spawnAfterimage.bind(this),
        'player',
      )
      this.addObject(missile)
    }

    this.player.homingCooldown = cooldownFrames
    return true
  }

  private nextWave(): void {
    if (this.isWaveClearing) return
    this.currentWave++
    this.waveEnemiesSpawned = 0
    const enemyCounts = [0, 3, 5, 8, 12, 15]
    this.totalEnemiesInWave =
      enemyCounts[this.currentWave] ?? 15 + (this.currentWave - 5) * 5

    const isBossWave = this.currentWave % 5 === 0
    const text = isBossWave
      ? `WAVE ${this.currentWave} BOSS START`
      : `WAVE ${this.currentWave} START`
    this.showAnnouncement(text, 240)
  }

  private clearWave(): void {
    if (this.player.isAlive) {
      this.player.hp = this.player.maxHp
      this.player.laserPower = this.player.maxLaserPower
      this.player.isLaserOverheated = false
    }
    // 敵の弾と誘導弾を消去
    for (const obj of this.objects) {
      if ((obj instanceof Bullet && obj.side === 'enemy') || obj instanceof HomingMissile) {
        obj.isAlive = false
      }
    }
    this.pendingPowerUpSelections++
    this.powerUpReason = 'wave'
    this.isWaitingForNextWaveTriggerPending = true
    if (!this.isPowerUpSelecting) this.generatePowerUpOptions()
  }

  public generatePowerUpOptions(): void {
    this.isPaused = true
    this.isPowerUpSelecting = true

    const options: PowerUp[] = []
    const pool = this.availablePowerUps
      .filter((p) => {
        const current = this.powerUpLevels[p.id] || 0
        return !p.maxLevel || current < p.maxLevel
      })
      .map((p) => ({ ...p, currentLevel: this.powerUpLevels[p.id] || 0 }))

    const getWeight = (rarity: number = 1): number => {
      switch (rarity) {
        case 1:
          return 100
        case 2:
          return 30 + this.rarityBonus * 20
        case 3:
          return 10 + this.rarityBonus * 15
        default:
          return 100
      }
    }

    for (let i = 0; i < 3; i++) {
      if (pool.length === 0) break
      const totalWeight = pool.reduce(
        (sum, p) => sum + (p ? getWeight(p.rarity) : 0),
        0,
      )
      let rand = Math.random() * totalWeight
      let selectedIndex = 0
      for (let j = 0; j < pool.length; j++) {
        const item = pool[j]
        if (!item) continue
        rand -= getWeight(item.rarity)
        if (rand <= 0) {
          selectedIndex = j
          break
        }
      }
      const powerUp = pool.splice(selectedIndex, 1)[0]
      if (powerUp) options.push(powerUp)
    }

    options.push({
      id: 'skip',
      name: '強化しない',
      description: '次回の強化でレア度が高い項目が出やすくなります。',
      rarity: 0,
      effect: (gm) => {
        gm.rarityBonus += 1
      },
    })

    this.currentPowerUpOptions = options
    this.isPowerUpSelecting = true
  }

  public selectPowerUp(index: number): void {
    const powerUp = this.currentPowerUpOptions[index]
    if (powerUp) {
      powerUp.effect(this)
      if (powerUp.id && powerUp.id !== 'skip') {
        this.rarityBonus = 0
        this.powerUpLevels[powerUp.id] = (this.powerUpLevels[powerUp.id] ?? 0) + 1
      }
      this.updatePowerUpListEntries()
      this.pendingPowerUpSelections--

      if (this.pendingPowerUpSelections > 0) {
        this.generatePowerUpOptions()
      } else {
        this.isPowerUpSelecting = false
        this.powerUpReason = null
        this.isPaused = false
        this.currentPowerUpOptions = []
        if (this.isWaitingForNextWaveTriggerPending) {
          this.isWaitingForNextWaveTriggerPending = false
          this.isWaitingForNextWave = true
          this.showAnnouncement('', 60)
        }
      }
    }
  }

  private showAnnouncement(text: string, duration: number): void {
    this.announcementText = text
    this.announcementAlpha = text === '' ? 0 : 0.5
    this.waveTransitionTimer = duration
  }

  private updateWaveAnnouncement(delta: number): void {
    if (this.waveTransitionTimer > 0) {
      this.waveTransitionTimer -= delta
      if (this.waveTransitionTimer < 60) {
        this.announcementAlpha = (this.waveTransitionTimer / 60) * 0.7
      } else {
        this.announcementAlpha = 0.7
      }
    } else if (
      this.announcementText !== '' ||
      this.isWaitingForClearAnnouncement ||
      this.isWaveClearing ||
      this.isSpawningDelayed ||
      this.isWaitingForNextWave
    ) {
      const previousText = this.announcementText
      this.announcementAlpha = 0
      this.announcementText = ''

      if (this.isWaitingForClearAnnouncement) {
        this.isWaitingForClearAnnouncement = false
        this.clearWave()
      } else if (previousText.includes('START')) {
        this.isSpawningDelayed = true
        this.showAnnouncement('', 180)
      } else if (previousText === '') {
        if (this.isSpawningDelayed) {
          this.isSpawningDelayed = false
        } else if (this.isWaitingForNextWave) {
          this.isWaitingForNextWave = false
          this.nextWave()
        }
      }
    }
  }

  private addScore(amount: number): void {
    this.score += amount

    let leveledUp = false
    while (this.score >= this.scoreForNextPowerUp) {
      this.playerLevel++
      this.player.hp = this.player.maxHp // レベルアップ時に体力全回復
      this.pendingPowerUpSelections++
      this.powerUpReason = 'level'
      this.currentPowerUpInterval += 500
      this.scoreForNextPowerUp += this.currentPowerUpInterval
      leveledUp = true
    }

    if (leveledUp && !this.isPowerUpSelecting) {
      this.generatePowerUpOptions()
    }
  }

  private updatePowerUpListEntries(): void {
    this.powerUpListEntries = []
    for (const pu of this.availablePowerUps) {
      const level = this.powerUpLevels[pu.id] || 0
      if (level <= 0) continue
      if (pu.maxLevel && pu.maxLevel > 1) {
        this.powerUpListEntries.push(`${pu.name} Lv.${level}`)
      } else {
        this.powerUpListEntries.push(pu.name)
      }
    }
  }

  private spawnHomingExplosion(
    x: number,
    y: number,
    vx: number = 0,
    vy: number = 0,
    scale: number = 2.25,
    duration: number = 30,
  ): void {
    this.addObject(new HomingExplosion(x, y, scale, duration, vx, vy))
  }

  /**
   * 毎フレーム更新
   */
  public update(delta: number, input: InputState): void {
    if (this.isPaused) return
    if (this.isGameOver) return

    // --- ゲームオーバー演出中 ---
    if (!this.player.isAlive && !this.isGameOver) {
      if (this.gameOverTimer <= 0) {
        this.gameOverTimer = 180
        this.hasTriggeredMassiveExplosion = false
        this.spawnHitEffect(
          this.player.position.x,
          this.player.position.y,
          0xffaa00,
          this.player.velocity.x,
          this.player.velocity.y,
        )
        this.shakeFrames = 30
      }

      this.gameOverTimer -= delta

      if (this.gameOverTimer > 120) {
        if (Math.random() < 0.15) {
          const exX = this.player.position.x + (Math.random() - 0.5) * 80
          const exY = this.player.position.y + (Math.random() - 0.5) * 80
          const colors = [0xff8800, 0xffaa00, 0xff3300, 0xffffff]
          const color = colors[Math.floor(Math.random() * colors.length)] ?? 0xff8800
          this.spawnExplosion(exX, exY, color, 1.0 + Math.random(), 20 + Math.random() * 20, true)
          for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 5 + Math.random() * 10
            this.addObject(
              new Particle(exX, exY, Math.cos(angle) * speed, Math.sin(angle) * speed, 20 + Math.random() * 20, color, 3),
            )
          }
          this.shakeFrames = 15
        }
      } else if (this.gameOverTimer > 0) {
        if (!this.hasTriggeredMassiveExplosion) {
          const cx = this.player.position.x
          const cy = this.player.position.y
          this.spawnExplosion(cx, cy, 0xffffff, 4.0, 40, true)
          const explosionCount = 3 + Math.floor(Math.random() * 3)
          for (let i = 0; i < explosionCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const dist = 40 + Math.random() * 60
            this.spawnExplosion(
              cx + Math.cos(angle) * dist,
              cy + Math.sin(angle) * dist,
              0xffaa00,
              2.0 + Math.random() * 2.0,
              30 + Math.random() * 20,
              true,
            )
          }
          const particleCount = 80 + Math.floor(Math.random() * 40)
          for (let n = 0; n < particleCount; n++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 5 + Math.random() * 25
            const baseLife = 40 + Math.random() * 40
            const colors = [0xffffff, 0xffaa00, 0xff5500, 0x00ffff]
            const pColor = colors[Math.floor(Math.random() * colors.length)]
            this.addObject(
              new Particle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, baseLife, pColor, 3 + Math.random() * 3),
            )
          }
          // 自機メッシュを非表示
          this.player.mesh.visible = false
          this.shakeFrames = 60
          this.hasTriggeredMassiveExplosion = true
        }
      } else {
        this.isGameOver = true
        return
      }
    }

    if (this.player.isAlive) {
      this.player.mesh.visible = this.isGameActive
      this.laser.mesh.visible = this.isGameActive
    }

    // 画面シェイク
    if (this.shakeFrames > 0) {
      this.shakeFrames -= delta
      this.shakeOffset = {
        x: (Math.random() - 0.5) * 10,
        y: (Math.random() - 0.5) * 10,
      }
    } else {
      this.shakeOffset = { x: 0, y: 0 }
    }

    // 1. Player 更新
    const isLaserFiring = this.laser.state === LaserState.FIRING
    this.player.updateLaserPower(delta, isLaserFiring, this.player.isBoosting)

    let laserTrigger = input.laser
    if (this.player.laserPower <= 0 || this.player.isLaserOverheated) laserTrigger = false

    this.player.currentWave = this.currentWave
    this.player.update(delta, input)
    this.laser.updateFromPlayer(
      this.player.position.x,
      this.player.position.y,
      this.player.rotation,
    )
    this.laser.thickness = 3 * this.player.laserWidthMultiplier
    this.laser.setTrigger(laserTrigger)

    if ((this.powerUpLevels['homing_laser'] || 0) > 0) {
      this.laser.mesh.visible = false
      if (laserTrigger) this.laser.state = LaserState.FIRING
    }

    this.updateHomingLaser(delta)

    // レーザー演出（パーティクル）
    if (
      this.laser.state === LaserState.CHARGING ||
      this.laser.state === LaserState.FIRING
    ) {
      const tipX = this.player.position.x + Math.sin(this.player.rotation) * 20
      const tipY = this.player.position.y - Math.cos(this.player.rotation) * 20
      const intensity =
        this.laser.state === LaserState.CHARGING ? this.laser.chargeProgress : 1.0
      const pCount =
        Math.floor(intensity * 3) + (Math.random() < (intensity * 3) % 1 ? 1 : 0)
      for (let i = 0; i < pCount; i++) {
        const angle = this.player.rotation + (Math.random() - 0.5) * 1.5
        const speed = 2 + Math.random() * 5
        this.addObject(
          new Particle(
            tipX,
            tipY,
            Math.sin(angle) * speed,
            -Math.cos(angle) * speed,
            10 + Math.random() * 10,
            0x00ffff,
            2,
          ),
        )
      }
    }

    // ブースト演出
    if (this.player.isBoosting) {
      const rearX = this.player.position.x - Math.sin(this.player.rotation) * 15
      const rearY = this.player.position.y + Math.cos(this.player.rotation) * 15
      const pCount = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < pCount; i++) {
        const angle = this.player.rotation + Math.PI + (Math.random() - 0.5) * 0.8
        const speed = 5 + Math.random() * 10
        const color = Math.random() < 0.7 ? 0x00ffff : 0xffaa00
        this.addObject(
          new Particle(
            rearX,
            rearY,
            Math.sin(angle) * speed,
            -Math.cos(angle) * speed,
            15 + Math.random() * 15,
            color,
            2 + Math.random() * 2,
          ),
        )
      }
      this.shakeFrames = Math.max(this.shakeFrames, 2)
    }

    // 2. Wave 管理
    if (this.isGameActive && this.player.isAlive) {
      if (this.currentWave === 0 && !this.isWaveClearing) this.nextWave()

      this.updateWaveAnnouncement(delta)

      if (
        !this.isWaveClearing &&
        !this.isWaitingForClearAnnouncement &&
        !this.isSpawningDelayed &&
        !this.isWaitingForNextWave &&
        !this.isPowerUpSelecting &&
        this.waveTransitionTimer <= 0 &&
        this.waveEnemiesSpawned < this.totalEnemiesInWave
      ) {
        this.enemySpawnTimer -= delta
        if (this.enemySpawnTimer <= 0) {
          const enemyCount = this.objects.filter(
            (obj) => (obj instanceof Fighter || obj instanceof MissileFlower) && obj.isAlive,
          ).length
          const maxSimultaneous = 5 + Math.floor(this.currentWave / 2)
          if (enemyCount < maxSimultaneous) this.spawnEnemy()
          this.enemySpawnTimer = Math.max(30, 120 - this.currentWave * 5)
        }
      }

      if (
        !this.isWaveClearing &&
        !this.isWaitingForClearAnnouncement &&
        !this.isWaitingForNextWave &&
        !this.isPowerUpSelecting &&
        this.waveTransitionTimer <= 0 &&
        this.waveEnemiesSpawned >= this.totalEnemiesInWave &&
        this.totalEnemiesInWave > 0
      ) {
        const enemyCount = this.objects.filter(
          (obj) => (obj instanceof Fighter || obj instanceof MissileFlower) && obj.isAlive,
        ).length
        if (enemyCount === 0) {
          this.isWaitingForClearAnnouncement = true
          this.showAnnouncement('', 180)
        }
      }
    }

    // 3. 全オブジェクト更新 & 当たり判定
    if (this.isGameActive || this.gameOverTimer > 0) {
      this.checkCollisions(delta)

      for (const obj of this.objects) {
        if (obj.isAlive) obj.update(delta)
        if (obj instanceof HomingMissile && obj.shouldExplode) {
          if (obj.isMaxDistanceExplosion) {
            this.spawnHomingExplosion(
              obj.position.x,
              obj.position.y,
              obj.velocity.x,
              obj.velocity.y,
              2.25 / 4,
              30 / 4,
            )
          } else {
            this.spawnHomingExplosion(
              obj.position.x,
              obj.position.y,
              obj.velocity.x,
              obj.velocity.y,
            )
          }
          obj.shouldExplode = false
        }
      }

      this.cleanup()

      // 4. 表示更新（カメラ追従）
      const cameraX = this.player.position.x
      const cameraY = this.player.position.y
      for (const obj of this.objects) obj.updateDisplay(cameraX, cameraY)
      this.player.updateDisplay(cameraX, cameraY)

      // 5. ミニマップ更新
      this.minimap.update(this.player, this.objects)
    }
  }

  public get minimapDots() {
    return this.minimap.dots
  }

  public get hpPercent(): number {
    return (this.player.hp / this.player.maxHp) * 100
  }

  public get powerPercent(): number {
    return (this.player.laserPower / this.player.maxLaserPower) * 100
  }

  public resize(width: number, height: number): void {
    this.screenWidth = width
    this.screenHeight = height
    if (this.player) {
      this.player.screenWidth = width
      this.player.screenHeight = height
    }
  }


  private spawnEnemy(): void {
    if (!this.scene) return
    this.waveEnemiesSpawned++

    const aceRate = this.currentWave >= 4 ? Math.min(0.4, (this.currentWave - 3) * 0.1) : 0
    const sniperRate = Math.min(0.8, (this.currentWave - 1) * 0.15)

    const angle = Math.random() * Math.PI * 2
    const dist = 800 + Math.random() * 400
    const x = this.player.position.x + Math.sin(angle) * dist
    const y = this.player.position.y - Math.cos(angle) * dist

    const rand = Math.random()
    if (rand < aceRate) {
      const model = this.enemyBaseModel ? SkeletonUtils.clone(this.enemyBaseModel) : undefined
      this.addObject(
        new AceFighter(
          x,
          y,
          this.player,
          (ex, ey, ea) => this.spawnBullet(ex, ey, ea, 'enemy'),
          (obj) => this.addObject(obj),
          this.spawnAfterimage.bind(this),
          this.currentWave,
          model,
        ),
      )
    } else if (rand < aceRate + sniperRate) {
      this.addObject(
        new MissileFlower(
          x,
          y,
          this.player,
          (ex, ey, ea) => this.spawnHomingMissile(ex, ey, ea),
          this.currentWave,
        ),
      )
    } else {
      const model = this.enemyBaseModel ? SkeletonUtils.clone(this.enemyBaseModel) : undefined
      this.addObject(
        new Fighter(
          x,
          y,
          this.player,
          (ex, ey, ea) => this.spawnBullet(ex, ey, ea, 'enemy'),
          this.currentWave,
          model,
        ),
      )
    }
  }

  private checkCollisions(delta: number): void {
    const bullets = this.objects.filter(
      (obj) => obj instanceof Bullet && obj.isAlive,
    ) as Bullet[]
    const enemies = this.objects.filter(
      (obj) =>
        (obj instanceof Fighter || obj instanceof MissileFlower) && obj.isAlive,
    ) as (Fighter | MissileFlower)[]

    // レーザー vs 敵機
    if (
      this.laser.state === LaserState.FIRING &&
      (this.powerUpLevels['homing_laser'] || 0) <= 0
    ) {
      const start = this.player.position
      const end = this.laser.getEndPoint()
      for (const enemy of enemies) {
        if (
          this.lineCircleTest(
            start.x,
            start.y,
            end.x,
            end.y,
            enemy.position.x,
            enemy.position.y,
            enemy.radius,
          )
        ) {
          enemy.takeDamage(10 * this.player.laserDamageMultiplier)
          this.spawnHitEffect(
            enemy.position.x,
            enemy.position.y,
            0xffffff,
            enemy.velocity.x,
            enemy.velocity.y,
          )
          if (!enemy.isAlive) {
            this.spawnDestructionEffect(
              enemy.position.x,
              enemy.position.y,
              enemy.velocity.x,
              enemy.velocity.y,
            )
            this.addScore(enemy instanceof AceFighter ? 2000 : enemy instanceof MissileFlower ? 1000 : 300)
          }
        }
      }
    }

    for (const bullet of bullets) {
      if (bullet.side === 'player') {
        for (const enemy of enemies) {
          if (this.hitTest(bullet, enemy)) {
            if (!bullet.isPiercing) bullet.isAlive = false
            enemy.takeDamage(bullet.damage)
            this.spawnHitEffect(
              bullet.position.x,
              bullet.position.y,
              0xffffff,
              bullet.velocity.x,
              bullet.velocity.y,
            )
            this.addScore(10)
            if (!enemy.isAlive) {
              this.spawnDestructionEffect(
                enemy.position.x,
                enemy.position.y,
                enemy.velocity.x,
                enemy.velocity.y,
              )
              this.addScore(enemy instanceof AceFighter ? 2000 : enemy instanceof MissileFlower ? 1000 : 300)
            }
            if (!bullet.isPiercing) break
          }
        }
      } else {
        if (!this.isInWaveTransition && this.hitTest(bullet, this.player)) {
          bullet.isAlive = false
          this.player.takeDamage(1)
          this.shakeFrames = 10
          this.spawnHitEffect(
            bullet.position.x,
            bullet.position.y,
            0xffff00,
            bullet.velocity.x,
            bullet.velocity.y,
          )
        }
      }
    }

    for (const enemy of enemies) {
      if (this.hitTest(this.player, enemy)) {
        if (!this.isInWaveTransition) {
          this.player.takeDamage(2)
          this.shakeFrames = 15
        }
        const dx = this.player.position.x - enemy.position.x
        const dy = this.player.position.y - enemy.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          const nx = dx / dist
          const ny = dy / dist
          const bounceForce = 20
          this.player.velocity.x += nx * bounceForce
          this.player.velocity.y += ny * bounceForce
          enemy.velocity.x -= nx * bounceForce
          enemy.velocity.y -= ny * bounceForce
          const overlap = this.player.radius + enemy.radius - dist
          if (overlap > 0) {
            this.player.position.x += nx * overlap * 0.5
            this.player.position.y += ny * overlap * 0.5
            enemy.position.x -= nx * overlap * 0.5
            enemy.position.y -= ny * overlap * 0.5
          }
        }
        this.spawnHitEffect(
          (this.player.position.x + enemy.position.x) / 2,
          (this.player.position.y + enemy.position.y) / 2,
          0xffaa00,
          (this.player.velocity.x + enemy.velocity.x) / 2,
          (this.player.velocity.y + enemy.velocity.y) / 2,
        )
      }
    }

    const missiles = this.objects.filter(
      (obj) => obj instanceof HomingMissile && obj.isAlive,
    ) as HomingMissile[]
    const homingExplosions = this.objects.filter(
      (obj) => obj instanceof HomingExplosion && obj.isAlive,
    ) as HomingExplosion[]

    for (const missile of missiles) {
      if (this.laser.state === LaserState.FIRING) {
        const start = this.player.position
        const end = this.laser.getEndPoint()
        if (
          this.lineCircleTest(
            start.x,
            start.y,
            end.x,
            end.y,
            missile.position.x,
            missile.position.y,
            missile.radius,
          )
        ) {
          missile.isAlive = false
          missile.shouldExplode = true
          this.addScore(10)
          this.spawnHitEffect(
            missile.position.x,
            missile.position.y,
            0xffffff,
            missile.velocity.x,
            missile.velocity.y,
          )
        }
      }
      for (const bullet of bullets) {
        if (bullet.side === 'player' && this.hitTest(bullet, missile)) {
          bullet.isAlive = false
          this.addScore(10)
          missile.hp -= 1
          if (missile.hp <= 0) {
            missile.isAlive = false
            missile.shouldExplode = true
            this.addScore(10)
          }
          this.spawnHitEffect(
            missile.position.x,
            missile.position.y,
            0xffffff,
            missile.velocity.x,
            missile.velocity.y,
          )
        }
      }
      if (this.hitTest(missile, this.player)) {
        missile.isAlive = false
        missile.shouldExplode = true
      }
    }

    for (const ex of homingExplosions) {
      if (!this.isInWaveTransition && this.hitTest(ex, this.player)) {
        if (ex.canDealDamage(this.player)) {
          this.player.takeDamage(ex.damage)
          this.shakeFrames = 20
          this.spawnHitEffect(
            this.player.position.x,
            this.player.position.y,
            0xffaa00,
            this.player.velocity.x,
            this.player.velocity.y,
          )
        }
      }
      for (const enemy of enemies) {
        if (this.hitTest(ex, enemy)) {
          if (ex.canDealDamage(enemy)) {
            enemy.takeDamage(ex.damage)
            this.spawnHitEffect(
              enemy.position.x,
              enemy.position.y,
              0xffaa00,
              enemy.velocity.x,
              enemy.velocity.y,
            )
            if (!enemy.isAlive) {
              this.spawnDestructionEffect(
                enemy.position.x,
                enemy.position.y,
                enemy.velocity.x,
                enemy.velocity.y,
              )
              this.addScore(enemy instanceof AceFighter ? 2000 : enemy instanceof MissileFlower ? 1000 : 300)
            }
          }
        }
      }
      for (const missile of missiles) {
        if (this.hitTest(ex, missile)) {
          if (ex.canDealDamage(missile)) {
            missile.takeDamage(ex.damage)
            if (!missile.isAlive) missile.shouldExplode = true
            this.spawnHitEffect(
              missile.position.x,
              missile.position.y,
              0xffaa00,
              missile.velocity.x,
              missile.velocity.y,
            )
          }
        }
      }
    }

    const homingLasers = this.objects.filter(
      (obj) => obj instanceof HomingLaser && obj.isAlive,
    ) as HomingLaser[]
    for (const hl of homingLasers) {
      for (const enemy of enemies) {
        if (this.hitTest(hl, enemy)) {
          enemy.takeDamage(hl.damage)
          this.spawnHitEffect(
            hl.position.x,
            hl.position.y,
            0xffff00,
            hl.velocity.x,
            hl.velocity.y,
          )
          hl.isAlive = false
          if (!enemy.isAlive) {
            this.spawnDestructionEffect(
              enemy.position.x,
              enemy.position.y,
              enemy.velocity.x,
              enemy.velocity.y,
            )
            this.addScore(enemy instanceof AceFighter ? 2000 : enemy instanceof MissileFlower ? 1000 : 300)
          }
          break
        }
      }
    }
  }

  private spawnHitEffect(
    x: number,
    y: number,
    color: number = 0xffffff,
    sourceVx: number = 0,
    sourceVy: number = 0,
  ): void {
    this.spawnExplosion(x, y, color, 0.3, 10, true, -sourceVx, -sourceVy)
    const reflectAngle = Math.atan2(-sourceVy, -sourceVx)
    const particleCount = 8 + Math.floor(Math.random() * 8)
    for (let i = 0; i < particleCount; i++) {
      const angle = reflectAngle + (Math.random() - 0.5) * Math.PI * 0.8
      const speed = 3 + Math.random() * 12
      this.addObject(
        new Particle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          15 + Math.random() * 10,
          color,
          2,
        ),
      )
    }
  }

  private spawnDestructionEffect(
    x: number,
    y: number,
    sourceVx: number = 0,
    sourceVy: number = 0,
  ): void {
    this.spawnExplosion(x, y, 0xff8800, 1.5, 30, true, sourceVx, sourceVy)
    const particleCount = 20 + Math.floor(Math.random() * 10)
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 3 + Math.random() * 8
      this.addObject(
        new Particle(
          x,
          y,
          Math.cos(angle) * speed + sourceVx,
          Math.sin(angle) * speed + sourceVy,
          20 + Math.random() * 20,
          0xffaa00,
          3,
        ),
      )
    }
  }

  private spawnExplosion(
    x: number,
    y: number,
    color: number,
    scale: number,
    duration: number,
    isFlashy: boolean = false,
    vx: number = 0,
    vy: number = 0,
  ): void {
    this.addObject(new Explosion(x, y, color, scale, duration, isFlashy, vx, vy))
  }

  private lineCircleTest(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    r: number,
  ): boolean {
    const laserW = 4 * this.player.laserWidthMultiplier
    const combinedR = r + laserW

    let dcx = cx - x1
    let dcy = cy - y1
    if (dcx > WORLD_HALF) dcx -= WORLD_SIZE
    if (dcx < -WORLD_HALF) dcx += WORLD_SIZE
    if (dcy > WORLD_HALF) dcy -= WORLD_SIZE
    if (dcy < -WORLD_HALF) dcy += WORLD_SIZE

    const correctedCx = x1 + dcx
    const correctedCy = y1 + dcy

    const dx = x2 - x1
    const dy = y2 - y1
    const l2 = dx * dx + dy * dy
    if (l2 === 0) return false

    let t = ((correctedCx - x1) * dx + (correctedCy - y1) * dy) / l2
    t = Math.max(0, Math.min(1, t))

    const closestX = x1 + t * dx
    const closestY = y1 + t * dy
    const distSq = (correctedCx - closestX) ** 2 + (correctedCy - closestY) ** 2
    return distSq < combinedR * combinedR
  }

  private hitTest(a: GameObject, b: GameObject): boolean {
    let dx = a.position.x - b.position.x
    let dy = a.position.y - b.position.y
    if (dx > WORLD_HALF) dx -= WORLD_SIZE
    if (dx < -WORLD_HALF) dx += WORLD_SIZE
    if (dy > WORLD_HALF) dy -= WORLD_SIZE
    if (dy < -WORLD_HALF) dy += WORLD_SIZE
    const distance = Math.sqrt(dx * dx + dy * dy)
    return distance < (a.radius || 10) + (b.radius || 10)
  }

  private updateHomingLaser(delta: number): void {
    const level = this.powerUpLevels['homing_laser'] || 0
    if (level <= 0) return
    const interval = Math.max(8, 20 - (level - 1) * 3)
    if (this.laser.state !== LaserState.FIRING) {
      this.homingLaserTimer = interval
      return
    }
    this.homingLaserTimer += delta
    if (this.homingLaserTimer >= interval) {
      this.homingLaserTimer %= interval
      const enemies = this.objects.filter(
        (obj) => (obj instanceof Fighter || obj instanceof MissileFlower) && obj.isAlive,
      )
      if (enemies.length === 0) return

      let closestEnemy: GameObject | null = null
      let minDistSq = Infinity
      for (const enemy of enemies) {
        let dx = enemy.position.x - this.player.position.x
        let dy = enemy.position.y - this.player.position.y
        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE
        const distSq = dx * dx + dy * dy
        if (distSq < minDistSq) {
          minDistSq = distSq
          closestEnemy = enemy
        }
      }

      if (closestEnemy) {
        const offsetDegrees = [30, -30, 50, -50]
        for (const deg of offsetDegrees) {
          const angle = this.player.rotation + deg * (Math.PI / 180)
          const hl = new HomingLaser(
            this.player.position.x,
            this.player.position.y,
            angle,
            closestEnemy,
            this.spawnAfterimage.bind(this),
          )
          hl.damage = 2 + (level - 1) * 0.5
          this.addObject(hl)
        }
      }
    }
  }

  public destroy(): void {
    if (this.scene) {
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]!)
      }
    }
    this.objects.forEach((obj) => obj.destroy())
    this.objects = []
  }

  private cleanup(): void {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i]
      if (obj && !obj.isAlive) {
        obj.destroy()
        this.objects.splice(i, 1)
      }
    }
  }
}
