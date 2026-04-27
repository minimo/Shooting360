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
    const state = this.manager.state
    if (state.isWaveClearing) return

    state.currentWave++
    state.waveEnemiesSpawned = 0
    const enemyCounts = [0, 3, 5, 8, 12, 15]
    state.totalEnemiesInWave =
      enemyCounts[state.currentWave] ?? 15 + (state.currentWave - 5) * 5

    const isBossWave = state.currentWave % 5 === 0
    if (isBossWave) state.totalEnemiesInWave = 1

    const text = isBossWave
      ? `WAVE ${state.currentWave} BOSS START`
      : `WAVE ${state.currentWave} START`
    this.showAnnouncement(text, 240)
  }

  public update(delta: number): void {
    const state = this.manager.state
    if (state.currentWave === 0 && !state.isWaveClearing) {
      this.startNextWave()
    }

    this.updateWaveAnnouncement(delta)

    if (
      !state.isWaveClearing &&
      !state.isWaitingForClearAnnouncement &&
      !state.isSpawningDelayed &&
      !state.isWaitingForNextWave &&
      !state.isPowerUpSelecting &&
      state.waveTransitionTimer <= 0 &&
      state.waveEnemiesSpawned < state.totalEnemiesInWave
    ) {
      state.enemySpawnTimer -= delta
      if (state.enemySpawnTimer <= 0) {
        const enemyCount = this.countActiveWaveEnemies()
        const maxSimultaneous = 5 + Math.floor(state.currentWave / 2)
        if (enemyCount < maxSimultaneous) this.manager.spawnSystem.spawnEnemy()
        state.enemySpawnTimer = Math.max(30, 120 - state.currentWave * 5)
      }
    }

    if (
      !state.isWaveClearing &&
      !state.isWaitingForClearAnnouncement &&
      !state.isWaitingForNextWave &&
      !state.isPowerUpSelecting &&
      state.waveTransitionTimer <= 0 &&
      state.waveEnemiesSpawned >= state.totalEnemiesInWave &&
      state.totalEnemiesInWave > 0 &&
      this.countActiveWaveEnemies() === 0
    ) {
      state.isWaitingForClearAnnouncement = true
      this.showAnnouncement('', 180)
    }
  }

  public showAnnouncement(text: string, duration: number): void {
    const state = this.manager.state
    state.announcementText = text
    state.announcementAlpha = text === '' ? 0 : 0.5
    state.waveTransitionTimer = duration
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
      this.manager.state.bossHp = boss.hp
      this.manager.state.bossMaxHp = boss.maxHp
      this.manager.state.isBossActive = true
      return
    }

    this.manager.state.isBossActive = false
  }

  private clearWave(): void {
    const state = this.manager.state
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

    state.pendingPowerUpSelections++
    state.powerUpReason = 'wave'
    state.isWaitingForNextWaveTriggerPending = true
    if (!state.isPowerUpSelecting) this.manager.powerUpSystem.generatePowerUpOptions()
  }

  private updateWaveAnnouncement(delta: number): void {
    const state = this.manager.state
    if (state.waveTransitionTimer > 0) {
      state.waveTransitionTimer -= delta
      if (state.waveTransitionTimer < 60) {
        state.announcementAlpha = (state.waveTransitionTimer / 60) * 0.7
      } else {
        state.announcementAlpha = 0.7
      }
      return
    }

    if (
      state.announcementText === '' &&
      !state.isWaitingForClearAnnouncement &&
      !state.isWaveClearing &&
      !state.isSpawningDelayed &&
      !state.isWaitingForNextWave
    ) {
      return
    }

    const previousText = state.announcementText
    state.announcementAlpha = 0
    state.announcementText = ''

    if (state.isWaitingForClearAnnouncement) {
      state.isWaitingForClearAnnouncement = false
      this.clearWave()
      return
    }

    if (previousText.includes('START')) {
      state.isSpawningDelayed = true
      this.showAnnouncement('', 180)
      return
    }

    if (previousText !== '') return

    if (state.isSpawningDelayed) {
      state.isSpawningDelayed = false
    } else if (state.isWaitingForNextWave) {
      state.isWaitingForNextWave = false
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
