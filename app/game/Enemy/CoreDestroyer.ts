import * as THREE from 'three'
import { GameObject, WORLD_SIZE, WORLD_HALF } from '../GameObject'
import type { Player, SpawnBulletFn } from '../Player'

export enum BossState {
  NORMAL = 'normal',
  PREPARING_LASER = 'preparing_laser',
  FIRING_LASER = 'firing_laser',
}

/**
 * Wave 5 Boss: Galaxy Core (Core Destroyer)
 */
export class CoreDestroyer extends GameObject {
  public hp: number = 300
  public maxHp: number = 300
  private player: Player
  private spawnBullet: SpawnBulletFn
  private addObject: (obj: GameObject) => void
  
  private state: BossState = BossState.NORMAL
  private stateTimer: number = 0
  
  private coreMesh: THREE.Mesh | null = null
  public shieldAngle: number = 0
  private shieldRotationSpeed: number = 0.005
  
  private laserMesh: THREE.Mesh | null = null
  private innerLaserMesh: THREE.Mesh | null = null
  private laserContainer: THREE.Group = new THREE.Group()

  // 自機 Laser.ts と同等のシェーダー
  private static readonly vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  private static readonly fragmentShader = `
    uniform vec3 color;
    uniform float opacity;
    varying vec2 vUv;
    void main() {
      float dist = abs(vUv.x - 0.5) * 2.0;
      float alpha = (1.0 - pow(dist, 2.0)) * opacity;
      gl_FragColor = vec4(color, alpha);
    }
  `

  // チャージ時の円形グラデーション用
  private static readonly chargeFragmentShader = `
    uniform vec3 color;
    uniform float opacity;
    varying vec2 vUv;
    void main() {
      // 0.5を中心に、外側(0.5の距離)に向かって透明になるグラデーション
      float dist = distance(vUv, vec2(0.5));
      float alpha = max(0.0, 1.0 - (dist * 2.0)) * opacity;
      gl_FragColor = vec4(color, alpha);
    }
  `

  // チャージ演出
  private chargeMesh: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial> | null = null
  private chargeGlowMesh: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial> | null = null

  constructor(
    x: number,
    y: number,
    player: Player,
    spawnBullet: SpawnBulletFn,
    addObject: (obj: GameObject) => void,
    wave: number
  ) {
    super(x, y)
    this.side = 'enemy'
    this.radius = 130 
    this.player = player
    this.spawnBullet = spawnBullet
    this.addObject = addObject
    
    this.maxHp = 1200 + (wave - 5) * 400
    this.hp = this.maxHp
    
    this.createMesh()
    this.stateTimer = 180 
  }

  private createMesh(): void {
    // 中心コア (半径 120)
    const coreGeo = new THREE.SphereGeometry(120, 32, 32)
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2,
      transparent: true,
      opacity: 0.9
    })
    this.coreMesh = new THREE.Mesh(coreGeo, coreMat)
    this.coreMesh.position.z = 0.5
    this.mesh.add(this.coreMesh)


    // チャージ演出 (自機 Laser.ts の実装をベースに、セグメント数を増やしグラデーションを適用)
    const chargeGeo = new THREE.CircleGeometry(1, 64)
    this.chargeMesh = new THREE.Mesh(
      chargeGeo,
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0xffffff) }, opacity: { value: 0 } },
        vertexShader: CoreDestroyer.vertexShader,
        fragmentShader: CoreDestroyer.chargeFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    this.chargeMesh.position.z = 2.0
    this.mesh.add(this.chargeMesh)

    this.chargeGlowMesh = new THREE.Mesh(
      chargeGeo,
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0xff3333) }, opacity: { value: 0 } },
        vertexShader: CoreDestroyer.vertexShader,
        fragmentShader: CoreDestroyer.chargeFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    this.chargeGlowMesh.position.z = 1.9
    this.mesh.add(this.chargeGlowMesh)

    // レーザー用コンテナ
    this.mesh.add(this.laserContainer)
    this.laserContainer.position.z = 0.2
    
    // メガレーザー
    const laserHeight = 4000
    const laserWidth = 160
    const laserGeo = new THREE.PlaneGeometry(laserWidth, laserHeight)
    laserGeo.translate(0, laserHeight / 2 + 100, 0)
    
    const laserMat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xff3333) },
        opacity: { value: 0 },
      },
      vertexShader: CoreDestroyer.vertexShader,
      fragmentShader: CoreDestroyer.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    this.laserMesh = new THREE.Mesh(laserGeo, laserMat)
    this.laserMesh.visible = false
    this.laserContainer.add(this.laserMesh)

    const innerGeo = new THREE.PlaneGeometry(40, laserHeight)
    innerGeo.translate(0, laserHeight / 2 + 100, 0.1)
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    this.innerLaserMesh = new THREE.Mesh(innerGeo, innerMat)
    this.laserMesh.add(this.innerLaserMesh)
  }

  public takeDamage(amount: number): void {
    this.hp -= amount
    if (this.coreMesh && this.coreMesh.material instanceof THREE.MeshStandardMaterial) {
      this.coreMesh.material.emissive.setHex(0xff0000)
      setTimeout(() => {
        if (this.coreMesh && this.coreMesh.material instanceof THREE.MeshStandardMaterial) {
          this.coreMesh.material.emissive.setHex(0x00ffff)
        }
      }, 50)
    }
    if (this.hp <= 0) this.isAlive = false
  }

  public override update(delta: number): void {
    this.stateTimer -= delta
    const currentRotSpeed = this.state === BossState.FIRING_LASER ? this.shieldRotationSpeed * 3 : this.shieldRotationSpeed
    this.shieldAngle += currentRotSpeed * delta

    let dx = this.player.position.x - this.position.x
    let dy = this.player.position.y - this.position.y
    if (dx > WORLD_HALF) dx -= WORLD_SIZE
    if (dx < -WORLD_HALF) dx += WORLD_SIZE
    if (dy > WORLD_HALF) dy -= WORLD_SIZE
    if (dy < -WORLD_HALF) dy += WORLD_SIZE
    const angleToPlayer = Math.atan2(dx, -dy)

    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 500) {
      this.velocity.x = Math.sin(angleToPlayer) * 1.5
      this.velocity.y = -Math.cos(angleToPlayer) * 1.5
    } else {
      this.velocity.x *= 0.95
      this.velocity.y *= 0.95
    }

    this.updatePosition(delta)

    switch (this.state) {
      case BossState.NORMAL:
        if (this.stateTimer <= 0) {
          this.state = BossState.PREPARING_LASER
          this.stateTimer = 120 
        }
        if (this.chargeMesh) this.chargeMesh.material.uniforms.opacity.value = 0
        if (this.chargeGlowMesh) this.chargeGlowMesh.material.uniforms.opacity.value = 0
        break
        
      case BossState.PREPARING_LASER:
        this.laserContainer.rotation.z = -angleToPlayer
        
        // チャージ演出 (自機 Laser.ts ロジックの拡大版)
        const progress = 1 - (this.stateTimer / 120)
        // 遠方から急激に収束させるため開始サイズを大きくする
        const baseSize = 800 * (1 - progress) + 120 
        
        if (this.chargeMesh) {
            this.chargeMesh.geometry.dispose()
            this.chargeMesh.geometry = new THREE.CircleGeometry(baseSize + 30, 64)
            this.chargeMesh.material.uniforms.opacity.value = 1.0 * progress
        }
        if (this.chargeGlowMesh) {
            this.chargeGlowMesh.geometry.dispose()
            this.chargeGlowMesh.geometry = new THREE.CircleGeometry(baseSize + 80, 64)
            this.chargeGlowMesh.material.uniforms.opacity.value = 0.8 * progress
        }

        if (this.stateTimer <= 0) {
          this.state = BossState.FIRING_LASER
          this.stateTimer = 120 
          if (this.laserMesh) this.laserMesh.visible = true
        }
        break
        
      case BossState.FIRING_LASER:
        if (this.laserMesh) {
            const lMat = this.laserMesh.material as THREE.ShaderMaterial
            lMat.uniforms.opacity.value = 0.6
        }
        if (this.innerLaserMesh) {
            ;(this.innerLaserMesh.material as THREE.MeshBasicMaterial).opacity = 1.0
        }
        if (this.chargeMesh) this.chargeMesh.material.uniforms.opacity.value = 0
        if (this.chargeGlowMesh) this.chargeGlowMesh.material.uniforms.opacity.value = 0

        if (this.stateTimer <= 0) {
          this.state = BossState.NORMAL
          this.stateTimer = 180
          if (this.laserMesh) {
              this.laserMesh.visible = false
              ;(this.laserMesh.material as THREE.ShaderMaterial).uniforms.opacity.value = 0
          }
          if (this.innerLaserMesh) {
              ;(this.innerLaserMesh.material as THREE.MeshBasicMaterial).opacity = 0
          }
        }
        break
    }
  }


  public isFiringLaser(): boolean {
    return this.state === BossState.FIRING_LASER
  }

  public getLaserAngle(): number {
    return -this.laserContainer.rotation.z
  }
}
