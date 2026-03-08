import * as THREE from 'three'
import { GameObject } from './GameObject'

export enum LaserState {
  IDLE,
  CHARGING,
  FIRING,
}

/**
 * レーザー武器クラス
 *
 * Three.js 版:
 *  - メインビームと外側グロウを PlaneGeometry で表現
 *  - 残像は事前に生成した Mesh 群の rotation で表現
 *  - 親グループの rotation.z = -this.rotation により自機向きに追従
 */
export class Laser extends GameObject {
  private maxLength: number = 1000
  private color: number

  public state: LaserState = LaserState.IDLE
  public chargeProgress: number = 0
  private chargeDuration: number = 15
  private chargeTimer: number = 0

  private afterimageCount: number = 12
  private rotationHistory: number[] = []

  public thickness: number = 3

  // 残像メッシュ群
  private afterimageMeshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = []
  private afterimageGroups: THREE.Group[] = []

  // メインビーム
  private coreMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private glowMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>

  // チャージ演出
  private chargeMesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  private chargeGlowMesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>

  // シェーダー定義
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
      // 左右（u=0, u=1）に向かって透明になるグラデーション
      float dist = abs(vUv.x - 0.5) * 2.0;
      float alpha = (1.0 - pow(dist, 2.0)) * opacity;
      gl_FragColor = vec4(color, alpha);
    }
  `

  constructor(x: number, y: number, color: number = 0x00ffff) {
    super(x, y)
    this.color = color
    this.mesh.position.z = 4

    // 残像グループ（ビームの回転履歴を表示・青系に固定）
    const afterimageColor = new THREE.Color(0x0088ff)
    for (let i = 0; i < this.afterimageCount; i++) {
      const group = new THREE.Group()
      const geo = new THREE.PlaneGeometry(16, this.maxLength)
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: afterimageColor },
          opacity: { value: 0 },
        },
        vertexShader: Laser.vertexShader,
        fragmentShader: Laser.fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(0, this.maxLength / 2, 0)
      group.add(mesh)
      this.afterimageMeshes.push(mesh)
      this.afterimageGroups.push(group)
      this.mesh.add(group)
    }

    // グロウ（外側光 - シェーダーでグラデーション）
    const glowGeo = new THREE.PlaneGeometry(1, this.maxLength)
    this.glowMesh = new THREE.Mesh(
      glowGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(color) },
          opacity: { value: 0 },
        },
        vertexShader: Laser.vertexShader,
        fragmentShader: Laser.fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.glowMesh.position.set(0, this.maxLength / 2, 0.1)
    this.mesh.add(this.glowMesh)

    // コア（白い芯 - そのまま）
    const coreGeo = new THREE.PlaneGeometry(1, this.maxLength)
    this.coreMesh = new THREE.Mesh(
      coreGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    )
    this.coreMesh.position.set(0, this.maxLength / 2, 0.2)
    this.mesh.add(this.coreMesh)

    // チャージ演出（円）
    const chargeGeo = new THREE.CircleGeometry(35, 16)
    this.chargeMesh = new THREE.Mesh(
      chargeGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    )
    this.chargeMesh.position.z = 0.3
    this.mesh.add(this.chargeMesh)

    const chargeGlowGeo = new THREE.CircleGeometry(45, 16)
    this.chargeGlowMesh = new THREE.Mesh(
      chargeGlowGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }),
    )
    this.chargeGlowMesh.position.z = 0.25
    this.mesh.add(this.chargeGlowMesh)

    this.mesh.visible = false
  }

  private updateVisuals(): void {
    if (this.state === LaserState.IDLE) {
      this.coreMesh.material.opacity = 0
      if (this.glowMesh.material.uniforms.opacity) {
        this.glowMesh.material.uniforms.opacity.value = 0
      }
      this.chargeMesh.material.opacity = 0
      this.chargeGlowMesh.material.opacity = 0
      for (const m of this.afterimageMeshes) {
        if (m.material.uniforms.opacity) {
          m.material.uniforms.opacity.value = 0
        }
      }
      return
    }

    if (this.state === LaserState.CHARGING) {
      const size = 30 * (1 - this.chargeProgress)
      this.chargeMesh.geometry.dispose()
      this.chargeMesh.geometry = new THREE.CircleGeometry(size + 5, 16)
      this.chargeMesh.material.opacity = 0.5 * this.chargeProgress

      this.chargeGlowMesh.geometry.dispose()
      this.chargeGlowMesh.geometry = new THREE.CircleGeometry(size + 10, 16)
      this.chargeGlowMesh.material.opacity = 0.3 * this.chargeProgress

      this.coreMesh.material.opacity = 0
      if (this.glowMesh.material.uniforms.opacity) {
        this.glowMesh.material.uniforms.opacity.value = 0
      }
      for (const m of this.afterimageMeshes) {
        if (m.material.uniforms.opacity) {
          m.material.uniforms.opacity.value = 0
        }
      }
      return
    }

    if (this.state === LaserState.FIRING) {
      this.chargeMesh.material.opacity = 0
      this.chargeGlowMesh.material.opacity = 0

      // 残像
      for (let i = 0; i < this.afterimageCount; i++) {
        const rot = this.rotationHistory[i]
        const group = this.afterimageGroups[i]
        const mesh = this.afterimageMeshes[i]
        if (rot === undefined || !group || !mesh) continue

        const relRot = rot - this.rotation
        group.rotation.z = -relRot

        const alpha = (1 - i / this.afterimageCount) * 0.2
        if (mesh.material.uniforms.opacity) {
          mesh.material.uniforms.opacity.value = alpha
        }

        // 残像のビーム幅（少し太めにしてグラデーションを活かす）
        if (mesh.geometry.parameters.width !== 16) {
          mesh.geometry.dispose()
          mesh.geometry = new THREE.PlaneGeometry(16, this.maxLength)
          mesh.position.set(0, this.maxLength / 2, 0)
        }
      }

      // メインビーム - thickness に応じてサイズ更新
      const glowW = this.thickness * 2.5 // グラデーションの余白を含めて少し広めに
      const coreW = this.thickness * 0.5 // 芯は細く

      if (Math.abs(this.glowMesh.geometry.parameters.width - glowW) > 0.1) {
        this.glowMesh.geometry.dispose()
        this.glowMesh.geometry = new THREE.PlaneGeometry(glowW, this.maxLength)
        this.glowMesh.position.set(0, this.maxLength / 2, 0.1)
      }
      if (Math.abs(this.coreMesh.geometry.parameters.width - coreW) > 0.1) {
        this.coreMesh.geometry.dispose()
        this.coreMesh.geometry = new THREE.PlaneGeometry(coreW, this.maxLength)
        this.coreMesh.position.set(0, this.maxLength / 2, 0.2)
      }

      if (this.glowMesh.material.uniforms.opacity) {
        this.glowMesh.material.uniforms.opacity.value = 0.6
      }
      this.coreMesh.material.opacity = 1.0
    }
  }

  public setTrigger(active: boolean): void {
    if (active) {
      if (this.state === LaserState.IDLE) {
        this.state = LaserState.CHARGING
        this.chargeTimer = 0
        this.mesh.visible = true
      }
    } else {
      this.state = LaserState.IDLE
      this.mesh.visible = false
      this.rotationHistory = []
      this.chargeProgress = 0
    }
  }

  public setVisible(visible: boolean): void {
    this.setTrigger(visible)
  }

  public updateFromPlayer(x: number, y: number, rotation: number): void {
    this.position.x = x
    this.position.y = y
    this.rotation = rotation

    if (this.state === LaserState.FIRING) {
      this.rotationHistory.unshift(rotation)
      if (this.rotationHistory.length > this.afterimageCount) {
        this.rotationHistory.pop()
      }
    }
  }

  public getEndPoint(): { x: number; y: number } {
    return {
      x: this.position.x + Math.sin(this.rotation) * this.maxLength,
      y: this.position.y - Math.cos(this.rotation) * this.maxLength,
    }
  }

  public override update(delta: number, ..._args: any[]): void {
    if (this.state === LaserState.CHARGING) {
      this.chargeTimer += delta
      this.chargeProgress = Math.min(1, this.chargeTimer / this.chargeDuration)
      if (this.chargeTimer >= this.chargeDuration) {
        this.state = LaserState.FIRING
      }
    }
    this.updateVisuals()
  }
}
