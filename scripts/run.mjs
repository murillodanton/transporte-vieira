import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundled = join(
  homedir(),
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin',
  process.platform === 'win32' ? 'node.exe' : 'node',
);
let node = process.execPath;
if (Number(process.versions.node.split('.')[0]) < 24) {
  node = process.env.VIEIRA_NODE || (existsSync(bundled) ? bundled : '');
  if (!node) {
    console.error('Instale o Node.js 24 LTS para executar este projeto.');
    process.exit(1);
  }
}
const command = process.argv[2];
const extra = process.argv.slice(3);
const commands = {
  dev: [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', ...extra],
  build: [join(root, 'node_modules/next/dist/bin/next'), 'build', ...extra],
  start: [
    join(root, 'node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    ...extra,
  ],
  typecheck: [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '-p',
    'apps/web/tsconfig.json',
  ],
  test: ['--import', 'tsx', '--test', 'packages/database/tests/store.test.ts'],
  'test:http': ['--import', 'tsx', 'scripts/smoke.ts'],
  setup: ['--import', 'tsx', 'scripts/setup.ts'],
  backup: ['--import', 'tsx', 'scripts/backup.ts'],
};
if (!(command in commands)) {
  console.error('Comando desconhecido.');
  process.exit(1);
}
const result = spawnSync(node, commands[command], {
  cwd: ['dev', 'build', 'start'].includes(command) ? join(root, 'apps/web') : root,
  env: { ...process.env, VIEIRA_ROOT: root },
  stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
