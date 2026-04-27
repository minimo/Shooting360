import type { PowerUp } from './GameManager'

export class GameSessionState {
  public shakeOffset: { x: number; y: number } = { x: 0, y: 0 }

  public isGameOver = false
  public gameOverWave = 0

  public score = 0
  public playerLevel = 0
  public levelUpEnergy = 0
  public energyForNextLevel = 60
  public currentEnergyInterval = 60
  public pendingPowerUpSelections = 0
  public isWaitingForNextWaveTriggerPending = false
  public powerUpListEntries: string[] = []

  public announcementText = ''
  public announcementAlpha = 0
  public bossWarningText = ''
  public isBossWarningActive = false
  public bossHp = 0
  public bossMaxHp = 0
  public isBossActive = false

  public currentWave = 0
  public waveEnemiesSpawned = 0
  public totalEnemiesInWave = 0
  public isWaveClearing = false
  public isWaitingForClearAnnouncement = false
  public isSpawningDelayed = false
  public isWaitingForNextWave = false
  public waveTransitionTimer = 0

  public isPowerUpSelecting = false
  public powerUpReason: 'wave' | 'level' | null = null
  public currentPowerUpOptions: PowerUp[] = []
  public availablePowerUps: PowerUp[] = []
  public rarityBonus = 0
  public powerUpLevels: Record<string, number> = {}

  public enemySpawnTimer = 0
  public enemySpawnInterval = 120
  public homingLaserTimer = 0

  public isGameActive = false
  public isPaused = false
  public isInitialized = false

  public reset(): void {
    this.shakeOffset = { x: 0, y: 0 }
    this.isGameOver = false
    this.gameOverWave = 0
    this.score = 0
    this.playerLevel = 0
    this.levelUpEnergy = 0
    this.energyForNextLevel = 60
    this.currentEnergyInterval = 60
    this.pendingPowerUpSelections = 0
    this.isWaitingForNextWaveTriggerPending = false
    this.powerUpListEntries = []
    this.announcementText = ''
    this.announcementAlpha = 0
    this.bossWarningText = ''
    this.isBossWarningActive = false
    this.bossHp = 0
    this.bossMaxHp = 0
    this.isBossActive = false
    this.currentWave = 0
    this.waveEnemiesSpawned = 0
    this.totalEnemiesInWave = 0
    this.isWaveClearing = false
    this.isWaitingForClearAnnouncement = false
    this.isSpawningDelayed = false
    this.isWaitingForNextWave = false
    this.waveTransitionTimer = 0
    this.isPowerUpSelecting = false
    this.powerUpReason = null
    this.currentPowerUpOptions = []
    this.availablePowerUps = []
    this.rarityBonus = 0
    this.powerUpLevels = {}
    this.enemySpawnTimer = 0
    this.enemySpawnInterval = 120
    this.homingLaserTimer = 0
    this.isGameActive = false
    this.isPaused = false
    this.isInitialized = false
  }
}
