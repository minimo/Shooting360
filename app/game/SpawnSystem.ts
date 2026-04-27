import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import { Afterimage } from './Afterimage'
import { Bullet } from './Bullet'
import { CoreDestroyer } from './Enemy/CoreDestroyer'
import { CoreShield } from './Enemy/CoreShield'
import { AceFighter } from './Enemy/AceFighter'
import { Fighter } from './Enemy/Fighter'
import { MissileFlower } from './Enemy/MissileFlower'
import { VoidSerpent } from './Enemy/VoidSerpent'
import { VoidSerpentSegment } from './Enemy/VoidSerpentSegment'
import { EnergyOrb } from './EnergyOrb'
import { Explosion } from './Explosion'
import { GameObject, WORLD_HALF, WORLD_SIZE } from './GameObject'
import { HomingExplosion } from './HomingExplosion'
import { HomingLaser } from './HomingLaser'
import { HomingMissile } from './HomingMissile'
import { LaserState } from './Laser'
import { Particle } from './Particle'
import type { GameManager } from './GameManager'

type EnemyType =
  | Fighter
  | MissileFlower
  | CoreDestroyer
  | CoreShield
  | VoidSerpent
  | VoidSerpentSegment

export class SpawnSystem {
  constructor(private readonly manager: GameManager) {}

  public spawnBullet(
    x: number,
    y: number,
    angle: number,
    side: 'player' | 'enemy',
    speedMultiplier: number = 1,
    damage: number = 1,
    isPiercing: boolean = false,
  ): void {
    this.manager.addObject(new Bullet(x, y, angle, side, speedMultiplier, damage, isPiercing))
  }

  public spawnAfterimage(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    life: number = 20,
    color: number = 0xffffff,
    alpha: number = 1.0,
  ): void {
    this.manager.addObject(new Afterimage(x1, y1, x2, y2, life, color, alpha))
  }

  public spawnHomingMissile(x: number, y: number, angle: number): void {
    const missile = new HomingMissile(
      x,
      y,
      angle,
      this.manager.player,
      this.spawnAfterimage.bind(this),
      'enemy',
    )
    this.manager.addObject(missile)
  }

  public spawnPlayerHomingMissile(x: number, y: number): boolean {
    let nearestEnemy: GameObject | null = null
    let minDist = 300

    for (const obj of this.manager.objects) {
      if (obj.isAlive && obj.side === 'enemy' && obj.radius > 0) {
        let dx = obj.position.x - x
        let dy = obj.position.y - y
        while (dx > WORLD_HALF) dx -= WORLD_SIZE
        while (dx < -WORLD_HALF) dx += WORLD_SIZE
        while (dy > WORLD_HALF) dy -= WORLD_SIZE
        while (dy < -WORLD_HALF) dy += WORLD_SIZE
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < minDist) {
          minDist = d
          nearestEnemy = obj
        }
      }
    }

    if (!nearestEnemy) return false

    const count = Math.min(8, 2 + Math.floor((this.manager.currentWave - 1) / 2))
    const cooldownSec = Math.max(8, 10 - (this.manager.currentWave - 1) * 0.2)
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
      this.manager.addObject(missile)
    }

    this.manager.player.homingCooldown = cooldownFrames
    return true
  }

  public spawnHomingExplosion(
    x: number,
    y: number,
    vx: number = 0,
    vy: number = 0,
    scale: number = 2.25,
    duration: number = 30,
  ): void {
    this.manager.addObject(new HomingExplosion(x, y, scale, duration, vx, vy))
  }

  public spawnHitEffect(
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
      this.manager.addObject(
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

  public spawnDestructionEffect(
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
      this.manager.addObject(
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

  public spawnExplosion(
    x: number,
    y: number,
    color: number,
    scale: number,
    duration: number,
    isFlashy: boolean = false,
    vx: number = 0,
    vy: number = 0,
  ): void {
    this.manager.addObject(new Explosion(x, y, color, scale, duration, isFlashy, vx, vy))
  }

  public spawnEnemy(): void {
    this.manager.waveEnemiesSpawned++

    const isBossWave = this.manager.currentWave > 0 && this.manager.currentWave % 5 === 0
    if (isBossWave) {
      this.spawnBoss()
      return
    }

    const aceRate =
      this.manager.currentWave >= 4
        ? Math.min(0.4, (this.manager.currentWave - 3) * 0.1)
        : 0
    const sniperRate = Math.min(0.8, (this.manager.currentWave - 1) * 0.15)

    const angle = Math.random() * Math.PI * 2
    const dist = 800 + Math.random() * 400
    const x = this.manager.player.position.x + Math.sin(angle) * dist
    const y = this.manager.player.position.y - Math.cos(angle) * dist

    const rand = Math.random()
    if (rand < aceRate) {
      const model = this.cloneEnemyModel()
      this.manager.addObject(
        new AceFighter(
          x,
          y,
          this.manager.player,
          (ex, ey, ea) => this.spawnBullet(ex, ey, ea, 'enemy'),
          (obj) => this.manager.addObject(obj),
          this.spawnAfterimage.bind(this),
          this.manager.currentWave,
          model,
        ),
      )
      return
    }

    if (rand < aceRate + sniperRate) {
      this.manager.addObject(
        new MissileFlower(
          x,
          y,
          this.manager.player,
          (ex, ey, ea) => this.spawnHomingMissile(ex, ey, ea),
          this.manager.currentWave,
        ),
      )
      return
    }

    const model = this.cloneEnemyModel()
    this.manager.addObject(
      new Fighter(
        x,
        y,
        this.manager.player,
        (ex, ey, ea) => this.spawnBullet(ex, ey, ea, 'enemy'),
        this.manager.currentWave,
        model,
      ),
    )
  }

  public updateHomingLaser(delta: number): void {
    const level = this.manager.powerUpLevels['homing_laser'] || 0
    if (level <= 0) return

    const interval = Math.max(8, 20 - (level - 1) * 3)
    if (this.manager.laser.state !== LaserState.FIRING) {
      this.manager.homingLaserTimer = interval
      return
    }

    this.manager.homingLaserTimer += delta
    if (this.manager.homingLaserTimer < interval) return
    this.manager.homingLaserTimer %= interval

    const enemies = this.manager.objects.filter(
      (obj) =>
        (obj instanceof Fighter ||
          obj instanceof MissileFlower ||
          obj instanceof CoreDestroyer) &&
        obj.isAlive,
    )
    if (enemies.length === 0) return

    let closestEnemy: GameObject | null = null
    let minDistSq = Infinity
    for (const enemy of enemies) {
      let dx = enemy.position.x - this.manager.player.position.x
      let dy = enemy.position.y - this.manager.player.position.y
      while (dx > WORLD_HALF) dx -= WORLD_SIZE
      while (dx < -WORLD_HALF) dx += WORLD_SIZE
      while (dy > WORLD_HALF) dy -= WORLD_SIZE
      while (dy < -WORLD_HALF) dy += WORLD_SIZE
      const distSq = dx * dx + dy * dy
      if (distSq < minDistSq) {
        minDistSq = distSq
        closestEnemy = enemy
      }
    }

    if (!closestEnemy) return

    const offsetDegrees = [30, -30, 50, -50]
    for (const deg of offsetDegrees) {
      const angle = this.manager.player.rotation + deg * (Math.PI / 180)
      const hl = new HomingLaser(
        this.manager.player.position.x,
        this.manager.player.position.y,
        angle,
        closestEnemy,
        this.spawnAfterimage.bind(this),
      )
      hl.damage = 2 + (level - 1) * 0.5
      this.manager.addObject(hl)
    }
  }

  public awardEnemyDestruction(enemy: EnemyType): void {
    const scoreValue = this.getEnemyScoreValue(enemy)
    this.manager.addScore(scoreValue)
    this.spawnEnergyBurst(
      enemy.position.x,
      enemy.position.y,
      scoreValue,
      enemy.velocity.x,
      enemy.velocity.y,
    )
  }

  private cloneEnemyModel(): THREE.Object3D | undefined {
    return this.manager.enemyBaseModel ? SkeletonUtils.clone(this.manager.enemyBaseModel) : undefined
  }

  private spawnBoss(): void {
    if (this.manager.currentWave % 10 !== 0) {
      const boss = new CoreDestroyer(
        this.manager.player.position.x + 1200,
        this.manager.player.position.y,
        this.manager.player,
        (ex, ey, ea) => this.spawnBullet(ex, ey, ea, 'enemy'),
        (obj) => this.manager.addObject(obj),
        this.manager.currentWave,
        (text, active) => {
          this.manager.bossWarningText = text
          this.manager.isBossWarningActive = active
        },
      )
      this.manager.addObject(boss)
      for (let i = 0; i < 4; i++) {
        this.manager.addObject(new CoreShield(boss, i))
      }
      return
    }

    const boss = new VoidSerpent(
      this.manager.player.position.x + 1200,
      this.manager.player.position.y,
      this.manager.player,
      (ex, ey, ea, side) => this.spawnBullet(ex, ey, ea, side || 'enemy'),
      (ex, ey, ea) => this.spawnHomingMissile(ex, ey, ea),
      (obj) => this.manager.addObject(obj),
      this.manager.currentWave,
      (text, active) => {
        this.manager.bossWarningText = text
        this.manager.isBossWarningActive = active
      },
    )
    this.manager.addObject(boss)
  }

  private getEnemyScoreValue(enemy: EnemyType): number {
    return enemy instanceof CoreDestroyer
      ? 10000
      : enemy instanceof VoidSerpent
        ? 20000
        : enemy instanceof VoidSerpentSegment
          ? 500
          : enemy instanceof AceFighter
            ? 2000
            : enemy instanceof MissileFlower
              ? 1000
              : enemy instanceof CoreShield
                ? 1000
                : 300
  }

  private spawnEnergyBurst(
    x: number,
    y: number,
    scoreValue: number,
    sourceVx: number = 0,
    sourceVy: number = 0,
  ): void {
    const totalEnergy = Math.max(1, Math.round(scoreValue / 25))
    const orbCount = Math.max(
      1,
      Math.min(totalEnergy, Math.min(18, Math.round(Math.sqrt(totalEnergy) * 1.75))),
    )
    let remainingEnergy = totalEnergy

    for (let i = 0; i < orbCount; i++) {
      const orbsLeft = orbCount - i
      const baseValue = Math.max(1, Math.round(remainingEnergy / orbsLeft))
      const variance = Math.max(0, Math.round(baseValue * 0.35))
      const value =
        i === orbCount - 1
          ? remainingEnergy
          : Math.max(
              1,
              Math.min(
                remainingEnergy - (orbsLeft - 1),
                baseValue + Math.round((Math.random() - 0.5) * variance),
              ),
            )
      remainingEnergy -= value

      const angle = Math.random() * Math.PI * 2
      const speed = 0.4 + Math.random() * 1.4
      const spreadVx = Math.cos(angle) * speed + sourceVx * 0.15
      const spreadVy = Math.sin(angle) * speed + sourceVy * 0.15
      this.manager.addObject(new EnergyOrb(x, y, spreadVx, spreadVy, this.manager.player, value))
    }
  }
}
