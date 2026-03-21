import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'SEKAI MMW Preview',
        short_name: 'MMW Preview',
        description: 'Project SEKAI 风格 SUS 谱面预览器',
        theme_color: '#0b1930',
        background_color: '#081018',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        maximumFileSizeToCacheInBytes: 80 * 1024 * 1024,
        globIgnores: [
          '**/.DS_Store',
          '**/pwa/icon-source.png',
          '**/assets/mmw/**',
          '**/assets/*.wasm',
        ],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,gif,json,mp3,mp4,wasm,txt,woff,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
