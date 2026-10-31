import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { nextCookies } from 'better-auth/next-js';
import { getStore, databasePath, DomainError } from '@vieira/database';
import { userSchema, type User } from '@vieira/core';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function authOptions() {
  const store = getStore();
  const secretPath = join(dirname(databasePath), 'auth.secret');
  if (!process.env.BETTER_AUTH_SECRET && !existsSync(secretPath)) {
    try {
      writeFileSync(secretPath, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!existsSync(secretPath)) throw error;
    }
  }
  return {
    appName: 'Transporte Vieira',
    database: store.db,
    secret: process.env.BETTER_AUTH_SECRET ?? readFileSync(secretPath, 'utf8'),
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    trustedOrigins: process.env.BETTER_AUTH_URL
      ? [process.env.BETTER_AUTH_URL]
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: { role: { type: 'string', defaultValue: 'operator', input: false } },
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 8 } },
    },
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;
}
function makeAuth() {
  return betterAuth(authOptions());
}
type Auth = ReturnType<typeof makeAuth>;
const state = globalThis as unknown as { vieiraAuthReady?: Promise<Auth> };
export function getAuth() {
  // Nenhuma conexão é aberta durante a compilação do Next.js.
  return (state.vieiraAuthReady ??= (async () => {
    const options = authOptions();
    const migrations = await getMigrations(options);
    await migrations.runMigrations();
    return betterAuth(options);
  })().catch((error) => {
    state.vieiraAuthReady = undefined;
    throw error;
  }));
}
export async function ready() {
  await getAuth();
}
export function needsSetup() {
  return !getStore().db.prepare('SELECT id FROM user LIMIT 1').get();
}
export async function currentUser(headers: Headers): Promise<User | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role === 'admin' ? 'admin' : 'operator',
  };
}
export async function createAccount(input: unknown, bootstrap = false, actor = 'Gestor') {
  await ready();
  const data = userSchema.parse(input);
  const store = getStore();
  if (bootstrap) {
    if (!needsSetup()) throw new DomainError('A configuração inicial já foi concluída.', 409);
    try {
      store.db.prepare("INSERT INTO settings VALUES('setup-lock','locked')").run();
    } catch {
      throw new DomainError('A configuração inicial já está em andamento.', 409);
    }
  }
  try {
    const options = authOptions();
    const registration = betterAuth({
      ...options,
      emailAndPassword: { ...options.emailAndPassword, disableSignUp: false },
      plugins: [],
    });
    const result = await registration.api.signUpEmail({
      body: { name: data.name, email: data.email, password: data.password },
    });
    store.db
      .prepare('UPDATE user SET role=? WHERE id=?')
      .run(bootstrap ? 'admin' : data.role, result.user.id);
    store.db.prepare('DELETE FROM session WHERE userId=?').run(result.user.id);
    store.log(bootstrap ? 'Configuração inicial' : actor, 'Usuário criado', data.email);
    return { id: result.user.id };
  } finally {
    if (bootstrap) store.db.prepare("DELETE FROM settings WHERE key='setup-lock'").run();
  }
}
