import * as THREE from 'three'
import { GameObject } from '../GameObject'
import type { Player, SpawnBulletFn } from '../Player'
import { VoidSerpentSegment } from './VoidSerpentSegment'

interface HistoryEntry {
  x: number
  y: number
  rotation: number
  dist: number
}

/**
 * Wave 10 Boss: Void Serpent
 * 巨大な長方形の頭部とそれに追従するセグメントからなる長身の旋回ボス
 */
export class VoidSerpent extends GameObject {
  public hp: number = 8000
  public maxHp: number = 8000
  public segments: VoidSerpentSegment[] = []
  
  private history: HistoryEntry[] = []
  private totalMovedDist: number = 0
  
  // 自機の初期速度(16.0)の約半分として、非常に重厚な速度
  private speed: number = 8.0 
  private moveAngle: number = 0
  private targetMoveAngle: number = 0
  private angleChangeTimer: number = 0
  
  // セグメント間の間隔（長方形の長さ200 + 隙間60 ＝ 260）
  private readonly SEGMENT_LENGTH = 260
  private segmentDists: number[] = []
  
  private isReconnecting: boolean = false
  
  private player: Player
  private spawnBullet: SpawnBulletFn
  private spawnMissile: (x: number, y: number, angle: number) => void
  private addObject: (obj: GameObject) => void
  private wave: number
  private setWarning: (text: string, active: boolean) => void
  private headMat!: THREE.MeshStandardMaterial
  private rotatingMesh!: THREE.Mesh

  constructor(
    x: number,
    y: number,
    player: Player,
    spawnBullet: SpawnBulletFn,
    spawnMissile: (x: number, y: number, angle: number) => void,
    addObject: (obj: GameObject) => void,
    wave: number,
    setWarning: (text: string, active: boolean) => void
  ) {
    super()
    this.position.x = x
    this.position.y = y
    this.player = player
    this.spawnBullet = spawnBullet
    this.spawnMissile = spawnMissile
    this.addObject = addObject
    this.wave = wave
    this.setWarning = setWarning
    
    // 頭部は特別大きくする（260x140等）
    this.radius = 120
    this.moveAngle = Math.PI // 最初は左方向へ
    this.targetMoveAngle = this.moveAngle
    this.rotation = this.moveAngle

    // HPスケーリング
    this.maxHp = 8000 + (wave - 10) * 1000
    this.hp = this.maxHp
    
    this.createMesh()
    
    // 初期ヒストリーの生成
    // 出現時、胴体セグメントが頭部の後ろに一直線に並ぶように履歴を疑似的に作成する
    for (let i = 0; i <= 600; i++) {
      const distBack = -(i * this.speed)
      let bx = this.position.x - Math.cos(this.moveAngle) * (i * this.speed)
      let by = this.position.y - Math.sin(this.moveAngle) * (i * this.speed)
      
      const worldSize = 4000
      const halfSize = 2000
      while (bx > halfSize) bx -= worldSize
      while (bx < -halfSize) bx += worldSize
      while (by > halfSize) by -= worldSize
      while (by < -halfSize) by += worldSize
      
      this.history.push({ x: bx, y: by, rotation: this.moveAngle, dist: distBack })
    }
    
    // 5個の胴体セグメントを生成
    for (let i = 0; i < 5; i++) {
      // 3個おきにミサイルポッドを配置（0, 3, 6, 9等ではなく特徴的に）
      const isMissilePod = (i % 3 === 2)
      const seg = new VoidSerpentSegment(i, isMissilePod, this.addObject, this.player, this.spawnMissile)
      
      // セグメントもウェーブスケーリング
      seg.hp = 1200 + (wave - 10) * 150
      seg.maxHp = seg.hp
      
      this.segments.push(seg)
      this.addObject(seg)
      
      // 初期距離設定
      this.segmentDists.push(-(i + 1) * this.SEGMENT_LENGTH)
    }
  }

  private createMesh(): void {
    const group = new THREE.Group()
    
    // 直方体に変更 (同じくらいのボリューム感で、長辺260, 短辺100, 100等)
    const geo = new THREE.BoxGeometry(260, 100, 100)
    this.headMat = new THREE.MeshStandardMaterial({
      color: 0x112288,
      roughness: 0.8,
      metalness: 0.2,
      emissive: 0x000000
    })
    
    this.rotatingMesh = new THREE.Mesh(geo, this.headMat)
    group.add(this.rotatingMesh)
    
    this.mesh = group
    this.mesh.position.z = 10
  }

  /**
   * 指定された移動距離に該当する過去の位置履歴を安全に取得する。
   * ループ境界での座標急ジャンプを防ぐため、線形補間は行わず、
   * 最も距離が近い履歴データ（フレーム）をそのまま返す。
   */
  private getClosestHistoryPosition(targetDist: number): { x: number, y: number, rotation: number } {
    if (this.history.length === 0) return { x: this.position.x, y: this.position.y, rotation: this.rotation }
    
    const first = this.history[0]!
    const last = this.history[this.history.length - 1]!
    
    if (targetDist >= first.dist) return first
    if (targetDist <= last.dist) return last
    
    for (let i = 0; i < this.history.length - 1; i++) {
      const h1 = this.history[i]!
      const h2 = this.history[i + 1]!
      if (targetDist <= h1.dist && targetDist >= h2.dist) {
        const d1 = h1.dist - targetDist
        const d2 = targetDist - h2.dist
        return (d1 < d2) ? h1 : h2
      }
    }
    return last
  }

  public takeDamage(amount: number): void {
    if (!this.isAlive || this.isDying) return
    this.hp -= amount
    
    if (this.headMat) {
      this.headMat.emissive.setHex(0xffffff)
      setTimeout(() => {
        if (this.headMat) {
          this.headMat.emissive.setHex(0x000000)
        }
      }, 50)
    }
  }

  public override update(delta: number, ..._args: any[]): void {
    if (!this.isAlive || this.isDying) return

    // 【1】関節の破壊検知と、停止・再結合フラグのオン
    let foundDead = false
    for (const seg of this.segments) {
      if (seg.justDestroyed) {
        seg.justDestroyed = false // イベントを消費
        foundDead = true
      } else if (!seg.isDestroyed && (!seg.isAlive || seg.hp <= 0)) {
        seg.destroySegment() // これで justDestroyed が true になるが、今回は直接フラグを立てる
        seg.justDestroyed = false
        foundDead = true
      }
    }

    if (foundDead && !this.isReconnecting) {
      this.isReconnecting = true
      this.setWarning("BOSS RECONNECTING...", true)
    }

    // 【2】再結合中（停止）または通常の旋回パトロール
    if (this.isReconnecting) {
      // 頭部は動かず、後続の関節が前進する
      let allReconnected = true
      let activeIndex = 0
      
      for (let i = 0; i < this.segments.length; i++) {
        const seg = this.segments[i]!
        if (seg.isDestroyed) continue
        
        // 破壊を詰めた（activeIndex）本来の目的距離
        const targetDist = this.totalMovedDist - (activeIndex + 1) * this.SEGMENT_LENGTH
        
        const currentDist = this.segmentDists[i]!
        if (currentDist < targetDist - 2.0) { // 許容誤差
          // 速度を徐々に頭部へ寄せていく（ゆっくりくっつく）
          const catchUpSpeed = this.speed * 0.75 * delta
          this.segmentDists[i] = Math.min(targetDist, currentDist + catchUpSpeed)
          allReconnected = false
        } else {
          this.segmentDists[i] = targetDist
        }
        activeIndex++
      }
      
      // 全ての関節がくっついた場合、停止解除
      if (allReconnected) {
        this.isReconnecting = false
        this.setWarning("", false)
      }
      
    } else {
      // --- 通常の旋回運動 ---
      this.angleChangeTimer -= delta
      if (this.angleChangeTimer <= 0) {
        // 徐々にカーブするよう、目標の角度を設定（±30度〜90度のランダムな変更）
        const turnAngle = (Math.random() - 0.5) * Math.PI
        this.targetMoveAngle = this.moveAngle + turnAngle
        this.angleChangeTimer = 180 + Math.random() * 120 // 3〜5秒おきに転舵
      }
      
      // 滑らかに角度を近づける
      const angleDiff = this.targetMoveAngle - this.moveAngle
      this.moveAngle += angleDiff * 0.02 * delta
      this.rotation = this.moveAngle
      
      const moveDist = this.speed * delta
      this.position.x += Math.cos(this.rotation) * moveDist
      this.position.y += Math.sin(this.rotation) * moveDist
      this.totalMovedDist += moveDist
      
      // 履歴を追加
      this.history.unshift({ x: this.position.x, y: this.position.y, rotation: this.rotation, dist: this.totalMovedDist })
      if (this.history.length > 800) {
        this.history.pop()  // 長すぎたら切り捨て
      }
      
      // 後続関節の目的距離を更新
      let activeIndex = 0
      for (let i = 0; i < this.segments.length; i++) {
        if (this.segments[i]!.isDestroyed) continue
        this.segmentDists[i] = this.totalMovedDist - (activeIndex + 1) * this.SEGMENT_LENGTH
        activeIndex++
      }
      
      // 頭部からの定期攻撃（ばらまき）
      if (Math.random() < 0.015 * delta) {
        for (let i = -1; i <= 1; i++) {
          this.spawnBullet(this.position.x, this.position.y, this.rotation + i * 0.4, 'enemy')
        }
      }
    }
    
    // 【3】関節の位置同期
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]!
      if (seg.isDestroyed) continue
      
      const pos = this.getClosestHistoryPosition(this.segmentDists[i]!)
      seg.syncPosition(pos.x, pos.y, pos.rotation)
    }

    // 【4】長軸回転
    if (this.rotatingMesh) {
      this.rotatingMesh.rotation.x += delta * 0.05
    }
  }

  // 頭部が破壊された時の連鎖爆発等の連携に使う
  public getAllActiveSegments(): VoidSerpentSegment[] {
    return this.segments.filter(s => !s.isDestroyed && s.isAlive)
  }
}
