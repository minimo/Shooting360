import { BossDestructionEffect } from './BossDestructionEffect'
import { Bullet } from './Bullet'
import { CoreDestroyer } from './Enemy/CoreDestroyer'
import { CoreShield } from './Enemy/CoreShield'
import { Fighter } from './Enemy/Fighter'
import { MissileFlower } from './Enemy/MissileFlower'
import { VoidSerpent } from './Enemy/VoidSerpent'
import { VoidSerpentSegment } from './Enemy/VoidSerpentSegment'
import { GameObject, WORLD_HALF, WORLD_SIZE } from './GameObject'
import type { GameManager } from './GameManager'
import { HomingExplosion } from './HomingExplosion'
import { HomingLaser } from './HomingLaser'
import { HomingMissile } from './HomingMissile'
import { LaserState } from './Laser'

type EnemyType =
  | Fighter
  | MissileFlower
  | CoreDestroyer
  | CoreShield
  | VoidSerpent
  | VoidSerpentSegment

export class CollisionSystem {
  constructor(private readonly manager: GameManager) {}

  public checkCollisions(_delta: number): void {
    const bullets = this.manager.objects.filter(
      (obj) => obj instanceof Bullet && obj.isAlive,
    ) as Bullet[]
    const enemies = this.manager.objects.filter(
      (obj) =>
        (obj instanceof Fighter ||
          obj instanceof MissileFlower ||
          obj instanceof CoreDestroyer ||
          obj instanceof CoreShield ||
          obj instanceof VoidSerpent ||
          obj instanceof VoidSerpentSegment) &&
        obj.isAlive &&
        !obj.isDying,
    ) as EnemyType[]

    this.handleLaserVsEnemies(enemies)
    this.handleBullets(bullets, enemies)
    this.handlePlayerVsEnemies(enemies)

    const missiles = this.manager.objects.filter(
      (obj) => obj instanceof HomingMissile && obj.isAlive,
    ) as HomingMissile[]
    const homingExplosions = this.manager.objects.filter(
      (obj) => obj instanceof HomingExplosion && obj.isAlive,
    ) as HomingExplosion[]

    this.handleMissiles(bullets, missiles)
    this.handleHomingExplosions(homingExplosions, missiles, enemies)
    this.handleHomingLasers(enemies)
    this.handleBossLasers(enemies)
  }

  private handleLaserVsEnemies(enemies: EnemyType[]): void {
    if (
      this.manager.laser.state !== LaserState.FIRING ||
      (this.manager.powerUpLevels['homing_laser'] || 0) > 0
    ) {
      return
    }

    const start = this.manager.laser.getStartPoint()
    const end = this.manager.laser.getEndPoint()
    for (const enemy of enemies) {
      if (
        enemy.laserHitCooldown > 0 ||
        !this.lineCircleTest(
          start.x,
          start.y,
          end.x,
          end.y,
          enemy.position.x,
          enemy.position.y,
          enemy.radius,
        )
      ) {
        continue
      }

      enemy.takeDamage(10 * this.manager.player.laserDamageMultiplier)
      enemy.laserHitCooldown = 3.0
      this.manager.spawnSystem.spawnHitEffect(
        enemy.position.x,
        enemy.position.y,
        0xffffff,
        enemy.velocity.x,
        enemy.velocity.y,
      )

      if (this.didEnemyJustDie(enemy)) {
        this.handleEnemyDefeat(enemy)
      }
    }
  }

  private handleBullets(bullets: Bullet[], enemies: EnemyType[]): void {
    for (const bullet of bullets) {
      if (bullet.side === 'player') {
        this.handlePlayerBullet(bullet, enemies)
      } else if (!this.manager.isInWaveTransition && this.hitTest(bullet, this.manager.player)) {
        bullet.isAlive = false
        this.manager.player.takeDamage(1)
        this.manager.setShakeFrames(10)
        this.manager.spawnSystem.spawnHitEffect(
          bullet.position.x,
          bullet.position.y,
          0xffff00,
          bullet.velocity.x,
          bullet.velocity.y,
        )
      }
    }
  }

  private handlePlayerBullet(bullet: Bullet, enemies: EnemyType[]): void {
    for (const enemy of enemies) {
      const isHit =
        enemy instanceof CoreShield
          ? enemy.checkHit(bullet.position.x, bullet.position.y, bullet.radius)
          : this.hitTest(bullet, enemy)
      if (!isHit) continue

      if (!bullet.isPiercing) bullet.isAlive = false
      enemy.takeDamage(bullet.damage)
      this.manager.spawnSystem.spawnHitEffect(
        bullet.position.x,
        bullet.position.y,
        0xffffff,
        bullet.velocity.x,
        bullet.velocity.y,
      )
      this.manager.addScore(10)

      if (this.didEnemyJustDie(enemy)) {
        this.handleEnemyDefeat(enemy)
      }

      if (!bullet.isPiercing) break
    }
  }

  private handlePlayerVsEnemies(enemies: EnemyType[]): void {
    for (const enemy of enemies) {
      const isHit =
        enemy instanceof CoreShield
          ? enemy.checkHit(
              this.manager.player.position.x,
              this.manager.player.position.y,
              this.manager.player.radius,
            )
          : this.hitTest(this.manager.player, enemy)

      if (!isHit) continue

      if (!this.manager.isInWaveTransition) {
        const collisionDamage = Math.floor(2 / 10)
        if (collisionDamage > 0) {
          this.manager.player.takeDamage(collisionDamage)
        }
        this.manager.setShakeFrames(15)
      }

      const dx = this.manager.player.position.x - enemy.position.x
      const dy = this.manager.player.position.y - enemy.position.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 0) {
        const nx = dx / dist
        const ny = dy / dist
        const bounceForce = 20
        this.manager.player.velocity.x += nx * bounceForce
        this.manager.player.velocity.y += ny * bounceForce

        if (
          !(enemy instanceof CoreDestroyer) &&
          !(enemy instanceof VoidSerpent) &&
          !(enemy instanceof VoidSerpentSegment)
        ) {
          enemy.velocity.x -= nx * bounceForce
          enemy.velocity.y -= ny * bounceForce
          const overlap = this.manager.player.radius + enemy.radius - dist
          if (overlap > 0) {
            this.manager.player.position.x += nx * overlap * 0.5
            this.manager.player.position.y += ny * overlap * 0.5
            enemy.position.x -= nx * overlap * 0.5
            enemy.position.y -= ny * overlap * 0.5
          }
        }
      }

      this.manager.spawnSystem.spawnHitEffect(
        (this.manager.player.position.x + enemy.position.x) / 2,
        (this.manager.player.position.y + enemy.position.y) / 2,
        0xffaa00,
        (this.manager.player.velocity.x + enemy.velocity.x) / 2,
        (this.manager.player.velocity.y + enemy.velocity.y) / 2,
      )
    }
  }

  private handleMissiles(bullets: Bullet[], missiles: HomingMissile[]): void {
    for (const missile of missiles) {
      if (this.manager.laser.state === LaserState.FIRING) {
        const start = this.manager.laser.getStartPoint()
        const end = this.manager.laser.getEndPoint()
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
          this.manager.addScore(10)
          this.manager.spawnSystem.spawnHitEffect(
            missile.position.x,
            missile.position.y,
            0xffffff,
            missile.velocity.x,
            missile.velocity.y,
          )
        }
      }

      for (const bullet of bullets) {
        if (bullet.side !== 'player' || !this.hitTest(bullet, missile)) continue
        bullet.isAlive = false
        this.manager.addScore(10)
        missile.hp -= 1
        if (missile.hp <= 0) {
          missile.isAlive = false
          missile.shouldExplode = true
          this.manager.addScore(10)
        }
        this.manager.spawnSystem.spawnHitEffect(
          missile.position.x,
          missile.position.y,
          0xffffff,
          missile.velocity.x,
          missile.velocity.y,
        )
      }

      if (this.hitTest(missile, this.manager.player)) {
        missile.isAlive = false
        missile.shouldExplode = true
      }
    }
  }

  private handleHomingExplosions(
    explosions: HomingExplosion[],
    missiles: HomingMissile[],
    enemies: EnemyType[],
  ): void {
    for (const explosion of explosions) {
      if (
        !this.manager.isInWaveTransition &&
        this.hitTest(explosion, this.manager.player) &&
        explosion.canDealDamage(this.manager.player)
      ) {
        this.manager.player.takeDamage(explosion.damage)
        this.manager.setShakeFrames(20)
        this.manager.spawnSystem.spawnHitEffect(
          this.manager.player.position.x,
          this.manager.player.position.y,
          0xffaa00,
          this.manager.player.velocity.x,
          this.manager.player.velocity.y,
        )
      }

      for (const enemy of enemies) {
        const isHit =
          enemy instanceof CoreShield
            ? enemy.checkHit(explosion.position.x, explosion.position.y, explosion.radius)
            : this.hitTest(explosion, enemy)
        if (!isHit || !explosion.canDealDamage(enemy)) continue

        enemy.takeDamage(explosion.damage)
        this.manager.spawnSystem.spawnHitEffect(
          enemy.position.x,
          enemy.position.y,
          0xffaa00,
          enemy.velocity.x,
          enemy.velocity.y,
        )
        if (this.didEnemyJustDie(enemy)) {
          this.handleEnemyDefeat(enemy)
        }
      }

      for (const missile of missiles) {
        if (!this.hitTest(explosion, missile) || !explosion.canDealDamage(missile)) continue
        missile.takeDamage(explosion.damage)
        if (!missile.isAlive) missile.shouldExplode = true
        this.manager.spawnSystem.spawnHitEffect(
          missile.position.x,
          missile.position.y,
          0xffaa00,
          missile.velocity.x,
          missile.velocity.y,
        )
      }
    }
  }

  private handleHomingLasers(enemies: EnemyType[]): void {
    const homingLasers = this.manager.objects.filter(
      (obj) => obj instanceof HomingLaser && obj.isAlive,
    ) as HomingLaser[]

    for (const homingLaser of homingLasers) {
      for (const enemy of enemies) {
        const isHit =
          enemy instanceof CoreShield
            ? enemy.checkHit(homingLaser.position.x, homingLaser.position.y, homingLaser.radius)
            : this.hitTest(homingLaser, enemy)
        if (!isHit) continue

        enemy.takeDamage(homingLaser.damage)
        this.manager.spawnSystem.spawnHitEffect(
          homingLaser.position.x,
          homingLaser.position.y,
          0xffff00,
          homingLaser.velocity.x,
          homingLaser.velocity.y,
        )
        homingLaser.isAlive = false

        if (this.didEnemyJustDie(enemy)) {
          this.handleEnemyDefeat(enemy)
        }
        break
      }
    }
  }

  private handleBossLasers(enemies: EnemyType[]): void {
    for (const enemy of enemies) {
      if (!(enemy instanceof CoreDestroyer) || !enemy.isFiringLaser()) continue
      const angle = enemy.getLaserAngle()
      const startX = enemy.position.x
      const startY = enemy.position.y
      const endX = startX + Math.sin(angle) * 2000
      const endY = startY - Math.cos(angle) * 2000

      if (
        this.lineCircleTest(
          startX,
          startY,
          endX,
          endY,
          this.manager.player.position.x,
          this.manager.player.position.y,
          this.manager.player.radius,
        )
      ) {
        this.manager.player.takeDamage(0.5)
        this.manager.setShakeFramesMax(5)
      }
    }
  }

  private handleEnemyDefeat(enemy: EnemyType): void {
    if (enemy instanceof CoreDestroyer) {
      enemy.isDying = true
      this.manager.addObject(
        new BossDestructionEffect(
          enemy.position.x,
          enemy.position.y,
          (obj) => this.manager.addObject(obj),
          (frames) => {
            this.manager.setShakeFramesMax(frames)
          },
          () => {
            enemy.isAlive = false
          },
        ),
      )
    } else if (enemy instanceof VoidSerpent) {
      enemy.isDying = true
      this.manager.addObject(
        new BossDestructionEffect(
          enemy.position.x,
          enemy.position.y,
          (obj) => this.manager.addObject(obj),
          (frames) => {
            this.manager.setShakeFramesMax(frames)
          },
          () => {
            enemy.isAlive = false
          },
        ),
      )
      enemy.getAllActiveSegments().forEach((segment) => {
        this.manager.spawnSystem.spawnDestructionEffect(segment.position.x, segment.position.y, 0, 0)
        segment.destroySegment()
      })
    } else if (enemy instanceof VoidSerpentSegment) {
      this.manager.spawnSystem.spawnDestructionEffect(
        enemy.position.x,
        enemy.position.y,
        enemy.velocity.x,
        enemy.velocity.y,
      )
      enemy.destroySegment()
    } else {
      this.manager.spawnSystem.spawnDestructionEffect(
        enemy.position.x,
        enemy.position.y,
        enemy.velocity.x,
        enemy.velocity.y,
      )
    }

    this.manager.spawnSystem.awardEnemyDestruction(enemy)
  }

  private didEnemyJustDie(enemy: EnemyType): boolean {
    return (
      !enemy.isAlive ||
      (enemy instanceof CoreDestroyer && enemy.hp <= 0 && !enemy.isDying) ||
      (enemy instanceof VoidSerpent && enemy.hp <= 0 && !enemy.isDying) ||
      (enemy instanceof VoidSerpentSegment && enemy.hp <= 0 && !enemy.isDestroyed)
    )
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
    const laserW = 4 * this.manager.player.laserWidthMultiplier
    const combinedR = r + laserW

    let dcx = cx - x1
    let dcy = cy - y1
    while (dcx > WORLD_HALF) dcx -= WORLD_SIZE
    while (dcx < -WORLD_HALF) dcx += WORLD_SIZE
    while (dcy > WORLD_HALF) dcy -= WORLD_SIZE
    while (dcy < -WORLD_HALF) dcy += WORLD_SIZE

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
    while (dx > WORLD_HALF) dx -= WORLD_SIZE
    while (dx < -WORLD_HALF) dx += WORLD_SIZE
    while (dy > WORLD_HALF) dy -= WORLD_SIZE
    while (dy < -WORLD_HALF) dy += WORLD_SIZE
    const distance = Math.sqrt(dx * dx + dy * dy)
    return distance < (a.radius || 10) + (b.radius || 10)
  }
}
