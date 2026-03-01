import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    include: [resolve(__dirname, 'src/**/*.{test,spec}.{js,ts}')],
    globals: true,
  },
});
