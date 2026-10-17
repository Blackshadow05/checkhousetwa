"use client";

import { useId, useState } from "react";
import styles from "./revisiones-screen.module.css";

const VINETAS_VISIBLES = 3;
const MAX_VINETAS_SIN_PLEGAR = 4;
const MAX_CARACTERES_SIN_PLEGAR = 500;

type Bloque = { tipo: "p"; texto: string } | { tipo: "ul"; items: string[] };

// Limpieza defensiva: el servidor ya entrega texto plano, pero nunca debe verse markdown crudo.
function lineas(texto: string) {
  return texto.split(/\r?\n/)
    .map((linea) => linea.replace(/\*\*|__|`+/g, "").replace(/^\s*#{1,6}\s*/, "").replace(/^\s*[-*]\s+/, "• ").trim())
    .filter(Boolean);
}

function bloques(items: string[]) {
  const salida: Bloque[] = [];
  for (const linea of items) {
    const ultimo = salida[salida.length - 1];
    if (!linea.startsWith("• ")) salida.push({ tipo: "p", texto: linea });
    else if (ultimo?.tipo === "ul") ultimo.items.push(linea.slice(2).trim());
    else salida.push({ tipo: "ul", items: [linea.slice(2).trim()] });
  }
  return salida;
}

// El padre la monta con key={texto}, así el estado de "Ver más" se reinicia al cambiar la respuesta.
export function RespuestaBusqueda({ texto }: { texto: string }) {
  const [abierta, setAbierta] = useState(false);
  const id = useId();
  const todas = lineas(texto);
  const vinetas = todas.filter((linea) => linea.startsWith("• ")).length;
  const plegable = vinetas > VINETAS_VISIBLES && (vinetas > MAX_VINETAS_SIN_PLEGAR || texto.length > MAX_CARACTERES_SIN_PLEGAR);
  // Plegada: todo hasta la tercera viñeta (el resumen y las primeras); lo demás, incluido "y N más.", al expandir.
  let visibles = todas;
  if (plegable && !abierta) {
    let vistas = 0;
    const corte = todas.findIndex((linea) => linea.startsWith("• ") && ++vistas > VINETAS_VISIBLES);
    visibles = corte === -1 ? todas : todas.slice(0, corte);
  }
  const ocultas = vinetas - VINETAS_VISIBLES;

  return (
    <>
      <div id={id} className={styles.answerText}>
        {bloques(visibles).map((bloque, index) => bloque.tipo === "p"
          ? <p key={index}>{bloque.texto}</p>
          : (
            <ul key={index} className={styles.answerList}>
              {bloque.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ul>
          ))}
      </div>
      {plegable && (
        <button type="button" className="text-action" aria-expanded={abierta} aria-controls={id} onClick={() => setAbierta((valor) => !valor)}>
          {abierta ? "Ver menos" : `Ver más (${ocultas})`}
        </button>
      )}
    </>
  );
}
