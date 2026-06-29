import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-app-version',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>\n    <meta name="app-version" content="${pkg.version}" />\n    <meta http-equiv="Cache-Control" content="no-cache" />`,
        );
      },
    },
  ],
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // UiPath codedapp push rejects filenames containing ".es." (e.g. index.es-*.js)
        chunkFileNames: 'assets/chunk-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
  },
});
