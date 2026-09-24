"""Réduit Atkinson Hyperlegible Next et Mono aux signes du site, en WOFF2 variable (graisses 200 à 800).

Les deux polices n'ont ni le signe micro (U+00B5, « µg/L ») ni l'espace fine insécable (U+202F, séparateur de
milliers de Intl fr-FR) : on les rattache aux glyphes existants de la lettre grecque mu (U+03BC) et de l'espace fine
(U+2009). La licence OFL le permet (aucun nom de police réservé). Les flèches (→ ↗ ←) n'existent pas dans le dessin :
elles restent à la police de secours.
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

UNICODES = ("U+0020-007E,U+00A0-017F,U+0192,U+02C6,U+02DA,U+02DC,U+03BC,U+2009,U+2010-2027,U+2030,U+2039,U+203A,"
            "U+2070-209F,U+20AC,U+2122,U+2212,U+2248,U+2260,U+2264,U+2265,U+FEFF")
ALIAS = {0x00B5: 0x03BC, 0x202F: 0x2009}

for src, dst in (("next.ttf", "next.woff2"), ("mono.ttf", "mono.woff2")):
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.flavor = "woff2"
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    for table in font["cmap"].tables:
        if table.isUnicode():
            for alias, cible in ALIAS.items():
                if cible in table.cmap:
                    table.cmap[alias] = table.cmap[cible]
    font.flavor = "woff2"
    font.save(dst)
    verif = TTFont(dst).getBestCmap()
    manque = [hex(c) for c in (0xB5, 0x202F, 0x2264, 0x2265, 0x20AC, 0x2212, 0x0153) if c not in verif]
    print(dst, "manquants :", manque or "aucun", file=sys.stderr)
