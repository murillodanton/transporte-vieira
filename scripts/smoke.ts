import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
const root = resolve(process.env.VIEIRA_ROOT ?? process.cwd());
mkdirSync(join(root, 'test-results'), { recursive: true });
const temp = mkdtempSync(join(root, 'test-results/http-'));
const database = join(temp, 'test.sqlite');
async function main() {
  const reservation = createServer();
  await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r));
  const address = reservation.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((r) => reservation.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  let logs = '';
  const server = spawn(
    process.execPath,
    [
      join(root, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: join(root, 'apps/web'),
      env: {
        ...process.env,
        VIEIRA_ROOT: root,
        DATABASE_PATH: database,
        BETTER_AUTH_URL: base,
        BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });
  const password = randomBytes(18).toString('base64url');
  let cookie = '';
  let tests = 0;
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    session = cookie,
    origin = base,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        origin,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { cookie: session } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const content = await response.text();
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(content);
    } catch {}
    return { response, data, content };
  }
  function check(condition: unknown, message: string) {
    assert.ok(condition, message);
    console.log('✓', message);
    tests++;
  }
  try {
    let online = false;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(base);
        if (r.ok) {
          online = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(online, 'Servidor não iniciou: ' + logs);
    check(
      (await request('/api/snapshot')).response.status === 401,
      'API rejeita acesso sem sessão',
    );
    const first = await request('/api/setup', 'POST', {
      name: 'Gestor de teste',
      email: 'gestor@example.com',
      password,
    });
    check(
      first.response.status === 201,
      'Primeiro gestor é criado pelo fluxo inicial: ' + first.content,
    );
    check(
      (
        await request('/api/setup', 'POST', {
          name: 'Outra conta',
          email: 'outro@example.com',
          password,
        })
      ).response.status === 409,
      'Configuração inicial não pode ser repetida',
    );
    const publicSignup = await request('/api/auth/sign-up/email', 'POST', {
      name: 'Intruso',
      email: 'intruso@example.com',
      password,
    });
    check(!publicSignup.response.ok, 'Cadastro público permanece desativado');
    const signIn = await request('/api/auth/sign-in/email', 'POST', {
      email: 'gestor@example.com',
      password,
    });
    check(signIn.response.ok, 'Autenticação do gestor funciona');
    cookie = signIn.response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
    check(cookie.includes('session_token'), 'Sessão é emitida em cookie');
    const page = await fetch(base, { headers: { cookie } });
    const html = await page.text();
    check(
      page.ok && html.includes('Seu mês em movimento') && !html.includes('Only plain objects'),
      'Painel autenticado renderiza os dados no React',
    );
    check(
      (await request('/api/demo', 'POST', {})).response.ok,
      'Demonstração pode ser carregada em base vazia',
    );
    const snapshot = (await request('/api/snapshot')).data;
    check(
      snapshot.trips.length === 5 && snapshot.entries.length === 6,
      'Dados persistidos retornam pela API',
    );
    const trip = snapshot.trips.find((t: any) => t.status === 'confirmed');
    const conflict = await request('/api/trips', 'POST', trip);
    check(
      conflict.response.status === 409 && String(conflict.data.error).includes('Conflito'),
      'API bloqueia uma reserva sobreposta',
    );
    const invalid = await request('/api/trips', 'POST', { ...trip, passengers: 99 });
    check(invalid.response.status === 409, 'API bloqueia lotação excedida');
    check(
      (await request('/api/trips', 'POST', { ...trip, arrival: trip.departure })).response
        .status === 400,
      'Erros de validação são retornados como erro de preenchimento',
    );
    const edited = await request('/api/trips/' + trip.id, 'PUT', {
      ...trip,
      notes: 'Registro modificado pelo teste HTTP',
    });
    check(edited.response.ok, 'Edição válida é persistida');
    check(
      (await request('/api/trips/' + trip.id, 'PUT', trip)).response.status === 409,
      'API impede edição com versão desatualizada',
    );
    const resource = await request('/api/clients', 'POST', {
      name: 'Cliente HTTP',
      contact: '(35) 90000-0000',
      email: 'http@example.com',
    });
    check(resource.response.status === 201, 'Cadastro de cliente é salvo');
    const exportResponse = await request('/api/export');
    check(
      exportResponse.response.ok &&
        exportResponse.content.includes('Motorista') &&
        exportResponse.response.headers.get('content-type')?.includes('text/csv'),
      'CSV autenticado é gerado',
    );
    const operator = await request('/api/users', 'POST', {
      name: 'Operador de teste',
      email: 'operador@example.com',
      password,
      role: 'operator',
    });
    check(operator.response.status === 201, 'Gestor pode criar operador');
    const opSignIn = await request(
      '/api/auth/sign-in/email',
      'POST',
      { email: 'operador@example.com', password },
      '',
    );
    const opCookie = opSignIn.response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
    check(opSignIn.response.ok, 'Operador consegue entrar');
    const opData = (await request('/api/snapshot', 'GET', undefined, opCookie)).data;
    check(
      opData.entries.length === 0 && opData.users.length === 0 && opData.audit.length === 0,
      'Operador não recebe dados financeiros ou administrativos',
    );
    check(
      (
        await request(
          '/api/entries',
          'POST',
          {
            tripId: trip.id,
            type: 'income',
            amount: '1.01',
            category: 'Teste',
            date: '2030-01-01',
            status: 'paid',
          },
          opCookie,
        )
      ).response.status === 403,
      'Permissão financeira é aplicada no servidor',
    );
    check(
      (
        await request(
          '/api/users',
          'POST',
          { name: 'Teste', email: 'x@example.com', password, role: 'admin' },
          opCookie,
        )
      ).response.status === 403,
      'Operador não cria novos acessos',
    );
    check(
      (await request('/api/clients/' + resource.data.id, 'DELETE', undefined, opCookie)).response
        .status === 403,
      'Operador não exclui cadastros',
    );
    check(
      (
        await request(
          '/api/clients/' + resource.data.id,
          'DELETE',
          undefined,
          cookie,
          'https://invalid.example',
        )
      ).response.status === 403,
      'Alteração de origem externa é recusada',
    );
    const amount = await request('/api/entries', 'POST', {
      tripId: trip.id,
      type: 'income',
      amount: '10.10',
      category: 'Teste',
      date: '2030-01-01',
      status: 'paid',
    });
    check(amount.response.status === 201, 'Gestor registra receita');
    const after = (await request('/api/snapshot')).data;
    check(
      after.entries.find((e: any) => e.id === amount.data.id).amount === 1010,
      'Centavos são preservados de ponta a ponta',
    );
    const oldCookie = cookie;
    check((await request('/api/auth/sign-out', 'POST', {})).response.ok, 'Saída encerra a sessão');
    check(
      (await request('/api/snapshot', 'GET', undefined, oldCookie)).response.status === 401,
      'Cookie encerrado não autoriza a API',
    );
    const source = new DatabaseSync(database);
    const copy = join(temp, 'backup.sqlite');
    await backup(source, copy);
    source.close();
    const restored = new DatabaseSync(copy);
    const count = restored.prepare('SELECT COUNT(*) total FROM trips').get();
    restored.close();
    check(count?.total === 5, 'Cópia de segurança pode ser reaberta com as viagens');
    console.log(
      `\n${tests} verificações HTTP e de persistência passaram. Base isolada em test-results.`,
    );
  } catch (error) {
    console.error('Saída do servidor:\n' + logs);
    throw error;
  } finally {
    server.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
