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
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap' },
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
