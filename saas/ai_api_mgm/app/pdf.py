from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.lib.colors import black
from textwrap import wrap


def render_pdf(path: str, title: str, summary: str, recommendations: list[str]) -> None:
    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4

    y = height - 2 * cm
    c.setFont("Helvetica-Bold", 16)
    c.drawString(2 * cm, y, title)
    y -= 1.2 * cm

    c.setFont("Helvetica", 12)
    c.setFillColor(black)
    c.drawString(2 * cm, y, "Executive Summary")
    y -= 0.6 * cm

    for line in wrap(summary, 100):
        c.drawString(2 * cm, y, line)
        y -= 0.5 * cm

    y -= 0.6 * cm
    c.setFont("Helvetica", 12)
    c.drawString(2 * cm, y, "Recommendations")
    y -= 0.6 * cm

    for i, rec in enumerate(recommendations, start=1):
        for j, line in enumerate(wrap(rec, 95)):
            prefix = f"{i}. " if j == 0 else "    "
            c.drawString(2 * cm, y, prefix + line)
            y -= 0.5 * cm
        y -= 0.2 * cm

    c.showPage()
    c.save()
