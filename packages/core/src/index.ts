import { z } from 'zod';
import ptBR from 'zod/v4/locales/pt-BR.js';
z.config(ptBR());

const text = (label: string, max = 160) =>
  z.string().trim().min(1, `${label} é obrigatório.`).max(max);
const optionalText = z.string().trim().max(500).default('');
export const clientSchema = z.object({
  name: text('Nome'),
  contact: optionalText,
  email: z.union([z.email(), z.literal('')]).default(''),
});
export const vehicleSchema = z.object({
  name: text('Identificação'),
  plate: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, 'Informe uma placa válida, sem hífen.'),
  capacity: z.coerce.number().int().min(1).max(100),
  status: z.enum(['active', 'maintenance', 'inactive']),
});
export const driverSchema = z.object({
  name: text('Nome'),
  contact: optionalText,
  status: z.enum(['active', 'leave', 'inactive']),
});
export const tripStatuses = [
  'draft',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type TripStatus = (typeof tripStatuses)[number];
export const statusLabels: Record<TripStatus, string> = {
  draft: 'Prevista',
  confirmed: 'Confirmada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};
export const tripSchema = z
  .object({
    clientId: text('Cliente', 60),
    vehicleId: text('Veículo', 60),
    driverId: text('Motorista', 60),
    origin: text('Origem'),
    destination: text('Destino'),
    departure: z.iso.datetime({ offset: true }),
    arrival: z.iso.datetime({ offset: true }),
    passengers: z.coerce.number().int().min(1).max(100),
    status: z.enum(tripStatuses),
    notes: optionalText,
  })
  .refine((t) => Date.parse(t.arrival) > Date.parse(t.departure), {
    message: 'O retorno deve ocorrer depois da saída.',
    path: ['arrival'],
  });
export const entrySchema = z.object({
  tripId: text('Viagem', 60),
  type: z.enum(['income', 'expense']),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,8}([.,]\d{1,2})?$/, 'Informe um valor positivo com até duas casas decimais.')
    .transform((v) => Math.round(Number(v.replace(',', '.')) * 100))
    .refine((v) => v > 0, 'O valor deve ser maior que zero.'),
  category: text('Categoria', 80),
  description: optionalText,
  date: z.iso.date(),
  status: z.enum(['pending', 'paid']),
});
export const userSchema = z.object({
  name: text('Nome'),
  email: z.email(),
  password: z.string().min(12, 'Use pelo menos 12 caracteres.').max(128),
  role: z.enum(['admin', 'operator']),
});
export type Client = z.infer<typeof clientSchema> & { id: string };
export type Vehicle = z.infer<typeof vehicleSchema> & { id: string };
export type Driver = z.infer<typeof driverSchema> & { id: string };
export type Trip = z.infer<typeof tripSchema> & {
  id: string;
  clientName: string;
  vehicleName: string;
  plate: string;
  driverName: string;
  version: number;
};
export type Entry = Omit<z.infer<typeof entrySchema>, 'amount'> & {
  id: string;
  amount: number;
  destination: string;
};
export type User = { id: string; name: string; email: string; role: 'admin' | 'operator' };
export type Audit = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  createdAt: string;
};
export type Snapshot = {
  clients: Client[];
  vehicles: Vehicle[];
  drivers: Driver[];
  trips: Trip[];
  entries: Entry[];
  users: User[];
  audit: Audit[];
  demo: boolean;
};
export function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
export function dateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
export function dayKey(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
export function csv(rows: unknown[][]): string {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((cell) => {
            let value = String(cell ?? '');
            // Impede execução de fórmulas ao abrir dados cadastrados em uma planilha.
            if (/^[\s]*[=+@\-\t\r]/.test(value)) value = "'" + value;
            return '"' + value.replaceAll('"', '""') + '"';
          })
          .join(';'),
      )
      .join('\r\n')
  );
}
