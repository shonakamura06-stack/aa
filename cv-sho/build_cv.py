#!/usr/bin/env python3
"""
Genera el CV de Sho Nakamura Salvatierra en .docx y .pdf, en dos versiones:
  tecnologia     — diseño funcional, control de calidad, IA y datos
  administrativa  — asistencia digital, investigación, redacción y organización

Los datos de contacto NO están en este archivo: se leen de un JSON externo,
porque el repositorio es público. Sin ese archivo salen marcadores visibles.

Uso:
  python3 cv-sho/build_cv.py tecnologia
  CV_CONTACTO=/ruta/contacto.json CV_SALIDA=/ruta/salida \\
      python3 cv-sho/build_cv.py administrativa
"""
import json
import os
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, Cm, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                HRFlowable, KeepTogether)

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "entregables")


def cargar_contacto():
    ruta = os.environ.get("CV_CONTACTO") or os.path.join(OUT, "datos_contacto.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f), True
    return {
        "nombre": "Sho Nakamura Salvatierra",
        "ubicacion": "[CIUDAD]",
        "telefono": "[TELÉFONO]",
        "email": "[CORREO]",
        "linkedin": "[LINKEDIN]",
        "web": "trazador-math-wars.vercel.app · sintonia-beta.vercel.app",
    }, False


# ==========================================================================
# CONTENIDO
# ==========================================================================

COMUN_FORMACION = [
    ("Ingeniería en Sistemas Informáticos — UNIVALLE", "Ingreso previsto en 2027."),
    ("Bachillerato — Colegio Mayor San Lorenzo",
     "Promoción 2026. Promedio superior a 80 en cuarto y quinto de secundaria."),
]

TECNOLOGIA = {
    "sluf": "tecnologia",
    "linea": "Estudiante de último año de secundaria · Diseño funcional y control de calidad",
    "perfil": (
        "Termino secundaria en 2026 y empiezo Ingeniería en Sistemas Informáticos en 2027. "
        "Diseñé las reglas, la puntuación y los flujos de un proyecto de once juegos de fiesta "
        "multijugador, y dirigí su implementación con agentes de IA revisando cambios, informes y "
        "pruebas. Publiqué dos aplicaciones web que siguen en línea. Busco un puesto remoto de "
        "tiempo parcial, compatible con el inicio de estudios, en evaluación de contenido o datos, "
        "control de calidad y asistencia técnica inicial."
    ),
    "proyectos": [
        {
            "titulo": "Sintonía — diseño funcional de una plataforma de 11 juegos multijugador",
            "meta": "2026 · en línea: sintonia-beta.vercel.app",
            "vinetas": [
                "Definí las reglas, la puntuación y el flujo completo de los once juegos, de la "
                "entrada a la sala hasta el resultado de cada ronda.",
                "Decidí el comportamiento del sistema: la computadora anfitriona no juega, los "
                "equipos no se asignan solos, los puntos de pareja se reparten entre sus integrantes "
                "y el Precio Justo compara decimales exactos en seis rangos.",
                "Escribí las especificaciones paso a paso para que los agentes implementaran cada "
                "mecánica y revisé los informes de cambio antes de aceptarlos.",
                "Coordiné 4.583 entradas de contenido con sistema antirrepetición; el proyecto reúne "
                "42 archivos de prueba y conserva 21 capturas de fallo previas a cada corrección.",
                "Probado con navegadores emulados y señalización local: no hay validación con "
                "teléfonos físicos ni en red pública, y así consta en el propio proyecto.",
            ],
        },
        {
            "titulo": "Trazador · Math Wars — plano cartesiano interactivo",
            "meta": "2026 · en línea: trazador-math-wars.vercel.app",
            "vinetas": [
                "Aplicación publicada para planear tiros en el juego Math Wars: se dibuja una curva "
                "con puntos y calcula por mínimos cuadrados la ecuación que mejor se ajusta.",
                "Catorce familias de funciones con deslizadores, detección de choques y ecuación "
                "lista para pegar; funciona en el navegador sin servidor, también en móvil.",
            ],
        },
        {
            "titulo": "ELIGE TU PROBLEMA — juego web de dilemas",
            "meta": "2026 · terminado, pendiente de publicación",
            "vinetas": [
                "66 dilemas originales y 10 finales que dependen de las decisiones, no del azar.",
                "Siete suites de prueba aprobadas y 2.000 partidas simuladas para verificar que los "
                "diez finales son alcanzables. Accesibilidad por teclado y áreas táctiles de 52 px.",
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
    ],
    "formacion": COMUN_FORMACION,
    "reconocimientos": [
        ("Reconocimiento por participación destacada — Olimpiadas STEM, UNIFRANZ", "Junio de 2026."),
        ("Cuarto lugar entre 32 equipos — Olimpiada de Robótica SPIKE, UPSA",
         "2026. Equipo de cuatro estudiantes; diseño, armado y programación del robot."),
        ("Segundo puesto, categoría general peso ligero — Cuarto torneo de tiro de cuerda, "
         "Asociación Boliviana Japonesa", "Enero de 2024."),
    ],
    "antecedentes": [
        ("BOLMUN — Modelo de Naciones Unidas, delegado",
         "2023–2026, cuatro ediciones; foro UNICEF en español (2024) y foro ONU Mujer (2023). "
         "Documentos de posición, intervenciones y resoluciones conjuntas en 2026."),
        ("Excel y hojas de cálculo",
         "Funciones de búsqueda, formato condicional, filtros y validación. Seguimiento de "
         "asistencia de un club de ajedrez durante nueve meses."),
    ],
    "habilidades": [
        ("Hojas de cálculo", "Excel y Google Sheets, con funciones de búsqueda y condicionales, "
                             "formato condicional, filtros y validación de datos."),
        ("Técnicas", "HTML y CSS (modificación y maquetación), Python (fundamentos), Git y GitHub "
                     "(uso básico), despliegue en Vercel."),
        ("IA y productividad", "Instrucciones detalladas, dirección de agentes y verificación de "
                               "respuestas. Word, Google Docs y Drive, Notion, Canva, CapCut."),
        ("Idiomas", "Español nativo; inglés B1–B2 autoevaluado."),
    ],
    "deporte": None,
}

ADMINISTRATIVA = {
    "sluf": "administrativa",
    "linea": "Asistencia digital y administrativa · Investigación, redacción y organización",
    "perfil": (
        "Termino secundaria en 2026 y empiezo Ingeniería en Sistemas Informáticos en 2027. Llevo "
        "registros y coordinación reales: soy secretario del club de ajedrez del colegio y mantengo "
        "su control de asistencia en hojas de cálculo desde marzo. Redacto documentos de posición, "
        "resúmenes e informes, y organizo información con hojas de cálculo, documentos y agentes de "
        "IA. Busco un puesto remoto de tiempo parcial en asistencia administrativa, investigación, "
        "redacción o atención al cliente."
    ),
    "proyectos": [
        {
            "titulo": "Secretario del club de ajedrez — control de asistencia y organización",
            "meta": "Marzo a noviembre de 2026 · Colegio Mayor San Lorenzo",
            "vinetas": [
                "Llevo el registro de asistencia del club: 30 jornadas, 14 jugadores y 388 marcas "
                "anotadas, con criterio propio para distinguir presencia, falta y ausencia "
                "justificada.",
                "Construí la planilla con conteos automáticos por jugador y por fecha, y una escala "
                "de asistencia diaria que permite ver de un vistazo cómo evoluciona el grupo.",
                "Como secretario, apoyo la coordinación del torneo escolar: participantes, horarios "
                "y materiales.",
            ],
        },
        {
            "titulo": "Sintonía — coordinación de contenido y documentación de un proyecto de 11 juegos",
            "meta": "2026 · en línea: sintonia-beta.vercel.app",
            "vinetas": [
                "Organicé y revisé 4.583 entradas de contenido repartidas entre juegos y seis "
                "mercados, con criterios de clasificación y control de repeticiones.",
                "Escribí especificaciones paso a paso para que un equipo de agentes de IA pudiera "
                "implementar cada mecánica sin ambigüedad.",
                "Revisé informes de cambio y documenté qué estaba probado y qué no: el proyecto "
                "conserva 21 capturas de fallo previas a cada corrección.",
            ],
        },
        {
            "titulo": "Investigación y redacción — BOLMUN, cuatro ediciones",
            "meta": "2023–2026 · foros UNICEF en español (2024) y ONU Mujer (2023)",
            "vinetas": [
                "Investigué posturas internacionales y redacté documentos de posición con estructura "
                "formal, para representar a un país en un foro de debate.",
                "Participé en la redacción de resoluciones conjuntas con otros delegados en 2026, con "
                "nueve y trece países firmantes.",
                "Realicé intervenciones orales y negociación con otras delegaciones.",
            ],
        },
        {
            "titulo": "Apoyo administrativo con hojas de cálculo y documentos",
            "meta": "2024–2026",
            "vinetas": [
                "Trabajo con funciones de búsqueda y condicionales, formato condicional, filtros y "
                "validación de datos en Excel y Google Sheets.",
                "Preparo documentos, presentaciones y resúmenes en Word, Google Docs y Drive; "
                "clasifico y verifico información en varias fuentes antes de usarla.",
            ],
        },
    ],
    "formacion": COMUN_FORMACION,
    "reconocimientos": [
        ("Reconocimiento por participación destacada — Olimpiadas STEM, UNIFRANZ", "Junio de 2026."),
        ("Segundo puesto, categoría general peso ligero — Cuarto torneo de tiro de cuerda, "
         "Asociación Boliviana Japonesa", "Enero de 2024."),
        ("Cuarto lugar entre 32 equipos — Olimpiada de Robótica SPIKE, UPSA",
         "2026. Equipo de cuatro estudiantes."),
    ],
    "antecedentes": [],
    "habilidades": [
        ("Hojas de cálculo", "Excel y Google Sheets, con funciones de búsqueda y condicionales, "
                             "formato condicional, filtros, validación y control de asistencia."),
        ("Documentos y organización", "Word, Google Docs y Drive, PowerPoint, Notion. Redacción "
                                      "formal en español, corrección y resumen de información."),
        ("Agentes de IA", "Uso de asistentes conectados al correo, la agenda y la mensajería para "
                          "resumir, transcribir, programar recordatorios y redactar borradores, "
                          "revisando siempre el resultado antes de usarlo."),
        ("Idiomas", "Español nativo; inglés B1–B2 autoevaluado: lectura de documentación y "
                    "conversación sencilla."),
    ],
    "deporte": ("Actividad deportiva continua en la colectividad nikkei de Santa Cruz: "
                "confraternizaciones de fútbol y vóleibol (2015–2017) y Juegos Deportivos "
                "Estudiantiles del municipio."),
}

PERFILES = {"tecnologia": TECNOLOGIA, "administrativa": ADMINISTRATIVA}

AZUL = RGBColor(0x1A, 0x1A, 0x1A)


# ==========================================================================
# DOCX
# ==========================================================================
def construir_docx(ruta, C):
    doc = Document()
    sec = doc.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
    sec.top_margin, sec.bottom_margin = Cm(1.25), Cm(1.1)
    sec.left_margin = sec.right_margin = Cm(1.7)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(9.5)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.0

    def p(texto="", size=9.5, bold=False, italic=False, space_before=0, space_after=0):
        par = doc.add_paragraph()
        par.paragraph_format.space_before = Pt(space_before)
        par.paragraph_format.space_after = Pt(space_after)
        run = par.add_run(texto)
        run.font.size = Pt(size)
        run.bold = bold
        run.italic = italic
        run.font.color.rgb = AZUL
        return par

    def seccion(titulo):
        par = doc.add_paragraph()
        par.paragraph_format.space_before = Pt(6)
        par.paragraph_format.space_after = Pt(2)
        run = par.add_run(titulo.upper())
        run.font.size = Pt(9)
        run.bold = True
        pPr = par._p.get_or_add_pPr()
        bordes = OxmlElement("w:pBdr")
        inferior = OxmlElement("w:bottom")
        inferior.set(qn("w:val"), "single")
        inferior.set(qn("w:sz"), "4")
        inferior.set(qn("w:space"), "1")
        inferior.set(qn("w:color"), "BBBBBB")
        bordes.append(inferior)
        pPr.append(bordes)

    def vineta(texto, size=9.2, bold=False):
        par = doc.add_paragraph()
        par.paragraph_format.left_indent = Cm(0.42)
        par.paragraph_format.first_line_indent = Cm(-0.42)
        par.paragraph_format.space_after = Pt(1.2)
        run = par.add_run("· " + texto)
        run.font.size = Pt(size)
        run.bold = bold

    p(CONTACTO["nombre"], size=17, bold=True, space_after=1)
    p(C["linea"], size=9.5, italic=True, space_after=2)
    p(f'{CONTACTO["ubicacion"]}  ·  {CONTACTO["telefono"]}  ·  {CONTACTO["email"]}',
      size=9, space_after=0)
    p(f'{CONTACTO["linkedin"]}  ·  {CONTACTO["web"]}', size=9, space_after=0)

    seccion("Perfil")
    p(C["perfil"], size=9.5)

    seccion("Experiencia y proyectos" if C["sluf"] == "administrativa" else "Proyectos")
    for i, pr in enumerate(C["proyectos"]):
        if i:
            p(size=3)
        p(pr["titulo"], size=10, bold=True, space_before=2 if i else 0)
        p(pr["meta"], size=8.5, italic=True, space_after=1.5)
        for v in pr["vinetas"]:
            vineta(v)

    seccion("Formación")
    for titulo, detalle in C["formacion"]:
        par = doc.add_paragraph()
        par.paragraph_format.space_after = Pt(1.5)
        r1 = par.add_run(titulo)
        r1.bold = True
        r1.font.size = Pt(9.5)
        r2 = par.add_run("  " + detalle)
        r2.font.size = Pt(9.2)

    seccion("Reconocimientos")
    for titulo, detalle in C["reconocimientos"]:
        vineta(f"{titulo} — {detalle}")

    if C["antecedentes"]:
        seccion("Otros antecedentes")
        for titulo, detalle in C["antecedentes"]:
            par = doc.add_paragraph()
            par.paragraph_format.space_after = Pt(1.5)
            r1 = par.add_run(titulo + ". ")
            r1.bold = True
            r1.font.size = Pt(9.2)
            r2 = par.add_run(detalle)
            r2.font.size = Pt(9.2)

    if C["deporte"]:
        seccion("Actividad deportiva")
        p(C["deporte"], size=9.2)

    seccion("Habilidades")
    for etiqueta, detalle in C["habilidades"]:
        par = doc.add_paragraph()
        par.paragraph_format.space_after = Pt(1.5)
        r1 = par.add_run(etiqueta + ": ")
        r1.bold = True
        r1.font.size = Pt(9.2)
        r2 = par.add_run(detalle)
        r2.font.size = Pt(9.2)

    doc.save(ruta)
    return ruta


# ==========================================================================
# PDF
# ==========================================================================
def construir_pdf(ruta, C):
    doc = SimpleDocTemplate(
        ruta, pagesize=A4,
        topMargin=1.1 * cm, bottomMargin=1.0 * cm,
        leftMargin=1.7 * cm, rightMargin=1.7 * cm,
        title=f"CV — {CONTACTO['nombre']}", author=CONTACTO["nombre"],
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
                                   textColor=GRIS),
        "seccion": ParagraphStyle("s", fontName="Helvetica-Bold", fontSize=8.7, leading=10.2,
                                  textColor=NEGRO, spaceBefore=4.5, spaceAfter=1),
        "cuerpo": ParagraphStyle("b", fontName="Helvetica", fontSize=9.0, leading=11.2,
                                 textColor=NEGRO, alignment=TA_LEFT),
        "titulo_proy": ParagraphStyle("tp", fontName="Helvetica-Bold", fontSize=9.6, leading=11.4,
                                      textColor=NEGRO, spaceBefore=2.5),
        "meta": ParagraphStyle("m", fontName="Helvetica-Oblique", fontSize=8.3, leading=10,
                               textColor=GRIS, spaceAfter=1.5),
        "vineta": ParagraphStyle("v", fontName="Helvetica", fontSize=8.9, leading=10.8,
                                 textColor=NEGRO, leftIndent=10, bulletIndent=0, spaceAfter=1.1),
        "vineta_b": ParagraphStyle("vb", fontName="Helvetica", fontSize=8.9, leading=10.8,
                                   textColor=NEGRO, leftIndent=10, bulletIndent=0, spaceAfter=1.6),
    }

    def sec(titulo):
        return [Spacer(1, 1.5),
                Paragraph(titulo.upper(), st["seccion"]),
                HRFlowable(width="100%", thickness=0.5, color=LINEA,
                           spaceBefore=0.5, spaceAfter=2.5)]

    fl = [Paragraph(CONTACTO["nombre"], st["nombre"]),
          Paragraph(C["linea"], st["linea"]),
          Paragraph(f'{CONTACTO["ubicacion"]}  ·  {CONTACTO["telefono"]}  ·  '
                    f'{CONTACTO["email"]}', st["contacto"]),
          Paragraph(f'{CONTACTO["linkedin"]}  ·  {CONTACTO["web"]}', st["contacto"])]

    fl += sec("Perfil")
    fl.append(Paragraph(C["perfil"], st["cuerpo"]))

    fl += sec("Experiencia y proyectos" if C["sluf"] == "administrativa" else "Proyectos")
    for pr in C["proyectos"]:
        bloque = [Paragraph(pr["titulo"], st["titulo_proy"]),
                  Paragraph(pr["meta"], st["meta"])]
        bloque += [Paragraph(v, st["vineta"], bulletText="·") for v in pr["vinetas"]]
        fl.append(KeepTogether(bloque))

    fl += sec("Formación")
    for titulo, detalle in C["formacion"]:
        fl.append(Paragraph(f"<b>{titulo}</b>  {detalle}", st["vineta_b"]))

    fl += sec("Reconocimientos")
    for titulo, detalle in C["reconocimientos"]:
        fl.append(Paragraph(f"{titulo} — {detalle}", st["vineta"], bulletText="·"))

    if C["antecedentes"]:
        fl += sec("Otros antecedentes")
        for titulo, detalle in C["antecedentes"]:
            fl.append(Paragraph(f"<b>{titulo}.</b> {detalle}", st["vineta_b"]))

    if C["deporte"]:
        fl += sec("Actividad deportiva")
        fl.append(Paragraph(C["deporte"], st["cuerpo"]))

    fl += sec("Habilidades")
    for etiqueta, detalle in C["habilidades"]:
        fl.append(Paragraph(f"<b>{etiqueta}:</b> {detalle}", st["vineta"]))

    doc.build(fl)
    return ruta


def main():
    global OUT, CONTACTO
    clave = (sys.argv[1] if len(sys.argv) > 1 else "tecnologia").lower()
    if clave not in PERFILES:
        print(f"Perfil desconocido: {clave}. Opciones: {', '.join(PERFILES)}")
        return 2
    C = PERFILES[clave]
    CONTACTO, tiene_datos = cargar_contacto()
    if os.environ.get("CV_SALIDA"):
        OUT = os.environ["CV_SALIDA"]
    os.makedirs(OUT, exist_ok=True)

    d = construir_docx(os.path.join(OUT, f"CV_Sho_Nakamura_{clave}.docx"), C)
    f = construir_pdf(os.path.join(OUT, f"CV_Sho_Nakamura_{clave}.pdf"), C)
    print("DOCX:", d)
    print("PDF :", f)
    if not tiene_datos:
        print("\nAVISO: sin datos de contacto; salió con marcadores [ ].\n"
              "Copia datos_contacto.json.example y pásalo con CV_CONTACTO=...")
        return 1
    return 0


if __name__ == "__main__":
    CONTACTO = {}
    sys.exit(main())
