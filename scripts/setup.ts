import { createAccount, ready, needsSetup } from '../apps/web/lib/auth';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
async function main() {
  await ready();
  if (!needsSetup()) {
    console.log('A primeira conta já existe. Entre pelo aplicativo.');
    return;
  }
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = process.env.ADMIN_NAME ?? (await input.question('Nome do gestor: '));
    const email = process.env.ADMIN_EMAIL ?? (await input.question('E-mail do gestor: '));
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(15).toString('base64url');
    await createAccount({ name, email, password, role: 'admin' }, true);
    console.log('Conta criada. Acesse http://localhost:3000');
    if (!process.env.ADMIN_PASSWORD)
      console.log('Senha inicial (altere em Minha conta):', password);
  } finally {
    input.close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
