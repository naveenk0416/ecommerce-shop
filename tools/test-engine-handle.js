(async () => {
  try {
    await import('@angular/compiler');
    const ssr = await import('@angular/ssr');
    const node = await import('@angular/ssr/node');
    const { pathToFileURL } = require('url');
    const { join } = require('path');
    const serverDist = join(__dirname, '..', 'dist', 'app', 'server');
    const engineManifestPath = join(serverDist, 'angular-app-engine-manifest.mjs');
    const appManifestPath = join(serverDist, 'angular-app-manifest.mjs');
    const engineMod = await import(pathToFileURL(engineManifestPath).href);
    ssr[Object.keys(ssr).find(k=>k.includes('setAngularAppEngine') ) || 'ɵsetAngularAppEngineManifest'](engineMod.default);
    const appMod = await import(pathToFileURL(appManifestPath).href);
    ssr[Object.keys(ssr).find(k=>k.includes('setAngularAppManifest') ) || 'ɵsetAngularAppManifest'](appMod.default);
    const engine = new node.AngularNodeAppEngine();
    console.log('engine created');
    const { createWebRequestFromNodeRequest } = node;
    const fakeReq = { method: 'GET', url: '/', headers: { host: 'localhost:4000' }, socket: {} };
    const webReq = createWebRequestFromNodeRequest(fakeReq);
    const response = await engine.handle(webReq);
    console.log('response:', !!response, response && Object.keys(response));
  } catch (err) {
    console.error('test engine error', err && err.message ? err.message : err);
  }
})();
