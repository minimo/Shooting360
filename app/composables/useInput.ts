import { reactive, onMounted, onUnmounted } from 'vue'

/** 入力状態の型定義 */
export interface InputState {
    up: boolean
    down: boolean
    left: boolean
    right: boolean
    shoot: boolean
    laser: boolean
    boost: boolean
}

/**
 * 入力管理 Composable
 *
 * キーボード操作（ArrowUp, ArrowDown, ArrowLeft, ArrowRight, KeyZ, KeyX）を管理する。
 */
export function useInput() {
    /** キー押下状態 */
    const state = reactive<InputState>({
        up: false,
        down: false,
        left: false,
        right: false,
        shoot: false,
        laser: false,
        boost: false,
    })

    // --- キーボードハンドラ ---
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'ArrowUp') state.up = true
        if (e.code === 'ArrowDown') state.down = true
        if (e.code === 'ArrowLeft') state.left = true
        if (e.code === 'ArrowRight') state.right = true
        if (e.code === 'KeyZ') state.shoot = true
        if (e.code === 'KeyX') state.laser = true
        if (e.code === 'KeyC') state.boost = true

        // ブラウザのスクロール等を抑制
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyX'].includes(e.code)) {
            e.preventDefault()
        }
    }

    const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'ArrowUp') state.up = false
        if (e.code === 'ArrowDown') state.down = false
        if (e.code === 'ArrowLeft') state.left = false
        if (e.code === 'ArrowRight') state.right = false
        if (e.code === 'KeyZ') state.shoot = false
        if (e.code === 'KeyX') state.laser = false
        if (e.code === 'KeyC') state.boost = false
    }

    // --- ライフサイクル ---
    onMounted(() => {
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
    })

    onUnmounted(() => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
    })

    return {
        state,
    }
}
