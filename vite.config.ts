import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Publish the plan schema at a stable URL next to the app: <site>/schema/curro-plan.v1.schema.json
function publishSchema(): Plugin {
  const source = 'schema/curro-plan.v1.schema.json';
  return {
    name: 'curro-publish-schema',
    configureServer(server) {
      // Only plain requests: the app also imports this file, and Vite serves that as a JS
      // module on the same path with a query string (e.g. ?import).
      server.middlewares.use('/' + source, (req, res, next) => {
        if (req.url?.includes('?')) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(source, 'utf8'));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: source, source: readFileSync(source, 'utf8') });
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any host or sub-path (GitHub Pages, Netlify, a local folder).
  base: './',
  plugins: [
    react(),
    publishSchema(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Curro — run tracker',
        short_name: 'Curro',
        description: 'Track runs against your training plan, offline.',
        theme_color: '#2a78d6',
        background_color: '#f9f9f7',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json}'] },
    }),
  ],
});
