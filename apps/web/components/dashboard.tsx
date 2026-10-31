'use client';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  BusFront,
  LayoutDashboard,
  CalendarDays,
  UsersRound,
  ContactRound,
  Wallet,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  ArrowDownLeft,
  MapPin,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Menu,
  X,
  Eye,
  Pencil,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Route,
  FlaskConical,
  Info,
  Mail,
  Phone,
  Building2,
  UserRound,
  LockKeyhole,
} from 'lucide-react';
import {
  type Snapshot,
  type User,
  type Trip,
  type TripStatus,
  statusLabels,
  money,
  dateTime,
  dayKey,
  csv,
} from '@vieira/core';
import { authClient } from '@/lib/auth-client';
import { Editor, type EditorState, type EditorKind } from './editor';

type View =
  'overview' | 'trips' | 'clients' | 'vehicles' | 'drivers' | 'finance' | 'users' | 'settings';
const titles: Record<View, string> = {
  overview: 'Visão geral',
  trips: 'Agenda de viagens',
  clients: 'Clientes',
  vehicles: 'Frota',
  drivers: 'Motoristas',
  finance: 'Financeiro',
  users: 'Equipe e acessos',
  settings: 'Minha conta',
};
const subtitles: Record<View, string> = {
  overview: 'Tudo pronto para seguir viagem.',
  trips: 'Planeje cada saída. Acompanhe cada chegada.',
  clients: 'Quem confia suas viagens à Transporte Vieira.',
  vehicles: 'Disponibilidade e informações dos seus veículos.',
  drivers: 'A equipe que faz cada viagem acontecer.',
  finance: 'Receitas, despesas e o saldo de cada viagem.',
  users: 'Organize os acessos da sua equipe.',
  settings: 'Seus dados e as informações da empresa.',
};
const nav = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'trips', icon: CalendarDays },
  { id: 'clients', icon: UsersRound },
  { id: 'vehicles', icon: BusFront },
  { id: 'drivers', icon: ContactRound },
  { id: 'finance', icon: Wallet },
] as const;
function Badge({ status }: { status: TripStatus }) {
  return (
    <span className={'badge ' + status}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Route size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = 'orange',
}: {
  label: string;
  value: string | number;
  note: string;
  icon: typeof BusFront;
  tone?: string;
}) {
  return (
    <article className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={'metric-icon ' + tone}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Calendar({ trips, onDay }: { trips: Trip[]; onDay: (day: string) => void }) {
  const today = dayKey(new Date().toISOString());
  const [year, month] = today.split('-').map(Number);
  const [offset, setOffset] = useState(0);
  const current = new Date(Date.UTC(year, month - 1 + offset, 1));
  const y = current.getUTCFullYear(),
    m = current.getUTCMonth();
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(current);
  const first = current.getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const booked = new Set(
    trips.filter((t) => t.status !== 'cancelled').map((t) => dayKey(t.departure)),
  );
  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <h2>Sua agenda</h2>
        <CalendarDays size={17} />
      </div>
      <div className="calendar-month">
        <strong>{label}</strong>
        <div>
          <button
            onClick={() => setOffset((n) => n - 1)}
            className="icon-button"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            onClick={() => setOffset((n) => n + 1)}
            className="icon-button"
            aria-label="Próximo mês"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x, i) => (
          <span className="week-day" key={i}>
            {x}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={'empty' + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          return (
            <button
              key={key}
              className={(key === today ? 'today ' : '') + (booked.has(key) ? 'has-trip' : '')}
              onClick={() => onDay(key)}
              aria-label={`Ver viagens em ${i + 1} de ${label}`}
            >
              {i + 1}
              {booked.has(key) ? <i /> : null}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span /> Dias com viagens programadas
      </div>
    </section>
  );
}
function Confirmation({
  text,
  onCancel,
  onConfirm,
  busy,
}: {
  text: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="confirm-title"
    >
      <div className="confirm-icon">
        <Trash2 size={23} />
      </div>
      <h2 id="confirm-title">Excluir este registro?</h2>
      <p>{text}</p>
      <div className="dialog-footer">
        <button className="button secondary" onClick={onCancel} disabled={busy}>
          Manter registro
        </button>
        <button className="button danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Excluindo…' : 'Excluir registro'}
        </button>
      </div>
    </dialog>
  );
}
function exportRows(rows: unknown[][], name: string) {
  const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Dashboard({ user, initial }: { user: User; initial: Snapshot }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>('overview');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: string; id: string; name: string } | null>(null);
  const admin = user.role === 'admin';
  const today = dayKey(new Date().toISOString());
  const month = today.slice(0, 7);
  const needle = search.trim().toLocaleLowerCase('pt-BR');
  const matches = (...parts: unknown[]) =>
    parts.join(' ').toLocaleLowerCase('pt-BR').includes(needle);
  const navigate = (next: View) => {
    setView(next);
    setSearch('');
    setStatus('all');
    setFrom('');
    setTo('');
    setMobile(false);
  };
  function notify(text: string, error = false) {
    setNotice(text);
    setNoticeError(error);
  }
  async function refresh() {
    const response = await fetch('/api/snapshot', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
  }
  async function saved() {
    await refresh();
    notify('Alterações salvas com sucesso.');
  }
  const edit = (kind: EditorKind, record?: object) => {
    setEditor({ kind, record: record as Record<string, unknown> | undefined });
    setNotice('');
  };
  async function demo() {
    setWorking(true);
    try {
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      notify('Demonstração carregada. Todos os registros de exemplo são fictícios.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Falha ao carregar.', true);
    } finally {
      setWorking(false);
    }
  }
  async function remove() {
    if (!confirm) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/${confirm.kind}/${confirm.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      notify('Registro excluído.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível excluir.', true);
    } finally {
      setConfirm(null);
      setWorking(false);
    }
  }
  async function logout() {
    setWorking(true);
    try {
      const res = await authClient.signOut();
      if (res.error) throw new Error();
      window.location.reload();
    } catch {
      notify('Não foi possível sair. Tente novamente.', true);
      setWorking(false);
    }
  }
  const trips = data.trips.filter(
    (t) =>
      matches(t.destination, t.origin, t.clientName, t.driverName, t.plate) &&
      (status === 'all' || t.status === status) &&
      (!from || dayKey(t.departure) >= from) &&
      (!to || dayKey(t.departure) <= to),
  );
  const upcoming = data.trips
    .filter(
      (t) =>
        t.arrival > new Date().toISOString() &&
        t.status !== 'cancelled' &&
        t.status !== 'completed',
    )
    .sort((a, b) => a.departure.localeCompare(b.departure));
  const monthTrips = data.trips.filter(
    (t) => dayKey(t.departure).startsWith(month) && t.status !== 'cancelled',
  );
  const monthEntries = data.entries.filter((e) => e.date.startsWith(month));
  const received = monthEntries
    .filter((e) => e.type === 'income' && e.status === 'paid')
    .reduce((s, e) => s + e.amount, 0);
  const spent = monthEntries
    .filter((e) => e.type === 'expense' && e.status === 'paid')
    .reduce((s, e) => s + e.amount, 0);
  const filteredEntries = data.entries.filter(
    (e) =>
      matches(e.destination, e.description, e.category) &&
      (status === 'all' || e.status === status) &&
      (!from || e.date >= from) &&
      (!to || e.date <= to),
  );
  const sumEntries = (type: string, paid: boolean) =>
    filteredEntries
      .filter((e) => e.type === type && (!paid || e.status === 'paid'))
      .reduce((s, e) => s + e.amount, 0);
  const isResource = view === 'clients' || view === 'vehicles' || view === 'drivers';
  const primary = () =>
    edit(
      view === 'finance'
        ? 'entries'
        : isResource
          ? (view as EditorKind)
          : view === 'users'
            ? 'users'
            : 'trips',
    );
  const primaryLabel =
    view === 'finance'
      ? 'Novo lançamento'
      : view === 'clients'
        ? 'Novo cliente'
        : view === 'vehicles'
          ? 'Novo veículo'
          : view === 'drivers'
            ? 'Novo motorista'
            : view === 'users'
              ? 'Adicionar pessoa'
              : 'Nova viagem';
  function tripExport() {
    exportRows(
      [
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
        ...trips.map((t) => [
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
      ],
      'vieira-viagens.csv',
    );
  }

  return (
    <div className="app-shell">
      {mobile ? (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobile(false)}
          aria-label="Fechar navegação"
        />
      ) : null}
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <a className="brand" href="/" aria-label="Vieira Viagens, início">
          <span className="brand-mark">
            <BusFront size={25} />
          </span>
          <div>
            vieira<span>VIAGENS & TRANSPORTE</span>
          </div>
        </a>
        <div className="workspace-label">
          <span className="company-avatar">TV</span>
          <div>
            Transporte Vieira<small>Paraisópolis, Minas Gerais</small>
          </div>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-label">OPERAÇÃO</div>
        <nav aria-label="Navegação principal">
          {nav
            .filter((n) => admin || n.id !== 'finance')
            .map((n) => (
              <button
                key={n.id}
                className={'nav-item ' + (view === n.id ? 'active' : '')}
                onClick={() => navigate(n.id)}
                aria-current={view === n.id ? 'page' : undefined}
              >
                <n.icon size={19} />
                {titles[n.id]}
                {n.id === 'trips' && upcoming.length ? (
                  <span className="nav-count">{upcoming.length}</span>
                ) : null}
              </button>
            ))}
        </nav>
        <div className="nav-label management-label">GERENCIAMENTO</div>
        <nav aria-label="Gerenciamento">
          {admin ? (
            <button
              className={'nav-item ' + (view === 'users' ? 'active' : '')}
              onClick={() => navigate('users')}
              aria-current={view === 'users' ? 'page' : undefined}
            >
              <ShieldCheck size={19} />
              Equipe e acessos
            </button>
          ) : null}
          <button
            className={'nav-item ' + (view === 'settings' ? 'active' : '')}
            onClick={() => navigate('settings')}
            aria-current={view === 'settings' ? 'page' : undefined}
          >
            <Settings size={19} />
            Minha conta
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-tag">
            <span />
            Sua operação em um só lugar
          </div>
          <button className="profile-button" onClick={() => navigate('settings')}>
            <span className="avatar">
              {user.name
                .split(' ')
                .map((s) => s[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span className="profile-text">
              <strong>{user.name}</strong>
              <small>{admin ? 'Gestor' : 'Operador'}</small>
            </span>
            <Settings size={16} />
          </button>
          <button className="logout-button" onClick={logout} disabled={working}>
            <LogOut size={16} />
            Sair da conta
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Abrir navegação"
            >
              <Menu size={22} />
            </button>
            <span>Minha operação</span>
            <span className="slash">/</span>
            <strong>{titles[view]}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" />
            Transporte Vieira
            <span className="topbar-divider" />
            <span className="top-avatar">{user.name[0]}</span>
          </div>
        </header>
        <main className="main-content" id="main-content">
          {data.demo ? (
            <div className="demo-banner">
              <FlaskConical size={15} />
              <span>
                Ambiente de demonstração <b>·</b> Os registros de exemplo são fictícios.
              </span>
            </div>
          ) : null}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {view === 'overview' ? 'PAINEL DA OPERAÇÃO' : 'TRANSPORTE VIEIRA'}
              </span>
              <h1>
                {titles[view]}
                <span className="heading-dot">.</span>
              </h1>
              <p>{subtitles[view]}</p>
            </div>
            {view !== 'settings' ? (
              <button className="button primary" onClick={primary}>
                <Plus size={18} />
                {primaryLabel}
              </button>
            ) : null}
          </div>
          {notice ? (
            <div
              className={'notice ' + (noticeError ? 'error' : '')}
              role={noticeError ? 'alert' : 'status'}
            >
              <span>{noticeError ? <Info size={18} /> : <CheckCircle2 size={18} />}</span>
              <p>{notice}</p>
              <button
                className="icon-button"
                aria-label="Dispensar aviso"
                onClick={() => setNotice('')}
              >
                <X size={17} />
              </button>
            </div>
          ) : null}

          {view === 'overview' ? (
            <>
              <div className="section-caption">
                <h2>Seu mês em movimento</h2>
                <span className="period-tag">
                  <CalendarDays size={14} />
                  {new Intl.DateTimeFormat('pt-BR', {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date())}
                </span>
              </div>
              <div className={'metrics ' + (!admin ? 'three' : '')}>
                <Metric
                  label="Viagens no mês"
                  value={monthTrips.length.toString().padStart(2, '0')}
                  note={`${monthTrips.filter((t) => t.status === 'completed').length} concluídas no período`}
                  icon={Route}
                />
                <Metric
                  label="Veículos disponíveis"
                  value={data.vehicles
                    .filter((v) => v.status === 'active')
                    .length.toString()
                    .padStart(2, '0')}
                  note={`${data.vehicles.length} veículos na frota`}
                  icon={BusFront}
                  tone="blue"
                />
                <Metric
                  label="Motoristas disponíveis"
                  value={data.drivers
                    .filter((d) => d.status === 'active')
                    .length.toString()
                    .padStart(2, '0')}
                  note={`${data.drivers.length} motoristas cadastrados`}
                  icon={ContactRound}
                  tone="green"
                />
                {admin ? (
                  <Metric
                    label="Saldo realizado"
                    value={money(received - spent)}
                    note="Recebimentos menos despesas no mês"
                    icon={Wallet}
                    tone="purple"
                  />
                ) : null}
              </div>
              <div className="dashboard-grid">
                <div className="dashboard-main">
                  <section className="journey-banner">
                    <div>
                      <span className="eyebrow light">CADA DETALHE CONTA</span>
                      <h2>
                        O próximo destino
                        <br />
                        começa com um bom plano.
                      </h2>
                      <p>
                        Organize horários, conecte sua equipe
                        <br className="desktop-break" /> e acompanhe tudo por aqui.
                      </p>
                      <button onClick={() => edit('trips')} className="button banner-button">
                        Planejar uma viagem
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="route-art" aria-hidden="true">
                      <div className="art-circle circle-one" />
                      <div className="art-circle circle-two" />
                      <div className="route-dashes" />
                      <span className="art-pin first">
                        <MapPin size={25} />
                      </span>
                      <span className="art-bus">
                        <BusFront size={39} strokeWidth={1.6} />
                      </span>
                      <span className="art-pin last">
                        <MapPin size={25} />
                      </span>
                      <span className="art-origin">PARAISÓPOLIS</span>
                      <span className="art-destination">PRÓXIMO DESTINO</span>
                    </div>
                  </section>
                  <section className="panel upcoming-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Próximas saídas <span className="count-pill">{upcoming.length}</span>
                        </h2>
                        <p>O que vem pela frente na sua agenda</p>
                      </div>
                      <button className="text-button" onClick={() => navigate('trips')}>
                        Ver agenda
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    {upcoming.length ? (
                      <div className="upcoming-list">
                        {upcoming.slice(0, 4).map((t) => (
                          <button
                            key={t.id}
                            className="upcoming-item"
                            onClick={() => edit('trips', t)}
                          >
                            <div className="trip-date">
                              <strong>{dayKey(t.departure).slice(8)}</strong>
                              <span>
                                {new Intl.DateTimeFormat('pt-BR', {
                                  month: 'short',
                                  timeZone: 'America/Sao_Paulo',
                                })
                                  .format(new Date(t.departure))
                                  .replace('.', '')}
                              </span>
                            </div>
                            <div className="upcoming-info">
                              <h3>{t.destination}</h3>
                              <p>{t.clientName}</p>
                              <div>
                                <span>
                                  <Clock3 size={12} />
                                  {new Intl.DateTimeFormat('pt-BR', {
                                    timeZone: 'America/Sao_Paulo',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }).format(new Date(t.departure))}
                                </span>
                                <span>
                                  <BusFront size={13} />
                                  {t.plate}
                                </span>
                                <span>
                                  <UsersRound size={13} />
                                  {t.passengers} passageiros
                                </span>
                              </div>
                            </div>
                            <div className="upcoming-end">
                              <Badge status={t.status} />
                              <ChevronRight size={18} />
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="Sua próxima viagem começa aqui"
                        description="Cadastre clientes, veículos e motoristas para organizar a primeira saída."
                      >
                        <button className="button secondary" onClick={() => navigate('clients')}>
                          Começar pelos cadastros
                          <ArrowRight size={16} />
                        </button>
                      </Empty>
                    )}
                  </section>
                </div>
                <div className="dashboard-side">
                  <Calendar
                    trips={data.trips}
                    onDay={(day) => {
                      navigate('trips');
                      setFrom(day);
                      setTo(day);
                    }}
                  />
                  <section className="panel quick-panel">
                    <div className="panel-heading">
                      <h2>Acesso rápido</h2>
                    </div>
                    <button onClick={() => edit('clients')}>
                      <span className="quick-icon">
                        <UsersRound size={18} />
                      </span>
                      <span>
                        Cadastrar cliente<small>Prepare o próximo atendimento</small>
                      </span>
                      <Plus size={16} />
                    </button>
                    <button onClick={() => navigate('vehicles')}>
                      <span className="quick-icon">
                        <BusFront size={18} />
                      </span>
                      <span>
                        Consultar frota<small>Disponibilidade dos veículos</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                    {admin ? (
                      <button onClick={() => edit('entries')}>
                        <span className="quick-icon">
                          <Wallet size={18} />
                        </span>
                        <span>
                          Registrar lançamento<small>Mantenha as contas em dia</small>
                        </span>
                        <Plus size={16} />
                      </button>
                    ) : null}
                  </section>
                  {!data.clients.length && admin ? (
                    <section className="demo-card">
                      <FlaskConical size={23} />
                      <h3>Conheça o aplicativo</h3>
                      <p>
                        Explore uma operação de exemplo com viagens, equipe e lançamentos fictícios.
                      </p>
                      <button className="text-button" onClick={demo} disabled={working}>
                        {working ? 'Carregando…' : 'Carregar demonstração'}
                        <ArrowRight size={15} />
                      </button>
                    </section>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {view === 'trips' ? (
            <section className="panel data-panel">
              <div className="table-toolbar">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    placeholder="Buscar destino, cliente ou motorista…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Buscar viagens"
                  />
                </label>
                <button className="button secondary small" onClick={tripExport}>
                  <Download size={16} />
                  Exportar CSV
                </button>
              </div>
              <div className="filter-row">
                <label>
                  Situação
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="all">Todas as situações</option>
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Saída a partir de
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label>
                  Saída até
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    setStatus('all');
                    setFrom('');
                    setTo('');
                    setSearch('');
                  }}
                >
                  Limpar filtros
                </button>
                <span>
                  {trips.length} {trips.length === 1 ? 'viagem' : 'viagens'}
                </span>
              </div>
              {trips.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>VIAGEM / CLIENTE</th>
                        <th>SAÍDA E RETORNO</th>
                        <th>VEÍCULO / MOTORISTA</th>
                        <th>PASSAGEIROS</th>
                        <th>SITUAÇÃO</th>
                        <th>
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {trips.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.destination}</strong>
                            <small>{t.clientName}</small>
                            <small className="origin">
                              <MapPin size={11} />
                              {t.origin}
                            </small>
                          </td>
                          <td>
                            <span>{dateTime(t.departure)}</span>
                            <small>até {dateTime(t.arrival)}</small>
                          </td>
                          <td>
                            <strong className="regular">
                              {t.vehicleName} <span className="plate">{t.plate}</span>
                            </strong>
                            <small>{t.driverName}</small>
                          </td>
                          <td>
                            <span className="passenger-number">
                              <UsersRound size={14} />
                              {t.passengers}
                            </span>
                          </td>
                          <td>
                            <Badge status={t.status} />
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={'Abrir viagem para ' + t.destination}
                              onClick={() => edit('trips', t)}
                            >
                              <Eye size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title={
                    data.trips.length
                      ? 'Nenhuma viagem encontrada'
                      : 'Vamos planejar a primeira viagem?'
                  }
                  description={
                    data.trips.length
                      ? 'Altere os filtros ou faça uma nova busca.'
                      : 'Preencha os cadastros e adicione uma viagem à agenda.'
                  }
                >
                  <button className="button secondary" onClick={() => edit('trips')}>
                    <Plus size={16} />
                    Nova viagem
                  </button>
                </Empty>
              )}
            </section>
          ) : null}

          {isResource ? (
            <section className="panel data-panel">
              <div className="table-toolbar">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    placeholder={
                      'Buscar ' +
                      (view === 'clients'
                        ? 'cliente'
                        : view === 'vehicles'
                          ? 'veículo ou placa'
                          : 'motorista') +
                      '…'
                    }
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label={'Buscar ' + titles[view]}
                  />
                </label>
                <span className="records-count">
                  {data[view as 'clients' | 'vehicles' | 'drivers'].length} registros
                </span>
              </div>
              {data[view as 'clients' | 'vehicles' | 'drivers'].filter((r) =>
                matches(...Object.values(r)),
              ).length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{view === 'vehicles' ? 'VEÍCULO' : 'NOME'}</th>
                        <th>{view === 'vehicles' ? 'PLACA' : 'CONTATO'}</th>
                        <th>
                          {view === 'vehicles'
                            ? 'CAPACIDADE'
                            : view === 'clients'
                              ? 'E-MAIL'
                              : 'DISPONIBILIDADE'}
                        </th>
                        {view === 'vehicles' ? <th>DISPONIBILIDADE</th> : null}
                        <th>AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data[view as 'clients' | 'vehicles' | 'drivers']
                        .filter((r) => matches(...Object.values(r)))
                        .map((r) => (
                          <tr key={r.id}>
                            <td>
                              <div className="entity-name">
                                <span className="entity-icon">
                                  {view === 'vehicles' ? (
                                    <BusFront size={18} />
                                  ) : (
                                    <UserRound size={18} />
                                  )}
                                </span>
                                <strong>{r.name}</strong>
                              </div>
                            </td>
                            <td>
                              {'plate' in r ? (
                                <span className="plate">{r.plate}</span>
                              ) : (
                                r.contact || 'Não informado'
                              )}
                            </td>
                            <td>
                              {'capacity' in r ? (
                                `${r.capacity} passageiros`
                              ) : 'email' in r ? (
                                r.email || 'Não informado'
                              ) : (
                                <span className={'availability ' + r.status}>
                                  {r.status === 'active'
                                    ? 'Disponível'
                                    : r.status === 'leave'
                                      ? 'Afastado'
                                      : 'Inativo'}
                                </span>
                              )}
                            </td>
                            {'capacity' in r ? (
                              <td>
                                <span className={'availability ' + r.status}>
                                  {r.status === 'active'
                                    ? 'Disponível'
                                    : r.status === 'maintenance'
                                      ? 'Em manutenção'
                                      : 'Inativo'}
                                </span>
                              </td>
                            ) : null}
                            <td>
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  onClick={() => edit(view as EditorKind, r)}
                                  aria-label={'Editar ' + r.name}
                                >
                                  <Pencil size={16} />
                                </button>
                                {admin ? (
                                  <button
                                    className="icon-button delete"
                                    onClick={() =>
                                      setConfirm({ kind: view, id: r.id, name: r.name })
                                    }
                                    aria-label={'Excluir ' + r.name}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title={search ? 'Nenhum registro encontrado' : 'Ainda não há registros por aqui'}
                  description={
                    search
                      ? 'Tente buscar por outro nome.'
                      : 'Cadastre as informações para começar a organizar suas viagens.'
                  }
                >
                  <button className="button secondary" onClick={primary}>
                    <Plus size={16} />
                    {primaryLabel}
                  </button>
                </Empty>
              )}
            </section>
          ) : null}

          {view === 'finance' && admin ? (
            <>
              <div className="metrics finance-metrics">
                <Metric
                  label="Receitas registradas"
                  value={money(sumEntries('income', false))}
                  note="Previstas e realizadas nos filtros"
                  icon={ArrowDownLeft}
                  tone="green"
                />
                <Metric
                  label="Despesas registradas"
                  value={money(sumEntries('expense', false))}
                  note="Previstas e realizadas nos filtros"
                  icon={ArrowUpRight}
                />
                <Metric
                  label="Saldo realizado"
                  value={money(sumEntries('income', true) - sumEntries('expense', true))}
                  note="Somente recebimentos e despesas pagos"
                  icon={Wallet}
                  tone="blue"
                />
              </div>
              <section className="panel data-panel">
                <div className="table-toolbar">
                  <label className="search-input">
                    <Search size={17} />
                    <input
                      placeholder="Buscar viagem, categoria ou descrição…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Buscar lançamentos"
                    />
                  </label>
                  <button
                    className="button secondary small"
                    onClick={() =>
                      exportRows(
                        [
                          ['Destino', 'Tipo', 'Categoria', 'Valor em reais', 'Data', 'Situação'],
                          ...filteredEntries.map((e) => [
                            e.destination,
                            e.type === 'income' ? 'Receita' : 'Despesa',
                            e.category,
                            (e.amount / 100).toFixed(2).replace('.', ','),
                            e.date,
                            e.status === 'paid' ? 'Realizado' : 'Pendente',
                          ]),
                        ],
                        'vieira-financeiro.csv',
                      )
                    }
                  >
                    <Download size={16} />
                    Exportar CSV
                  </button>
                </div>
                <div className="filter-row">
                  <label>
                    Situação
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="all">Todas</option>
                      <option value="pending">Pendente / previsto</option>
                      <option value="paid">Realizado / pago</option>
                    </select>
                  </label>
                  <label>
                    A partir de
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </label>
                  <label>
                    Até
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setStatus('all');
                      setFrom('');
                      setTo('');
                      setSearch('');
                    }}
                  >
                    Limpar filtros
                  </button>
                  <span>{filteredEntries.length} lançamentos</span>
                </div>
                {filteredEntries.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>LANÇAMENTO</th>
                          <th>VIAGEM</th>
                          <th>DATA</th>
                          <th>VALOR</th>
                          <th>SITUAÇÃO</th>
                          <th>AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEntries.map((e) => (
                          <tr key={e.id}>
                            <td>
                              <div className="entity-name">
                                <span className={'entry-icon ' + e.type}>
                                  {e.type === 'income' ? (
                                    <ArrowDownLeft size={18} />
                                  ) : (
                                    <ArrowUpRight size={18} />
                                  )}
                                </span>
                                <div>
                                  <strong>{e.category}</strong>
                                  <small>
                                    {e.description || (e.type === 'income' ? 'Receita' : 'Despesa')}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>{e.destination}</td>
                            <td>{e.date.split('-').reverse().join('/')}</td>
                            <td className={'amount ' + e.type}>
                              {e.type === 'expense' ? '− ' : '+ '}
                              {money(e.amount)}
                            </td>
                            <td>
                              <span
                                className={
                                  'availability ' + (e.status === 'paid' ? 'active' : 'pending')
                                }
                              >
                                {e.status === 'paid' ? 'Realizado' : 'Pendente'}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  onClick={() => edit('entries', e)}
                                  aria-label={'Editar lançamento ' + e.category}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="icon-button delete"
                                  onClick={() =>
                                    setConfirm({
                                      kind: 'entries',
                                      id: e.id,
                                      name: e.category + ' · ' + money(e.amount),
                                    })
                                  }
                                  aria-label={'Excluir lançamento ' + e.category}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Nenhum lançamento neste período"
                    description="Adicione uma receita ou despesa vinculada a uma viagem."
                  >
                    <button className="button secondary" onClick={() => edit('entries')}>
                      <Plus size={16} />
                      Novo lançamento
                    </button>
                  </Empty>
                )}
              </section>
              <p className="footnote">
                <Info size={14} />O saldo considera apenas os valores registrados. Ele não
                representa o lucro contábil da empresa.
              </p>
            </>
          ) : null}

          {view === 'users' && admin ? (
            <section className="panel data-panel">
              <div className="panel-heading">
                <h2>Pessoas da operação</h2>
                <span className="count-pill">{data.users.length}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>PESSOA</th>
                      <th>E-MAIL</th>
                      <th>PERFIL DE ACESSO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="entity-name">
                            <span className="entity-icon">
                              <UserRound size={18} />
                            </span>
                            <strong>
                              {u.name}
                              {u.id === user.id ? <span className="you-tag">Você</span> : null}
                            </strong>
                          </div>
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <span
                            className={
                              'availability ' + (u.role === 'admin' ? 'active' : 'operator')
                            }
                          >
                            {u.role === 'admin' ? 'Gestor' : 'Operador'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="permission-note">
                <ShieldCheck size={19} />
                <p>
                  <strong>O acesso acompanha a responsabilidade.</strong> Gestores acessam toda a
                  operação e o financeiro. Operadores gerenciam viagens e cadastros.
                </p>
              </div>
            </section>
          ) : null}

          {view === 'settings' ? (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="panel-heading">
                  <h2>Seu perfil</h2>
                  <UserRound size={18} />
                </div>
                <dl>
                  <div>
                    <dt>Nome</dt>
                    <dd>{user.name}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{user.email}</dd>
                  </div>
                  <div>
                    <dt>Perfil</dt>
                    <dd>{admin ? 'Gestor' : 'Operador'}</dd>
                  </div>
                </dl>
                <button className="button secondary" onClick={() => edit('password')}>
                  <LockKeyhole size={16} />
                  Alterar senha
                </button>
              </section>
              <section className="panel settings-panel">
                <div className="panel-heading">
                  <h2>Transporte Vieira</h2>
                  <Building2 size={18} />
                </div>
                <dl>
                  <div>
                    <dt>Razão social</dt>
                    <dd>Joao de Fatima Moura Vieira LTDA</dd>
                  </div>
                  <div>
                    <dt>CNPJ</dt>
                    <dd>02.284.385/0001-91</dd>
                  </div>
                  <div>
                    <dt>Endereço</dt>
                    <dd>
                      Rua Geraldo Vitorio, 11 · Paraisópolis, MG
                      <br />
                      CEP 37.660-000
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Phone size={14} />
                      Telefone
                    </dt>
                    <dd>(31) 9927-2321</dd>
                  </div>
                  <div>
                    <dt>
                      <Mail size={14} />
                      E-mail
                    </dt>
                    <dd>transportevieira@yahoo.com.br</dd>
                  </div>
                </dl>
              </section>
              {admin ? (
                <section className="panel audit-panel">
                  <div className="panel-heading">
                    <h2>Últimas atividades</h2>
                    <Clock3 size={18} />
                  </div>
                  {data.audit.length ? (
                    <ol className="audit-list">
                      {data.audit.map((a) => (
                        <li key={a.id}>
                          <span className="audit-dot" />
                          <div>
                            <strong>{a.action}</strong>
                            <p>
                              {a.actor} · {dateTime(a.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted">As ações da equipe aparecerão aqui.</p>
                  )}
                </section>
              ) : null}
            </div>
          ) : null}
          <footer className="main-footer">
            <span>
              Transporte Vieira <b>·</b> Gestão de viagens
            </span>
            <span>
              Feito para seguir em frente
              <ArrowUpRight size={13} />
            </span>
          </footer>
        </main>
      </div>
      {editor ? (
        <Editor
          key={editor.kind + String(editor.record?.id ?? 'new')}
          editor={editor}
          data={data}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      {confirm ? (
        <Confirmation
          text={`${confirm.name}. A exclusão será bloqueada se houver histórico de viagens associado.`}
          busy={working}
          onCancel={() => setConfirm(null)}
          onConfirm={remove}
        />
      ) : null}
    </div>
  );
}
