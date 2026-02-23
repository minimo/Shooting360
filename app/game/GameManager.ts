import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { Player } from './Player'
import { Bullet } from './Bullet'
import { Enemy } from './Enemy'
import { SniperEnemy } from './SniperEnemy'
import { Explosion } from './Explosion'
import { Particle } from './Particle'
import { Laser, LaserState } from './Laser'
import { Minimap } from './Minimap'
import { BackgroundObject } from './BackgroundObject'
import { HomingMissile } from './HomingMissile'
import { HomingExplosion } from './HomingExplosion'
import { GameObject, WORLD_SIZE, WORLD_HALF } from './GameObject'
import type { InputState } from '~/composables/useInput'

/**
 * ゲーム全体の状態を管理するマネージャー
 */
export class GameManager {
    private app: Application | null = null
    private mainContainer: Container = new Container()
    private minimap: Minimap = new Minimap()
    public player: Player = new Player(0, 0, () => { })
    private laser: Laser = new Laser(0, 0)
    private objects: GameObject[] = []
    private screenWidth: number = 0
    private screenHeight: number = 0
    private uiContainer: Container = new Container()
    private hpGauge: Graphics = new Graphics()
    private shakeFrames: number = 0
    public isGameOver: boolean = false
    private gameOverTimer: number = 0
    private hasTriggeredMassiveExplosion: boolean = false
    private score: number = 0
    private scoreText: Text | null = null

    // スポーンタイマー
    private enemySpawnTimer: number = 0
    private enemySpawnInterval: number = 120 // フレーム単位

    /** ゲームがアクティブ（開始済み）かどうか */
    public isGameActive: boolean = false

    public get stage(): Container {
        return this.mainContainer
    }

    /**
     * 初期化
     */
    public init(app: Application): void {
        this.app = app
        this.app.stage.addChild(this.mainContainer)

        // --- UI Container ---
        this.app.stage.addChild(this.uiContainer)
        this.uiContainer.addChild(this.hpGauge)

        this.objects = []
        this.isGameOver = false
        this.isGameActive = false // タイトル画面中は停止
        this.mainContainer.visible = false
        this.uiContainer.visible = false
        this.gameOverTimer = 0
        this.score = 0 // スコアリセット
        this.hasTriggeredMassiveExplosion = false

        // --- Minimap ---
        this.minimap = new Minimap()
        this.uiContainer.addChild(this.minimap.display)

        // --- Score UI ---
        this.initScoreUI()
        this.addScore(0) // 表示リセット

        this.screenWidth = app.screen.width
        this.screenHeight = app.screen.height
        this.mainContainer.position.set(this.screenWidth / 2, this.screenHeight / 2)

        // --- 弾生成コールバック ---
        const spawnBullet = (x: number, y: number, angle: number, side?: 'player' | 'enemy') => {
            this.spawnBullet(x, y, angle, side || 'player')
        }

        // --- Laser ---
        this.laser = new Laser(0, 0)
        this.addObject(this.laser)

        // --- Player ---
        this.player = new Player(0, 0, spawnBullet)
        this.player.screenWidth = this.screenWidth
        this.player.screenHeight = this.screenHeight
        this.mainContainer.addChild(this.player.display)

        // --- Background ---
        // ワールドが2倍（面積4倍）になったため、密度を維持するために数を4倍(50->200)に増やす
        for (let i = 0; i < 200; i++) {
            const x = (Math.random() - 0.5) * WORLD_SIZE
            const y = (Math.random() - 0.5) * WORLD_SIZE
            this.addObject(new BackgroundObject(x, y))
        }

        this.updateMinimapPosition()
    }

    /**
     * オブジェクト追加
     */
    private addObject(obj: GameObject): void {
        this.objects.push(obj)
        this.mainContainer.addChild(obj.display)
    }

    /**
     * 弾丸生成
     */
    private spawnBullet(x: number, y: number, angle: number, side: 'player' | 'enemy'): void {
        const bullet = new Bullet(x, y, angle, side)
        this.addObject(bullet)
    }

    /**
     * 誘導ミサイル生成
     */
    private spawnHomingMissile(x: number, y: number, angle: number): void {
        const missile = new HomingMissile(x, y, angle, this.player)
        this.addObject(missile)
    }

    private initScoreUI(): void {
        if (this.scoreText) return // 既に存在する場合は作成しない

        const style = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 24,
            fontWeight: 'bold',
            fill: '#ffffff',
            dropShadow: {
                alpha: 0.5,
                angle: 2,
                blur: 4,
                color: '#000000',
                distance: 2
            }
        })

        this.scoreText = new Text({ text: 'SCORE: 000000', style })
        this.scoreText.anchor.set(0, 0.5) // 縦の中央を基準にする
        this.scoreText.x = 20
        this.scoreText.y = 30 // HPゲージ (y=20, h=20) の中心 y=30 に合わせる
        this.uiContainer.addChild(this.scoreText)
    }

    private addScore(amount: number): void {
        this.score += amount
        if (this.scoreText) {
            this.scoreText.text = `SCORE: ${this.score.toString().padStart(6, '0')}`
        }
    }

    /**
     * ダメージ付き爆発生成
     */
    private spawnHomingExplosion(x: number, y: number, vx: number = 0, vy: number = 0, scale: number = 2.25, duration: number = 30): void {
        const explosion = new HomingExplosion(x, y, scale, duration, vx, vy)
        this.addObject(explosion)
    }

    /**
     * 毎フレーム更新
     */
    public update(delta: number, input: InputState): void {
        if (this.isGameOver) return

        // --- ゲームオーバー（自機破壊）演出中 ---
        if (!this.player.isAlive && !this.isGameOver) {
            // 初回の自機破壊：演出タイマーをセット（どのダメージソースでも確実に発動）
            if (this.gameOverTimer <= 0) {
                this.gameOverTimer = 180
                this.hasTriggeredMassiveExplosion = false
                this.spawnHitEffect(this.player.position.x, this.player.position.y, 0xffaa00, this.player.velocity.x, this.player.velocity.y)
                this.shakeFrames = 30
            }

            this.gameOverTimer -= delta

            // 計3秒(180フレーム)
            if (this.gameOverTimer > 120) {
                // [最初の1秒] 連続して派手な爆発を発生させる（自機は漂い続ける）
                if (Math.random() < 0.15) {
                    const exX = this.player.position.x + (Math.random() - 0.5) * 80
                    const exY = this.player.position.y + (Math.random() - 0.5) * 80
                    const colors = [0xff8800, 0xffaa00, 0xff3300, 0xffffff]
                    const color = colors[Math.floor(Math.random() * colors.length)] ?? 0xff8800

                    this.spawnExplosion(exX, exY, color, 1.0 + Math.random(), 20 + Math.random() * 20, true)

                    for (let i = 0; i < 15; i++) {
                        const angle = Math.random() * Math.PI * 2
                        const speed = 5 + Math.random() * 10
                        const baseLife = 20 + Math.random() * 20
                        const particle = new Particle(exX, exY, Math.cos(angle) * speed, Math.sin(angle) * speed, baseLife, color, 3)
                        this.addObject(particle)
                    }
                    this.shakeFrames = 15
                }
            } else if (this.gameOverTimer > 0) {
                // [1秒経過〜3秒未満] 巨大爆散＋自機消失（初回のみ発動）
                if (!this.hasTriggeredMassiveExplosion) {
                    const cx = this.player.position.x
                    const cy = this.player.position.y

                    // 中央の超巨大爆発
                    this.spawnExplosion(cx, cy, 0xffffff, 4.0, 40, true)

                    // 周囲に散らばる複数の大爆発 (3〜5個)
                    const explosionCount = 3 + Math.floor(Math.random() * 3)
                    for (let i = 0; i < explosionCount; i++) {
                        const angle = Math.random() * Math.PI * 2
                        const dist = 40 + Math.random() * 60
                        const ex = cx + Math.cos(angle) * dist
                        const ey = cy + Math.sin(angle) * dist
                        // オレンジ・黄色の巨大爆発
                        this.spawnExplosion(ex, ey, 0xffaa00, 2.0 + Math.random() * 2.0, 30 + Math.random() * 20, true)
                    }

                    // ど派手な大量のパーティクル放出
                    const particleCount = 80 + Math.floor(Math.random() * 40) // 80〜120個
                    for (let n = 0; n < particleCount; n++) {
                        const angle = Math.random() * Math.PI * 2
                        const speed = 5 + Math.random() * 25
                        const baseLife = 40 + Math.random() * 40
                        const colors = [0xffffff, 0xffaa00, 0xff5500, 0x00ffff]
                        const pColor = colors[Math.floor(Math.random() * colors.length)]
                        const size = 3 + Math.random() * 3
                        const particle = new Particle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, baseLife, pColor, size)
                        this.addObject(particle)
                    }

                    // 自機を非表示に
                    this.player.display.visible = false

                    this.shakeFrames = 60 // 巨大な揺れ
                    this.hasTriggeredMassiveExplosion = true
                }
            } else {
                // [3秒経過] 演出全終了、真のゲームオーバー状態へ
                this.isGameOver = true
                return
            }
        }

        if (!this.isGameActive) return // タイトル画面中は停止

        // ゲーム開始時にコンテナを表示
        if (!this.mainContainer.visible) {
            this.mainContainer.visible = true
            this.uiContainer.visible = true
        }

        // --- 画面シェイクエフェクト ---
        if (this.shakeFrames > 0) {
            this.shakeFrames -= delta
            const dx = (Math.random() - 0.5) * 10
            const dy = (Math.random() - 0.5) * 10
            this.mainContainer.position.set((this.screenWidth / 2) + dx, (this.screenHeight / 2) + dy)
        } else {
            this.mainContainer.position.set(this.screenWidth / 2, this.screenHeight / 2)
        }

        // 1. Player更新 (レーザーのパワー消費・回復)
        const isLaserFiring = this.laser.state === LaserState.FIRING
        // ブーストのパワー消費は Player.update 内で単発的に行われるようになったため、ここでは false を渡す
        this.player.updateLaserPower(delta, isLaserFiring, false)

        // パワーが切れた、またはオーバーヒート冷却中ならレーザーを強制停止
        let laserTrigger = input.laser
        if (this.player.laserPower <= 0 || this.player.isLaserOverheated) {
            laserTrigger = false
        }

        this.player.update(delta, input)
        this.laser.updateFromPlayer(this.player.position.x, this.player.position.y, this.player.rotation)
        this.laser.setTrigger(laserTrigger)

        // --- レーザー演出（パーティクル） ---
        if (this.laser.state === LaserState.CHARGING || this.laser.state === LaserState.FIRING) {
            // 自機の先端（中心から前方に20px程度）
            const tipX = this.player.position.x + Math.sin(this.player.rotation) * 20
            const tipY = this.player.position.y - Math.cos(this.player.rotation) * 20

            // チャージ中は徐々に量を増やす (progress 0->1), 発射中は高頻度(1.0)
            const intensity = this.laser.state === LaserState.CHARGING ? this.laser.chargeProgress : 1.0

            // 密度を調整：intensity=1の時、1フレームあたり平均3個程度
            const pCount = Math.floor(intensity * 3) + (Math.random() < (intensity * 3 % 1) ? 1 : 0)

            for (let i = 0; i < pCount; i++) {
                const angle = this.player.rotation + (Math.random() - 0.5) * 1.5
                const speed = 2 + Math.random() * 5
                const vx = Math.sin(angle) * speed
                const vy = -Math.cos(angle) * speed
                const life = 10 + Math.random() * 10
                const particle = new Particle(tipX, tipY, vx, vy, life, 0x00ffff, 2)
                this.addObject(particle)
            }
        }

        // --- ブースト演出（後方への火花） ---
        if (this.player.isBoosting) {
            // 自機の後方（中心から後方に15px程度）
            const rearX = this.player.position.x - Math.sin(this.player.rotation) * 15
            const rearY = this.player.position.y + Math.cos(this.player.rotation) * 15

            // 1フレームあたり平均4個程度
            const pCount = 3 + Math.floor(Math.random() * 3)

            for (let i = 0; i < pCount; i++) {
                // 真後ろから広がるように
                const angle = this.player.rotation + Math.PI + (Math.random() - 0.5) * 0.8
                const speed = 5 + Math.random() * 10
                const vx = Math.sin(angle) * speed
                const vy = -Math.cos(angle) * speed
                const life = 15 + Math.random() * 15
                // 青白い火花とオレンジを混ぜる
                const color = Math.random() < 0.7 ? 0x00ffff : 0xffaa00
                const particle = new Particle(rearX, rearY, vx, vy, life, color, 2 + Math.random() * 2)
                this.addObject(particle)
            }
            // ブースト中は少し画面を揺らす
            this.shakeFrames = Math.max(this.shakeFrames, 2)
        }

        // 2. 敵スポーン管理 (ゲーム開始後のみ・自機生存中のみ)
        if (this.isGameActive && this.player.isAlive) {
            this.enemySpawnTimer -= delta
            if (this.enemySpawnTimer <= 0) {
                // 現在生存している敵の数を数える
                const enemyCount = this.objects.filter(obj => (obj instanceof Enemy || obj instanceof SniperEnemy) && obj.isAlive).length
                if (enemyCount < 5) {
                    this.spawnEnemy()
                }
                this.enemySpawnTimer = this.enemySpawnInterval
            }
        }

        // 3. 全オブジェクト更新 & 当たり判定
        this.checkCollisions()

        for (const obj of this.objects) {
            if (obj.isAlive) {
                obj.update(delta)
            }

            // 誘導ミサイルが爆発フラグを立てていたら爆発を生成
            // (updateで立った場合も、衝突判定で立った場合もここで拾う)
            if (obj instanceof HomingMissile && obj.shouldExplode) {
                if (obj.isMaxDistanceExplosion) {
                    // 最大飛距離到達時は通常の1/4サイズ
                    this.spawnHomingExplosion(obj.position.x, obj.position.y, obj.velocity.x, obj.velocity.y, 2.25 / 4, 30 / 4)
                } else {
                    this.spawnHomingExplosion(obj.position.x, obj.position.y, obj.velocity.x, obj.velocity.y)
                }
                obj.shouldExplode = false // 二重発生防止
            }
        }

        // 4. 不要なオブジェクトの削除
        this.cleanup()

        // 5. 表示更新（カメラ追従：自機を常に中心に）
        const cameraX = this.player.position.x
        const cameraY = this.player.position.y

        for (const obj of this.objects) {
            obj.updateDisplay(cameraX, cameraY)
        }
        this.player.updateDisplay(cameraX, cameraY)

        // 6. ミニマップ更新
        this.minimap.update(this.player, this.objects)

        // 7. HPゲージ更新
        this.drawHpGauge()
    }

    private drawHpGauge(): void {
        this.hpGauge.clear()
        // 背景
        this.hpGauge.rect(this.screenWidth / 2 - 100, 20, 200, 20)
        this.hpGauge.fill({ color: 0x333333, alpha: 0.8 })

        const ratio = Math.max(0, this.player.hp / this.player.maxHp)
        let color = 0x00ffff // Default: Blue
        if (ratio < 0.3) color = 0xff0000 // Red
        else if (ratio < 0.5) color = 0xffff00 // Yellow
        else if (ratio < 0.75) color = 0x00ff00 // Green

        this.hpGauge.rect(this.screenWidth / 2 - 100, 20, 200 * ratio, 20)
        this.hpGauge.fill({ color, alpha: 1 })

        this.hpGauge.stroke({ color: 0xffffff, width: 2 })
    }

    /**
     * ミニマップの位置を右上に更新
     */
    private updateMinimapPosition(): void {
        this.minimap.setPosition(this.screenWidth - 180, 20)
    }

    /**
     * 画面リサイズ対応
     */
    public resize(width: number, height: number): void {
        this.screenWidth = width
        this.screenHeight = height
        this.mainContainer.position.set(width / 2, height / 2)
        if (this.player) {
            this.player.screenWidth = width
            this.player.screenHeight = height
        }
        this.updateMinimapPosition()
    }

    /**
     * 破棄処理
     */
    public destroy(): void {
        // オブジェクトの破棄
        for (const obj of this.objects) {
            obj.destroy()
        }
        this.objects = []

        // 自機の破棄（重要：これがないとリスタート時に残る可能性がある）
        if (this.player) {
            this.player.destroy()
        }

        // レーザーの破棄
        if (this.laser) {
            this.laser.destroy()
        }

        // コンテナの破棄とステージからの削除
        this.mainContainer.destroy({ children: true })
        this.uiContainer.destroy({ children: true })

        this.app = null
    }

    /**
     * 敵機スポーン
     */
    private spawnEnemy(): void {
        // プレイヤーから離れた場所にスポーン
        const angle = Math.random() * Math.PI * 2
        // マップが広大になったため、スポーン範囲を少し広げて出現を自然にする
        const dist = 800 + Math.random() * 400
        const x = this.player.position.x + Math.sin(angle) * dist
        const y = this.player.position.y - Math.cos(angle) * dist

        // 70%で通常の敵、30%でスナイパー型の敵
        if (Math.random() < 0.7) {
            const enemy = new Enemy(x, y, this.player, (ex: number, ey: number, ea: number) => this.spawnBullet(ex, ey, ea, 'enemy'))
            this.addObject(enemy)
        } else {
            const sniper = new SniperEnemy(x, y, this.player, (ex: number, ey: number, ea: number) => this.spawnHomingMissile(ex, ey, ea))
            this.addObject(sniper)
        }
    }

    /**
     * 当たり判定管理
     */
    private checkCollisions(): void {
        // 弾丸などの生存しているオブジェクトを取得
        const bullets = this.objects.filter(obj => obj instanceof Bullet && obj.isAlive) as Bullet[]
        const enemies = this.objects.filter(obj => (obj instanceof Enemy || obj instanceof SniperEnemy) && obj.isAlive) as (Enemy | SniperEnemy)[]

        // レーザーの当たり判定（発射中のみ判定）
        if (this.laser.state === LaserState.FIRING) {

            const start = this.player.position
            const end = this.laser.getEndPoint()
            for (const enemy of enemies) {
                if (this.lineCircleTest(start.x, start.y, end.x, end.y, enemy.position.x, enemy.position.y, enemy.radius)) {
                    enemy.takeDamage(10) // レーザーを一撃必殺（威力10）に強化
                    this.spawnHitEffect(enemy.position.x, enemy.position.y, 0xffffff, enemy.velocity.x, enemy.velocity.y)
                    if (!enemy.isAlive) {
                        this.spawnDestructionEffect(enemy.position.x, enemy.position.y, enemy.velocity.x, enemy.velocity.y)
                        if (enemy instanceof SniperEnemy) {
                            this.addScore(200)
                        } else {
                            this.addScore(100)
                        }
                    }
                }
            }
        }

        for (const bullet of bullets) {
            if (bullet.side === 'player') {
                // 自機の弾 vs 敵機
                for (const enemy of enemies) {
                    if (this.hitTest(bullet, enemy)) {
                        bullet.isAlive = false
                        enemy.takeDamage(1)
                        // ヒットエフェクト
                        this.spawnHitEffect(bullet.position.x, bullet.position.y, 0xffffff, bullet.velocity.x, bullet.velocity.y)

                        // 通常弾ヒット加点 (10点)
                        this.addScore(10)

                        if (!enemy.isAlive) {
                            this.spawnDestructionEffect(enemy.position.x, enemy.position.y, enemy.velocity.x, enemy.velocity.y)
                            // 撃破加点
                            if (enemy instanceof SniperEnemy) {
                                this.addScore(200)
                            } else {
                                this.addScore(100)
                            }
                        }
                    }
                }
            } else {
                // 敵機の弾 vs 自機
                if (this.hitTest(bullet, this.player)) {
                    bullet.isAlive = false
                    this.player.takeDamage(1)
                    this.shakeFrames = 10
                    console.log('Player hit! HP:', this.player.hp)
                    // 自機ヒットエフェクト（黄色パーティクル）
                    this.spawnHitEffect(bullet.position.x, bullet.position.y, 0xffff00, bullet.velocity.x, bullet.velocity.y)
                }
            }
        }

        // 自機 vs 敵機（体当り・弾き飛ばし）
        for (const enemy of enemies) {
            if (this.hitTest(this.player, enemy)) {
                // ダメージ処理
                this.player.takeDamage(2)
                this.shakeFrames = 15

                // 衝突ベクトルを計算 (敵からプレイヤーへの方向)
                const dx = this.player.position.x - enemy.position.x
                const dy = this.player.position.y - enemy.position.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist > 0) {
                    const nx = dx / dist
                    const ny = dy / dist

                    // 反発の強さ
                    const bounceForce = 20

                    // お互いを逆方向に弾き飛ばす
                    this.player.velocity.x += nx * bounceForce
                    this.player.velocity.y += ny * bounceForce
                    enemy.velocity.x -= nx * bounceForce
                    enemy.velocity.y -= ny * bounceForce

                    // めり込み防止：お互いを重ならない位置まで押し出す
                    const overlap = (this.player.radius + enemy.radius) - dist
                    if (overlap > 0) {
                        this.player.position.x += nx * overlap * 0.5
                        this.player.position.y += ny * overlap * 0.5
                        enemy.position.x -= nx * overlap * 0.5
                        enemy.position.y -= ny * overlap * 0.5
                    }
                }

                // 衝突エフェクト（火花）生成
                this.spawnHitEffect(
                    (this.player.position.x + enemy.position.x) / 2,
                    (this.player.position.y + enemy.position.y) / 2,
                    0xffaa00,
                    (this.player.velocity.x + enemy.velocity.x) / 2,
                    (this.player.velocity.y + enemy.velocity.y) / 2
                )

                console.log('Player bounced with enemy!')
            }
        }

        // --- 誘導ミサイル関連の衝突判定 ---
        const missiles = this.objects.filter(obj => obj instanceof HomingMissile && obj.isAlive) as HomingMissile[]
        const homingExplosions = this.objects.filter(obj => obj instanceof HomingExplosion && obj.isAlive) as HomingExplosion[]

        // 1. 自機の弾・レーザー vs 誘導ミサイル
        for (const missile of missiles) {
            // レーザー
            if (this.laser.state === LaserState.FIRING) {
                const start = this.player.position
                const end = this.laser.getEndPoint()
                if (this.lineCircleTest(start.x, start.y, end.x, end.y, missile.position.x, missile.position.y, missile.radius)) {
                    missile.isAlive = false
                    missile.shouldExplode = true
                    this.spawnHitEffect(missile.position.x, missile.position.y, 0xffffff, missile.velocity.x, missile.velocity.y)
                }
            }
            // 自機の弾
            for (const bullet of bullets) {
                if (bullet.side === 'player' && this.hitTest(bullet, missile)) {
                    bullet.isAlive = false

                    // 通常弾ヒット加点 (誘導弾もヒット自体は10点とする)
                    this.addScore(10)

                    missile.hp -= 1 // HomingMissile は hp: 1 なのでこれで破壊
                    if (missile.hp <= 0) {
                        missile.isAlive = false
                        missile.shouldExplode = true
                        // 撃破加点：誘導弾は0点 (ユーザー指定)
                    }
                    this.spawnHitEffect(missile.position.x, missile.position.y, 0xffffff, missile.velocity.x, missile.velocity.y)
                }
            }
            // 自機との体当り
            if (this.hitTest(missile, this.player)) {
                missile.isAlive = false
                missile.shouldExplode = true
            }
        }

        // 2. 爆発 vs 各種オブジェクト
        for (const ex of homingExplosions) {
            // 自機との衝突
            if (this.hitTest(ex, this.player)) {
                if (ex.canDealDamage(this.player)) {
                    this.player.takeDamage(ex.damage)
                    this.shakeFrames = 20
                    this.spawnHitEffect(this.player.position.x, this.player.position.y, 0xffaa00, this.player.velocity.x, this.player.velocity.y)
                    // プレイヤー被弾なので加点なし
                }
            }

            // 敵機（Enemy, SniperEnemy）との衝突
            const enemies = this.objects.filter(obj => (obj instanceof Enemy || obj instanceof SniperEnemy) && obj.isAlive) as (Enemy | SniperEnemy)[]
            for (const enemy of enemies) {
                if (this.hitTest(ex, enemy)) {
                    if (ex.canDealDamage(enemy)) {
                        enemy.takeDamage(ex.damage)
                        this.spawnHitEffect(enemy.position.x, enemy.position.y, 0xffaa00, enemy.velocity.x, enemy.velocity.y)

                        // 誘爆による撃破加点
                        if (!enemy.isAlive) {
                            this.spawnDestructionEffect(enemy.position.x, enemy.position.y, enemy.velocity.x, enemy.velocity.y)
                            if (enemy instanceof SniperEnemy) {
                                this.addScore(200)
                            } else {
                                this.addScore(100)
                            }
                        }
                    }
                }
            }

            // 他の誘導弾との衝突
            for (const missile of missiles) {
                if (this.hitTest(ex, missile)) {
                    if (ex.canDealDamage(missile)) {
                        missile.takeDamage(ex.damage)
                        if (!missile.isAlive) {
                            missile.shouldExplode = true // 誘爆
                        }
                        this.spawnHitEffect(missile.position.x, missile.position.y, 0xffaa00, missile.velocity.x, missile.velocity.y)
                    }
                }
            }
        }
    }

    /**
     * ヒットエフェクト（火花 + ミニ爆発）を生成
     */
    private spawnHitEffect(x: number, y: number, color: number = 0xffffff, sourceVx: number = 0, sourceVy: number = 0): void {
        // 小さなフラッシュ（爆発）
        this.spawnExplosion(x, y, color, 0.3, 10, true, sourceVx, sourceVy)

        // 火花パーティクル（元オブジェクトの慣性を加算）
        const particleCount = 5 + Math.floor(Math.random() * 5)
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 2 + Math.random() * 4
            const pvx = Math.cos(angle) * speed + sourceVx
            const pvy = Math.sin(angle) * speed + sourceVy
            const particle = new Particle(x, y, pvx, pvy, 15 + Math.random() * 10, color, 2)
            this.addObject(particle)
        }
    }

    /**
     * 破壊エフェクト（派手な爆発）を生成
     */
    private spawnDestructionEffect(x: number, y: number, sourceVx: number = 0, sourceVy: number = 0): void {
        // 派手な爆発（フラッシュ付き、スケール大）
        this.spawnExplosion(x, y, 0xff8800, 1.5, 30, true, sourceVx, sourceVy)

        // 大量の火花パーティクル（元オブジェクトの慣性を加算）
        const particleCount = 20 + Math.floor(Math.random() * 10)
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 3 + Math.random() * 8
            const pvx = Math.cos(angle) * speed + sourceVx
            const pvy = Math.sin(angle) * speed + sourceVy
            const particle = new Particle(x, y, pvx, pvy, 20 + Math.random() * 20, 0xffaa00, 3)
            this.addObject(particle)
        }
    }

    /**
     * 爆発エフェクトを単体生成
     */
    private spawnExplosion(x: number, y: number, color: number, scale: number, duration: number, isFlashy: boolean = false, vx: number = 0, vy: number = 0): void {
        const explosion = new Explosion(x, y, color, scale, duration, isFlashy, vx, vy)
        this.addObject(explosion)
    }

    /**
     * 線分と円の当たり判定
     */
    private lineCircleTest(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
        // 円の中心(cx, cy)を始点(x1, y1)からの最短経路上の座標に補正する
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
        return distSq < r * r
    }

    /**
     * 円形当たり判定
     */
    private hitTest(a: GameObject, b: GameObject): boolean {
        let dx = a.position.x - b.position.x
        let dy = a.position.y - b.position.y

        // --- 最短経路補正 ---
        if (dx > WORLD_HALF) dx -= WORLD_SIZE
        if (dx < -WORLD_HALF) dx += WORLD_SIZE
        if (dy > WORLD_HALF) dy -= WORLD_SIZE
        if (dy < -WORLD_HALF) dy += WORLD_SIZE

        const distance = Math.sqrt(dx * dx + dy * dy)
        const r1 = a.radius || 10
        const r2 = b.radius || 10
        return distance < r1 + r2
    }

    /**
     * オブジェクトのクリーンアップ
     */
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
