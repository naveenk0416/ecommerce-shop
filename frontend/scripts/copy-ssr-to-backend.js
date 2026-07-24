const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const workspace = path.resolve(__dirname, '..', '..');
    const distRoot = path.join(workspace, 'dist', 'app');

    if (!fs.existsSync(distRoot)) {
      console.error(`Expected build output at ${distRoot} but it doesn't exist.`);
      process.exit(1);
    }

    const browserSrc = path.join(distRoot, 'browser');
    const serverSrc = path.join(distRoot, 'server');

    const backendDir = path.join(workspace, 'backend');
    const browserDest = path.join(backendDir, 'browser');
    const serverDest = path.join(backendDir, 'server');

    // Ensure dest directories
    fs.rmSync(browserDest, { recursive: true, force: true });
    fs.rmSync(serverDest, { recursive: true, force: true });
    fs.mkdirSync(browserDest, { recursive: true });
    fs.mkdirSync(serverDest, { recursive: true });

    // Copy recursively (Node 16+ supports fs.cp)
    const copyDir = (src, dest) => {
      if (!fs.existsSync(src)) return;
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
      }
    };

    copyDir(browserSrc, browserDest);
    copyDir(serverSrc, serverDest);

    console.log('SSR build copied to backend:');
    console.log(' -', browserDest);
    console.log(' -', serverDest);
  } catch (err) {
    console.error('Failed to copy SSR build to backend', err);
    process.exit(1);
  }
})();
