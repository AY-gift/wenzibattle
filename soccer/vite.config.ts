import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { configDefaults } from 'vitest/config';

const shared = fileURLToPath(new URL('../shared/src', import.meta.url));
const sharedTests = fileURLToPath(new URL('../shared/tests', import.meta.url));

/**
 * Fills %SITE_URL% in index.html (Open Graph / X card tags) from VITE_SITE_URL, e.g.
 * VITE_SITE_URL=https://example.com/soccer/ npm run build. Social crawlers need absolute
 * HTTPS URLs; without it the tags fall back to relative paths and a warning is printed.
 */
function siteUrl(env: Record<string, string>): Plugin {
  let url = (env.VITE_SITE_URL || '').trim();
  if (url && !url.endsWith('/')) url += '/';
  let warned = false;
  return {
    name: 'glyph-site-url',
    transformIndexHtml(html, ctx) {
      if (!url && ctx.bundle && !warned && (warned = true)) console.warn('\n[og] VITE_SITE_URL is not set: og:image / og:url will be relative and most SNS previews will not show the image.\n');
      return html.replace(/%SITE_URL%/g, url);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    base: './',
    plugins: [siteUrl(env)],
    // Character system, glyph modelling and sharing come from ../shared (one database for all games).
    resolve: {
      alias: { '@shared': shared, '@shared-tests': sharedTests },
      dedupe: ['three'],
    },
    server: { port: 5174 },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: { main: 'index.html' },
      },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      exclude: [...configDefaults.exclude],
    },
  };
});
