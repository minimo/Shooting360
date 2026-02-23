<template>
  <div class="game-wrapper">
    <div ref="gameContainer" class="game-container" />
    <div v-if="showOverlay" class="overlay">
      <div class="overlay-content">
        <h2>🎮 Shooting 360</h2>
        <p>Z / X キーでスタート</p>
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

    <!-- ゲームオーバー画面 -->
    <div v-if="showGameOver" class="overlay">
      <div class="overlay-content">
        <h2 class="game-over-text">GAME OVER</h2>
        <p>Your ship was destroyed.</p>
        <div class="controls">
          <p style="font-size: 1.2rem; margin: 0; color: #fff;">Z / X キーでリスタート</p>
        </div>
      </div>
    </div>

    <!-- パワーアップ選択画面 -->
    <div v-if="showPowerUp" class="overlay powerup-overlay">
      <div class="overlay-content">
        <h2 class="powerup-title">WAVE CLEAR!</h2>
        <p>強化項目を一つ選択してください</p>
        <div class="powerup-options">
          <div 
            v-for="(option, index) in powerUpOptions" 
            :key="option.id" 
            class="powerup-card"
            :class="{ selected: index === selectedIndex }"
            @click="selectPowerUp(index)"
            @mouseenter="selectedIndex = index"
          >
            <h3>{{ option.name }}</h3>
            <p>{{ option.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ポーズ画面 -->
    <div v-if="isPaused" class="overlay pause-overlay">
      <div class="overlay-content">
        <h2 class="pause-title">PAUSE</h2>
        <p>ESC キーで再開</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Application, Ticker } from 'pixi.js'
import { GameManager } from '~/game/GameManager'
import { useInput, type InputState } from '~/composables/useInput'

const gameContainer = ref<HTMLDivElement | null>(null)
const showOverlay = ref(true)
const showGameOver = ref(false)
const showPowerUp = ref(false)
const isPaused = ref(false)
const selectedIndex = ref(0)
const powerUpOptions = ref<any[]>([])

// --- Input ---
const input = useInput()

let app: Application | null = null
let gameManager: GameManager | null = null

// --- Game Loop ---
const gameLoop = (time: Ticker) => {
  if (gameManager) {
    if (gameManager.isGameOver && !showGameOver.value) {
      showGameOver.value = true
      // 入力重複防止のため少し待ってからイベント登録
      setTimeout(() => {
        window.addEventListener('keydown', restartOnKey)
      }, 500)
    }
    // パワーアップ選択中またはオーバーレイ表示中は自機の操作入力を遮断する
    const effectiveInput = (showPowerUp.value || showOverlay.value || showGameOver.value) 
      ? { up: false, down: false, left: false, right: false, shoot: false, laser: false, boost: false }
      : input.state

    gameManager.update(time.deltaTime, effectiveInput as InputState)
    
    // パワーアップ状態の同期
    showPowerUp.value = gameManager.isPowerUpSelecting
    if (showPowerUp.value) {
      powerUpOptions.value = gameManager.currentPowerUpOptions
    }

    // ポーズ状態の同期
    isPaused.value = gameManager.isPaused
  }
}

// キー入力でスタートするハンドラ（Z or X キーのみ）
const startOnKey = (e: KeyboardEvent) => {
  if (showOverlay.value && gameManager && (e.key === 'z' || e.key === 'Z' || e.key === 'x' || e.key === 'X')) {
    showOverlay.value = false
    gameManager.isGameActive = true
    window.removeEventListener('keydown', startOnKey)
  }
}

// リスタートハンドラ
const restartOnKey = () => {
  if (showGameOver.value && gameManager && app) {
    showGameOver.value = false
    window.removeEventListener('keydown', restartOnKey)
    
    // 現在のゲームマネージャーを破棄し、再生成
    gameManager.destroy()
    gameManager = new GameManager()
    gameManager.init(app)
    gameManager.isGameActive = true
  }
}

// パワーアップ選択
const selectPowerUp = (index: number) => {
  if (gameManager) {
    gameManager.selectPowerUp(index)
    showPowerUp.value = false
  }
}

// パワーアップ選択用のキーボード操作
const handlePowerUpKey = (e: KeyboardEvent) => {
  if (!showPowerUp.value) return

  const key = e.key.toLowerCase()
  if (key === 'z') {
    // Zキーで次を選択（ループ）
    selectedIndex.value = (selectedIndex.value + 1) % powerUpOptions.value.length
  } else if (key === 'x' || key === 'enter') {
    // XキーまたはEnterで決定
    selectPowerUp(selectedIndex.value)
  } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
    selectedIndex.value = (selectedIndex.value - 1 + powerUpOptions.value.length) % powerUpOptions.value.length
  } else if (e.key === 'ArrowRight' || e.key === 'Right') {
    selectedIndex.value = (selectedIndex.value + 1) % powerUpOptions.value.length
  }
}

// ポーズ用のキーボード操作
const handlePauseKey = (e: KeyboardEvent) => {
  // オーバーレイやゲームオーバー時は無視
  if (showOverlay.value || showGameOver.value || showPowerUp.value) return
  
  if (e.key === 'Escape') {
    if (gameManager) {
      gameManager.isPaused = !gameManager.isPaused
      isPaused.value = gameManager.isPaused
    }
  }
}

watch(showPowerUp, (val) => {
  if (val) {
    selectedIndex.value = 0
    window.addEventListener('keydown', handlePowerUpKey)
  } else {
    window.removeEventListener('keydown', handlePowerUpKey)
  }
})

// 固定解像度
const GAME_WIDTH = 1920
const GAME_HEIGHT = 1080

const fitCanvas = () => {
  if (!gameContainer.value) return
  const wrapperW = window.innerWidth
  const wrapperH = window.innerHeight
  const scale = Math.min(wrapperW / GAME_WIDTH, wrapperH / GAME_HEIGHT)
  const container = gameContainer.value
  container.style.width = `${GAME_WIDTH}px`
  container.style.height = `${GAME_HEIGHT}px`
  container.style.transform = `translate(-50%, -50%) scale(${scale})`
}

onMounted(async () => {
  if (!gameContainer.value) return

  // タイトル画面用の入力待ち
  window.addEventListener('keydown', startOnKey)
  // ポーズ用の入力待ち
  window.addEventListener('keydown', handlePauseKey)

  // --- Pixi Application 初期化 (固定解像度 1920×1080) ---
  app = new Application()
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: 0x050510,
    antialias: true,
    resolution: 1,
  })

  gameContainer.value.appendChild(app.canvas)

  // --- GameManager 初期化 ---
  gameManager = new GameManager()
  gameManager.init(app)
  gameManager.resize(GAME_WIDTH, GAME_HEIGHT)

  // --- メインループ ---
  app.ticker.add(gameLoop)

  // --- 初回フィット + リサイズ対応 ---
  fitCanvas()
  window.addEventListener('resize', fitCanvas)
})

onUnmounted(() => {
  window.removeEventListener('keydown', startOnKey)
  window.removeEventListener('keydown', restartOnKey)
  window.removeEventListener('keydown', handlePauseKey)
  window.removeEventListener('resize', fitCanvas)
  if (gameManager) {
    gameManager.destroy()
    gameManager = null
  }
  if (app) {
    app.destroy(true, { children: true })
    app = null
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

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  z-index: 10;
}

.overlay-content {
  text-align: center;
  color: #fff;
  font-family: 'Segoe UI', sans-serif;
}

.overlay-content h2 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
  color: #00ffcc;
  text-shadow: 0 0 20px rgba(0, 255, 204, 0.5);
}

.game-over-text {
  font-size: 3.5rem !important;
  color: #ff3333 !important;
  text-shadow: 0 0 20px rgba(255, 51, 51, 0.5) !important;
}

.overlay-content p {
  font-size: 1.2rem;
  color: #aaa;
  margin: 0.3rem 0;
}

.controls {
  margin-top: 1.5rem;
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.controls ul {
  list-style: none;
  padding: 0;
}

.controls li {
  text-align: left;
  font-size: 1.1rem;
  color: #ccc;
  margin: 0.4rem 0;
}

/* パワーアップUI */
.powerup-overlay {
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
}

.powerup-title {
  font-size: 3rem !important;
  color: #ffff00 !important;
  text-shadow: 0 0 30px rgba(255, 255, 0, 0.5) !important;
  margin-bottom: 2rem !important;
}

.powerup-options {
  display: flex;
  gap: 20px;
  margin-top: 2rem;
  justify-content: center;
}

.powerup-card {
  width: 280px;
  padding: 2rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
  border: 2px solid rgba(0, 255, 204, 0.3);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.powerup-card:hover, .powerup-card.selected {
  transform: translateY(-10px);
  background: linear-gradient(135deg, rgba(0, 255, 204, 0.2) 0%, rgba(0, 255, 204, 0.1) 100%);
  border-color: #00ffcc;
  box-shadow: 0 10px 30px rgba(0, 255, 204, 0.3);
}

.powerup-card.selected {
  border-width: 3px;
  animation: pulse-border 1.5s infinite;
}

@keyframes pulse-border {
  0% { box-shadow: 0 0 10px rgba(0, 255, 204, 0.3); }
  50% { box-shadow: 0 0 25px rgba(0, 255, 204, 0.6); }
  100% { box-shadow: 0 0 10px rgba(0, 255, 204, 0.3); }
}

.powerup-card h3 {
  color: #00ffcc;
  font-size: 1.4rem;
  margin-bottom: 1rem;
}

.powerup-card p {
  color: #eee !important;
  font-size: 0.95rem !important;
  line-height: 1.4;
}

/* ポーズUI */
.pause-overlay {
  background: rgba(0, 0, 0, 0.6);
}

.pause-title {
  font-size: 4rem !important;
  color: #fff !important;
  letter-spacing: 0.5rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5) !important;
  margin-bottom: 1rem !important;
}
</style>
