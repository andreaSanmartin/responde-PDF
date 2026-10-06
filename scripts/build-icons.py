"""Genera los iconos de la extensión (16, 48 y 128 px) a partir de assets/icon-source.jpg.

Mejoras aplicadas a la imagen original:
  1. Encuadre centrado en el libro y el lápiz (se elimina el margen blanco).
  2. Ajuste de color para que el fondo coincida con el crema de la paleta (#F8E8C8).
  3. Más contraste y saturación, y enfoque en los tamaños pequeños.
  4. Esquinas redondeadas con transparencia y un borde sutil color mostaza.

Uso: npm run icons   (requiere Python 3 con Pillow: pip install pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "assets" / "icon-source.jpg"
DESTINO = RAIZ / "extension" / "icons"

# Paleta (RGB)
CREMA = (248, 232, 200)    # #F8E8C8
MOSTAZA = (232, 163, 61)   # #E8A33D

# Color del fondo de la imagen original, que se convierte en CREMA
FONDO_ORIGINAL = (255, 241, 230)

# Encuadre (en píxeles de la imagen original de 1024x1024): centro y lado del cuadrado.
# En 16 px se recorta más ajustado para que el dibujo se vea lo más grande posible.
ENCUADRES = {
    16: ((535, 520), 720),
    48: ((532, 515), 780),
    128: ((530, 520), 800),
}

ESCALA = 4  # se trabaja a 4x y se reduce al final para suavizar los bordes


def ajustar_a_paleta(img: Image.Image) -> Image.Image:
    """Multiplica cada canal para que el fondo original pase a ser el crema de la paleta."""
    canales = [
        c.point(lambda v, f=CREMA[i] / FONDO_ORIGINAL[i]: min(255, round(v * f)))
        for i, c in enumerate(img.split())
    ]
    return Image.merge("RGB", canales)


def mascara_redondeada(lado: int, radio: int) -> Image.Image:
    mascara = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, lado - 1, lado - 1), radio, fill=255)
    return mascara


def generar(original: Image.Image, tam: int) -> Image.Image:
    (cx, cy), lado = ENCUADRES[tam]
    recorte = original.crop((cx - lado // 2, cy - lado // 2, cx + lado // 2, cy + lado // 2))

    # Mejoras de color
    recorte = ajustar_a_paleta(recorte)
    recorte = ImageEnhance.Contrast(recorte).enhance(1.15)
    recorte = ImageEnhance.Color(recorte).enhance(1.15 if tam > 16 else 1.05)

    grande = tam * ESCALA
    recorte = recorte.resize((grande, grande), Image.LANCZOS)

    # Borde sutil para que el icono se distinga sobre barras de herramientas claras
    # (en 16 px se omite: cada píxel cuenta)
    grosor = 0 if tam == 16 else max(ESCALA, round(grande * 0.025))
    radio = round(grande * (0.16 if tam == 16 else 0.22))
    # (mostaza mezclada al 55 % con la imagen para que no resulte demasiado marcado)
    borde = Image.blend(recorte, Image.new("RGB", (grande, grande), MOSTAZA), 0.55)
    mascara_interior = Image.new("L", (grande, grande), 0)
    mascara_interior.paste(mascara_redondeada(grande - 2 * grosor, max(1, radio - grosor)), (grosor, grosor))
    lienzo = Image.composite(recorte, borde, mascara_interior)

    icono = lienzo.convert("RGBA")
    icono.putalpha(mascara_redondeada(grande, radio))
    icono = icono.resize((tam, tam), Image.LANCZOS)

    # Enfoque final, más fuerte en tamaños pequeños
    if tam <= 48:
        rgb = icono.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
        rgb.putalpha(icono.getchannel("A"))
        icono = rgb
    return icono


def main() -> None:
    original = Image.open(ORIGEN).convert("RGB")
    DESTINO.mkdir(parents=True, exist_ok=True)
    for tam in ENCUADRES:
        ruta = DESTINO / f"icon{tam}.png"
        generar(original, tam).save(ruta, optimize=True)
        print(f"Generado {ruta.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
