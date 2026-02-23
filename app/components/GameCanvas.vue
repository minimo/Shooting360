<template>
  <div class="game-wrapper">
    <div ref="gameContainer" class="game-container" />
    <div v-if="showOverlay" class="overlay">
      <div class="overlay-content">
        <h2>🎮 Shooting 360</h2>
        <p>何かキーを押してスタート</p>
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
          <p style="font-size: 1.2rem; margin: 0; color: #fff;">何かキーを押してリスタート</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Application, Ticker } from 'pixi.js'
import { GameManager } from '~/game/GameManager'
import { useInput } from '~/composables/useInput'

const gameContainer = ref<HTMLDivElement | null>(null)
const showOverlay = ref(true)
const showGameOver = ref(false)

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
    gameManager.update(time.deltaTime, input.state)
  }
}

// キー入力でスタートするハンドラ
const startOnKey = () => {
  if (showOverlay.value && gameManager) {
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

onMounted(async () => {
  if (!gameContainer.value) return

  // タイトル画面用の入力待ち
  window.addEventListener('keydown', startOnKey)

  // --- Pixi Application 初期化 ---
  app = new Application()
  await app.init({
    resizeTo: gameContainer.value,
    backgroundColor: 0x050510,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  gameContainer.value.appendChild(app.canvas)

  // --- GameManager 初期化 ---
  gameManager = new GameManager()
  gameManager.init(app)
  // --- メインループ ---
  app.ticker.add(gameLoop)

  // --- リサイズ対応 ---
  const onResize = () => {
    if (app && gameManager) {
      gameManager.resize(app.screen.width, app.screen.height)
    }
  }
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('keydown', startOnKey)
  window.removeEventListener('keydown', restartOnKey)
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
  background: #0a0a1a;
}

.game-container {
  width: 100%;
  height: 100%;
  cursor: none; /* マウスを使わないため非表示へ */
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
</style>
