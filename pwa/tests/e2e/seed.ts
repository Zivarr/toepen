import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const dockerBin = 'C:\\Users\\t.wezeman\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin'

/** Resets the dev database to the known e2e state (admin, tim, group Work with Ravi/Kees/Sanne). */
export function seed(): void {
  const sep = process.platform === 'win32' ? ';' : ':'
  execSync('docker compose exec -T -e TOEPEN_E2E_SEED=1 php php api/tests/seed_e2e.php', {
    cwd: repoRoot,
    env: { ...process.env, PATH: `${dockerBin}${sep}${process.env.PATH ?? ''}` },
    stdio: 'pipe',
  })
}
