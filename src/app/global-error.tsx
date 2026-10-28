"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f6f7f4",
          color: "#263b31",
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 340, padding: 24, display: "grid", gap: 16, justifyItems: "center" }}>
          {/* global-error replaces the root layout; next/image is unavailable here */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={88} height={88} />
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Algo salió mal</h1>
          <p style={{ margin: 0, color: "#68746a", lineHeight: 1.5 }}>Toca Reintentar para volver a cargar la app.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: 48,
              padding: "12px 20px",
              border: "none",
              borderRadius: 14,
              background: "#285542",
              color: "#ffffff",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
