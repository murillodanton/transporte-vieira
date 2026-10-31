'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="access-page">
      <div className="access-card">
        <h1>Não foi possível carregar a operação.</h1>
        <p>Tente novamente. Se o problema continuar, confira o terminal do aplicativo.</p>
        <button className="button primary" onClick={reset}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
