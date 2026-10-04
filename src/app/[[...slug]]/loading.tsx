import Image from "next/image";

export default function Loading() {
  return (
    <div className="app-shell" role="status" aria-label="Cargando">
      <header className="app-header">
        <div className="header-inner">
          <div className="app-brand">
            <span className="brand-mark">
              <Image src="/icons/icon-192.png" alt="" width={44} height={44} priority />
            </span>
            <div>
              <p className="brand-name">Casitas</p>
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
              style={{ width: 100, height: 32, marginBottom: 12 }}
            />
          </div>
          <div
            className="skeleton"
              style={{ height: 194, borderRadius: 20, marginBottom: 24 }}
          />
          <div
            className="skeleton"
              style={{ height: 168, borderRadius: 20, marginBottom: 24 }}
          />
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
