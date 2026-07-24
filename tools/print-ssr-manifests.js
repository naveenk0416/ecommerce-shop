(async () => {
  try {
    const { pathToFileURL } = require('url');
    const { join } = require('path');
    const serverDist = join(__dirname, '..', 'dist', 'app', 'server');
    const enginePath = join(serverDist, 'angular-app-engine-manifest.mjs');
    const appPath = join(serverDist, 'angular-app-manifest.mjs');

    console.log('Looking for manifests in', serverDist);

    const fs = require('fs');
    if (!fs.existsSync(serverDist)) {
      console.error('Server dist folder not found:', serverDist);
      process.exit(1);
    }

    const engine = await import(pathToFileURL(enginePath).href).catch(e => { console.error('Failed engine import', e.message); return null; });
    const app = await import(pathToFileURL(appPath).href).catch(e => { console.error('Failed app import', e.message); return null; });

    console.log('engine manifest:', engine ? Object.keys(engine.default) : null);
    console.log('app manifest keys:', app ? Object.keys(app.default) : null);
    if (app && app.default && app.default.assets) {
      console.log('assets keys:', Object.keys(app.default.assets));
    }
  } catch (err) {
    console.error('Error inspecting manifests:', err);
    process.exit(1);
  }
})();
