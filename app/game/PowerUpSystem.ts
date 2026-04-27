import type { GameManager, PowerUp } from './GameManager'

export class PowerUpSystem {
  private static readonly EXCLUSIVE_SHOT_IDS = ['3way', '5way', 'wide', 'piercing'] as const

  constructor(private readonly manager: GameManager) {}

  public initPowerUps(): void {
    const state = this.manager.state
    state.availablePowerUps = [
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
          this.resetExclusiveShotGroup('3way')
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
          this.resetExclusiveShotGroup('5way')
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
          this.resetExclusiveShotGroup('wide')
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
          this.resetExclusiveShotGroup('piercing')
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
    ]
  }

  public applyPowerUpLevels(powerUpLevels: Record<string, number>): void {
    const state = this.manager.state
    for (const [id, level] of Object.entries(powerUpLevels)) {
      const powerUp = state.availablePowerUps.find((p) => p.id === id)
      if (!powerUp || level <= 0) continue
      for (let i = 0; i < level; i++) powerUp.effect(this.manager)
      state.powerUpLevels[id] = level
    }
    this.updatePowerUpListEntries()
  }

  public generatePowerUpOptions(): void {
    const state = this.manager.state
    state.isPaused = true
    state.isPowerUpSelecting = true

    const options: PowerUp[] = []
    const pool = state.availablePowerUps
      .filter((p) => {
        const current = state.powerUpLevels[p.id] || 0
        return !p.maxLevel || current < p.maxLevel
      })
      .map((p) => ({ ...p, currentLevel: state.powerUpLevels[p.id] || 0 }))

    const getWeight = (rarity: number = 1): number => {
      switch (rarity) {
        case 1:
          return 100
        case 2:
          return 30 + state.rarityBonus * 20
        case 3:
          return 10 + state.rarityBonus * 15
        default:
          return 100
      }
    }

    for (let i = 0; i < 3; i++) {
      if (pool.length === 0) break
      const totalWeight = pool.reduce((sum, p) => sum + (p ? getWeight(p.rarity) : 0), 0)
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

    state.currentPowerUpOptions = options
    state.isPowerUpSelecting = true
  }

  public selectPowerUp(index: number): void {
    const state = this.manager.state
    const powerUp = state.currentPowerUpOptions[index]
    if (!powerUp) return

    powerUp.effect(this.manager)
    if (powerUp.id && powerUp.id !== 'skip') {
      state.rarityBonus = 0
      state.powerUpLevels[powerUp.id] = (state.powerUpLevels[powerUp.id] ?? 0) + 1
    }
    this.updatePowerUpListEntries()
    state.pendingPowerUpSelections--

    if (state.pendingPowerUpSelections > 0) {
      this.generatePowerUpOptions()
      return
    }

    state.isPowerUpSelecting = false
    state.powerUpReason = null
    state.isPaused = false
    state.currentPowerUpOptions = []
    if (state.isWaitingForNextWaveTriggerPending) {
      state.isWaitingForNextWaveTriggerPending = false
      state.isWaitingForNextWave = true
      this.manager.waveSystem.showAnnouncement('', 60)
    }
  }

  public updatePowerUpListEntries(): void {
    const state = this.manager.state
    state.powerUpListEntries = []
    for (const pu of state.availablePowerUps) {
      const level = state.powerUpLevels[pu.id] || 0
      if (level <= 0) continue
      if (pu.maxLevel && pu.maxLevel > 1) {
        state.powerUpListEntries.push(`${pu.name} Lv.${level}`)
      } else {
        state.powerUpListEntries.push(pu.name)
      }
    }
  }

  private resetExclusiveShotGroup(selectedId: string): void {
    for (const id of PowerUpSystem.EXCLUSIVE_SHOT_IDS) {
      if (id !== selectedId) delete this.manager.powerUpLevels[id]
    }
    if (selectedId === 'piercing') {
      this.manager.player.weaponType = 'normal'
    } else {
      this.manager.player.bulletPiercing = false
    }
  }
}
