import { currentUser, ready, createAccount } from '@/lib/auth';
import { DomainError, getStore, requireAdmin } from '@vieira/database';
import { csv, statusLabels } from '@vieira/core';
import { ZodError } from 'zod';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, ctx: Context) {
  try {
    await ready();
    const { path } = await ctx.params;
    const [kind, id] = path;
    if (path.length > 2) throw new DomainError('Recurso não encontrado.', 404);
    if (req.method !== 'GET') {
      const origin = req.headers.get('origin');
      const allowed = process.env.BETTER_AUTH_URL
        ? [process.env.BETTER_AUTH_URL]
        : ['http://localhost:3000', 'http://127.0.0.1:3000'];
      if (!origin || !allowed.includes(origin))
        throw new DomainError('Origem da solicitação não autorizada.', 403);
      if (Number(req.headers.get('content-length') ?? 0) > 20000)
        throw new DomainError('Solicitação muito grande.', 413);
    }
    if (kind === 'setup' && req.method === 'POST' && !id) {
      const body = await req.json();
      await createAccount({ ...body, role: 'admin' }, true);
      return Response.json({ ok: true }, { status: 201 });
    }
    const user = await currentUser(req.headers);
    if (!user) throw new DomainError('Entre novamente para continuar.', 401);
    const store = getStore();
    if (kind === 'snapshot' && req.method === 'GET')
      return Response.json(store.snapshot(user.role === 'admin'), {
        headers: { 'Cache-Control': 'no-store' },
      });
    if (kind === 'export' && req.method === 'GET') {
      const snapshot = store.snapshot(user.role === 'admin');
      const financial = req.nextUrl.searchParams.get('type') === 'finance';
      if (financial) requireAdmin(user);
      const content = financial
        ? csv([
            ['Viagem', 'Tipo', 'Valor em reais', 'Categoria', 'Descrição', 'Data', 'Situação'],
            ...snapshot.entries.map((e) => [
              e.destination,
              e.type === 'income' ? 'Receita' : 'Despesa',
              (e.amount / 100).toFixed(2).replace('.', ','),
              e.category,
              e.description,
              e.date,
              e.status === 'paid' ? 'Realizado' : 'Pendente',
            ]),
          ])
        : csv([
            [
              'Cliente',
              'Origem',
              'Destino',
              'Saída',
              'Retorno',
              'Veículo',
              'Placa',
              'Motorista',
              'Passageiros',
              'Situação',
            ],
            ...snapshot.trips.map((t) => [
              t.clientName,
              t.origin,
              t.destination,
              t.departure,
              t.arrival,
              t.vehicleName,
              t.plate,
              t.driverName,
              t.passengers,
              statusLabels[t.status],
            ]),
          ]);
      return new Response(content, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="vieira-${financial ? 'financeiro' : 'viagens'}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    if (kind === 'demo' && req.method === 'POST' && !id) {
      requireAdmin(user);
      store.seedDemo(user.name);
      return Response.json({ ok: true });
    }
    if (kind === 'users' && req.method === 'POST' && !id) {
      requireAdmin(user);
      const result = await createAccount(await req.json(), false, user.name);
      return Response.json(result, { status: 201 });
    }
    if (['clients', 'vehicles', 'drivers'].includes(kind)) {
      const resource = kind as 'clients' | 'vehicles' | 'drivers';
      if (req.method === 'DELETE' && id) {
        requireAdmin(user);
        store.deleteResource(resource, id, user.name);
        return Response.json({ ok: true });
      }
      if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id))
        return Response.json(store.saveResource(resource, await req.json(), id, user.name), {
          status: id ? 200 : 201,
        });
    }
    if (kind === 'trips' && ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)))
      return Response.json(store.saveTrip(await req.json(), id, user.name), {
        status: id ? 200 : 201,
      });
    if (kind === 'entries') {
      requireAdmin(user);
      if (req.method === 'DELETE' && id) {
        store.deleteEntry(id, user.name);
        return Response.json({ ok: true });
      }
      if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id))
        return Response.json(store.saveEntry(await req.json(), id, user.name), {
          status: id ? 200 : 201,
        });
    }
    throw new DomainError('Recurso ou método não encontrado.', 404);
  } catch (error) {
    // Os pacotes podem existir em chunks diferentes do Next.js; instanceof sozinho não é suficiente.
    if (
      error instanceof ZodError ||
      (error instanceof Error && error.name === 'ZodError' && 'issues' in error)
    ) {
      const issues = (error as ZodError).issues;
      return Response.json({ error: issues[0]?.message ?? 'Confira os campos.' }, { status: 400 });
    }
    if (
      error instanceof DomainError ||
      (error instanceof Error && 'code' in error && error.code === 'VIEIRA_DOMAIN')
    ) {
      const domain = error as DomainError;
      return Response.json({ error: domain.message }, { status: domain.status });
    }
    if (error instanceof SyntaxError)
      return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const body = 'body' in error ? error.body : null;
      return Response.json(
        {
          error:
            body && typeof body === 'object' && 'message' in body
              ? String(body.message)
              : 'Não foi possível concluir esta ação.',
        },
        { status: Number(error.statusCode) || 400 },
      );
    }
    console.error('Falha na operação', error);
    return Response.json({ error: 'Não foi possível concluir. Tente novamente.' }, { status: 500 });
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
