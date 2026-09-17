interface HeaderProps {
  sessionActive?: boolean;
}

export function Header({ sessionActive = false }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <h1>Disagro — Feria de Promociones</h1>
        {sessionActive && (
          <p className="session-indicator" role="status">
            Sesión activa · borrador guardado automáticamente
          </p>
        )}
      </div>
    </header>
  );
}
