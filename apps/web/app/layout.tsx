import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Vieira Viagens | Gestão de viagens',
  description: 'Agenda, frota e gestão de viagens da Transporte Vieira.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
