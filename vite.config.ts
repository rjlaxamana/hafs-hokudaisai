import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HAFS 北大際 POS & KDS',
        short_name: 'HAFS 北大際',
        description: 'Festival Stall POS & Kitchen Display System',
        theme_color: '#0038A8',
        background_color: '#FFFFFF',
        display: 'standalone',
      }
    })
  ],
});