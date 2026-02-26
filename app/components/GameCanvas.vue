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
              <span class="level-badge" :style="{ visibility: (option.maxLevel && option.maxLevel > 1) ? 'visible' : 'hidden' }">
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

    <!-- ポーズ画面 -->
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
                highlighted: debugSelectedIndex === index
              }"
              @click="incrementDebugPowerUp(option.id, option.maxLevel || 1)"
              @contextmenu.prevent="decrementDebugPowerUp(option.id)"
              @mouseenter="debugSelectedIndex = index"
            >
              <h4>{{ option.name }}</h4>
              <div 
                class="debug-level-badge"
                :class="{ active: (debugPowerUpLevels[option.id] || 0) > 0 }"
                :style="{ visibility: (option.maxLevel && option.maxLevel > 1) || (debugPowerUpLevels[option.id] || 0) > 0 ? 'visible' : 'hidden' }"
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

        <div class="debug-section" :class="{ 'debug-section-highlighted': debugSelectedIndex === availablePowerUps.length }" @mouseenter="debugSelectedIndex = availablePowerUps.length">
          <h3>開始WAVE選択: {{ debugStartWave }}</h3>
          <div class="debug-wave-selector">
            <button @click="debugStartWave = Math.max(1, debugStartWave - 1)">◀</button>
            <input type="range" v-model.number="debugStartWave" min="1" max="50">
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
import { Application, Ticker } from 'pixi.js'
import { GameManager } from '~/game/GameManager'
import { useInput, type InputState } from '~/composables/useInput'

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
const currentWave = ref(0)

const mainPowerUpOptions = computed(() => {
  return powerUpOptions.value.filter(opt => opt.id !== 'skip')
})

const skipPowerUpOption = computed(() => {
  return powerUpOptions.value.find(opt => opt.id === 'skip')
})

// --- Input ---
const input = useInput()

let app: Application | null = null
const gameManager = shallowRef<GameManager | null>(null)

// --- Game Loop ---
const gameLoop = (time: Ticker) => {
  if (gameManager.value) {
    if (gameManager.value.isGameOver && !showGameOver.value) {
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

    gameManager.value.update(time.deltaMS / (1000/60), effectiveInput as InputState)
    
    // 常にWave数を同期
    currentWave.value = gameManager.value.currentWave

    // パワーアップ状態の同期
    showPowerUp.value = gameManager.value.isPowerUpSelecting
    if (showPowerUp.value) {
      powerUpOptions.value = gameManager.value.currentPowerUpOptions
    }

    // ポーズ状態の同期
    isPaused.value = gameManager.value.isPaused
  }
}

// キー入力でスタートするハンドラ（Z or X キーのみ）
const startOnKey = (e: KeyboardEvent) => {
  if (showOverlay.value && gameManager.value) {
    const key = e.key.toLowerCase()
    if (key === 'z' || key === 'x') {
      showOverlay.value = false
      gameManager.value.isGameActive = true
      window.removeEventListener('keydown', startOnKey)
    } else if (key === 'q') {
      // デバッグモード起動
      showOverlay.value = false
      showDebugMenu.value = true
      availablePowerUps.value = gameManager.value.powerUps
      window.removeEventListener('keydown', startOnKey)
      window.addEventListener('keydown', handleDebugKey)
    }
  }
}

// リスタートハンドラ
const restartOnKey = () => {
  if (showGameOver.value && gameManager.value && app) {
    showGameOver.value = false
    window.removeEventListener('keydown', restartOnKey)
    
    // 現在のゲームマネージャーを破棄し、再生成
    gameManager.value.destroy()
    gameManager.value = new GameManager()
    gameManager.value.init(app)
    gameManager.value.isGameActive = true
  }
}

// パワーアップ選択
const selectPowerUp = (index: number) => {
  if (gameManager.value) {
    gameManager.value.selectPowerUp(index)
    showPowerUp.value = false
  }
}

/** 排他的な通常弾強化グループ */
const EXCLUSIVE_SHOT_IDS = ['3way', '5way', 'wide', 'piercing'] as const

const incrementDebugPowerUp = (id: string, maxLevel: number = 1) => {
  const current = debugPowerUpLevels.value[id] || 0
  if (current < maxLevel) {
    // 排他グループの場合、他をリセット
    if ((EXCLUSIVE_SHOT_IDS as readonly string[]).includes(id)) {
      for (const otherId of EXCLUSIVE_SHOT_IDS) {
        if (otherId !== id) {
          delete debugPowerUpLevels.value[otherId]
        }
      }
    }
    debugPowerUpLevels.value[id] = current + 1
  }
}

const decrementDebugPowerUp = (id: string) => {
  const current = debugPowerUpLevels.value[id] || 0
  if (current > 0) {
    debugPowerUpLevels.value[id] = current - 1
  }
}

const startDebugGame = () => {
  if (gameManager.value) {
    gameManager.value.startWithDebug(debugPowerUpLevels.value, debugStartWave.value)
    showDebugMenu.value = false
    window.removeEventListener('keydown', handleDebugKey)
  }
}

// デバッグメニュー用のキーボード操作
const handleDebugKey = (e: KeyboardEvent) => {
  if (!showDebugMenu.value) return

  const powerUpCount = availablePowerUps.value.length
  const waveIndex = powerUpCount       // Wave選択行のインデックス
  const startIndex = powerUpCount + 1  // スタートボタンのインデックス

  if (e.key === 'ArrowLeft' || e.key === 'Left') {
    if (debugSelectedIndex.value < powerUpCount) {
      // グリッド内で左移動
      debugSelectedIndex.value = (debugSelectedIndex.value - 1 + powerUpCount) % powerUpCount
    } else if (debugSelectedIndex.value === waveIndex) {
      // Wave選択行: Waveを減らす
      debugStartWave.value = Math.max(1, debugStartWave.value - 1)
    }
  } else if (e.key === 'ArrowRight' || e.key === 'Right') {
    if (debugSelectedIndex.value < powerUpCount) {
      // グリッド内で右移動
      debugSelectedIndex.value = (debugSelectedIndex.value + 1) % powerUpCount
    } else if (debugSelectedIndex.value === waveIndex) {
      // Wave選択行: Waveを増やす
      debugStartWave.value = Math.min(50, debugStartWave.value + 1)
    }
  } else if (e.key === 'ArrowUp' || e.key === 'Up') {
    if (debugSelectedIndex.value === startIndex) {
      debugSelectedIndex.value = waveIndex // スタート → Wave選択
    } else if (debugSelectedIndex.value === waveIndex) {
      debugSelectedIndex.value = 0 // Wave選択 → グリッド先頭
    } else if (debugSelectedIndex.value >= 4) {
      debugSelectedIndex.value -= 4 // 上の行へ (4列想定)
    }
  } else if (e.key === 'ArrowDown' || e.key === 'Down') {
    if (debugSelectedIndex.value < powerUpCount) {
      if (debugSelectedIndex.value + 4 < powerUpCount) {
        debugSelectedIndex.value += 4 // 下の行へ
      } else {
        debugSelectedIndex.value = waveIndex // グリッド → Wave選択
      }
    } else if (debugSelectedIndex.value === waveIndex) {
      debugSelectedIndex.value = startIndex // Wave選択 → スタート
    }
  } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Enter') {
    if (debugSelectedIndex.value < powerUpCount) {
      const option = availablePowerUps.value[debugSelectedIndex.value]
      incrementDebugPowerUp(option.id, option.maxLevel || 1)
    } else if (debugSelectedIndex.value === startIndex) {
      startDebugGame()
    }
  } else if (e.key === 'x' || e.key === 'X') {
    if (debugSelectedIndex.value < powerUpCount) {
      decrementDebugPowerUp(availablePowerUps.value[debugSelectedIndex.value].id)
    }
  } else if (e.key === 'w') {
    debugStartWave.value = Math.min(50, debugStartWave.value + 1)
  } else if (e.key === 's') {
    debugStartWave.value = Math.max(1, debugStartWave.value - 1)
  }
}

// パワーアップ選択用のキーボード操作
const handlePowerUpKey = (e: KeyboardEvent) => {
  if (!showPowerUp.value) return
  if (e.repeat) return // 長押しによる連続入力を無効化
  
  // 表示時にキーが押されていた場合は、一度全て離すまで入力を無視
  if (isKeyHeldOnPowerUpShow.value) return

  const key = e.key.toLowerCase()
  const totalOptions = powerUpOptions.value.length
  const mainOptionsCount = mainPowerUpOptions.value.length

  if (key === 'z' || key === 'x' || key === 'enter') {
    // Z, X, または Enterで決定
    selectPowerUp(selectedIndex.value)
  } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
    if (selectedIndex.value < mainOptionsCount) {
       selectedIndex.value = (selectedIndex.value - 1 + mainOptionsCount) % mainOptionsCount
    }
  } else if (e.key === 'ArrowRight' || e.key === 'Right') {
    if (selectedIndex.value < mainOptionsCount) {
       selectedIndex.value = (selectedIndex.value + 1) % mainOptionsCount
    }
  } else if (e.key === 'ArrowDown' || e.key === 'Down') {
    if (selectedIndex.value < mainOptionsCount && skipPowerUpOption.value) {
      selectedIndex.value = totalOptions - 1 // Skipボタンへ
    }
  } else if (e.key === 'ArrowUp' || e.key === 'Up') {
    if (selectedIndex.value === totalOptions - 1) {
       // 中央の強化項目に戻す
       selectedIndex.value = Math.floor(mainOptionsCount / 2) 
    }
  }
}

// ポーズ用のキーボード操作
const handlePauseKey = (e: KeyboardEvent) => {
  // オーバーレイやゲームオーバー時は無視
  if (showOverlay.value || showGameOver.value || showPowerUp.value) return
  
  if (e.key === 'Escape') {
    if (gameManager.value) {
      gameManager.value.isPaused = !gameManager.value.isPaused
      isPaused.value = gameManager.value.isPaused
    }
  }
}

// フォーカス喪失（タブ切り替え等）時の自動ポーズ
const handleBlur = () => {
  if (showOverlay.value || showGameOver.value || showPowerUp.value) return
  if (gameManager.value && !gameManager.value.isPaused) {
    gameManager.value.isPaused = true
    isPaused.value = true
  }
}

const isKeyHeldOnPowerUpShow = ref(false)

// キーが離された時の判定
const handlePowerUpKeyUp = () => {
  if (!showPowerUp.value) return
  
  // すべてのキーが離されたかチェック
  const s = input.state
  if (!s.up && !s.down && !s.left && !s.right && !s.shoot && !s.laser && !s.boost) {
    isKeyHeldOnPowerUpShow.value = false
  }
}

watch(showPowerUp, (val) => {
  if (val) {
    selectedIndex.value = 0
    // 画面が出た瞬間に「ガード状態」にする
    // 何かキーが押されていたら確実にブロック
    const s = input.state
    if (s.up || s.down || s.left || s.right || s.shoot || s.laser || s.boost) {
      isKeyHeldOnPowerUpShow.value = true
    } else {
      isKeyHeldOnPowerUpShow.value = false
    }

    window.addEventListener('keydown', handlePowerUpKey)
    window.addEventListener('keyup', handlePowerUpKeyUp)
  } else {
    window.removeEventListener('keydown', handlePowerUpKey)
    window.removeEventListener('keyup', handlePowerUpKeyUp)
    isKeyHeldOnPowerUpShow.value = false
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
  // フォーカス喪失時の自動ポーズ
  window.addEventListener('blur', handleBlur)

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
  gameManager.value = new GameManager()
  gameManager.value.init(app)
  gameManager.value.resize(GAME_WIDTH, GAME_HEIGHT)

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
  window.removeEventListener('blur', handleBlur)
  window.removeEventListener('resize', fitCanvas)
  if (gameManager.value) {
    gameManager.value.destroy()
    gameManager.value = null
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
  background: rgba(0, 0, 0, 0.4); /* 背景をもっと明るく（透けるように） */
  backdrop-filter: blur(4px);    /* ぼかしも弱く */
}

.powerup-title {
  font-size: 4rem !important;    /* CLEAR表示に合わせて大きく */
  color: #ffff00 !important;
  text-shadow: 0 0 30px rgba(255, 255, 0, 0.5), 0 0 10px rgba(0, 0, 0, 0.5) !important;
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
  align-items: stretch; /* 全てのカードの高さを揃える */
}

.powerup-card {
  width: 280px;
  height: 320px; /* 厳密に固定 */
  padding: 2rem 1.5rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
  border: 2px solid rgba(0, 255, 204, 0.3);
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-sizing: border-box;
}

.powerup-card:hover, .powerup-card.selected {
  background: linear-gradient(135deg, rgba(0, 255, 204, 0.2) 0%, rgba(0, 255, 204, 0.1) 100%);
  border-color: #00ffcc;
  box-shadow: 0 0 30px rgba(0, 255, 204, 0.4);
}

.powerup-card.selected {
  animation: pulse-border 1.5s infinite;
}

@keyframes pulse-border {
  0% { box-shadow: 0 0 10px rgba(0, 255, 204, 0.3); }
  50% { box-shadow: 0 0 25px rgba(0, 255, 204, 0.6); }
  100% { box-shadow: 0 0 10px rgba(0, 255, 204, 0.3); }
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

.powerup-skip-button:hover, .powerup-skip-button.selected {
  border-color: #fff;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

/* ポーズUI */
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

/* デバッグメニューUI */
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

.debug-start-button:hover, .debug-start-button.highlighted {
  transform: translateY(-5px) scale(1.05);
  box-shadow: 0 8px 25px rgba(255, 0, 255, 0.6);
  filter: brightness(1.2);
}
</style>
