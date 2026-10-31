'use client';
import { useState, type FormEvent } from 'react';
import { BusFront, ArrowRight, ShieldCheck, Route, CalendarDays, Wallet } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export function Access({ setup }: { setup: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    try {
      if (setup) {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.get('name'), email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error('Não foi possível entrar. Confira seu e-mail e sua senha.');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível conectar. Tente novamente.');
      setBusy(false);
    }
  }
  return (
    <main className="access-page">
      <section className="access-story">
        <div className="brand">
          <span className="brand-mark">
            <BusFront size={25} />
          </span>
          <div>
            vieira<span>VIAGENS & TRANSPORTE</span>
          </div>
        </div>
        <div className="access-message">
          <span className="eyebrow light">TRANSPORTE VIEIRA · PARAISÓPOLIS, MG</span>
          <h1>
            Mais organização.
            <br />
            Melhores viagens.
          </h1>
          <p>Do primeiro agendamento ao último desembarque, sua operação em um só lugar.</p>
          <div className="access-features">
            <span>
              <CalendarDays size={19} /> Agenda integrada
            </span>
            <span>
              <Route size={19} /> Frota organizada
            </span>
            <span>
              <Wallet size={19} /> Controle financeiro
            </span>
          </div>
        </div>
        <div className="access-footer">
          Gestão de viagens · Projeto de extensão em Engenharia de Software
        </div>
      </section>
      <section className="access-form-side">
        <div className="access-card">
          <span className="eyebrow">{setup ? 'VAMOS COMEÇAR' : 'BEM-VINDO DE VOLTA'}</span>
          <h2>{setup ? 'Prepare sua operação' : 'Acesse sua conta'}</h2>
          <p>
            {setup
              ? 'Crie a conta do primeiro gestor. Depois, você poderá convidar os colaboradores pelo aplicativo.'
              : 'Entre para acompanhar as viagens e organizar o dia a dia da empresa.'}
          </p>
          <form onSubmit={submit}>
            {setup ? (
              <label>
                Seu nome
                <input
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="Como você quer ser chamado?"
                  maxLength={160}
                />
              </label>
            ) : null}
            <label>
              E-mail
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                placeholder="voce@empresa.com.br"
                maxLength={200}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                name="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                minLength={setup ? 12 : 1}
                maxLength={128}
                required
                placeholder={setup ? 'Pelo menos 12 caracteres' : 'Digite sua senha'}
              />
            </label>
            {setup ? (
              <span className="field-hint">
                Use uma senha exclusiva, com pelo menos 12 caracteres.
              </span>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button primary full" disabled={busy}>
              {busy ? 'Aguarde…' : setup ? 'Criar conta e começar' : 'Entrar na operação'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="access-security">
            <ShieldCheck size={17} />
            <span>Acesso exclusivo à equipe da Transporte Vieira</span>
          </div>
        </div>
      </section>
    </main>
  );
}
