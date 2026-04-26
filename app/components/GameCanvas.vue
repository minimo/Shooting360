<template>
  <div class="game-wrapper">
    <div ref="gameContainer" class="game-container" />

    <!-- HUD・アナウンス・ボス警告・パワーアップ・ポーズはThree.jsシーン内で描画 -->



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
import { ref, shallowRef, onMounted, onUnmounted, watch } from 'vue'
import { TitleScreen } from '~/game/TitleScreen'
import { GameOverScreen } from '~/game/GameOverScreen'
import { GameHUD } from '~/game/GameHUD'
import { PowerUpScreen } from '~/game/PowerUpScreen'
import { PauseScreen } from '~/game/PauseScreen'
import * as THREE from 'three'
import { GameManager } from '~/game/GameManager'
import { useInput, type InputState } from '~/composables/useInput'

// --- CONSTANTS ---
const GAME_WIDTH = 1920
const GAME_HEIGHT = 1080

// --- REFS ---
const gameContainer = ref<HTMLDivElement | null>(null)
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
// ゲームオーバー画面用
const selectedGameOverIndex = ref(0)
const gameOverWaveDisplay = ref(0)
const gameOverScoreDisplay = ref('000000')

// ゲームプレイ中のみHUDを表示する内部フラグ
const isHudVisible = () => !showOverlay.value && !showDebugMenu.value && !showGameOver.value


// --- Input ---
const input = useInput()
const gameManager = shallowRef<GameManager | null>(null)

// --- Three.js ---
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let animationId: number | null = null
let lastTime: number = 0

// --- オーバーレイ画面（Three.js描画） ---
let titleScreen: TitleScreen | null = null
let gameOverScreen: GameOverScreen | null = null
let gameHUD: GameHUD | null = null
let powerUpScreen: PowerUpScreen | null = null
let pauseScreen: PauseScreen | null = null

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
    // リザルトをラッチしてThree.js画面を表示
    gameOverWaveDisplay.value = gm.gameOverWave
    gameOverScoreDisplay.value = gm.score.toString().padStart(6, '0')
    showGameOver.value = true
    selectedGameOverIndex.value = 0
    gameOverScreen?.show(gm.gameOverWave, gm.score.toString().padStart(6, '0'))
    setTimeout(() => window.addEventListener('keydown', handleGameOverKey), 500)
  }

  // Three.js画面の更新
  titleScreen?.update(delta)
  if (showGameOver.value) gameOverScreen?.update(delta)
  if (showPowerUp.value) powerUpScreen?.update(delta)


  // HUD更新（ゲームプレイ中のみ）
  const hudVisible = isHudVisible()
  gameHUD?.update({
    wave: gm.currentWave,
    score: gm.score,
    playerLevel: gm.playerLevel,
    scoreForNextPowerUp: gm.scoreForNextPowerUp,
    powerUpListText: gm.powerUpListEntries.join(' / '),
    hpPercent: gm.hpPercent,
    isBossActive: gm.isBossActive,
    bossHpPercent: gm.isBossActive ? (gm.bossHp / gm.bossMaxHp) * 100 : 0,
    minimapDots: gm.minimapDots,
    announcementText: gm.announcementText,
    announcementAlpha: gm.announcementAlpha,
    bossWarningText: gm.bossWarningText,
    isBossWarningActive: gm.isBossWarningActive,
    isVisible: hudVisible,
  }, delta)

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

  // 内部状態の同期（デバッグメニュー等で使うもの）
  showPowerUp.value = gm.isPowerUpSelecting
  if (showPowerUp.value) powerUpOptions.value = gm.currentPowerUpOptions
  isPaused.value = gm.isPaused

  // カメラシェイク
  camera.position.set(gm.shakeOffset.x, gm.shakeOffset.y, 100)
  camera.lookAt(gm.shakeOffset.x, gm.shakeOffset.y, 0)

  renderer.render(scene, camera)
}

// --- キーハンドラー ---
const startOnKey = (e: KeyboardEvent) => {
  if (!showOverlay.value || !gameManager.value) return
  const key = e.key.toLowerCase()
  if (key === 'z' || key === 'x') {
    showOverlay.value = false
    titleScreen?.hide()
    gameManager.value.isGameActive = true
    window.removeEventListener('keydown', startOnKey)
  } else if (key === 'q') {
    showOverlay.value = false
    titleScreen?.hide()
    showDebugMenu.value = true
    availablePowerUps.value = gameManager.value.powerUps
    window.removeEventListener('keydown', startOnKey)
    window.addEventListener('keydown', handleDebugKey)
  }
}

// ゲームオーバー画面でのキー操作
const handleGameOverKey = (e: KeyboardEvent) => {
  if (!showGameOver.value) return
  const key = e.key.toLowerCase()
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    selectedGameOverIndex.value = (selectedGameOverIndex.value - 1 + 2) % 2
    gameOverScreen?.setSelectedIndex(selectedGameOverIndex.value)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    selectedGameOverIndex.value = (selectedGameOverIndex.value + 1) % 2
    gameOverScreen?.setSelectedIndex(selectedGameOverIndex.value)
  } else if (key === 'z' || key === 'x' || key === 'enter') {
    onGameOverSelect(selectedGameOverIndex.value)
  }
}

// コンティニュー / タイトルに戻る の処理
const onGameOverSelect = async (index: number) => {
  const s = scene
  if (!showGameOver.value || !gameManager.value || !s) return
  showGameOver.value = false
  gameOverScreen?.hide()
  window.removeEventListener('keydown', handleGameOverKey)

  if (index === 0) {
    // ---- コンティニュー ----
    await gameManager.value.continueGame(s, GAME_WIDTH, GAME_HEIGHT)
  } else {
    // ---- タイトルに戻る ----
    // TitleScreen / GameOverScreen / HUD系 を先にシーンから切り離す
    titleScreen?.destroy()
    gameOverScreen?.destroy()
    gameHUD?.destroy()
    powerUpScreen?.destroy()
    pauseScreen?.destroy()
    titleScreen = null
    gameOverScreen = null
    gameHUD = null
    powerUpScreen = null
    pauseScreen = null

    // title/gameOver/hud などのオーバーレイ系の destroy() により関連Spriteが削除される
    // sceneにある Light（AmbientLight, DirectionalLight 等）は残し、それ以外をクリアする
    const objectsToRemove = s.children.filter((obj) => !obj.type.includes('Light') && obj.type !== 'OrthographicCamera')
    objectsToRemove.forEach((obj) => s.remove(obj))

    gameManager.value.destroy()
    gameManager.value = new GameManager()
    await gameManager.value.init(s, GAME_WIDTH, GAME_HEIGHT)
    // 新しいシーンにオーバーレイ画面を再追加
    titleScreen = new TitleScreen(s)
    gameOverScreen = new GameOverScreen(s)
    gameHUD = new GameHUD(s)
    powerUpScreen = new PowerUpScreen(s)
    pauseScreen = new PauseScreen(s)
    titleScreen.show()
    showOverlay.value = true
    window.addEventListener('keydown', startOnKey)
  }
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

  const key = e.key.toLowerCase()
  const options = powerUpOptions.value
  const mainOptions = options.filter((o: any) => o.id !== 'skip')
  const hasSkip = options.some((o: any) => o.id === 'skip')
  const mainCount = mainOptions.length
  const totalCount = options.length

  if (key === 'z' || key === 'x' || key === 'enter') {
    selectPowerUp(selectedIndex.value)
  } else if (e.key === 'ArrowLeft') {
    if (selectedIndex.value < mainCount) {
      selectedIndex.value = (selectedIndex.value - 1 + mainCount) % mainCount
      powerUpScreen?.setSelectedIndex(selectedIndex.value)
    }
  } else if (e.key === 'ArrowRight') {
    if (selectedIndex.value < mainCount) {
      selectedIndex.value = (selectedIndex.value + 1) % mainCount
      powerUpScreen?.setSelectedIndex(selectedIndex.value)
    }
  } else if (e.key === 'ArrowDown') {
    if (selectedIndex.value < mainCount && hasSkip) {
      selectedIndex.value = totalCount - 1
      powerUpScreen?.setSelectedIndex(selectedIndex.value)
    }
  } else if (e.key === 'ArrowUp') {
    if (selectedIndex.value === totalCount - 1) {
      selectedIndex.value = Math.floor(mainCount / 2)
      powerUpScreen?.setSelectedIndex(selectedIndex.value)
    }
  }
}

// handlePowerUpKeyUp は不要になった（isKeyHeldOnPowerUpShow廃止）



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
    // PowerUpScreenを表示
    const options = powerUpOptions.value
    const reason = gameManager.value?.powerUpReason ?? null
    const wave = gameManager.value?.currentWave ?? 0
    powerUpScreen?.show(options, reason, wave)
    window.addEventListener('keydown', handlePowerUpKey)
  } else {
    powerUpScreen?.hide()
    window.removeEventListener('keydown', handlePowerUpKey)
  }
})

watch(isPaused, (val) => {
  // 強化画面、ゲームオーバー、タイトル画面（Overlay）が表示されていない場合のみポーズ画面を出す
  const anyOverlayActive = showPowerUp.value || showGameOver.value || showOverlay.value || showDebugMenu.value
  if (val && !anyOverlayActive) {
    pauseScreen?.show()
  } else {
    pauseScreen?.hide()
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
onMounted(async () => {
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

  // --- Lighting ---
  const ambientLight = new THREE.AmbientLight(0xffffff, 2.5)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0)
  // 光源を左上から当てる (OrthographicCameraの左上が -width/2, +height/2)
  directionalLight.position.set(-GAME_WIDTH / 2, GAME_HEIGHT / 2, 100)
  scene.add(directionalLight)

  // --- GameManager 初期化 ---
  const gm = new GameManager()
  await gm.init(scene, GAME_WIDTH, GAME_HEIGHT)
  gameManager.value = gm

  // --- オーバーレイ画面（Three.js描画）初期化 ---
  titleScreen = new TitleScreen(scene)
  gameOverScreen = new GameOverScreen(scene)
  gameHUD = new GameHUD(scene)
  powerUpScreen = new PowerUpScreen(scene)
  pauseScreen = new PauseScreen(scene)
  titleScreen.show()

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
  window.removeEventListener('keydown', handleGameOverKey)
  window.removeEventListener('keydown', handlePauseKey)
  window.removeEventListener('blur', handleBlur)
  window.removeEventListener('resize', fitCanvas)
  titleScreen?.destroy()
  titleScreen = null
  gameOverScreen?.destroy()
  gameOverScreen = null
  gameHUD?.destroy()
  gameHUD = null
  powerUpScreen?.destroy()
  powerUpScreen = null
  pauseScreen?.destroy()
  pauseScreen = null

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
}

.game-container canvas {
  display: block;
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
