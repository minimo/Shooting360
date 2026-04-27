import { Bullet } from './Bullet'
import { CoreDestroyer } from './Enemy/CoreDestroyer'
import { Fighter } from './Enemy/Fighter'
import { MissileFlower } from './Enemy/MissileFlower'
import { VoidSerpent } from './Enemy/VoidSerpent'
import { HomingMissile } from './HomingMissile'
import type { GameManager } from './GameManager'

export class WaveSystem {
  constructor(private readonly manager: GameManager) {}

  public startNextWave(): void {
    if (this.manager.isWaveClearing) return

    this.manager.currentWave++
    this.manager.waveEnemiesSpawned = 0
    const enemyCounts = [0, 3, 5, 8, 12, 15]
    this.manager.totalEnemiesInWave =
      enemyCounts[this.manager.currentWave] ?? 15 + (this.manager.currentWave - 5) * 5

    const isBossWave = this.manager.currentWave % 5 === 0
    if (isBossWave) this.manager.totalEnemiesInWave = 1

    const text = isBossWave
      ? `WAVE ${this.manager.currentWave} BOSS START`
      : `WAVE ${this.manager.currentWave} START`
    this.showAnnouncement(text, 240)
  }

  public update(delta: number): void {
    if (this.manager.currentWave === 0 && !this.manager.isWaveClearing) {
      this.startNextWave()
    }

    this.updateWaveAnnouncement(delta)

    if (
      !this.manager.isWaveClearing &&
      !this.manager.isWaitingForClearAnnouncement &&
      !this.manager.isSpawningDelayed &&
      !this.manager.isWaitingForNextWave &&
      !this.manager.isPowerUpSelecting &&
      this.manager.waveTransitionTimer <= 0 &&
      this.manager.waveEnemiesSpawned < this.manager.totalEnemiesInWave
    ) {
      this.manager.enemySpawnTimer -= delta
      if (this.manager.enemySpawnTimer <= 0) {
        const enemyCount = this.countActiveWaveEnemies()
        const maxSimultaneous = 5 + Math.floor(this.manager.currentWave / 2)
        if (enemyCount < maxSimultaneous) this.manager.spawnSystem.spawnEnemy()
        this.manager.enemySpawnTimer = Math.max(30, 120 - this.manager.currentWave * 5)
      }
    }

    if (
      !this.manager.isWaveClearing &&
      !this.manager.isWaitingForClearAnnouncement &&
      !this.manager.isWaitingForNextWave &&
      !this.manager.isPowerUpSelecting &&
      this.manager.waveTransitionTimer <= 0 &&
      this.manager.waveEnemiesSpawned >= this.manager.totalEnemiesInWave &&
      this.manager.totalEnemiesInWave > 0 &&
      this.countActiveWaveEnemies() === 0
    ) {
      this.manager.isWaitingForClearAnnouncement = true
      this.showAnnouncement('', 180)
    }
  }

  public showAnnouncement(text: string, duration: number): void {
    this.manager.announcementText = text
    this.manager.announcementAlpha = text === '' ? 0 : 0.5
    this.manager.waveTransitionTimer = duration
  }

  public syncBossStatus(): void {
    let boss: CoreDestroyer | VoidSerpent | undefined
    for (const obj of this.manager.objects) {
      if ((obj instanceof CoreDestroyer || obj instanceof VoidSerpent) && !obj.isDying) {
        boss = obj
        break
      }
    }

    if (boss) {
      this.manager.bossHp = boss.hp
      this.manager.bossMaxHp = boss.maxHp
      this.manager.isBossActive = true
      return
    }

    this.manager.isBossActive = false
  }

  private clearWave(): void {
    if (this.manager.player.isAlive) {
      this.manager.player.hp = this.manager.player.maxHp
      this.manager.player.laserPower = this.manager.player.maxLaserPower
      this.manager.player.isLaserOverheated = false
    }

    for (const obj of this.manager.objects) {
      if ((obj instanceof Bullet && obj.side === 'enemy') || obj instanceof HomingMissile) {
        obj.isAlive = false
      }
    }

    this.manager.pendingPowerUpSelections++
    this.manager.powerUpReason = 'wave'
    this.manager.isWaitingForNextWaveTriggerPending = true
    if (!this.manager.isPowerUpSelecting) this.manager.powerUpSystem.generatePowerUpOptions()
  }

  private updateWaveAnnouncement(delta: number): void {
    if (this.manager.waveTransitionTimer > 0) {
      this.manager.waveTransitionTimer -= delta
      if (this.manager.waveTransitionTimer < 60) {
        this.manager.announcementAlpha = (this.manager.waveTransitionTimer / 60) * 0.7
      } else {
        this.manager.announcementAlpha = 0.7
      }
      return
    }

    if (
      this.manager.announcementText === '' &&
      !this.manager.isWaitingForClearAnnouncement &&
      !this.manager.isWaveClearing &&
      !this.manager.isSpawningDelayed &&
      !this.manager.isWaitingForNextWave
    ) {
      return
    }

    const previousText = this.manager.announcementText
    this.manager.announcementAlpha = 0
    this.manager.announcementText = ''

    if (this.manager.isWaitingForClearAnnouncement) {
      this.manager.isWaitingForClearAnnouncement = false
      this.clearWave()
      return
    }

    if (previousText.includes('START')) {
      this.manager.isSpawningDelayed = true
      this.showAnnouncement('', 180)
      return
    }

    if (previousText !== '') return

    if (this.manager.isSpawningDelayed) {
      this.manager.isSpawningDelayed = false
    } else if (this.manager.isWaitingForNextWave) {
      this.manager.isWaitingForNextWave = false
      this.startNextWave()
    }
  }

  private countActiveWaveEnemies(): number {
    return this.manager.objects.filter(
      (obj) =>
        (obj instanceof Fighter ||
          obj instanceof MissileFlower ||
          obj instanceof CoreDestroyer ||
          obj instanceof VoidSerpent) &&
        obj.isAlive,
    ).length
  }
}
