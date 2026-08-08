// Cross-platform replacement for the old POSIX-only shell one-liner in package.json's `dev`
// script — that version used `[ ]`/`grep`/`printf`, which npm's default cmd.exe script-shell on
// Windows can't run at all (the whole `dev` script silently no-ops, `ng serve` never starts).
//
// Regenerates src/app/env.ts from the GEMINI_API_KEY environment variable, but only when the
// file is missing or still has a blank/placeholder key — an existing real key is left alone.
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', 'src', 'app', 'env.ts');
const apiKey = process.env.GEMINI_API_KEY;

const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null;
const needsRegeneration = existing === null || existing.includes("''") || existing.includes('MY_GEMINI_API_KEY');

if (needsRegeneration && apiKey) {
  fs.writeFileSync(envPath, `export const GEMINI_API_KEY = '${apiKey}';\n`);
}
