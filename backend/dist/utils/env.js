import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
function resolveEnvPath() {
    const candidates = [
        process.cwd(),
        resolve(process.cwd(), '..'),
        resolve(process.cwd(), 'backend'),
        resolve(process.cwd(), 'backend', '..'),
    ];
    for (const candidate of candidates) {
        const envPath = join(candidate, '.env');
        if (existsSync(envPath)) {
            return envPath;
        }
    }
    return join(process.cwd(), '.env');
}
dotenv.config({ path: resolveEnvPath() });
//# sourceMappingURL=env.js.map