import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, requireAdmin } from '../src/index';
import { csv, tripSchema } from '@vieira/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
function fixture() {
  const store = new Store(':memory:');
  const c = store.saveResource(
    'clients',
    { name: 'Cliente teste', email: '', contact: '' },
    undefined,
    'Teste',
  ).id;
  const v = store.saveResource(
    'vehicles',
    { name: 'Ônibus', plate: 'ABC1D23', capacity: 40, status: 'active' },
    undefined,
    'Teste',
  ).id;
  const d = store.saveResource(
    'drivers',
    { name: 'Motorista', contact: '', status: 'active' },
    undefined,
    'Teste',
  ).id;
  const trip = {
    clientId: c,
    vehicleId: v,
    driverId: d,
    origin: 'Paraisópolis',
    destination: 'Aparecida',
    departure: '2030-11-10T10:00:00.000Z',
    arrival: '2030-11-10T18:00:00.000Z',
    passengers: 30,
    status: 'confirmed',
    notes: '',
  };
  return { store, trip, c, v, d };
}
test('bloqueia sobreposição por veículo, motorista e intervalo de preparação', () => {
  const { store, trip } = fixture();
  store.saveTrip(trip, undefined, 'Teste');
  assert.throws(
    () => store.saveTrip({ ...trip, departure: '2030-11-10T17:00:00Z' }, undefined, 'Teste'),
    /Conflito/,
  );
  assert.throws(
    () =>
      store.saveTrip(
        { ...trip, departure: '2030-11-10T18:29:00Z', arrival: '2030-11-10T21:00:00Z' },
        undefined,
        'Teste',
      ),
    /30 minutos/,
  );
  const vehicleId = store.saveResource(
    'vehicles',
    { name: 'Van', plate: 'DEF4G56', capacity: 40, status: 'active' },
    undefined,
    'Teste',
  ).id;
  assert.throws(() => store.saveTrip({ ...trip, vehicleId }, undefined, 'Teste'), /motorista/);
  const driverId = store.saveResource(
    'drivers',
    { name: 'Outra pessoa', contact: '', status: 'active' },
    undefined,
    'Teste',
  ).id;
  store.saveTrip({ ...trip, vehicleId, driverId }, undefined, 'Teste');
  store.saveTrip(
    { ...trip, departure: '2030-11-10T18:30:00Z', arrival: '2030-11-10T21:00:00Z' },
    undefined,
    'Teste',
  );
  assert.equal(store.snapshot(false).trips.length, 3);
  store.db.close();
});
test('cancela e libera reserva, mas exige validação ao confirmar uma prevista', () => {
  const { store, trip } = fixture();
  const first = store.saveTrip(trip, undefined, 'Teste');
  const second = store.saveTrip({ ...trip, status: 'draft' }, undefined, 'Teste');
  assert.throws(() => store.saveTrip({ ...trip, version: 1 }, second.id, 'Teste'), /Conflito/);
  store.saveTrip({ ...trip, status: 'cancelled', version: 1 }, first.id, 'Teste');
  store.saveTrip({ ...trip, version: 1 }, second.id, 'Teste');
  assert.equal(store.get('trips', second.id).status, 'confirmed');
  store.db.close();
});
test('valida lotação, datas, disponibilidade e referências', () => {
  const { store, trip, v } = fixture();
  assert.throws(
    () => store.saveTrip({ ...trip, passengers: 41 }, undefined, 'Teste'),
    /40 passageiros/,
  );
  assert.equal(tripSchema.safeParse({ ...trip, arrival: trip.departure }).success, false);
  assert.throws(
    () => store.saveTrip({ ...trip, clientId: 'inexistente' }, undefined, 'Teste'),
    /não encontrado/,
  );
  store.saveResource(
    'vehicles',
    { name: 'Ônibus', plate: 'ABC1D23', capacity: 40, status: 'maintenance' },
    v,
    'Teste',
  );
  assert.throws(() => store.saveTrip(trip, undefined, 'Teste'), /disponíveis/);
  store.db.close();
});
test('preserva reservas existentes quando capacidade ou disponibilidade mudam', () => {
  const { store, trip, v, d } = fixture();
  store.saveTrip(trip, undefined, 'Teste');
  assert.throws(
    () =>
      store.saveResource(
        'vehicles',
        { name: 'Ônibus', plate: 'ABC1D23', capacity: 20, status: 'active' },
        v,
        'Teste',
      ),
    /capacidade/,
  );
  assert.throws(
    () =>
      store.saveResource(
        'drivers',
        { name: 'Motorista', contact: '', status: 'leave' },
        d,
        'Teste',
      ),
    /Realoque/,
  );
  assert.throws(() => store.deleteResource('vehicles', v, 'Teste'), /histórico/);
  store.db.close();
});
test('detecta edição concorrente e impede alteração de viagem concluída', () => {
  const { store, trip } = fixture();
  const { id } = store.saveTrip(trip, undefined, 'Teste');
  store.saveTrip({ ...trip, notes: 'Atualização A', version: 1 }, id, 'Teste');
  assert.throws(
    () => store.saveTrip({ ...trip, notes: 'Atualização B', version: 1 }, id, 'Teste'),
    /outra pessoa/,
  );
  assert.equal(store.get('trips', id).notes, 'Atualização A');
  store.saveTrip({ ...trip, status: 'in_progress', version: 2 }, id, 'Teste');
  store.saveTrip({ ...trip, status: 'completed', version: 3 }, id, 'Teste');
  assert.throws(
    () => store.saveTrip({ ...trip, status: 'completed', version: 4 }, id, 'Teste'),
    /concluídas/,
  );
  store.db.close();
});
test('valores financeiros usam centavos e não são expostos a operadores', () => {
  const { store, trip } = fixture();
  const t = store.saveTrip(trip, undefined, 'Teste');
  const entry = {
    tripId: t.id,
    type: 'income',
    amount: '10,10',
    category: 'Fretamento',
    description: '',
    date: '2030-11-10',
    status: 'paid',
  };
  const { id } = store.saveEntry(entry, undefined, 'Teste');
  assert.equal(store.snapshot(true).entries[0].amount, 1010);
  assert.equal(
    Object.getPrototypeOf(store.snapshot(true).entries[0]),
    Object.prototype,
    'Os dados enviados ao React devem ser objetos comuns.',
  );
  assert.equal(store.snapshot(false).entries.length, 0);
  assert.equal(store.snapshot(false).audit.length, 0);
  assert.throws(
    () => requireAdmin({ id: 'x', name: 'Operador', email: 'a@example.com', role: 'operator' }),
    /gestores/,
  );
  assert.throws(() => store.saveEntry({ ...entry, amount: '-1' }, undefined, 'Teste'));
  assert.throws(() => store.saveEntry({ ...entry, amount: '0' }, undefined, 'Teste'));
  assert.throws(() => store.saveEntry({ ...entry, amount: '0.001' }, undefined, 'Teste'));
  store.deleteEntry(id, 'Teste');
  assert.equal(store.snapshot(true).entries.length, 0);
  store.db.close();
});
test('transações inválidas não deixam viagem nem auditoria parcial', () => {
  const { store, trip } = fixture();
  const before = store.snapshot(true).audit.length;
  assert.throws(() => store.saveTrip({ ...trip, passengers: 50 }, undefined, 'Teste'));
  assert.equal(store.snapshot(true).trips.length, 0);
  assert.equal(store.snapshot(true).audit.length, before);
  store.db.close();
});
test('dados persistem após reabertura e conflitos funcionam entre conexões', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vieira-test-'));
  const file = join(dir, 'test.sqlite');
  const a = new Store(file);
  let b: Store | undefined;
  try {
    a.seedDemo('Teste');
    b = new Store(file);
    const trip = a.snapshot(true).trips.find((t) => t.status === 'confirmed')!;
    assert.throws(
      () => b!.saveTrip({ ...trip, version: undefined }, undefined, 'Teste'),
      /Conflito/,
    );
    assert.equal(b.snapshot(false).trips.length, 5);
    assert.throws(() => b!.seedDemo('Teste'), /vazia/);
  } finally {
    a.db.close();
    b?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('exportação protege contra fórmulas e preserva separadores e aspas', () => {
  const out = csv([['=HYPERLINK("x")', 'texto;texto', ' João', '+1']]);
  assert.ok(out.includes('"\'=HYPERLINK'));
  assert.ok(out.includes('"texto;texto"'));
  assert.ok(out.includes('"\'+1"'));
});
