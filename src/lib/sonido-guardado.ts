type WindowConAudio = Window & { webkitAudioContext?: typeof AudioContext };

let contexto: AudioContext | null = null;

export function prepararSonidoGuardado() {
  try {
    const Contexto = window.AudioContext ?? (window as WindowConAudio).webkitAudioContext;
    if (!Contexto) return;
    contexto ??= new Contexto();
    if (contexto.state === "suspended") void contexto.resume().catch(() => {});
  } catch {
    contexto = null;
  }
}

function nota(audio: AudioContext, frecuencia: number, inicio: number, duracion: number) {
  const oscilador = audio.createOscillator();
  const volumen = audio.createGain();
  oscilador.type = "sine";
  oscilador.frequency.setValueAtTime(frecuencia, inicio);
  volumen.gain.setValueAtTime(0.0001, inicio);
  volumen.gain.exponentialRampToValueAtTime(0.07, inicio + 0.02);
  volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  oscilador.connect(volumen).connect(audio.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + duracion + 0.02);
}

export function sonarGuardado() {
  const audio = contexto;
  if (!audio || audio.state !== "running") return;
  try {
    const ahora = audio.currentTime + 0.01;
    nota(audio, 784, ahora, 0.22);
    nota(audio, 1175, ahora + 0.11, 0.32);
  } catch {
    return;
  }
}
