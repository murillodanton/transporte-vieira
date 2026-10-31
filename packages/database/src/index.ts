import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  clientSchema,
  vehicleSchema,
  driverSchema,
  tripSchema,
  entrySchema,
  type Snapshot,
  type User,
} from '@vieira/core';

export class DomainError extends Error {
  readonly code = 'VIEIRA_DOMAIN';
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type RecordRow = Record<string, string | number | null>;
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,contact TEXT NOT NULL,email TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY,name TEXT NOT NULL,plate TEXT NOT NULL UNIQUE,capacity INTEGER NOT NULL CHECK(capacity>0),status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drivers(id TEXT PRIMARY KEY,name TEXT NOT NULL,contact TEXT NOT NULL,status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY,clientId TEXT NOT NULL REFERENCES clients(id),vehicleId TEXT NOT NULL REFERENCES vehicles(id),driverId TEXT NOT NULL REFERENCES drivers(id),origin TEXT NOT NULL,destination TEXT NOT NULL,departure TEXT NOT NULL,arrival TEXT NOT NULL,passengers INTEGER NOT NULL,status TEXT NOT NULL,notes TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS trips_schedule ON trips(vehicleId,driverId,departure,arrival);
      CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,tripId TEXT NOT NULL REFERENCES trips(id),type TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),category TEXT NOT NULL,description TEXT NOT NULL,date TEXT NOT NULL,status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,entity TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  get(table: 'clients' | 'vehicles' | 'drivers' | 'trips' | 'entries', id: string) {
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as
      RecordRow | undefined;
    if (!row) throw new DomainError('Registro não encontrado.', 404);
    return row;
  }
  log(actor: string, action: string, entity: string) {
    this.db
      .prepare('INSERT INTO audit VALUES(?,?,?,?,?)')
      .run(randomUUID(), actor, action, entity, new Date().toISOString());
  }
  snapshot(admin: boolean): Snapshot {
    const list = (sql: string) =>
      this.db
        .prepare(sql)
        .all()
        .map((row) => ({ ...row }));
    return {
      clients: list('SELECT * FROM clients ORDER BY name'),
      vehicles: list('SELECT * FROM vehicles ORDER BY name'),
      drivers: list('SELECT * FROM drivers ORDER BY name'),
      trips: list(
        `SELECT t.*,c.name clientName,v.name vehicleName,v.plate,d.name driverName FROM trips t JOIN clients c ON c.id=t.clientId JOIN vehicles v ON v.id=t.vehicleId JOIN drivers d ON d.id=t.driverId ORDER BY t.departure DESC`,
      ),
      entries: admin
        ? list(
            'SELECT e.*,t.destination FROM entries e JOIN trips t ON t.id=e.tripId ORDER BY e.date DESC',
          )
        : [],
      users:
        admin && this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='user'").get()
          ? list('SELECT id,name,email,role FROM user ORDER BY name')
          : [],
      audit: admin ? list('SELECT * FROM audit ORDER BY createdAt DESC LIMIT 40') : [],
      demo: Boolean(this.db.prepare("SELECT 1 FROM settings WHERE key='demo'").get()),
    } as unknown as Snapshot;
  }
  saveResource(
    kind: 'clients' | 'vehicles' | 'drivers',
    input: unknown,
    id: string | undefined,
    actor: string,
  ) {
    const data =
      kind === 'clients'
        ? clientSchema.parse(input)
        : kind === 'vehicles'
          ? vehicleSchema.parse(input)
          : driverSchema.parse(input);
    return this.transaction(() => {
      if (id) this.get(kind, id);
      if (id && (kind === 'vehicles' || kind === 'drivers')) {
        const key = kind === 'vehicles' ? 'vehicleId' : 'driverId';
        const assigned = this.db
          .prepare(
            `SELECT passengers FROM trips WHERE ${key}=? AND status IN ('confirmed','in_progress') AND arrival>?`,
          )
          .all(id, new Date().toISOString()) as { passengers: number }[];
        if ('status' in data && data.status !== 'active' && assigned.length)
          throw new DomainError(
            'Existem viagens confirmadas para este cadastro. Realoque ou cancele as viagens antes de alterar a disponibilidade.',
            409,
          );
        if ('capacity' in data && assigned.some((t) => t.passengers > data.capacity))
          throw new DomainError(
            'A capacidade não pode ser menor que a lotação de uma viagem já confirmada.',
            409,
          );
      }
      const recordId = id ?? randomUUID();
      const fields = Object.keys(data);
      const values = Object.values(data);
      try {
        if (id)
          this.db
            .prepare(`UPDATE ${kind} SET ${fields.map((f) => f + '=?').join(',')} WHERE id=?`)
            .run(...values, recordId);
        else
          this.db
            .prepare(
              `INSERT INTO ${kind}(id,${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')},?)`,
            )
            .run(recordId, ...values);
      } catch (error) {
        if (String(error).includes('UNIQUE'))
          throw new DomainError('Esta placa já está cadastrada.', 409);
        throw error;
      }
      this.log(actor, id ? 'Cadastro atualizado' : 'Cadastro criado', `${kind}:${recordId}`);
      return { id: recordId };
    });
  }
  deleteResource(kind: 'clients' | 'vehicles' | 'drivers', id: string, actor: string) {
    return this.transaction(() => {
      this.get(kind, id);
      const key = { clients: 'clientId', vehicles: 'vehicleId', drivers: 'driverId' }[kind];
      if (this.db.prepare(`SELECT 1 FROM trips WHERE ${key}=?`).get(id))
        throw new DomainError(
          'Este cadastro possui histórico de viagens e não pode ser excluído. Altere sua disponibilidade quando aplicável.',
          409,
        );
      this.db.prepare(`DELETE FROM ${kind} WHERE id=?`).run(id);
      this.log(actor, 'Cadastro excluído', `${kind}:${id}`);
    });
  }
  saveTrip(input: unknown, id: string | undefined, actor: string) {
    const data = tripSchema.parse(input);
    data.departure = new Date(data.departure).toISOString();
    data.arrival = new Date(data.arrival).toISOString();
    return this.transaction(() => {
      const previous = id ? this.get('trips', id) : null;
      if (previous?.status === 'completed')
        throw new DomainError(
          'Viagens concluídas preservam seu histórico e não podem ser alteradas.',
          409,
        );
      if (previous) {
        const version = (input as { version?: unknown }).version;
        if (version !== previous.version)
          throw new DomainError(
            'Esta viagem foi atualizada por outra pessoa. Atualize a página e tente novamente.',
            409,
          );
        const allowed: Record<string, string[]> = {
          draft: ['draft', 'confirmed', 'cancelled'],
          confirmed: ['confirmed', 'in_progress', 'cancelled'],
          in_progress: ['in_progress', 'completed'],
          cancelled: ['cancelled', 'draft'],
        };
        if (!allowed[String(previous.status)]?.includes(data.status))
          throw new DomainError('Esta mudança de situação não é permitida.', 409);
      } else if (!['draft', 'confirmed'].includes(data.status))
        throw new DomainError('Uma nova viagem deve iniciar como prevista ou confirmada.');
      this.get('clients', data.clientId);
      const vehicle = this.get('vehicles', data.vehicleId);
      const driver = this.get('drivers', data.driverId);
      if (data.status !== 'cancelled') {
        if (vehicle.status !== 'active' || driver.status !== 'active')
          throw new DomainError('Selecione um veículo e um motorista disponíveis.', 409);
        if (data.passengers > Number(vehicle.capacity))
          throw new DomainError(`O veículo comporta até ${vehicle.capacity} passageiros.`, 409);
      }
      if (['confirmed', 'in_progress', 'completed'].includes(data.status)) {
        // A transação de escrita serializa validação e gravação entre conexões.
        const start = new Date(Date.parse(data.departure) - 30 * 60000).toISOString();
        const end = new Date(Date.parse(data.arrival) + 30 * 60000).toISOString();
        const conflict = this.db
          .prepare(
            `SELECT id,vehicleId FROM trips WHERE id!=? AND status IN ('confirmed','in_progress','completed') AND (vehicleId=? OR driverId=?) AND departure<? AND arrival>?`,
          )
          .get(id ?? '', data.vehicleId, data.driverId, end, start) as RecordRow | undefined;
        if (conflict)
          throw new DomainError(
            `Conflito de agenda: ${conflict.vehicleId === data.vehicleId ? 'o veículo' : 'o motorista'} já está reservado neste período. Considere 30 minutos de intervalo entre viagens.`,
            409,
          );
      }
      const recordId = id ?? randomUUID();
      const fields = Object.keys(data);
      const values = Object.values(data);
      if (id)
        this.db
          .prepare(
            `UPDATE trips SET ${fields.map((f) => f + '=?').join(',')},version=version+1 WHERE id=?`,
          )
          .run(...values, recordId);
      else
        this.db
          .prepare(
            `INSERT INTO trips(id,${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')},?)`,
          )
          .run(recordId, ...values);
      this.log(actor, id ? 'Viagem atualizada' : 'Viagem criada', recordId);
      return { id: recordId };
    });
  }
  saveEntry(input: unknown, id: string | undefined, actor: string) {
    const data = entrySchema.parse(input);
    return this.transaction(() => {
      this.get('trips', data.tripId);
      if (id) this.get('entries', id);
      const recordId = id ?? randomUUID();
      const fields = Object.keys(data);
      const values = Object.values(data);
      if (id)
        this.db
          .prepare(`UPDATE entries SET ${fields.map((f) => f + '=?').join(',')} WHERE id=?`)
          .run(...values, recordId);
      else
        this.db
          .prepare(
            `INSERT INTO entries(id,${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')},?)`,
          )
          .run(recordId, ...values);
      this.log(actor, id ? 'Lançamento atualizado' : 'Lançamento criado', recordId);
      return { id: recordId };
    });
  }
  deleteEntry(id: string, actor: string) {
    return this.transaction(() => {
      this.get('entries', id);
      this.db.prepare('DELETE FROM entries WHERE id=?').run(id);
      this.log(actor, 'Lançamento excluído', id);
    });
  }
  seedDemo(actor: string) {
    return this.transaction(() => {
      if (
        this.db
          .prepare(
            'SELECT 1 FROM trips UNION SELECT 1 FROM clients UNION SELECT 1 FROM vehicles UNION SELECT 1 FROM drivers UNION SELECT 1 FROM settings LIMIT 1',
          )
          .get()
      )
        throw new DomainError(
          'A demonstração só pode ser carregada em uma base operacional vazia.',
          409,
        );
      const clients = [
        ['demo-c1', 'Horizonte Turismo · Exemplo', '(35) 90000-0101', 'contato@example.com'],
        ['demo-c2', 'Grupo Caminhos · Exemplo', '(35) 90000-0102', ''],
        ['demo-c3', 'Escola Aprender · Exemplo', '(35) 90000-0103', ''],
      ];
      for (const c of clients) this.db.prepare('INSERT INTO clients VALUES(?,?,?,?)').run(...c);
      for (const v of [
        ['demo-v1', 'Ônibus executivo', 'ABC1D23', 46, 'active'],
        ['demo-v2', 'Micro-ônibus', 'DEF4G56', 28, 'active'],
        ['demo-v3', 'Van de turismo', 'GHI7J89', 15, 'active'],
      ])
        this.db.prepare('INSERT INTO vehicles VALUES(?,?,?,?,?)').run(...v);
      for (const dr of [
        ['demo-d1', 'Carlos · Exemplo', '(35) 90000-0201', 'active'],
        ['demo-d2', 'Ana · Exemplo', '(35) 90000-0202', 'active'],
        ['demo-d3', 'Paulo · Exemplo', '(35) 90000-0203', 'active'],
      ])
        this.db.prepare('INSERT INTO drivers VALUES(?,?,?,?)').run(...dr);
      const destinations = [
        'Aparecida, SP',
        'Campos do Jordão, SP',
        'São Paulo, SP',
        'Monte Verde, MG',
        'São Lourenço, MG',
      ];
      for (let i = 0; i < 5; i++) {
        const day = new Date();
        day.setUTCDate(day.getUTCDate() + i - 1);
        day.setUTCHours(10, 0, 0, 0);
        const end = new Date(day.getTime() + 10 * 3600000);
        const status =
          i === 0 ? 'completed' : i === 1 ? 'confirmed' : i === 2 ? 'draft' : 'confirmed';
        this.db
          .prepare('INSERT INTO trips VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(
            `demo-t${i}`,
            `demo-c${(i % 3) + 1}`,
            `demo-v${(i % 3) + 1}`,
            `demo-d${(i % 3) + 1}`,
            'Paraisópolis, MG',
            destinations[i],
            day.toISOString(),
            end.toISOString(),
            [38, 22, 12, 40, 24][i],
            status,
            'Registro fictício para demonstração do projeto.',
            1,
          );
        this.db
          .prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?)')
          .run(
            `demo-e${i}`,
            `demo-t${i}`,
            'income',
            [420000, 280000, 190000, 450000, 290000][i],
            'Fretamento',
            'Dados de demonstração',
            day.toISOString().slice(0, 10),
            i === 0 ? 'paid' : 'pending',
          );
        if (i === 0)
          this.db
            .prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?)')
            .run(
              'demo-expense',
              'demo-t0',
              'expense',
              135000,
              'Combustível',
              'Dados de demonstração',
              day.toISOString().slice(0, 10),
              'paid',
            );
      }
      this.db.prepare("INSERT INTO settings VALUES('demo','true')").run();
      this.log(actor, 'Demonstração carregada', 'Dados fictícios');
    });
  }
}
export const databasePath =
  process.env.DATABASE_PATH ??
  resolve(process.env.VIEIRA_ROOT ?? process.cwd(), 'data/vieira.sqlite');
const globals = globalThis as unknown as { vieiraStore?: Store };
export function getStore() {
  return (globals.vieiraStore ??= new Store(databasePath));
}
export function requireAdmin(user: User) {
  if (user.role !== 'admin')
    throw new DomainError('Esta ação está disponível apenas para gestores.', 403);
}
