import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove


def parse_args():
    parser = argparse.ArgumentParser(description="Quita el fondo de una o varias imagenes con IA.")
    parser.add_argument("entradas", nargs="+", type=Path, help="Imagenes a procesar")
    parser.add_argument("-o", "--salida", type=Path, help="Archivo .png o carpeta de destino")
    parser.add_argument("-m", "--modelo", default="isnet-general-use", help="Modelo de rembg (isnet-general-use, birefnet-general, u2net...)")
    parser.add_argument("--recortar", action="store_true", help="Recorta el lienzo al contenido")
    parser.add_argument("--bordes-finos", action="store_true", help="Usa alpha matting para bordes suaves (pelo, piel)")
    return parser.parse_args()


def destino_para(entrada: Path, salida: Path | None, varias: bool) -> Path:
    nombre = f"{entrada.stem}-sin-fondo.png"
    if salida is None:
        return entrada.with_name(nombre)
    if salida.suffix.lower() == ".png" and not varias:
        salida.parent.mkdir(parents=True, exist_ok=True)
        return salida
    salida.mkdir(parents=True, exist_ok=True)
    return salida / nombre


def refinar_alpha(alpha: np.ndarray, bajo: float = 8, alto: float = 235) -> np.ndarray:
    return np.clip((alpha - bajo) * 255 / (alto - bajo), 0, 255)


def color_de_fondo_uniforme(original: np.ndarray, tolerancia: float = 6) -> np.ndarray | None:
    borde = np.concatenate([original[0], original[-1], original[:, 0], original[:, -1]])
    if borde.std(axis=0).max() > tolerancia:
        return None
    return np.median(borde, axis=0)


def descontaminar(rgb: np.ndarray, alpha: np.ndarray, fondo: np.ndarray) -> np.ndarray:
    a = (alpha / 255)[..., None]
    parcial = (a > 0) & (a < 1)
    limpio = (rgb - (1 - a) * fondo) / np.maximum(a, 1e-3)
    return np.where(parcial, np.clip(limpio, 0, 255), rgb)


def quitar_fondo(imagen: Image.Image, session, bordes_finos: bool) -> Image.Image:
    original = np.asarray(imagen.convert("RGB"), dtype=np.float32)
    mascara = remove(imagen, session=session, alpha_matting=bordes_finos, only_mask=True)
    alpha = refinar_alpha(np.asarray(mascara.convert("L"), dtype=np.float32))
    fondo = color_de_fondo_uniforme(original)
    rgb = descontaminar(original, alpha, fondo) if fondo is not None else original
    resultado = np.dstack([rgb, alpha]).round().astype(np.uint8)
    return Image.fromarray(resultado, "RGBA")


def main():
    args = parse_args()
    session = new_session(args.modelo)
    varias = len(args.entradas) > 1
    for entrada in args.entradas:
        imagen = Image.open(entrada).convert("RGBA")
        resultado = quitar_fondo(imagen, session, args.bordes_finos)
        if args.recortar:
            caja = resultado.getbbox()
            if caja:
                resultado = resultado.crop(caja)
        destino = destino_para(entrada, args.salida, varias)
        resultado.save(destino, optimize=True)
        print(destino)


if __name__ == "__main__":
    main()
