import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { BackgroundObject } from './BackgroundObject'
import { CollisionSystem } from './CollisionSystem'
import { GameObject, WORLD_SIZE } from './GameObject'
import { EnergyOrb } from './EnergyOrb'
import { HomingMissile } from './HomingMissile'
import { Laser, LaserState } from './Laser'
import { Minimap } from './Minimap'
import { Particle } from './Particle'
import { Player } from './Player'
import { PowerUpSystem } from './PowerUpSystem'
import { SpawnSystem } from './SpawnSystem'
import { WaveSystem } from './WaveSystem'
import type { InputState } from '~/composables/useInput'

export interface PowerUp {
  id: string
  name: string
  description: string
  effect: (gm: GameManager) => void
  rarity?: number
  maxLevel?: number
  currentLevel?: number
}

export class GameManager {
  private scene: THREE.Scene | null = null
  public player: Player = new Player(0, 0, () => {}, () => {}, () => false)
  public laser: Laser = new Laser(0, 0)
  public objects: GameObject[] = []
  private screenWidth: number = 0
  private screenHeight: number = 0
  private minimap: Minimap = new Minimap()
  private sharedBaseModel: THREE.Object3D | null = null
  public enemyBaseModel: THREE.Object3D | null = null

  public spawnSystem: SpawnSystem
  public powerUpSystem: PowerUpSystem
  public waveSystem: WaveSystem
  public collisionSystem: CollisionSystem

  private shakeFrames: number = 0
  public shakeOffset: { x: number; y: number } = { x: 0, y: 0 }

  public isGameOver: boolean = false
  private gameOverTimer: number = 0
  private hasTriggeredMassiveExplosion: boolean = false
  public gameOverWave: number = 0

  public score: number = 0
  public playerLevel: number = 0
  public levelUpEnergy: number = 0
  public energyForNextLevel: number = 60
  public currentEnergyInterval: number = 60
  public pendingPowerUpSelections: number = 0
  public isWaitingForNextWaveTriggerPending: boolean = false
  public powerUpListEntries: string[] = []

  public announcementText: string = ''
  public announcementAlpha: number = 0
  public bossWarningText: string = ''
  public isBossWarningActive: boolean = false
  public bossHp: number = 0
  public bossMaxHp: number = 0
  public isBossActive: boolean = false

  public currentWave: number = 0
  public waveEnemiesSpawned: number = 0
  public totalEnemiesInWave: number = 0
  public isWaveClearing: boolean = false
  public isWaitingForClearAnnouncement: boolean = false
  public isSpawningDelayed: boolean = false
  public isWaitingForNextWave: boolean = false
  public waveTransitionTimer: number = 0

  public isPowerUpSelecting: boolean = false
  public powerUpReason: 'wave' | 'level' | null = null
  public currentPowerUpOptions: PowerUp[] = []
  public availablePowerUps: PowerUp[] = []
  public rarityBonus: number = 0
  public powerUpLevels: Record<string, number> = {}

  public enemySpawnTimer: number = 0
  public enemySpawnInterval: number = 120
  public homingLaserTimer: number = 0

  public isGameActive: boolean = false
  public isPaused: boolean = false
  public isInitialized: boolean = false

  public constructor() {
    this.spawnSystem = new SpawnSystem(this)
    this.powerUpSystem = new PowerUpSystem(this)
    this.waveSystem = new WaveSystem(this)
    this.collisionSystem = new CollisionSystem(this)
  }

  public get isInWaveTransition(): boolean {
    return (
      this.isWaitingForClearAnnouncement ||
      this.isWaveClearing ||
      this.isPowerUpSelecting ||
      this.isWaitingForNextWave
    )
  }

  public get powerUps(): PowerUp[] {
    return this.availablePowerUps
  }

  public async init(scene: THREE.Scene, screenWidth: number, screenHeight: number): Promise<void> {
    this.scene = scene
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight
    this.resetState()

    this.minimap = new Minimap()

    const spawnBullet = (x: number, y: number, angle: number, side?: 'player' | 'enemy') => {
      this.spawnSystem.spawnBullet(
        x,
        y,
        angle,
        side || 'player',
        this.player.bulletSpeedMultiplier,
        this.player.bulletDamage,
        this.player.bulletPiercing,
      )
    }

    this.laser = new Laser(0, 0)
    this.addObject(this.laser)

    const loader = new GLTFLoader()
    const playerGltf = await loader.loadAsync('/models/fighter.glb').catch((e: Error) => {
      console.error('Failed to load fighter model:', e)
      return null
    })
    const playerModel = playerGltf ? playerGltf.scene : undefined
    this.sharedBaseModel = playerModel || null

    const enemyGltf = await loader.loadAsync('/models/enemy.glb').catch((e: Error) => {
      console.error('Failed to load enemy model:', e)
      return null
    })
    if (enemyGltf) {
      const wrapper = new THREE.Group()
      enemyGltf.scene.rotation.x = Math.PI / 2
      wrapper.add(enemyGltf.scene)
      this.enemyBaseModel = wrapper
    } else {
      this.enemyBaseModel = null
    }

    this.player = new Player(
      0,
      0,
      spawnBullet,
      this.spawnSystem.spawnAfterimage.bind(this.spawnSystem),
      this.spawnSystem.spawnPlayerHomingMissile.bind(this.spawnSystem),
      playerModel,
    )
    this.player.screenWidth = screenWidth
    this.player.screenHeight = screenHeight
    scene.add(this.player.mesh)

    for (let i = 0; i < 50; i++) {
      const x = (Math.random() - 0.5) * WORLD_SIZE
      const y = (Math.random() - 0.5) * WORLD_SIZE
      this.addObject(new BackgroundObject(x, y))
    }

    this.powerUpSystem.initPowerUps()
    this.isInitialized = true
  }

  public startWithDebug(powerUpLevels: Record<string, number>, startWave: number): void {
    this.currentWave = startWave - 1
    this.powerUpLevels = {}
    this.powerUpSystem.applyPowerUpLevels(powerUpLevels)
    this.waveSystem.startNextWave()
    this.isGameActive = true
  }

  public generatePowerUpOptions(): void {
    this.powerUpSystem.generatePowerUpOptions()
  }

  public selectPowerUp(index: number): void {
    this.powerUpSystem.selectPowerUp(index)
  }

  public update(delta: number, input: InputState): void {
    if (!this.isInitialized || this.isPaused || this.isGameOver) return

    if (!this.player.isAlive && !this.isGameOver) {
      if (this.gameOverTimer <= 0) {
        this.gameOverTimer = 180
        this.hasTriggeredMassiveExplosion = false
        this.spawnSystem.spawnHitEffect(
          this.player.position.x,
          this.player.position.y,
          0xffaa00,
          this.player.velocity.x,
          this.player.velocity.y,
        )
        this.setShakeFrames(30)
      }

      this.gameOverTimer -= delta

      if (this.gameOverTimer > 120) {
        if (Math.random() < 0.15) {
          const exX = this.player.position.x + (Math.random() - 0.5) * 80
          const exY = this.player.position.y + (Math.random() - 0.5) * 80
          const colors = [0xff8800, 0xffaa00, 0xff3300, 0xffffff]
          const color = colors[Math.floor(Math.random() * colors.length)] ?? 0xff8800
          this.spawnSystem.spawnExplosion(
            exX,
            exY,
            color,
            1.0 + Math.random(),
            20 + Math.random() * 20,
            true,
          )
          for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 5 + Math.random() * 10
            this.addObject(
              new Particle(
                exX,
                exY,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                20 + Math.random() * 20,
                color,
                3,
              ),
            )
          }
          this.setShakeFrames(15)
        }
      } else if (this.gameOverTimer > 0) {
        if (!this.hasTriggeredMassiveExplosion) {
          const cx = this.player.position.x
          const cy = this.player.position.y
          this.spawnSystem.spawnExplosion(cx, cy, 0xffffff, 4.0, 40, true)
          const explosionCount = 3 + Math.floor(Math.random() * 3)
          for (let i = 0; i < explosionCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const dist = 40 + Math.random() * 60
            this.spawnSystem.spawnExplosion(
              cx + Math.cos(angle) * dist,
              cy + Math.sin(angle) * dist,
              0xffaa00,
              2.0 + Math.random() * 2.0,
              30 + Math.random() * 20,
              true,
            )
          }
          this.spawnGameOverParticles(cx, cy)
          this.player.mesh.visible = false
          this.setShakeFrames(60)
          this.hasTriggeredMassiveExplosion = true
        }
      } else {
        this.gameOverWave = this.currentWave
        this.isGameOver = true
        return
      }
    }

    if (this.player.isAlive) {
      this.player.mesh.visible = this.isGameActive
      this.laser.mesh.visible = this.isGameActive
    }

    this.updateShake(delta)

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

    this.spawnSystem.updateHomingLaser(delta)
    this.spawnLaserParticles()
    this.spawnBoostParticles()

    if (this.isGameActive && this.player.isAlive) {
      this.waveSystem.update(delta)
    }

    if (this.isGameActive || this.gameOverTimer > 0) {
      this.collisionSystem.checkCollisions(delta)
      this.waveSystem.syncBossStatus()

      for (const obj of this.objects) {
        if (obj.isAlive) {
          obj.update(delta)
          if (obj.laserHitCooldown > 0) obj.laserHitCooldown -= delta
          if (obj instanceof EnergyOrb && obj.canBeCollected()) {
            this.addLevelUpEnergy(obj.energyValue)
            obj.isAlive = false
          }
        }
        if (obj instanceof HomingMissile && obj.shouldExplode) {
          if (obj.isMaxDistanceExplosion) {
            this.spawnSystem.spawnHomingExplosion(
              obj.position.x,
              obj.position.y,
              obj.velocity.x,
              obj.velocity.y,
              2.25 / 4,
              30 / 4,
            )
          } else {
            this.spawnSystem.spawnHomingExplosion(
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

      const cameraX = this.player.position.x
      const cameraY = this.player.position.y
      for (const obj of this.objects) obj.updateDisplay(cameraX, cameraY)
      this.player.updateDisplay(cameraX, cameraY)

      this.minimap.update(this.player, this.objects)
    }
  }

  public addObject(obj: GameObject): void {
    this.objects.push(obj)
    this.scene?.add(obj.mesh)
  }

  public addScore(amount: number): void {
    this.score += amount
  }

  public addLevelUpEnergy(amount: number): void {
    this.levelUpEnergy += amount

    let leveledUp = false
    while (this.levelUpEnergy >= this.energyForNextLevel) {
      this.levelUpEnergy -= this.energyForNextLevel
      this.playerLevel++
      this.player.hp = this.player.maxHp
      this.pendingPowerUpSelections++
      this.powerUpReason = 'level'
      this.currentEnergyInterval += 25
      this.energyForNextLevel = this.currentEnergyInterval
      leveledUp = true
    }

    if (leveledUp && !this.isPowerUpSelecting) {
      this.powerUpSystem.generatePowerUpOptions()
    }
  }

  public setShakeFrames(frames: number): void {
    this.shakeFrames = frames
  }

  public setShakeFramesMax(frames: number): void {
    this.shakeFrames = Math.max(this.shakeFrames, frames)
  }

  public get minimapDots() {
    return this.minimap.dots
  }

  public get hpPercent(): number {
    return (this.player.hp / this.player.maxHp) * 100
  }

  public get levelUpEnergyPercent(): number {
    return this.energyForNextLevel > 0
      ? (this.levelUpEnergy / this.energyForNextLevel) * 100
      : 0
  }

  public get powerPercent(): number {
    return (this.player.laserPower / this.player.maxLaserPower) * 100
  }

  public resize(width: number, height: number): void {
    this.screenWidth = width
    this.screenHeight = height
    this.player.screenWidth = width
    this.player.screenHeight = height
  }

  public destroy(): void {
    this.player.destroy()
    this.objects.forEach((obj) => obj.destroy())
    this.objects = []
  }

  public async continueGame(
    scene: THREE.Scene,
    screenWidth: number,
    screenHeight: number,
  ): Promise<void> {
    const savedWave = this.gameOverWave
    const savedPowerUpLevels = { ...this.powerUpLevels }
    const savedRarityBonus = this.rarityBonus
    const savedScore = this.score
    const savedLevel = this.playerLevel
    const savedLevelUpEnergy = this.levelUpEnergy
    const savedEnergyForNextLevel = this.energyForNextLevel
    const savedCurrentEnergyInterval = this.currentEnergyInterval

    this.destroy()
    await this.init(scene, screenWidth, screenHeight)

    this.score = savedScore
    this.rarityBonus = savedRarityBonus
    this.playerLevel = savedLevel
    this.levelUpEnergy = savedLevelUpEnergy
    this.energyForNextLevel = savedEnergyForNextLevel
    this.currentEnergyInterval = savedCurrentEnergyInterval

    this.powerUpSystem.applyPowerUpLevels(savedPowerUpLevels)

    this.currentWave = savedWave - 1
    this.waveSystem.startNextWave()
    this.isGameActive = true
  }

  private resetState(): void {
    this.isInitialized = false
    this.objects = []
    this.isGameOver = false
    this.isGameActive = false
    this.shakeFrames = 0
    this.gameOverTimer = 0
    this.score = 0
    this.playerLevel = 0
    this.levelUpEnergy = 0
    this.energyForNextLevel = 60
    this.currentEnergyInterval = 60
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
    this.bossWarningText = ''
    this.isBossWarningActive = false
    this.bossHp = 0
    this.bossMaxHp = 0
    this.isBossActive = false
    this.shakeOffset = { x: 0, y: 0 }
    this.currentPowerUpOptions = []
    this.availablePowerUps = []
    this.enemySpawnTimer = 0
    this.enemySpawnInterval = 120
    this.homingLaserTimer = 0
    this.isPaused = false
  }

  private updateShake(delta: number): void {
    if (this.shakeFrames > 0) {
      this.shakeFrames -= delta
      this.shakeOffset = {
        x: (Math.random() - 0.5) * 10,
        y: (Math.random() - 0.5) * 10,
      }
    } else {
      this.shakeOffset = { x: 0, y: 0 }
    }
  }

  private spawnLaserParticles(): void {
    if (
      this.laser.state !== LaserState.CHARGING &&
      this.laser.state !== LaserState.FIRING
    ) {
      return
    }

    const tipX = this.player.position.x + Math.sin(this.player.rotation) * 15
    const tipY = this.player.position.y - Math.cos(this.player.rotation) * 15
    const intensity = this.laser.state === LaserState.CHARGING ? this.laser.chargeProgress : 1.0
    const pCount = Math.floor(intensity * 3) + (Math.random() < (intensity * 3) % 1 ? 1 : 0)
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

  private spawnBoostParticles(): void {
    if (!this.player.isBoosting) return

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
    this.setShakeFramesMax(2)
  }

  private spawnGameOverParticles(x: number, y: number): void {
    const particleCount = 80 + Math.floor(Math.random() * 40)
    for (let n = 0; n < particleCount; n++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 5 + Math.random() * 25
      const baseLife = 40 + Math.random() * 40
      const colors = [0xffffff, 0xffaa00, 0xff5500, 0x00ffff]
      const color = colors[Math.floor(Math.random() * colors.length)] ?? 0xffffff
      this.addObject(
        new Particle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          baseLife,
          color,
          3 + Math.random() * 3,
        ),
      )
    }
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
