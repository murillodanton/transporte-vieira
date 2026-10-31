import { backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getStore } from '@vieira/database';
async function main() {
  const store = getStore();
  const dir = resolve(process.env.VIEIRA_ROOT ?? process.cwd(), 'data/backups');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `vieira-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await backup(store.db, file);
  console.log('Cópia de segurança criada em:', file);
  store.db.close();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
