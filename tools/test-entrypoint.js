(async () => {
  const { pathToFileURL } = require('url');
  const { join } = require('path');
  try {
    const serverDist = join(__dirname, '..', 'dist', 'app', 'server');
    const engineManifestPath = join(serverDist, 'angular-app-engine-manifest.mjs');
    console.log('engineManifestPath', engineManifestPath);
    const engineMod = await import(pathToFileURL(engineManifestPath).href);
    const manifest = engineMod.default;
    console.log('entryPoints keys', Object.keys(manifest.entryPoints));
    for (const key of Object.keys(manifest.entryPoints)) {
      try {
        console.log('Invoking entryPoint', key);
        const res = await manifest.entryPoints[key]();
        console.log('entryPoint result keys', Object.keys(res));
      } catch (err) {
        console.error('entryPoint error', err && err.message ? err.message : err);
      }
    }
  } catch (err) {
    console.error('test error', err && err.message ? err.message : err);
  }
})();
