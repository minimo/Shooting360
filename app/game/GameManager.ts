import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { BackgroundObject } from './BackgroundObject'
import { CollisionSystem } from './CollisionSystem'
import { GameObject, WORLD_SIZE } from './GameObject'
import { GameSessionState } from './GameSessionState'
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
  public readonly state = new GameSessionState()
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

  private gameOverTimer: number = 0
  private hasTriggeredMassiveExplosion: boolean = false

  public constructor() {
    this.spawnSystem = new SpawnSystem(this)
    this.powerUpSystem = new PowerUpSystem(this)
    this.waveSystem = new WaveSystem(this)
    this.collisionSystem = new CollisionSystem(this)
  }

  public get isInWaveTransition(): boolean {
    return (
      this.state.isWaitingForClearAnnouncement ||
      this.state.isWaveClearing ||
      this.state.isPowerUpSelecting ||
      this.state.isWaitingForNextWave
    )
  }

  public get powerUps(): PowerUp[] {
    return this.state.availablePowerUps
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
    this.state.isInitialized = true
  }

  public startWithDebug(powerUpLevels: Record<string, number>, startWave: number): void {
    this.state.currentWave = startWave - 1
    this.state.powerUpLevels = {}
    this.powerUpSystem.applyPowerUpLevels(powerUpLevels)
    this.waveSystem.startNextWave()
    this.state.isGameActive = true
  }

  public generatePowerUpOptions(): void {
    this.powerUpSystem.generatePowerUpOptions()
  }

  public selectPowerUp(index: number): void {
    this.powerUpSystem.selectPowerUp(index)
  }

  public update(delta: number, input: InputState): void {
    if (!this.state.isInitialized || this.state.isPaused || this.state.isGameOver) return

    if (!this.player.isAlive && !this.state.isGameOver) {
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
        this.state.gameOverWave = this.state.currentWave
        this.state.isGameOver = true
        return
      }
    }

    if (this.player.isAlive) {
      this.player.mesh.visible = this.state.isGameActive
      this.laser.mesh.visible = this.state.isGameActive
    }

    this.updateShake(delta)

    const isLaserFiring = this.laser.state === LaserState.FIRING
    this.player.updateLaserPower(delta, isLaserFiring, this.player.isBoosting)

    let laserTrigger = input.laser
    if (this.player.laserPower <= 0 || this.player.isLaserOverheated) laserTrigger = false

    this.player.currentWave = this.state.currentWave
    this.player.update(delta, input)
    this.laser.updateFromPlayer(
      this.player.position.x,
      this.player.position.y,
      this.player.rotation,
    )
    this.laser.thickness = 3 * this.player.laserWidthMultiplier
    this.laser.setTrigger(laserTrigger)

    if ((this.state.powerUpLevels['homing_laser'] || 0) > 0) {
      this.laser.mesh.visible = false
      if (laserTrigger) this.laser.state = LaserState.FIRING
    }

    this.spawnSystem.updateHomingLaser(delta)
    this.spawnLaserParticles()
    this.spawnBoostParticles()

    if (this.state.isGameActive && this.player.isAlive) {
      this.waveSystem.update(delta)
    }

    if (this.state.isGameActive || this.gameOverTimer > 0) {
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
    this.state.score += amount
  }

  public addLevelUpEnergy(amount: number): void {
    this.state.levelUpEnergy += amount

    let leveledUp = false
    while (this.state.levelUpEnergy >= this.state.energyForNextLevel) {
      this.state.levelUpEnergy -= this.state.energyForNextLevel
      this.state.playerLevel++
      this.player.hp = this.player.maxHp
      this.state.pendingPowerUpSelections++
      this.state.powerUpReason = 'level'
      this.state.currentEnergyInterval += 25
      this.state.energyForNextLevel = this.state.currentEnergyInterval
      leveledUp = true
    }

    if (leveledUp && !this.state.isPowerUpSelecting) {
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
    return this.state.energyForNextLevel > 0
      ? (this.state.levelUpEnergy / this.state.energyForNextLevel) * 100
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
    const savedWave = this.state.gameOverWave
    const savedPowerUpLevels = { ...this.state.powerUpLevels }
    const savedRarityBonus = this.state.rarityBonus
    const savedScore = this.state.score
    const savedLevel = this.state.playerLevel
    const savedLevelUpEnergy = this.state.levelUpEnergy
    const savedEnergyForNextLevel = this.state.energyForNextLevel
    const savedCurrentEnergyInterval = this.state.currentEnergyInterval

    this.destroy()
    await this.init(scene, screenWidth, screenHeight)

    this.state.score = savedScore
    this.state.rarityBonus = savedRarityBonus
    this.state.playerLevel = savedLevel
    this.state.levelUpEnergy = savedLevelUpEnergy
    this.state.energyForNextLevel = savedEnergyForNextLevel
    this.state.currentEnergyInterval = savedCurrentEnergyInterval

    this.powerUpSystem.applyPowerUpLevels(savedPowerUpLevels)

    this.state.currentWave = savedWave - 1
    this.waveSystem.startNextWave()
    this.state.isGameActive = true
  }

  private resetState(): void {
    this.objects = []
    this.shakeFrames = 0
    this.gameOverTimer = 0
    this.hasTriggeredMassiveExplosion = false
    this.state.reset()
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

  public get shakeOffset() {
    return this.state.shakeOffset
  }

  public set shakeOffset(value) {
    this.state.shakeOffset = value
  }

  public get isGameOver() { return this.state.isGameOver }
  public set isGameOver(value: boolean) { this.state.isGameOver = value }
  public get gameOverWave() { return this.state.gameOverWave }
  public set gameOverWave(value: number) { this.state.gameOverWave = value }
  public get score() { return this.state.score }
  public set score(value: number) { this.state.score = value }
  public get playerLevel() { return this.state.playerLevel }
  public set playerLevel(value: number) { this.state.playerLevel = value }
  public get levelUpEnergy() { return this.state.levelUpEnergy }
  public set levelUpEnergy(value: number) { this.state.levelUpEnergy = value }
  public get energyForNextLevel() { return this.state.energyForNextLevel }
  public set energyForNextLevel(value: number) { this.state.energyForNextLevel = value }
  public get currentEnergyInterval() { return this.state.currentEnergyInterval }
  public set currentEnergyInterval(value: number) { this.state.currentEnergyInterval = value }
  public get pendingPowerUpSelections() { return this.state.pendingPowerUpSelections }
  public set pendingPowerUpSelections(value: number) { this.state.pendingPowerUpSelections = value }
  public get isWaitingForNextWaveTriggerPending() { return this.state.isWaitingForNextWaveTriggerPending }
  public set isWaitingForNextWaveTriggerPending(value: boolean) { this.state.isWaitingForNextWaveTriggerPending = value }
  public get powerUpListEntries() { return this.state.powerUpListEntries }
  public set powerUpListEntries(value: string[]) { this.state.powerUpListEntries = value }
  public get announcementText() { return this.state.announcementText }
  public set announcementText(value: string) { this.state.announcementText = value }
  public get announcementAlpha() { return this.state.announcementAlpha }
  public set announcementAlpha(value: number) { this.state.announcementAlpha = value }
  public get bossWarningText() { return this.state.bossWarningText }
  public set bossWarningText(value: string) { this.state.bossWarningText = value }
  public get isBossWarningActive() { return this.state.isBossWarningActive }
  public set isBossWarningActive(value: boolean) { this.state.isBossWarningActive = value }
  public get bossHp() { return this.state.bossHp }
  public set bossHp(value: number) { this.state.bossHp = value }
  public get bossMaxHp() { return this.state.bossMaxHp }
  public set bossMaxHp(value: number) { this.state.bossMaxHp = value }
  public get isBossActive() { return this.state.isBossActive }
  public set isBossActive(value: boolean) { this.state.isBossActive = value }
  public get currentWave() { return this.state.currentWave }
  public set currentWave(value: number) { this.state.currentWave = value }
  public get waveEnemiesSpawned() { return this.state.waveEnemiesSpawned }
  public set waveEnemiesSpawned(value: number) { this.state.waveEnemiesSpawned = value }
  public get totalEnemiesInWave() { return this.state.totalEnemiesInWave }
  public set totalEnemiesInWave(value: number) { this.state.totalEnemiesInWave = value }
  public get isWaveClearing() { return this.state.isWaveClearing }
  public set isWaveClearing(value: boolean) { this.state.isWaveClearing = value }
  public get isWaitingForClearAnnouncement() { return this.state.isWaitingForClearAnnouncement }
  public set isWaitingForClearAnnouncement(value: boolean) { this.state.isWaitingForClearAnnouncement = value }
  public get isSpawningDelayed() { return this.state.isSpawningDelayed }
  public set isSpawningDelayed(value: boolean) { this.state.isSpawningDelayed = value }
  public get isWaitingForNextWave() { return this.state.isWaitingForNextWave }
  public set isWaitingForNextWave(value: boolean) { this.state.isWaitingForNextWave = value }
  public get waveTransitionTimer() { return this.state.waveTransitionTimer }
  public set waveTransitionTimer(value: number) { this.state.waveTransitionTimer = value }
  public get isPowerUpSelecting() { return this.state.isPowerUpSelecting }
  public set isPowerUpSelecting(value: boolean) { this.state.isPowerUpSelecting = value }
  public get powerUpReason() { return this.state.powerUpReason }
  public set powerUpReason(value: 'wave' | 'level' | null) { this.state.powerUpReason = value }
  public get currentPowerUpOptions() { return this.state.currentPowerUpOptions }
  public set currentPowerUpOptions(value: PowerUp[]) { this.state.currentPowerUpOptions = value }
  public get availablePowerUps() { return this.state.availablePowerUps }
  public set availablePowerUps(value: PowerUp[]) { this.state.availablePowerUps = value }
  public get rarityBonus() { return this.state.rarityBonus }
  public set rarityBonus(value: number) { this.state.rarityBonus = value }
  public get powerUpLevels() { return this.state.powerUpLevels }
  public set powerUpLevels(value: Record<string, number>) { this.state.powerUpLevels = value }
  public get enemySpawnTimer() { return this.state.enemySpawnTimer }
  public set enemySpawnTimer(value: number) { this.state.enemySpawnTimer = value }
  public get enemySpawnInterval() { return this.state.enemySpawnInterval }
  public set enemySpawnInterval(value: number) { this.state.enemySpawnInterval = value }
  public get homingLaserTimer() { return this.state.homingLaserTimer }
  public set homingLaserTimer(value: number) { this.state.homingLaserTimer = value }
  public get isGameActive() { return this.state.isGameActive }
  public set isGameActive(value: boolean) { this.state.isGameActive = value }
  public get isPaused() { return this.state.isPaused }
  public set isPaused(value: boolean) { this.state.isPaused = value }
  public get isInitialized() { return this.state.isInitialized }
  public set isInitialized(value: boolean) { this.state.isInitialized = value }
}
