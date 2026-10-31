'use client';
import { useRef, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { X, Info, Check, LoaderCircle } from 'lucide-react';
import { type Snapshot, statusLabels, type TripStatus } from '@vieira/core';
import { authClient } from '@/lib/auth-client';
export type EditorKind =
  'trips' | 'clients' | 'vehicles' | 'drivers' | 'entries' | 'users' | 'password';
export type EditorState = { kind: EditorKind; record?: Record<string, unknown> };
const singular: Record<EditorKind, string> = {
  trips: 'viagem',
  clients: 'cliente',
  vehicles: 'veículo',
  drivers: 'motorista',
  entries: 'lançamento',
  users: 'usuário',
  password: 'senha',
};
const toLocal = (value: unknown) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(String(value)))
    .replace(' ', 'T');
};
function Field({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      {title}
      {children}
    </label>
  );
}

export function Editor({
  editor,
  data,
  onClose,
  onSaved,
}: {
  editor: EditorState;
  data: Snapshot;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { kind, record } = editor;
  const value = (key: string, otherwise = '') => String(record?.[key] ?? otherwise);
  const completed = kind === 'trips' && record?.status === 'completed';
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      if (kind === 'password') {
        const result = await authClient.changePassword({
          currentPassword: String(fields.currentPassword),
          newPassword: String(fields.newPassword),
          revokeOtherSessions: true,
        });
        if (result.error)
          throw new Error(
            'Não foi possível alterar a senha. Confira a senha atual e tente novamente.',
          );
      } else {
        const body: Record<string, unknown> = { ...fields };
        if (kind === 'trips') {
          body.departure = new Date(String(fields.departure) + ':00-03:00').toISOString();
          body.arrival = new Date(String(fields.arrival) + ':00-03:00').toISOString();
          if (record) body.version = record.version;
        }
        const response = await fetch(`/api/${kind}${record ? '/' + record.id : ''}`, {
          method: record ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  const tripStatuses: Record<string, TripStatus[]> = {
    draft: ['draft', 'confirmed', 'cancelled'],
    confirmed: ['confirmed', 'in_progress', 'cancelled'],
    in_progress: ['in_progress', 'completed'],
    completed: ['completed'],
    cancelled: ['cancelled', 'draft'],
  };
  return (
    <dialog
      ref={ref}
      className="editor-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      aria-labelledby="editor-title"
    >
      <div className="dialog-header">
        <div>
          <span className="eyebrow">
            {kind === 'password'
              ? 'SUA CONTA'
              : record
                ? 'GERENCIAR REGISTRO'
                : 'ORGANIZE SUA OPERAÇÃO'}
          </span>
          <h2 id="editor-title">
            {completed
              ? 'Detalhes da viagem'
              : kind === 'password'
                ? 'Alterar senha'
                : `${record ? 'Editar' : 'Novo cadastro de'} ${singular[kind]}`}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Fechar formulário"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          <X size={22} />
        </button>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy || completed} className="form-grid">
          {kind === 'trips' ? (
            <>
              {!data.clients.length ||
              !data.vehicles.some((v) => v.status === 'active') ||
              !data.drivers.some((d) => d.status === 'active') ? (
                <p className="form-note wide">
                  <Info size={17} />
                  Antes de agendar, cadastre ao menos um cliente, um veículo disponível e um
                  motorista disponível nos menus da operação.
                </p>
              ) : null}
              <Field title="Cliente" wide>
                <select name="clientId" defaultValue={value('clientId')} required>
                  <option value="">Selecione o contratante</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Origem">
                <input
                  name="origin"
                  defaultValue={value('origin', 'Paraisópolis, MG')}
                  required
                  maxLength={160}
                />
              </Field>
              <Field title="Destino">
                <input
                  name="destination"
                  defaultValue={value('destination')}
                  required
                  placeholder="Cidade, UF"
                  maxLength={160}
                />
              </Field>
              <Field title="Saída">
                <input
                  type="datetime-local"
                  name="departure"
                  defaultValue={toLocal(record?.departure)}
                  required
                />
              </Field>
              <Field title="Retorno previsto">
                <input
                  type="datetime-local"
                  name="arrival"
                  defaultValue={toLocal(record?.arrival)}
                  required
                />
              </Field>
              <Field title="Veículo">
                <select name="vehicleId" defaultValue={value('vehicleId')} required>
                  <option value="">Selecione o veículo</option>
                  {data.vehicles
                    .filter((v) => v.status === 'active' || v.id === record?.vehicleId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.plate} · {v.capacity} lugares
                      </option>
                    ))}
                </select>
              </Field>
              <Field title="Motorista">
                <select name="driverId" defaultValue={value('driverId')} required>
                  <option value="">Selecione o motorista</option>
                  {data.drivers
                    .filter((d) => d.status === 'active' || d.id === record?.driverId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field title="Passageiros">
                <input
                  type="number"
                  name="passengers"
                  min={1}
                  max={100}
                  defaultValue={value('passengers', '1')}
                  required
                />
              </Field>
              <Field title="Situação">
                <select name="status" defaultValue={value('status', 'draft')}>
                  {(record
                    ? tripStatuses[String(record.status)]
                    : (['draft', 'confirmed'] as TripStatus[])
                  ).map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Observações" wide>
                <textarea
                  name="notes"
                  defaultValue={value('notes')}
                  rows={3}
                  maxLength={500}
                  placeholder="Ponto de embarque, informações do grupo…"
                />
              </Field>
              <div className="form-note wide">
                <Info size={17} />
                <span>
                  Horários de Brasília. Viagens confirmadas reservam veículo e motorista, com 30
                  minutos de intervalo entre atendimentos.
                </span>
              </div>
            </>
          ) : null}
          {['clients', 'drivers', 'vehicles', 'users'].includes(kind) ? (
            <Field title={kind === 'vehicles' ? 'Identificação do veículo' : 'Nome'} wide>
              <input
                name="name"
                defaultValue={value('name')}
                required
                maxLength={160}
                placeholder={
                  kind === 'vehicles' ? 'Ex.: Ônibus executivo 01' : 'Nome completo ou razão social'
                }
              />
            </Field>
          ) : null}
          {kind === 'clients' || kind === 'drivers' ? (
            <Field title="Telefone de contato">
              <input
                name="contact"
                type="tel"
                defaultValue={value('contact')}
                maxLength={50}
                placeholder="(35) 99999-9999"
              />
            </Field>
          ) : null}
          {kind === 'clients' || kind === 'users' ? (
            <Field title="E-mail" wide={kind === 'users'}>
              <input
                type="email"
                name="email"
                defaultValue={value('email')}
                required={kind === 'users'}
                maxLength={200}
                placeholder="contato@exemplo.com.br"
              />
            </Field>
          ) : null}
          {kind === 'vehicles' ? (
            <>
              <Field title="Placa">
                <input
                  name="plate"
                  defaultValue={value('plate')}
                  required
                  maxLength={7}
                  minLength={7}
                  placeholder="ABC1D23"
                  className="uppercase"
                />
              </Field>
              <Field title="Capacidade de passageiros">
                <input
                  name="capacity"
                  type="number"
                  defaultValue={value('capacity')}
                  min={1}
                  max={100}
                  required
                />
              </Field>
            </>
          ) : null}
          {kind === 'vehicles' || kind === 'drivers' ? (
            <Field title="Disponibilidade" wide>
              <select name="status" defaultValue={value('status', 'active')}>
                <option value="active">Disponível</option>
                <option value={kind === 'vehicles' ? 'maintenance' : 'leave'}>
                  {kind === 'vehicles' ? 'Em manutenção' : 'Afastado'}
                </option>
                <option value="inactive">Inativo</option>
              </select>
            </Field>
          ) : null}
          {kind === 'entries' ? (
            <>
              <Field title="Viagem" wide>
                <select name="tripId" defaultValue={value('tripId')} required>
                  <option value="">Selecione a viagem</option>
                  {data.trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.destination} ·{' '}
                      {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(
                        new Date(t.departure),
                      )}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Tipo">
                <select name="type" defaultValue={value('type', 'income')}>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </Field>
              <Field title="Valor em reais">
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max="99999999.99"
                  step="0.01"
                  defaultValue={record ? Number(record.amount) / 100 : ''}
                  placeholder="0,00"
                  required
                />
              </Field>
              <Field title="Categoria">
                <input
                  name="category"
                  defaultValue={value('category')}
                  list="categories"
                  required
                  maxLength={80}
                  placeholder="Ex.: Fretamento"
                />
                <datalist id="categories">
                  {[
                    'Fretamento',
                    'Combustível',
                    'Pedágio',
                    'Alimentação',
                    'Hospedagem',
                    'Outros',
                  ].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field title="Data">
                <input
                  name="date"
                  type="date"
                  defaultValue={value(
                    'date',
                    new Intl.DateTimeFormat('en-CA', {
                      timeZone: 'America/Sao_Paulo',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    }).format(new Date()),
                  )}
                  required
                />
              </Field>
              <Field title="Situação" wide>
                <select name="status" defaultValue={value('status', 'pending')}>
                  <option value="pending">Pendente / previsto</option>
                  <option value="paid">Realizado / pago</option>
                </select>
              </Field>
              <Field title="Descrição" wide>
                <textarea
                  name="description"
                  defaultValue={value('description')}
                  rows={2}
                  maxLength={500}
                />
              </Field>
            </>
          ) : null}
          {kind === 'users' ? (
            <>
              <Field title="Senha inicial" wide>
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  placeholder="Pelo menos 12 caracteres"
                />
              </Field>
              <Field title="Perfil de acesso" wide>
                <select name="role" defaultValue="operator">
                  <option value="operator">Operador · agenda e cadastros</option>
                  <option value="admin">Gestor · acesso completo</option>
                </select>
              </Field>
              <p className="field-hint wide">
                Compartilhe a senha inicial diretamente com o colaborador. Ele poderá alterá-la em
                Minha conta.
              </p>
            </>
          ) : null}
          {kind === 'password' ? (
            <>
              <Field title="Senha atual" wide>
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field title="Nova senha" wide>
                <input
                  name="newPassword"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                  placeholder="Pelo menos 12 caracteres"
                />
              </Field>
              <p className="field-hint wide">As outras sessões da sua conta serão encerradas.</p>
            </>
          ) : null}
        </fieldset>
        {completed ? (
          <p className="form-note">
            <Info size={17} />
            Viagem concluída. O histórico é preservado.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-footer">
          <button className="button secondary" type="button" disabled={busy} onClick={onClose}>
            {completed ? 'Fechar' : 'Cancelar'}
          </button>
          {!completed ? (
            <button className="button primary" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{' '}
              {busy
                ? 'Salvando…'
                : 'Salvar ' + (kind === 'password' ? 'nova senha' : singular[kind])}
            </button>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}
