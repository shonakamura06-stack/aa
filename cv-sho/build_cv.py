#!/usr/bin/env python3
"""
Genera el CV de Sho Nakamura Salvatierra en .docx y .pdf.

Los datos de contacto NO están en este archivo: se leen de
`entregables/datos_contacto.json`, que está fuera del control de versiones.
Si ese archivo no existe, se usan marcadores visibles para rellenar a mano.

Uso:
  python3 cv-sho/build_cv.py                      # plantilla con marcadores
  CV_CONTACTO=/ruta/contacto.json \
  CV_SALIDA=/ruta/salida python3 cv-sho/build_cv.py   # versión final
"""
import json
import os
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, Cm, RGBColor

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                HRFlowable, KeepTogether)

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "entregables")
PERFIL = "tecnologia"

# --------------------------------------------------------------------------
# Contacto: fuera del repo público
# --------------------------------------------------------------------------
def cargar_contacto():
    ruta = os.environ.get("CV_CONTACTO") or os.path.join(OUT, "datos_contacto.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    return {
        "nombre": "Sho Nakamura Salvatierra",
        "linea": "Estudiante de último año de secundaria · Diseño funcional y control de calidad",
        "ubicacion": "[CIUDAD]",
        "telefono": "[TELÉFONO]",
        "email": "[CORREO]",
        "linkedin": "[LINKEDIN]",
        "web": "trazador-math-wars.vercel.app · sintonia-beta.vercel.app",
    }


CONTACTO = cargar_contacto()

# --------------------------------------------------------------------------
# Contenido
# --------------------------------------------------------------------------
PERFIL_TXT = (
    "Termino secundaria en 2026 y empiezo Ingeniería en Sistemas Informáticos en 2027. "
    "Diseñé las reglas, la puntuación y los flujos de un proyecto de once juegos de fiesta "
    "multijugador, y dirigí su implementación con agentes de IA revisando cambios, informes y "
    "pruebas. Publiqué dos aplicaciones web que siguen en línea. Busco un puesto remoto de "
    "tiempo parcial, compatible con el inicio de estudios, en evaluación de contenido o datos, "
    "control de calidad y asistencia técnica inicial."
)

PROYECTOS = [
    {
        "titulo": "Sintonía — diseño funcional de una plataforma de 11 juegos multijugador",
        "meta": "2026 · en línea: sintonia-beta.vercel.app",
        "vinetas": [
            "Definí las reglas, la puntuación y el flujo completo de los once juegos, de la entrada "
            "a la sala hasta el resultado de cada ronda.",
            "Decidí el comportamiento del sistema: la computadora anfitriona no juega, los equipos "
            "no se asignan solos, los puntos de pareja se reparten entre sus integrantes y el Precio "
            "Justo compara decimales exactos en seis rangos.",
            "Escribí las especificaciones paso a paso para que los agentes implementaran cada mecánica "
            "y revisé los informes de cambio antes de aceptarlos.",
            "Coordiné 4.583 entradas de contenido con sistema antirrepetición; el proyecto reúne 42 "
            "archivos de prueba y conserva 21 capturas de fallo previas a cada corrección.",
            "Probado con navegadores emulados y señalización local: no hay validación con teléfonos "
            "físicos ni en red pública, y así consta en el propio proyecto.",
        ],
    },
    {
        "titulo": "Trazador · Math Wars — plano cartesiano interactivo",
        "meta": "2026 · en línea: trazador-math-wars.vercel.app",
        "vinetas": [
            "Aplicación publicada para planear tiros en el juego Math Wars: se dibuja una curva con "
            "puntos y calcula por mínimos cuadrados la ecuación que mejor se ajusta.",
            "Catorce familias de funciones con deslizadores, detección de choques y ecuación lista "
            "para pegar; funciona en el navegador sin servidor, también en móvil.",
        ],
    },
    {
        "titulo": "ELIGE TU PROBLEMA — juego web de dilemas",
        "meta": "2026 · terminado, pendiente de publicación",
        "vinetas": [
            "66 dilemas originales y 10 finales que dependen de las decisiones, no del azar.",
            "Siete suites de prueba aprobadas y 2.000 partidas simuladas para verificar que los diez "
            "finales son alcanzables. Accesibilidad por teclado y áreas táctiles de 52 px.",
        ],
    },
    {
        "titulo": "Umbral — plataforma de análisis de texto",
        "meta": "2026 · en desarrollo",
        "vinetas": [
            "Arquitectura de 15 analizadores propios con orquestador de concurrencia y tiempos "
            "límite; cada componente se marca como funcionando, deshabilitado o no probado.",
        ],
    },
]

FORMACION = [
    ("Ingeniería en Sistemas Informáticos — UNIVALLE",
     "Ingreso previsto en 2027."),
    ("Bachillerato — Colegio Mayor San Lorenzo",
     "Promoción 2026. Promedio superior a 80 en cuarto y quinto de secundaria."),
]

RECONOCIMIENTOS = [
    ("Reconocimiento por participación destacada — Olimpiadas STEM, UNIFRANZ",
     "Junio de 2026."),
    ("Cuarto lugar entre 32 equipos — Olimpiada de Robótica SPIKE, UPSA",
     "2026. Equipo de cuatro estudiantes; diseño, armado y programación del robot."),
    ("Segundo puesto, categoría general peso ligero — Cuarto torneo de tiro de cuerda, "
     "Asociación Boliviana Japonesa",
     "Enero de 2024."),
]

ANTECEDENTES = [
    ("BOLMUN — Modelo de Naciones Unidas, delegado",
     "2023–2026, cuatro ediciones; foro UNICEF en español (2024) y foro ONU Mujer (2023). "
     "Documentos de posición, intervenciones y resoluciones conjuntas en 2026."),
    ("Excel y hojas de cálculo",
     "Funciones de búsqueda, formato condicional, filtros y validación. Seguimiento de "
     "asistencia de un club de ajedrez durante nueve meses."),
]

HABILIDADES = [
    ("Hojas de cálculo", "Excel y Google Sheets, con funciones de búsqueda y condicionales, "
                         "formato condicional, filtros y validación de datos."),
    ("Técnicas", "HTML y CSS (modificación y maquetación), Python (fundamentos), Git y GitHub "
                 "(uso básico), despliegue en Vercel."),
    ("IA y productividad", "Instrucciones detalladas, dirección de agentes y verificación de "
                           "respuestas. Word, Google Docs y Drive, Notion, Canva, CapCut."),
    ("Idiomas", "Español nativo; inglés B1–B2 autoevaluado."),
]

DISPONIBILIDAD = ("Remoto, tiempo parcial y flexible, compatible con el inicio de estudios "
                  "universitarios en 2027.")

# --------------------------------------------------------------------------
# DOCX
# --------------------------------------------------------------------------
AZUL = RGBColor(0x1A, 0x1A, 0x1A)


def construir_docx(ruta):
    doc = Document()
    sec = doc.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
    sec.top_margin = Cm(1.25)
    sec.bottom_margin = Cm(1.1)
    sec.left_margin = Cm(1.7)
    sec.right_margin = Cm(1.7)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(9.5)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.0

    def p(texto="", size=9.5, bold=False, italic=False, space_before=0, space_after=0,
          align=None, color=AZUL, space_after_pt=None):
        par = doc.add_paragraph()
        par.paragraph_format.space_before = Pt(space_before)
        par.paragraph_format.space_after = Pt(
            space_after if space_after_pt is None else space_after_pt)
        if align:
            par.alignment = align
        run = par.add_run(texto)
        run.font.size = Pt(size)
        run.bold = bold
        run.italic = italic
        run.font.color.rgb = color
        return par

    def seccion(titulo):
        par = doc.add_paragraph()
        par.paragraph_format.space_before = Pt(6)
        par.paragraph_format.space_after = Pt(2)
        run = par.add_run(titulo.upper())
        run.font.size = Pt(9)
        run.bold = True
        # línea inferior fina
        pPr = par._p.get_or_add_pPr()
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        bordes = OxmlElement("w:pBdr")
        inferior = OxmlElement("w:bottom")
        inferior.set(qn("w:val"), "single")
        inferior.set(qn("w:sz"), "4")
        inferior.set(qn("w:space"), "1")
        inferior.set(qn("w:color"), "BBBBBB")
        bordes.append(inferior)
        pPr.append(bordes)

    # Encabezado
    p(CONTACTO["nombre"], size=17, bold=True, space_after=1)
    p(CONTACTO["linea"], size=9.5, italic=True, space_after=2)
    p(f'{CONTACTO["ubicacion"]}  ·  {CONTACTO["telefono"]}  ·  {CONTACTO["email"]}',
      size=9, space_after=0)
    p(f'{CONTACTO["linkedin"]}  ·  {CONTACTO["web"]}', size=9, space_after=0)

    seccion("Perfil")
    p(PERFIL_TXT, size=9.5)

    seccion("Proyectos")
    for i, pr in enumerate(PROYECTOS):
        if i:
            p(size=4)
        p(pr["titulo"], size=10, bold=True, space_before=2 if i else 0, space_after=0)
        p(pr["meta"], size=8.5, italic=True, space_after=1.5)
        for v in pr["vinetas"]:
            par = doc.add_paragraph()
            par.paragraph_format.left_indent = Cm(0.42)
            par.paragraph_format.first_line_indent = Cm(-0.42)
            par.paragraph_format.space_after = Pt(1.2)
            run = par.add_run("· " + v)
            run.font.size = Pt(9.2)

    seccion("Formación")
    for titulo, detalle in FORMACION:
        par = doc.add_paragraph()
        par.paragraph_format.space_after = Pt(1.5)
        r1 = par.add_run(titulo)
        r1.bold = True
        r1.font.size = Pt(9.5)
        r2 = par.add_run("  " + detalle)
        r2.font.size = Pt(9.2)

    seccion("Reconocimientos")
    for titulo, detalle in RECONOCIMIENTOS:
        par = doc.add_paragraph()
        par.paragraph_format.left_indent = Cm(0.42)
        par.paragraph_format.first_line_indent = Cm(-0.42)
        par.paragraph_format.space_after = Pt(1.5)
        r1 = par.add_run("· " + titulo)
        r1.bold = False
        r1.font.size = Pt(9.2)
        r2 = par.add_run(" — " + detalle)
        r2.font.size = Pt(9.2)

    seccion("Otros antecedentes")
    for titulo, detalle in ANTECEDENTES:
        par = doc.add_paragraph()
        par.paragraph_format.space_after = Pt(1.5)
        r1 = par.add_run(titulo + ". ")
        r1.bold = True
        r1.font.size = Pt(9.2)
        r2 = par.add_run(detalle)
        r2.font.size = Pt(9.2)

    seccion("Habilidades")
    for etiqueta, detalle in HABILIDADES:
        par = doc.add_paragraph()
        par.paragraph_format.space_after = Pt(1.5)
        r1 = par.add_run(etiqueta + ": ")
        r1.bold = True
        r1.font.size = Pt(9.2)
        r2 = par.add_run(detalle)
        r2.font.size = Pt(9.2)

    seccion("Disponibilidad")
    p(DISPONIBILIDAD, size=9.2)

    doc.save(ruta)
    return ruta


# --------------------------------------------------------------------------
# PDF
# --------------------------------------------------------------------------
def construir_pdf(ruta):
    doc = SimpleDocTemplate(
        ruta, pagesize=A4,
        topMargin=1.1 * cm, bottomMargin=1.0 * cm,
        leftMargin=1.7 * cm, rightMargin=1.7 * cm,
        title="CV — Sho Nakamura Salvatierra", author="Sho Nakamura Salvatierra",
    )
    NEGRO = colors.HexColor("#1A1A1A")
    GRIS = colors.HexColor("#555555")
    LINEA = colors.HexColor("#BBBBBB")

    st = {
        "nombre": ParagraphStyle("n", fontName="Helvetica-Bold", fontSize=17, leading=20,
                                 textColor=NEGRO, spaceAfter=1),
        "linea": ParagraphStyle("l", fontName="Helvetica-Oblique", fontSize=9.5, leading=11.5,
                                textColor=NEGRO, spaceAfter=2),
        "contacto": ParagraphStyle("c", fontName="Helvetica", fontSize=8.8, leading=10.8,
                                   textColor=GRIS, spaceAfter=0),
        "seccion": ParagraphStyle("s", fontName="Helvetica-Bold", fontSize=8.7, leading=10.2,
                                  textColor=NEGRO, spaceBefore=4.5, spaceAfter=1),
        "cuerpo": ParagraphStyle("b", fontName="Helvetica", fontSize=9.0, leading=11.2,
                                 textColor=NEGRO, alignment=TA_LEFT, spaceAfter=0),
        "titulo_proy": ParagraphStyle("tp", fontName="Helvetica-Bold", fontSize=9.6, leading=11.4,
                                      textColor=NEGRO, spaceBefore=2.5, spaceAfter=0),
        "meta": ParagraphStyle("m", fontName="Helvetica-Oblique", fontSize=8.3, leading=10,
                               textColor=GRIS, spaceAfter=1.5),
        "vineta": ParagraphStyle("v", fontName="Helvetica", fontSize=8.9, leading=10.8,
                                 textColor=NEGRO, leftIndent=10, bulletIndent=0,
                                 spaceAfter=1.1),
        "vineta_b": ParagraphStyle("vb", fontName="Helvetica", fontSize=8.9, leading=10.8,
                                   textColor=NEGRO, leftIndent=10, bulletIndent=0,
                                   spaceAfter=1.6),
    }

    def sec(titulo):
        return [Spacer(1, 1.5),
                Paragraph(titulo.upper(), st["seccion"]),
                HRFlowable(width="100%", thickness=0.5, color=LINEA,
                           spaceBefore=0.5, spaceAfter=2.5)]

    fl = []
    fl.append(Paragraph(CONTACTO["nombre"], st["nombre"]))
    fl.append(Paragraph(CONTACTO["linea"], st["linea"]))
    fl.append(Paragraph(
        f'{CONTACTO["ubicacion"]}  ·  {CONTACTO["telefono"]}  ·  {CONTACTO["email"]}',
        st["contacto"]))
    fl.append(Paragraph(f'{CONTACTO["linkedin"]}  ·  {CONTACTO["web"]}', st["contacto"]))

    fl += sec("Perfil")
    fl.append(Paragraph(PERFIL_TXT, st["cuerpo"]))

    fl += sec("Proyectos")
    for i, pr in enumerate(PROYECTOS):
        bloque = [Paragraph(pr["titulo"], st["titulo_proy"]),
                  Paragraph(pr["meta"], st["meta"])]
        bloque += [Paragraph(v, st["vineta"], bulletText="·") for v in pr["vinetas"]]
        fl.append(KeepTogether(bloque) if i < 3 else KeepTogether(bloque))

    fl += sec("Formación")
    for titulo, detalle in FORMACION:
        fl.append(Paragraph(f"<b>{titulo}</b>  {detalle}", st["vineta_b"]))

    fl += sec("Reconocimientos")
    for titulo, detalle in RECONOCIMIENTOS:
        fl.append(Paragraph(f"{titulo} — {detalle}", st["vineta"], bulletText="·"))

    fl += sec("Otros antecedentes")
    for titulo, detalle in ANTECEDENTES:
        fl.append(Paragraph(f"<b>{titulo}.</b> {detalle}", st["vineta_b"]))

    fl += sec("Habilidades")
    for etiqueta, detalle in HABILIDADES:
        fl.append(Paragraph(f"<b>{etiqueta}:</b> {detalle}", st["vineta"]))

    doc.build(fl)
    return ruta


def main():
    global OUT
    fuera = os.environ.get("CV_SALIDA")
    if fuera:
        OUT = fuera
    os.makedirs(OUT, exist_ok=True)
    d = construir_docx(os.path.join(OUT, f"CV_Sho_Nakamura_{PERFIL}.docx"))
    f = construir_pdf(os.path.join(OUT, f"CV_Sho_Nakamura_{PERFIL}.pdf"))
    print("DOCX:", d)
    print("PDF :", f)
    if not (os.environ.get("CV_CONTACTO") or os.path.exists(os.path.join(OUT, "datos_contacto.json"))):
        print("\nAVISO: falta entregables/datos_contacto.json; el CV salió con marcadores.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
