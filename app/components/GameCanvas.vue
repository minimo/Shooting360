<template>
  <div class="game-wrapper">
    <div ref="gameContainer" class="game-container" />

    <!-- HUD（ゲームプレイ中のみ表示） -->
    <div v-if="isHudVisible" class="hud">
      <!-- スコア・Wave・レベル -->
      <div class="score-area">
        <div class="score-line">WAVE {{ currentWave }}&nbsp;&nbsp;SCORE: {{ scoreDisplay }}</div>
        <div class="level-line">Lv.{{ playerLevel }} (NEXT: {{ scoreForNextPowerUp }})</div>
        <div v-if="powerUpListText" class="powerup-list">{{ powerUpListText }}</div>
      </div>

      <!-- HP ゲージ -->
      <div class="hp-bar-wrapper">
        <div class="hp-bar-track">
          <div
            class="hp-bar-fill"
            :style="{ width: hpPercent + '%', background: hpBarColor }"
          />
        </div>
      </div>

      <!-- ミニマップ -->
      <canvas ref="minimapCanvas" class="minimap" :width="MINIMAP_SIZE" :height="MINIMAP_SIZE" />
    </div>

    <!-- Wave アナウンス -->
    <div
      v-if="announcementText"
      class="announcement"
      :style="{ opacity: announcementAlpha }"
    >
      {{ announcementText }}
    </div>

    <!-- タイトル画面 -->
    <div v-if="showOverlay" class="overlay">
      <div class="overlay-content">
        <div class="title-container">
          <h1 class="glitch-title" data-text="SHOOTING 360">SHOOTING 360</h1>
          <div class="subtitle">OMNIDIRECTIONAL 2D SHOOTING</div>
        </div>
        <p class="start-hint">PRESS Z / X TO START</p>
        <div class="controls">
          <ul>
            <li>⬅️➡️: 回転</li>
            <li>⬆️: 前進加速 / ⬇️: 減速</li>
            <li>Z: 弾丸発射</li>
            <li>X: レーザー発射</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- ゲームオーバー -->
    <div v-if="showGameOver" class="overlay">
      <div class="overlay-content">
        <h2 class="game-over-text">GAME OVER</h2>
        <p>Your ship was destroyed.</p>
        <div class="controls">
          <p style="font-size: 1.2rem; margin: 0; color: #fff;">Z / X キーでリスタート</p>
        </div>
      </div>
    </div>

    <!-- パワーアップ選択 -->
    <div v-if="showPowerUp" class="overlay powerup-overlay">
      <div class="overlay-content">
        <h2 class="powerup-title">
          <template v-if="gameManager?.powerUpReason === 'level'">LEVEL UP!</template>
          <template v-else>WAVE {{ currentWave }} CLEAR!</template>
        </h2>
        <p class="powerup-subtitle">強化項目を選択してください</p>
        <div class="powerup-options">
          <div
            v-for="(option, index) in mainPowerUpOptions"
            :key="option.id"
            class="powerup-card"
            :class="{ selected: index === selectedIndex }"
            @click="selectPowerUp(index)"
            @mouseenter="selectedIndex = index"
          >
            <div v-if="option.rarity && option.rarity > 0" class="rarity-stars">
              {{ '★'.repeat(option.rarity) }}
            </div>
            <h3>
              {{ option.name }}
              <span
                class="level-badge"
                :style="{
                  visibility: option.maxLevel && option.maxLevel > 1 ? 'visible' : 'hidden',
                }"
              >
                Lv {{ option.currentLevel || 0 }}/{{ option.maxLevel || 1 }}
              </span>
            </h3>
            <p>{{ option.description }}</p>
          </div>
        </div>
        <div v-if="skipPowerUpOption" class="powerup-skip-container">
          <button
            class="powerup-skip-button"
            :class="{ selected: powerUpOptions.length - 1 === selectedIndex }"
            @click="selectPowerUp(powerUpOptions.length - 1)"
            @mouseenter="selectedIndex = powerUpOptions.length - 1"
          >
            {{ skipPowerUpOption.name }}
          </button>
        </div>
      </div>
    </div>

    <!-- ポーズ -->
    <div v-if="isPaused && !showPowerUp" class="overlay pause-overlay">
      <div class="overlay-content">
        <h2 class="pause-title">PAUSE</h2>
        <p>ESC キーで再開</p>
      </div>
    </div>

    <!-- デバッグメニュー -->
    <div v-if="showDebugMenu" class="overlay debug-overlay">
      <div class="overlay-content debug-content">
        <h2 class="debug-title">DEBUG MODE</h2>
        <div class="debug-section debug-section-powerups">
          <h3>強化項目選択</h3>
          <div class="debug-powerup-grid">
            <div
              v-for="(option, index) in availablePowerUps"
              :key="option.id"
              class="debug-powerup-card"
              :class="{
                selected: (debugPowerUpLevels[option.id] || 0) > 0,
                highlighted: debugSelectedIndex === index,
              }"
              @click="incrementDebugPowerUp(option.id, option.maxLevel || 1)"
              @contextmenu.prevent="decrementDebugPowerUp(option.id)"
              @mouseenter="debugSelectedIndex = index"
            >
              <h4>{{ option.name }}</h4>
              <div
                class="debug-level-badge"
                :class="{ active: (debugPowerUpLevels[option.id] || 0) > 0 }"
                :style="{
                  visibility:
                    (option.maxLevel && option.maxLevel > 1) ||
                    (debugPowerUpLevels[option.id] || 0) > 0
                      ? 'visible'
                      : 'hidden',
                }"
              >
                <template v-if="option.maxLevel && option.maxLevel > 1">
                  Lv {{ debugPowerUpLevels[option.id] || 0 }}/{{ option.maxLevel }}
                </template>
                <template v-else>
                  {{ (debugPowerUpLevels[option.id] || 0) > 0 ? 'ON' : 'OFF' }}
                </template>
              </div>
            </div>
          </div>
        </div>
        <div
          class="debug-section"
          :class="{ 'debug-section-highlighted': debugSelectedIndex === availablePowerUps.length }"
          @mouseenter="debugSelectedIndex = availablePowerUps.length"
        >
          <h3>開始WAVE選択: {{ debugStartWave }}</h3>
          <div class="debug-wave-selector">
            <button @click="debugStartWave = Math.max(1, debugStartWave - 1)">◀</button>
            <input type="range" v-model.number="debugStartWave" min="1" max="50" />
            <button @click="debugStartWave = Math.min(50, debugStartWave + 1)">▶</button>
          </div>
        </div>
        <div class="debug-actions">
          <button
            class="debug-start-button"
            :class="{ highlighted: debugSelectedIndex === availablePowerUps.length + 1 }"
            @click="startDebugGame"
            @mouseenter="debugSelectedIndex = availablePowerUps.length + 1"
          >
            START GAME
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, watch, computed } from 'vue'
import * as THREE from 'three'
import { GameManager } from '~/game/GameManager'
import { useInput, type InputState } from '~/composables/useInput'

// --- CONSTANTS ---
const GAME_WIDTH = 1920
const GAME_HEIGHT = 1080
const MINIMAP_SIZE = 240

// --- REFS ---
const gameContainer = ref<HTMLDivElement | null>(null)
const minimapCanvas = ref<HTMLCanvasElement | null>(null)
const showOverlay = ref(true)
const showGameOver = ref(false)
const showPowerUp = ref(false)
const showDebugMenu = ref(false)
const isPaused = ref(false)
const selectedIndex = ref(0)
const debugSelectedIndex = ref(0)
const powerUpOptions = ref<any[]>([])
const availablePowerUps = ref<any[]>([])
const debugPowerUpLevels = ref<Record<string, number>>({})
const debugStartWave = ref(1)
const currentWave = ref(0)
const hpPercent = ref(100)
const playerLevel = ref(0)
const scoreForNextPowerUp = ref(1000)
const scoreRaw = ref(0)
const powerUpListText = ref('')
const announcementText = ref('')
const announcementAlpha = ref(0)
const isKeyHeldOnPowerUpShow = ref(false)

const isHudVisible = computed(() => !showOverlay.value && !showDebugMenu.value)
const scoreDisplay = computed(() => scoreRaw.value.toString().padStart(6, '0'))

const hpBarColor = computed(() => {
  if (hpPercent.value < 30) return '#ff3333'
  if (hpPercent.value < 50) return '#ffff00'
  return '#00ff88'
})

const mainPowerUpOptions = computed(() => powerUpOptions.value.filter((opt) => opt.id !== 'skip'))
const skipPowerUpOption = computed(() => powerUpOptions.value.find((opt) => opt.id === 'skip'))

// --- Input ---
const input = useInput()
const gameManager = shallowRef<GameManager | null>(null)

// --- Three.js ---
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let animationId: number | null = null
let lastTime: number = 0

// --- Game Loop ---
const gameLoop = (time: number) => {
  animationId = requestAnimationFrame(gameLoop)

  const deltaMS = time - lastTime
  lastTime = time
  // PixiJS の deltaMS と同じ単位に合わせる（60fps基準の補正値）
  const delta = deltaMS / (1000 / 60)

  const gm = gameManager.value
  if (!gm || !renderer || !scene || !camera) return

  if (gm.isGameOver && !showGameOver.value) {
    showGameOver.value = true
    setTimeout(() => window.addEventListener('keydown', restartOnKey), 500)
  }

  const effectiveInput =
    showPowerUp.value || showOverlay.value || showGameOver.value
      ? ({
          up: false,
          down: false,
          left: false,
          right: false,
          shoot: false,
          laser: false,
          boost: false,
        } as InputState)
      : (input.state as InputState)

  gm.update(delta, effectiveInput)

  // Vue リアクティブ値の同期
  currentWave.value = gm.currentWave
  hpPercent.value = gm.hpPercent
  playerLevel.value = gm.playerLevel
  scoreForNextPowerUp.value = gm.scoreForNextPowerUp
  scoreRaw.value = gm.score
  powerUpListText.value = gm.powerUpListEntries.join(' / ')
  announcementText.value = gm.announcementText
  announcementAlpha.value = gm.announcementAlpha

  showPowerUp.value = gm.isPowerUpSelecting
  if (showPowerUp.value) powerUpOptions.value = gm.currentPowerUpOptions
  isPaused.value = gm.isPaused

  // カメラシェイク
  camera.position.set(gm.shakeOffset.x, gm.shakeOffset.y, 100)
  camera.lookAt(gm.shakeOffset.x, gm.shakeOffset.y, 0)

  // ミニマップ描画
  drawMinimap(gm)

  renderer.render(scene, camera)
}

function drawMinimap(gm: GameManager): void {
  const canvas = minimapCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

  const radius = (MINIMAP_SIZE / 2) * 0.9 // 少し内側に円を描画
  const centerX = MINIMAP_SIZE / 2
  const centerY = MINIMAP_SIZE / 2

  // クリッピング設定（円形以外を描画しないようにする）
  ctx.save()
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.clip()

  // 背景
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fill()

  // ドット描画
  for (const dot of gm.minimapDots) {
    const x = dot.nx * MINIMAP_SIZE
    const y = dot.ny * MINIMAP_SIZE
    ctx.fillStyle = dot.color
    ctx.beginPath()
    ctx.arc(x, y, dot.size / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()

  // 枠（クリッピングの外側に描画）
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius - 1, 0, Math.PI * 2)
  ctx.stroke()
}

// --- キーハンドラー ---
const startOnKey = (e: KeyboardEvent) => {
  if (!showOverlay.value || !gameManager.value) return
  const key = e.key.toLowerCase()
  if (key === 'z' || key === 'x') {
    showOverlay.value = false
    gameManager.value.isGameActive = true
    window.removeEventListener('keydown', startOnKey)
  } else if (key === 'q') {
    showOverlay.value = false
    showDebugMenu.value = true
    availablePowerUps.value = gameManager.value.powerUps
    window.removeEventListener('keydown', startOnKey)
    window.addEventListener('keydown', handleDebugKey)
  }
}

const restartOnKey = () => {
  if (!showGameOver.value || !gameManager.value || !scene) return
  showGameOver.value = false
  window.removeEventListener('keydown', restartOnKey)

  // シーンをクリア（背景色オブジェクト以外を削除）
  while (scene.children.length > 0) scene.remove(scene.children[0]!)

  gameManager.value.destroy()
  gameManager.value = new GameManager()
  gameManager.value.init(scene, GAME_WIDTH, GAME_HEIGHT)
  gameManager.value.isGameActive = true
}

const selectPowerUp = (index: number) => {
  if (gameManager.value) {
    gameManager.value.selectPowerUp(index)
    showPowerUp.value = false
  }
}

const EXCLUSIVE_SHOT_IDS = ['3way', '5way', 'wide', 'piercing'] as const

const incrementDebugPowerUp = (id: string, maxLevel: number = 1) => {
  const current = debugPowerUpLevels.value[id] || 0
  if (current < maxLevel) {
    if ((EXCLUSIVE_SHOT_IDS as readonly string[]).includes(id)) {
      for (const otherId of EXCLUSIVE_SHOT_IDS) {
        if (otherId !== id) delete debugPowerUpLevels.value[otherId]
      }
    }
    debugPowerUpLevels.value[id] = current + 1
  }
}

const decrementDebugPowerUp = (id: string) => {
  const current = debugPowerUpLevels.value[id] || 0
  if (current > 0) debugPowerUpLevels.value[id] = current - 1
}

const startDebugGame = () => {
  if (gameManager.value) {
    gameManager.value.startWithDebug(debugPowerUpLevels.value, debugStartWave.value)
    showDebugMenu.value = false
    window.removeEventListener('keydown', handleDebugKey)
  }
}

const handleDebugKey = (e: KeyboardEvent) => {
  if (!showDebugMenu.value) return
  const powerUpCount = availablePowerUps.value.length
  const waveIndex = powerUpCount
  const startIndex = powerUpCount + 1

  if (e.key === 'ArrowLeft') {
    if (debugSelectedIndex.value < powerUpCount)
      debugSelectedIndex.value = (debugSelectedIndex.value - 1 + powerUpCount) % powerUpCount
    else if (debugSelectedIndex.value === waveIndex)
      debugStartWave.value = Math.max(1, debugStartWave.value - 1)
  } else if (e.key === 'ArrowRight') {
    if (debugSelectedIndex.value < powerUpCount)
      debugSelectedIndex.value = (debugSelectedIndex.value + 1) % powerUpCount
    else if (debugSelectedIndex.value === waveIndex)
      debugStartWave.value = Math.min(50, debugStartWave.value + 1)
  } else if (e.key === 'ArrowUp') {
    if (debugSelectedIndex.value === startIndex) debugSelectedIndex.value = waveIndex
    else if (debugSelectedIndex.value === waveIndex) debugSelectedIndex.value = 0
    else if (debugSelectedIndex.value >= 4) debugSelectedIndex.value -= 4
  } else if (e.key === 'ArrowDown') {
    if (debugSelectedIndex.value < powerUpCount) {
      if (debugSelectedIndex.value + 4 < powerUpCount) debugSelectedIndex.value += 4
      else debugSelectedIndex.value = waveIndex
    } else if (debugSelectedIndex.value === waveIndex) {
      debugSelectedIndex.value = startIndex
    }
  } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Enter') {
    if (debugSelectedIndex.value < powerUpCount) {
      const option = availablePowerUps.value[debugSelectedIndex.value]
      incrementDebugPowerUp(option.id, option.maxLevel || 1)
    } else if (debugSelectedIndex.value === startIndex) {
      startDebugGame()
    }
  } else if (e.key === 'x' || e.key === 'X') {
    if (debugSelectedIndex.value < powerUpCount)
      decrementDebugPowerUp(availablePowerUps.value[debugSelectedIndex.value].id)
  } else if (e.key === 'w') {
    debugStartWave.value = Math.min(50, debugStartWave.value + 1)
  } else if (e.key === 's') {
    debugStartWave.value = Math.max(1, debugStartWave.value - 1)
  }
}

const handlePowerUpKey = (e: KeyboardEvent) => {
  if (!showPowerUp.value || e.repeat) return
  if (isKeyHeldOnPowerUpShow.value) return

  const key = e.key.toLowerCase()
  const totalOptions = powerUpOptions.value.length
  const mainOptionsCount = mainPowerUpOptions.value.length

  if (key === 'z' || key === 'x' || key === 'enter') {
    selectPowerUp(selectedIndex.value)
  } else if (e.key === 'ArrowLeft') {
    if (selectedIndex.value < mainOptionsCount)
      selectedIndex.value = (selectedIndex.value - 1 + mainOptionsCount) % mainOptionsCount
  } else if (e.key === 'ArrowRight') {
    if (selectedIndex.value < mainOptionsCount)
      selectedIndex.value = (selectedIndex.value + 1) % mainOptionsCount
  } else if (e.key === 'ArrowDown') {
    if (selectedIndex.value < mainOptionsCount && skipPowerUpOption.value)
      selectedIndex.value = totalOptions - 1
  } else if (e.key === 'ArrowUp') {
    if (selectedIndex.value === totalOptions - 1)
      selectedIndex.value = Math.floor(mainOptionsCount / 2)
  }
}

const handlePowerUpKeyUp = () => {
  if (!showPowerUp.value) return
  const s = input.state
  if (!s.up && !s.down && !s.left && !s.right && !s.shoot && !s.laser && !s.boost)
    isKeyHeldOnPowerUpShow.value = false
}

const handlePauseKey = (e: KeyboardEvent) => {
  if (showOverlay.value || showGameOver.value || showPowerUp.value) return
  if (e.key === 'Escape' && gameManager.value) {
    gameManager.value.isPaused = !gameManager.value.isPaused
    isPaused.value = gameManager.value.isPaused
  }
}

const handleBlur = () => {
  if (showOverlay.value || showGameOver.value || showPowerUp.value) return
  if (gameManager.value && !gameManager.value.isPaused) {
    gameManager.value.isPaused = true
    isPaused.value = true
  }
}

watch(showPowerUp, (val) => {
  if (val) {
    selectedIndex.value = 0
    const s = input.state
    isKeyHeldOnPowerUpShow.value =
      s.up || s.down || s.left || s.right || s.shoot || s.laser || s.boost
    window.addEventListener('keydown', handlePowerUpKey)
    window.addEventListener('keyup', handlePowerUpKeyUp)
  } else {
    window.removeEventListener('keydown', handlePowerUpKey)
    window.removeEventListener('keyup', handlePowerUpKeyUp)
    isKeyHeldOnPowerUpShow.value = false
  }
})

// --- リサイズ対応 ---
const fitCanvas = () => {
  if (!gameContainer.value || !renderer || !camera) return
  const wrapperW = window.innerWidth
  const wrapperH = window.innerHeight
  const scale = Math.min(wrapperW / GAME_WIDTH, wrapperH / GAME_HEIGHT)
  const container = gameContainer.value
  container.style.width = `${GAME_WIDTH}px`
  container.style.height = `${GAME_HEIGHT}px`
  container.style.transform = `translate(-50%, -50%) scale(${scale})`
}

// --- マウント ---
onMounted(() => {
  if (!gameContainer.value) return

  window.addEventListener('keydown', startOnKey)
  window.addEventListener('keydown', handlePauseKey)
  window.addEventListener('blur', handleBlur)

  // --- Three.js 初期化 ---
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(GAME_WIDTH, GAME_HEIGHT)
  renderer.setClearColor(0x050510)
  gameContainer.value.appendChild(renderer.domElement)

  scene = new THREE.Scene()

  // OrthographicCamera: 画面中央を原点、y-up
  // left/right/top/bottom = ±width/2, ±height/2
  camera = new THREE.OrthographicCamera(
    -GAME_WIDTH / 2,
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    -GAME_HEIGHT / 2,
    -1000,
    1000,
  )
  camera.position.set(0, 0, 100)

  // --- GameManager 初期化 ---
  const gm = new GameManager()
  gm.init(scene, GAME_WIDTH, GAME_HEIGHT)
  gameManager.value = gm

  // --- メインループ開始 ---
  lastTime = performance.now()
  animationId = requestAnimationFrame(gameLoop)

  // --- リサイズ ---
  fitCanvas()
  window.addEventListener('resize', fitCanvas)
})

onUnmounted(() => {
  if (animationId !== null) cancelAnimationFrame(animationId)
  window.removeEventListener('keydown', startOnKey)
  window.removeEventListener('keydown', restartOnKey)
  window.removeEventListener('keydown', handlePauseKey)
  window.removeEventListener('blur', handleBlur)
  window.removeEventListener('resize', fitCanvas)
  if (gameManager.value) {
    gameManager.value.destroy()
    gameManager.value = null
  }
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
})
</script>

<style scoped>
.game-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
}

.game-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center center;
  cursor: none;
}

.game-container canvas {
  display: block;
}

/* HUD */
.hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  font-family: 'Orbitron', sans-serif;
}

.score-area {
  position: absolute;
  top: 16px;
  left: 20px;
  color: #fff;
  text-shadow: 1px 1px 4px #000;
}

.score-line {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 4px;
}

.level-line {
  font-size: 16px;
  opacity: 0.9;
  margin-bottom: 4px;
}

.powerup-list {
  font-size: 13px;
  color: #ddeeff;
  opacity: 0.85;
}

.hp-bar-wrapper {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: 400px;
}

.hp-bar-track {
  height: 20px;
  background: rgba(50, 50, 50, 0.8);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.hp-bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.1s ease, background 0.3s ease;
}

.minimap {
  position: absolute;
  bottom: 20px;
  left: 20px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.3);
}

/* Wave アナウンス */
.announcement {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -200px);
  font-family: 'Orbitron', sans-serif;
  font-size: 64px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
  text-align: center;
  pointer-events: none;
  white-space: nowrap;
}

/* オーバーレイ共通 */
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, rgba(10, 10, 30, 0.85) 0%, rgba(0, 0, 0, 0.95) 100%);
  z-index: 10;
  backdrop-filter: blur(8px);
}

.overlay-content {
  text-align: center;
  color: #fff;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.1rem;
}

/* タイトルアニメーション */
.title-container {
  margin-bottom: 2rem;
  position: relative;
}

.glitch-title {
  font-size: 5rem !important;
  font-weight: 700;
  color: #00f2ff !important;
  text-shadow: 
    0 0 10px rgba(0, 242, 255, 0.8),
    0 0 20px rgba(0, 242, 255, 0.5),
    0 0 40px rgba(0, 242, 255, 0.3);
  margin-bottom: 0.5rem !important;
  position: relative;
  letter-spacing: 0.4rem;
  text-transform: uppercase;
}

.glitch-title::before,
.glitch-title::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.8;
}

.glitch-title::before {
  color: #ff00ff;
  z-index: -1;
  animation: glitch-anim 3s infinite linear alternate-reverse;
}

.glitch-title::after {
  color: #00ffff;
  z-index: -2;
  animation: glitch-anim-2 2s infinite linear alternate-reverse;
}

@keyframes glitch-anim {
  0% { transform: translate(0); }
  20% { transform: translate(-2px, 2px); }
  40% { transform: translate(-2px, -2px); }
  60% { transform: translate(2px, 2px); }
  80% { transform: translate(2px, -2px); }
  100% { transform: translate(0); }
}

@keyframes glitch-anim-2 {
  0% { transform: translate(0); }
  20% { transform: translate(2px, -2px); }
  40% { transform: translate(2px, 2px); }
  60% { transform: translate(-2px, -2px); }
  80% { transform: translate(-2px, 2px); }
  100% { transform: translate(0); }
}

.subtitle {
  font-size: 1.2rem;
  color: #66ccff;
  opacity: 0.8;
  letter-spacing: 0.8rem;
  margin-top: -0.5rem;
  text-shadow: 0 0 10px rgba(102, 204, 255, 0.5);
}

.start-hint {
  font-size: 1.4rem !important;
  color: #fff !important;
  margin: 2rem 0 !important;
  animation: pulse 2s infinite ease-in-out;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.98); }
  50% { opacity: 1; transform: scale(1); }
}

.game-over-text {
  font-size: 4.5rem !important;
  color: #ff3333 !important;
  text-shadow: 
    0 0 15px rgba(255, 51, 51, 0.8),
    0 0 30px rgba(255, 51, 51, 0.4);
  font-weight: 700;
  margin-bottom: 1rem !important;
  letter-spacing: 0.5rem;
}

.controls {
  margin-top: 3rem;
  padding: 2rem 3rem;
  background: rgba(0, 242, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(0, 242, 255, 0.2);
  box-shadow: inset 0 0 20px rgba(0, 242, 255, 0.1);
}

.controls ul {
  list-style: none;
  padding: 0;
}

.controls li {
  text-align: left;
  font-size: 1rem;
  color: #aaddff;
  margin: 0.6rem 0;
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* パワーアップUI */
.powerup-overlay {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.powerup-title {
  font-size: 4rem !important;
  color: #ffff00 !important;
  text-shadow:
    0 0 30px rgba(255, 255, 0, 0.5),
    0 0 10px rgba(0, 0, 0, 0.5) !important;
  margin-bottom: 0.5rem !important;
  letter-spacing: 0.2rem;
}

.powerup-subtitle {
  color: #fff !important;
  font-size: 1.4rem !important;
  margin-bottom: 2rem !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.powerup-options {
  display: flex;
  gap: 20px;
  margin-top: 2rem;
  justify-content: center;
  align-items: stretch;
}

.powerup-card {
  width: 280px;
  height: 320px;
  padding: 2rem 1.5rem;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.1) 0%,
    rgba(255, 255, 255, 0.05) 100%
  );
  border: 2px solid rgba(0, 255, 204, 0.3);
  border-radius: 16px;
  cursor: pointer;
  transition:
    background 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-sizing: border-box;
}

.powerup-card:hover,
.powerup-card.selected {
  background: linear-gradient(
    135deg,
    rgba(0, 255, 204, 0.2) 0%,
    rgba(0, 255, 204, 0.1) 100%
  );
  border-color: #00ffcc;
  box-shadow: 0 0 30px rgba(0, 255, 204, 0.4);
}

.powerup-card.selected {
  animation: pulse-border 1.5s infinite;
}

@keyframes pulse-border {
  0% {
    box-shadow: 0 0 10px rgba(0, 255, 204, 0.3);
  }
  50% {
    box-shadow: 0 0 25px rgba(0, 255, 204, 0.6);
  }
  100% {
    box-shadow: 0 0 10px rgba(0, 255, 204, 0.3);
  }
}

.rarity-stars {
  color: #ffd700;
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  letter-spacing: 4px;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
}

.powerup-card h3 {
  color: #00ffcc;
  font-size: 1.4rem;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.level-badge {
  font-size: 0.9rem;
  background: rgba(0, 255, 204, 0.2);
  color: #00ffcc;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  border: 1px solid rgba(0, 255, 204, 0.4);
  font-weight: bold;
}

.powerup-card p {
  color: #eee !important;
  font-size: 0.95rem !important;
  line-height: 1.4;
}

.powerup-skip-container {
  margin-top: 2rem;
  display: flex;
  justify-content: center;
}

.powerup-skip-button {
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #aaa;
  font-size: 1.1rem;
  padding: 0.5rem 2rem;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Segoe UI', sans-serif;
}

.powerup-skip-button:hover,
.powerup-skip-button.selected {
  border-color: #fff;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

/* ポーズ */
.pause-overlay {
  background: rgba(0, 0, 0, 0.6);
}

.pause-title {
  font-size: 4rem !important;
  color: #aaa !important;
  letter-spacing: 0.5rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.2) !important;
  margin-bottom: 1rem !important;
}

/* デバッグ */
.debug-overlay {
  background: rgba(0, 0, 0, 0.9);
}

.debug-content {
  width: 860px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(20, 20, 30, 0.95);
  border: 2px solid #ff00ff;
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 0 40px rgba(255, 0, 255, 0.3);
}

.debug-title {
  color: #ff00ff !important;
  font-size: 3rem !important;
  margin-bottom: 1rem !important;
  text-shadow: 0 0 15px rgba(255, 0, 255, 0.6) !important;
  flex-shrink: 0;
}

.debug-section {
  text-align: left;
  flex-shrink: 0;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: 12px;
  box-sizing: border-box;
}

.debug-section-powerups {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.debug-section h3 {
  color: #00ffcc;
  margin-bottom: 1rem;
  font-size: 1.2rem;
  border-left: 4px solid #00ffcc;
  padding-left: 10px;
}

.debug-powerup-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  overflow-y: auto;
  padding-right: 4px;
  flex: 1;
  min-height: 0;
}

.debug-powerup-card {
  padding: 0.8rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(0, 255, 204, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.debug-powerup-card h4 {
  margin: 0;
  font-size: 0.9rem;
  color: #ccc;
}

.debug-powerup-card.highlighted {
  border-color: #ffff00;
  background: rgba(255, 255, 0, 0.1);
}

.debug-powerup-card.selected {
  background: rgba(0, 255, 204, 0.2);
  border-color: #00ffcc;
  box-shadow: 0 0 10px rgba(0, 255, 204, 0.4);
}

.debug-powerup-card.selected h4 {
  color: #fff;
}

.debug-level-badge {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
  padding: 2px 6px;
  border-radius: 8px;
  border: 1px solid transparent;
}

.debug-level-badge.active {
  background: rgba(0, 255, 204, 0.2);
  color: #00ffcc;
  border: 1px solid rgba(0, 255, 204, 0.5);
}

.debug-section.debug-section-highlighted {
  background: rgba(255, 255, 0, 0.08);
  border-color: rgba(255, 255, 0, 0.4);
}

.debug-wave-selector {
  display: flex;
  align-items: center;
  gap: 20px;
  justify-content: center;
  margin-top: 1rem;
}

.debug-wave-selector button {
  width: 40px;
  height: 40px;
  background: #333;
  border: 1px solid #555;
  color: #fff;
  font-size: 1.5rem;
  cursor: pointer;
  border-radius: 5px;
}

.debug-wave-selector button:hover {
  background: #444;
}

.debug-wave-selector input {
  flex: 1;
  accent-color: #ff00ff;
}

.debug-actions {
  margin-top: 1rem;
  flex-shrink: 0;
}

.debug-start-button {
  padding: 1rem 3rem;
  font-size: 1.5rem;
  background: linear-gradient(135deg, #ff00ff 0%, #aa00ff 100%);
  border: none;
  border-radius: 50px;
  color: #fff;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 5px 15px rgba(255, 0, 255, 0.4);
}

.debug-start-button:hover,
.debug-start-button.highlighted {
  transform: translateY(-5px) scale(1.05);
  box-shadow: 0 8px 25px rgba(255, 0, 255, 0.6);
  filter: brightness(1.2);
}
</style>
