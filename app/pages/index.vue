<template>
  <div>
    <ClientOnly>
      <GameCanvas />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
useHead({
  title: 'Shooting 360 - 全方向型2Dシューティング',
  meta: [
    { name: 'description', content: '全方向型2Dシューティングゲーム Nuxt4 + PixiJS' },
  ],
})
</script>

<style>
/* グローバルリセット */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0a1a;
}
</style>
