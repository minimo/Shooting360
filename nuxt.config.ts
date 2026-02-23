// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // PixiJS はクライアントサイドのみで動作
  ssr: false,

  devServer: {
    port: 3330,
  },
})
