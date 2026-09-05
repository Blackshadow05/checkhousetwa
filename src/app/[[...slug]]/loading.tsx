import { House } from "lucide-react";

export default function Loading() {
  return (
    <div className="app-shell" role="status" aria-label="Cargando revisiones">
      <header className="app-header">
        <div className="header-inner">
          <div className="app-brand">
            <span className="brand-mark">
              <House size={23} />
            </span>
            <div>
              <p className="brand-name">Casitas</p>
              <p className="brand-caption">Cuidamos cada detalle</p>
            </div>
          </div>
        </div>
      </header>
      <main className="app-main" aria-hidden="true">
        <div className="app-screen">
          <div className="welcome-block">
            <div
              className="skeleton"
              style={{ width: 165, height: 12, marginBottom: 14 }}
            />
            <div
              className="skeleton"
              style={{ width: "80%", height: 36, marginBottom: 12 }}
            />
            <div className="skeleton" style={{ width: "90%", height: 16 }} />
          </div>
          <div
            className="skeleton"
            style={{ height: 139, borderRadius: 21, marginBottom: 28 }}
          />
          <div
            className="skeleton"
            style={{ width: 185, height: 24, marginBottom: 16 }}
          />
          <div className="skeleton" style={{ height: 48, marginBottom: 76 }} />
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="skeleton"
              style={{ height: 125, marginBottom: 12, borderRadius: 17 }}
            />
          ))}
        </div>
      </main>
      <div className="bottom-navigation" aria-hidden="true">
        <div className="bottom-navigation-inner">
          {[0, 1, 2].map((item) => (
            <div key={item} className="nav-item">
              <div className="skeleton" style={{ width: 45, height: 32 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
