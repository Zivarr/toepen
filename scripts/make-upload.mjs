// Builds upload/: the exact folder to copy to the web host (document root).
// Usage: node scripts/make-upload.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiSrc = path.join(repoRoot, 'api');

// Top-level entries of api/ that go to the server. Everything else stays local.
const FILES = ['index.php', 'install.php', '.htaccess', 'config.example.php'];
const DIRS = ['src', 'migrations'];

// Never copied, even if they show up inside src/ or migrations/.
const EXCLUDED_NAMES = new Set(['config.php', 'vendor', 'tests', 'phpunit.xml']);

function isAllowed(name) {
    if (EXCLUDED_NAMES.has(name)) return false;
    if (name.startsWith('composer.')) return false;
    if (name.startsWith('.') && name !== '.htaccess') return false;
    return true;
}

export function copyApi(targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });

    for (const file of FILES) {
        fs.copyFileSync(path.join(apiSrc, file), path.join(targetDir, file));
    }

    for (const dir of DIRS) {
        fs.cpSync(path.join(apiSrc, dir), path.join(targetDir, dir), {
            recursive: true,
            filter: (src) => isAllowed(path.basename(src)),
        });
    }
}

function build() {
    const uploadDir = path.join(repoRoot, 'upload');
    fs.rmSync(uploadDir, { recursive: true, force: true });
    copyApi(path.join(uploadDir, 'api'));
    console.log(`Built ${path.relative(process.cwd(), uploadDir) || uploadDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    build();
}
