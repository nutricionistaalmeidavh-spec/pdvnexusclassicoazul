import type { ReactNode } from "react";

const go = (route: string) => {
  window.location.hash = route;
};

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="classic-blue-menu-group">
      <summary>{label}</summary>
      <div className="classic-blue-menu-popup">{children}</div>
    </details>
  );
}

export function ClassicBlueChrome() {
  return (
    <>
      <div className="classic-blue-titlebar" data-classic-blue="titlebar">
        <span className="classic-blue-app-mark">N</span>
        <strong>PDV Nexus Clássico Azul</strong>
        <span className="classic-blue-title-spacer" />
        <span className="classic-blue-window-button">_</span>
        <span className="classic-blue-window-button">□</span>
        <span className="classic-blue-window-button">×</span>
      </div>
      <nav className="classic-blue-menubar" aria-label="Menu principal">
        <MenuGroup label="Cadastros">
          <button type="button" onClick={() => go("/produtos")}>Produtos</button>
          <button type="button" onClick={() => go("/clientes")}>Clientes</button>
        </MenuGroup>
        <MenuGroup label="Movimentações">
          <button type="button" onClick={() => go("/caixa")}>Venda (PDV)</button>
          <button type="button" onClick={() => go("/financeiro")}>Financeiro / Caixa</button>
        </MenuGroup>
        <MenuGroup label="Relatórios">
          <button type="button" onClick={() => go("/financeiro")}>Vendas e fechamento</button>
        </MenuGroup>
        <MenuGroup label="Utilitários">
          <button type="button" onClick={() => go("/administracao")}>Administração</button>
          <button type="button" onClick={() => go("/balanca")}>Balança</button>
        </MenuGroup>
        <MenuGroup label="Ajuda">
          <button type="button" onClick={() => go("/administracao")}>Sobre o sistema</button>
        </MenuGroup>
      </nav>
      <div className="classic-blue-statusbar" aria-label="Status do sistema">
        <span>Usuário: OPERADOR</span>
        <span>Caixa 001</span>
        <span>PDV Nexus Clássico Azul</span>
        <span>Local</span>
      </div>
    </>
  );
}
