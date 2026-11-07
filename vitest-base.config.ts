import { defineConfig } from 'vitest/config';

// Used by `ng test` (angular.json → test.options.runnerConfig).
// @ionic/angular imports "@ionic/core/components" as a directory, which Node's ESM loader
// rejects; inlining Ionic lets Vitest's resolver handle it instead.
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@ionic\//, /@stencil\//, /ionicons/],
      },
    },
  },
});
