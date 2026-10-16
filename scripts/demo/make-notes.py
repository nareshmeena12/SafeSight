"""
Builds public/demo/me201-thermodynamics-notes.pdf, the lecture notes the
teacher uploads in the demo (PLAN.md section 12, step 2). Sage cites page 12
(polytropic processes) when Riya asks about problem set 3.

    python3 scripts/demo/make-notes.py

Needs reportlab and the DejaVu fonts (both present in the cloud container).
The PDF is committed, so this only needs re-running when the notes change.
"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("Sans", FONT_DIR / "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", FONT_DIR / "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Serif-Bold", FONT_DIR / "DejaVuSerif-Bold.ttf"))

OUT = Path(__file__).resolve().parents[2] / "public" / "demo" / "me201-thermodynamics-notes.pdf"

# One lecture topic per page. Each entry: (title, [paragraphs]). Paragraphs that
# start with "  " are set as indented equations.
PAGES = [
    ("ME201 Thermodynamics: Lecture notes", [
        "Shivalik Institute of Technology, Mandi. Course teacher: Prof. Kavita Sharma.",
        "These notes follow the lectures of weeks 1 to 7. Each page covers one idea. Read them alongside the problem sets; the worked examples use different numbers from the assignments on purpose.",
        "Contents: 2 Systems and boundaries. 3 Properties and state. 4 Temperature and the zeroth law. 5 Energy, heat and work. 6 Sign convention. 7 Boundary work. 8 Pure substances. 9 Property tables and quality. 10 Ideal gases. 11 First law for closed systems. 12 Polytropic processes. 13 Specific heats and internal energy. 14 Summary of process relations.",
    ]),
    ("Lecture 1: Systems and boundaries", [
        "A system is the quantity of matter or region of space we choose to study. Everything outside it is the surroundings, and the real or imaginary surface that separates them is the boundary.",
        "A closed system (control mass) has a fixed mass: energy may cross the boundary as heat or work, but mass may not. A piston-cylinder device with the valves shut is the standard example. An open system (control volume) lets mass flow across its boundary, like a nozzle, turbine or compressor.",
        "Always draw the system boundary before writing any equation. Most sign errors in this course come from not knowing which side of the boundary the work is done on.",
    ]),
    ("Lecture 1: Properties and state", [
        "A property is any characteristic of a system we can measure, such as pressure P, temperature T, volume V and mass m. Intensive properties (P, T, density) do not depend on the size of the system; extensive properties (V, m, total energy) do. Dividing an extensive property by mass gives a specific property, for example specific volume v = V/m.",
        "The state of a system is fixed by its properties. The state postulate says that the state of a simple compressible system is fixed by two independent intensive properties.",
        "A process is any change from one equilibrium state to another. A quasi-equilibrium (quasi-static) process happens slowly enough that the system stays close to equilibrium at every instant, so we can draw it as a line on a P-V diagram.",
    ]),
    ("Lecture 2: Temperature and the zeroth law", [
        "The zeroth law: if two bodies are each in thermal equilibrium with a third body, they are in thermal equilibrium with each other. This is what makes a thermometer meaningful.",
        "Temperature scales: T(K) = T(°C) + 273.15. Temperature differences are the same in kelvin and degrees Celsius, so a specific heat in kJ/kg·K can be used with a ΔT in °C. In gas-law equations always use absolute temperature in kelvin.",
    ]),
    ("Lecture 2: Energy, heat and work", [
        "Energy can cross the boundary of a closed system in two forms only: heat and work. Heat Q is energy transfer driven by a temperature difference. Work W is energy transfer associated with a force acting through a distance, such as a moving piston or a rotating shaft.",
        "Heat and work are path functions: their amounts depend on the process, not just on the end states. Properties such as internal energy U are point functions. We write small amounts of heat and work as δQ and δW, and small changes of properties as dU.",
        "Units: 1 J = 1 N·m. In this course, keep energy in kJ, pressure in kPa and volume in m³; then kPa·m³ = kJ.",
    ]),
    ("Lecture 3: Sign convention for heat and work", [
        "We use the classical sign convention: heat transferred TO the system is positive, and work done BY the system is positive.",
        "  Q > 0 : heat added to the system      W > 0 : work done by the system",
        "So an expanding gas does positive boundary work, and a gas being compressed has negative boundary work (work is done on it). Heat lost to the surroundings is negative.",
        "Common mistake: writing the work done on a gas during compression as a positive W in Q − W = ΔU. State your sign convention at the top of every solution and stick to it.",
    ]),
    ("Lecture 3: Moving boundary work", [
        "When a piston moves, the boundary work is the area under the process curve on a P-V diagram:",
        "  W_b = ∫ P dV   (from state 1 to state 2)",
        "For a constant-pressure process: W_b = P (V2 − V1). For a constant-volume process: W_b = 0.",
        "For an isothermal process of an ideal gas (PV = constant): W_b = P1 V1 ln(V2/V1) = mRT ln(P1/P2).",
        "The integral is only defined for quasi-equilibrium processes. A sudden, unrestrained expansion into a vacuum does no boundary work.",
    ]),
    ("Lecture 4: Pure substances and phases", [
        "A pure substance has a fixed chemical composition throughout, such as water or nitrogen. It can exist as compressed liquid, saturated liquid, saturated liquid-vapour mixture, saturated vapour or superheated vapour.",
        "At a given pressure, a pure substance boils at a fixed saturation temperature, Tsat. At 101.325 kPa, water boils at 100 °C; at 200 kPa it boils at about 120.2 °C.",
        "On a T-v diagram, the saturated liquid and saturated vapour lines meet at the critical point. For water: Pcr = 22.06 MPa and Tcr = 373.95 °C.",
    ]),
    ("Lecture 4: Property tables and quality", [
        "In the wet region, pressure and temperature are not independent, so we need one more property. The quality x is the mass fraction of vapour in the mixture:",
        "  x = m_vapour / m_total,   v = vf + x (vg − vf),   u = uf + x ufg,   h = hf + x hfg",
        "Steps for reading the steam tables: 1) Decide the phase by comparing the given T or P with saturation values. 2) Use the saturated tables for a mixture, the superheated tables otherwise. 3) Interpolate linearly between rows when the value lies between two entries.",
    ]),
    ("Lecture 5: The ideal gas", [
        "At low pressure and high temperature, gases follow the ideal gas equation of state:",
        "  P v = R T     or     P V = m R T",
        "R is the gas constant of the particular gas: R = Ru / M, where Ru = 8.314 kJ/kmol·K. For air, R = 0.287 kJ/kg·K.",
        "Use absolute pressure and absolute temperature. For a fixed mass going between two states: P1 V1 / T1 = P2 V2 / T2.",
    ]),
    ("Lecture 5: First law for closed systems", [
        "The first law is conservation of energy. For a closed system, with our sign convention:",
        "  Q − W = ΔU + ΔKE + ΔPE",
        "For a stationary system, ΔKE = ΔPE = 0, so Q − W = ΔU. Here W includes boundary work and any other work (shaft, electrical).",
        "For a cycle, the system returns to its initial state, so ΔU = 0 and the net heat equals the net work: Q_net = W_net.",
        "Method: 1) draw the system and its boundary; 2) list the known states; 3) find the work from the process; 4) find ΔU from tables or specific heats; 5) get Q from the first law.",
    ]),
    ("Lecture 6: Polytropic processes", [
        "Many real expansions and compressions of gases follow the polytropic relation",
        "  P V^n = constant",
        "where n is the polytropic exponent. Special cases: n = 0 constant pressure; n = 1 isothermal (ideal gas); n = k adiabatic and reversible (isentropic, k = cp/cv = 1.4 for air); n → ∞ constant volume.",
        "Boundary work for n ≠ 1 comes from integrating P dV with P = C V^−n:",
        "  W_b = (P2 V2 − P1 V1) / (1 − n) = m R (T2 − T1) / (1 − n)",
        "For an ideal gas, the end temperatures are related by",
        "  T2 / T1 = (P2 / P1)^((n − 1)/n) = (V1 / V2)^(n − 1)",
        "Heat transfer then follows from the first law: Q = W_b + m cv (T2 − T1). In a polytropic compression with 1 < n < k, the gas is compressed (W_b negative) and loses some heat (Q negative).",
        "Worked example (different numbers from the problem set): 2 kg of nitrogen (R = 0.297 kJ/kg·K, cv = 0.743 kJ/kg·K) expands polytropically with n = 1.2 from 600 kPa, 400 K to 150 kPa. T2 = 400 × (150/600)^(0.2/1.2) = 317.5 K. W_b = 2 × 0.297 × (317.5 − 400) / (1 − 1.2) = 245.0 kJ (done by the gas). ΔU = 2 × 0.743 × (317.5 − 400) = −122.6 kJ. Q = 245.0 − 122.6 = 122.4 kJ added.",
    ]),
    ("Lecture 7: Specific heats and internal energy", [
        "The specific heat at constant volume cv and at constant pressure cp are defined as cv = (∂u/∂T)v and cp = (∂h/∂T)p. For an ideal gas, u and h depend on temperature only, so:",
        "  Δu = cv (T2 − T1),   Δh = cp (T2 − T1),   cp − cv = R,   k = cp / cv",
        "For air at room temperature: cv = 0.718 kJ/kg·K, cp = 1.005 kJ/kg·K, k = 1.4. These relations hold for any process of an ideal gas, not only constant-volume or constant-pressure ones.",
        "For liquids and solids (incompressible substances), cp ≈ cv = c and Δu = c ΔT.",
    ]),
    ("Summary: process relations for an ideal gas", [
        "Constant volume: W_b = 0, Q = m cv ΔT.",
        "Constant pressure: W_b = P (V2 − V1) = m R ΔT, Q = m cp ΔT.",
        "Isothermal: W_b = m R T ln(V2/V1), ΔU = 0, Q = W_b.",
        "Polytropic (n ≠ 1): W_b = m R (T2 − T1)/(1 − n), Q = W_b + m cv ΔT. See page 12.",
        "Adiabatic reversible (n = k): Q = 0, W_b = −m cv ΔT.",
        "Before using any of these: state your system, your sign convention and the units of every quantity.",
    ]),
]

W, H = A4
MARGIN = 22 * mm
LINE = 15.5


def wrap(text, font, size, width):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if pdfmetrics.stringWidth(trial, font, size) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4)
    c.setTitle("ME201 Thermodynamics: Lecture notes")
    c.setAuthor("Kavita Sharma (demo)")
    for number, (title, paragraphs) in enumerate(PAGES, start=1):
        y = H - MARGIN - 6
        c.setFont("Serif-Bold", 20 if number == 1 else 17)
        c.drawString(MARGIN, y, title)
        y -= 30
        for p in paragraphs:
            eq = p.startswith("  ")
            font, size, indent = ("Sans-Bold", 11, 12 * mm) if eq else ("Sans", 11, 0)
            for line in wrap(p.strip(), font, size, W - 2 * MARGIN - indent):
                c.setFont(font, size)
                c.drawString(MARGIN + indent, y, line)
                y -= LINE
            y -= 8
        c.setFont("Sans", 9)
        c.drawString(MARGIN, 14 * mm, "ME201 Thermodynamics · Lecture notes")
        c.drawRightString(W - MARGIN, 14 * mm, f"Page {number}")
        c.showPage()
    c.save()
    print(f"Wrote {OUT} ({len(PAGES)} pages)")


if __name__ == "__main__":
    main()
