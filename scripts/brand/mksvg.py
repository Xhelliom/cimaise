# Génère logo.svg (512) et tile.svg (1536x864) pour verre-2 et verre-4. Halos = dégradés radiaux, aucun filtre.
# Usage : python3 scripts/brand/mksvg.py [packages/launcher/brand]
# Le texte de la tuile est converti en tracés par inkscape (police Jost requise à la génération, pas à l'affichage).
import sys, os, subprocess
OUT = sys.argv[1] if len(sys.argv) > 1 else 'packages/launcher/brand'
def glass(x,y,w,h,r,fill):  # panneau de verre : fond, reflet, faux halo de bord, liseré
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" stroke="#ffd2b4" stroke-opacity=".22" stroke-width="10"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="#fff" fill-opacity=".13"/>{fill}'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="url(#sheen)" stroke="#ffe6d6" stroke-opacity=".9" stroke-width="2.5"/>')
V = {
"verre-2": dict(
 bg=('<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3540"/><stop offset=".45" stop-color="#03171f"/><stop offset="1" stop-color="#01070b"/></linearGradient>'
     '<radialGradient id="beam" cx="0" cy="0" r=".6"><stop offset="0" stop-color="#6fc2c6" stop-opacity=".4"/><stop offset="1" stop-color="#6fc2c6" stop-opacity="0"/></radialGradient>'),
 defs=('<linearGradient id="brass" x1="0" x2="1"><stop offset="0" stop-color="#b8863a" stop-opacity=".3"/><stop offset=".5" stop-color="#ffe2a0"/><stop offset="1" stop-color="#b8863a" stop-opacity=".3"/></linearGradient>'
       '<radialGradient id="glow"><stop offset="0" stop-color="#ffc56a" stop-opacity=".7"/><stop offset="1" stop-color="#ffc56a" stop-opacity="0"/></radialGradient>'
       '<linearGradient id="art" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a52"/><stop offset=".42" stop-color="#ff9a4e"/><stop offset=".56" stop-color="#ffc77a"/><stop offset=".6" stop-color="#b86a5a"/><stop offset="1" stop-color="#2c3550"/></linearGradient>'
       '<radialGradient id="sun" cx=".55" cy=".55" r=".35"><stop offset="0" stop-color="#fff0b0" stop-opacity=".95"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>'
       '<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2dc"/><stop offset=".5" stop-color="#cdeff2" stop-opacity=".5"/><stop offset="1" stop-color="#7fe6ff"/></linearGradient>'
       '<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#9ff0ff" stop-opacity=".15"/></linearGradient>'),
 mark=('<ellipse cx="256" cy="150" rx="160" ry="18" fill="url(#glow)"/>'
       '<rect x="110" y="148" width="292" height="4" rx="2" fill="url(#brass)"/>'
       '<path d="M204 152v34M308 152v34" stroke="#e0b464" stroke-width="2.5"/>'
       '<rect x="198" y="180" width="12" height="9" rx="1.5" fill="#e0b464"/><rect x="302" y="180" width="12" height="9" rx="1.5" fill="#e0b464"/>'
       '<rect x="170" y="186" width="172" height="196" rx="9" fill="#bfe9ee" fill-opacity=".16"/>'
       '<rect x="182" y="198" width="148" height="172" rx="3" fill="url(#art)"/>'
       '<rect x="182" y="198" width="148" height="172" rx="3" fill="url(#sun)"/>'
       '<rect x="170" y="186" width="172" height="196" rx="9" fill="url(#sheen)" stroke="url(#edge)" stroke-width="3.5"/>'),
 bbox=(110,140,402,382), text="#f6ecd8", gap=-50),
"verre-4": dict(
 bg=('<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14030c"/><stop offset=".5" stop-color="#3c0717"/><stop offset="1" stop-color="#7c1a1a"/></linearGradient>'
     '<radialGradient id="beam" cx="1" cy="0" r=".75"><stop offset="0" stop-color="#e0462e" stop-opacity=".55"/><stop offset="1" stop-color="#e0462e" stop-opacity="0"/></radialGradient>'
     '<radialGradient id="beam2" cx="1" cy="1" r=".7"><stop offset="0" stop-color="#d03a2a" stop-opacity=".5"/><stop offset="1" stop-color="#d03a2a" stop-opacity="0"/></radialGradient>'),
 bg2='<rect width="100%" height="100%" fill="url(#beam2)"/>',
 defs=('<linearGradient id="rail" x1="0" x2="1"><stop offset="0" stop-color="#ffb27a" stop-opacity=".35"/><stop offset=".55" stop-color="#ffe6cc"/><stop offset="1" stop-color="#ffb27a" stop-opacity=".35"/></linearGradient>'
       '<radialGradient id="glow"><stop offset="0" stop-color="#ffa060" stop-opacity=".75"/><stop offset="1" stop-color="#ffa060" stop-opacity="0"/></radialGradient>'
       '<radialGradient id="a1" cx=".4" cy=".4" r=".55"><stop offset="0" stop-color="#ffd488"/><stop offset=".5" stop-color="#ff7a40" stop-opacity=".5"/><stop offset="1" stop-color="#ff7a40" stop-opacity="0"/></radialGradient>'
       '<radialGradient id="a2" cx=".55" cy=".55" r=".55"><stop offset="0" stop-color="#ff7a90" stop-opacity=".9"/><stop offset=".55" stop-color="#e04060" stop-opacity=".45"/><stop offset="1" stop-color="#e04060" stop-opacity="0"/></radialGradient>'
       '<radialGradient id="w1"><stop offset="0" stop-color="#ffe2a8" stop-opacity=".8"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>'
       '<radialGradient id="w2"><stop offset="0" stop-color="#ff8a9a" stop-opacity=".6"/><stop offset="1" stop-color="#ff6080" stop-opacity="0"/></radialGradient>'
       '<clipPath id="c1"><rect x="132" y="106" width="158" height="228" rx="7"/></clipPath><clipPath id="c2"><rect x="268" y="169" width="118" height="176" rx="6"/></clipPath>'
       '<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#ffd8c8" stop-opacity=".16"/></linearGradient>'),
 mark=('<ellipse cx="300" cy="57" rx="300" ry="34" fill="url(#glow)"/>'
       '<rect x="0" y="55" width="512" height="4" fill="url(#rail)"/>'
       '<path d="M202 59v45M334 59v108" stroke="#ffc9a0" stroke-opacity=".85" stroke-width="2"/>'
       '<rect x="198" y="100" width="8" height="7" rx="1" fill="#ffc9a0"/><rect x="330" y="163" width="8" height="7" rx="1" fill="#ffc9a0"/>'
       + glass(132,106,158,228,7,'<rect x="132" y="106" width="158" height="228" rx="7" fill="url(#a1)"/><g clip-path="url(#c1)"><ellipse cx="200" cy="200" rx="95" ry="30" transform="rotate(-35 200 200)" fill="url(#w1)"/><ellipse cx="230" cy="285" rx="90" ry="22" transform="rotate(-20 230 285)" fill="url(#w2)"/></g>')
       + glass(268,169,118,176,6,'<rect x="268" y="169" width="118" height="176" rx="6" fill="url(#a2)"/><g clip-path="url(#c2)"><ellipse cx="320" cy="260" rx="70" ry="22" transform="rotate(30 320 260)" fill="url(#w1)"/></g>')),
 bbox=(132,55,386,345), text="#fbe3e0"),
}
FONT='font-family="Jost" font-weight="350"'
for name, v in V.items():
    os.makedirs(f"{OUT}/{name}", exist_ok=True)
    defs = f"<defs>{v['bg']}{v['defs']}</defs>"
    bgfill = f'<rect width="100%" height="100%" fill="url(#bg)"/><rect width="100%" height="100%" fill="url(#beam)"/>{v.get("bg2","")}'
    open(f"{OUT}/{name}/logo.svg","w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{defs}{bgfill}{v["mark"]}</svg>\n')
    x0,y0,x1,y1 = v["bbox"]; s = 260/(y1-y0)          # symbole ~260 px de haut dans la tuile
    w = (x1-x0)*s; tw = 540; gap = 44 + v.get("gap",0); left = (1536-(w+gap+tw))/2
    tx, ty = left - x0*s, 432 - (y0+y1)/2*s
    mark = v["mark"].replace('x="0" y="55" width="512"', 'x="40" y="55" width="432"')  # rail borné dans la tuile
    open(f"{OUT}/{name}/tile.svg","w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 864">{defs}{bgfill}'
        f'<g transform="translate({tx:.1f} {ty:.1f}) scale({s:.3f})">{mark}</g>'
        f'<text x="{left+w+gap:.1f}" y="470" {FONT} font-size="118" letter-spacing="16" fill="{v["text"]}">cimaise</text></svg>\n')
    subprocess.run(["inkscape", f"{OUT}/{name}/tile.svg", "--export-text-to-path", "--export-plain-svg",
                    f"--export-filename={OUT}/{name}/tile.svg"], check=True, stderr=subprocess.DEVNULL)
