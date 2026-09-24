"""Historique des restrictions sécheresse (arrêtés préfectoraux, jeu « Donnée Sécheresse - VigiEau ») → site.

Chaque arrêté s'applique à des zones d'alerte (eaux superficielles SUP, souterraines SOU, eau potable AEP), chacune
à un niveau : vigilance, alerte, alerte renforcée, crise. Pour chaque département et chaque jour depuis 2012, on
retient le niveau le plus grave en vigueur sur l'une de ses zones. VigiEau ne donne que la situation du jour ;
cet historique permet de dire combien de jours un département a passé en crise, et de comparer les années.

Limites : avant 2012 les arrêtés ne portent pas de niveau ; les zones « eau potable » n'existent que depuis 2024 ;
un département « en crise » peut ne l'être que sur une petite zone.
"""
from __future__ import annotations

import datetime as dt
import json

import pandas as pd

from . import config as C
from .build import _dump

NIVEAUX = ["vigilance", "alerte", "alerte_renforcee", "crise"]
RANG = {n: i + 1 for i, n in enumerate(NIVEAUX)}
DEBUT = dt.date(2012, 1, 1)


def _liste(x) -> list:
    try:
        v = json.loads(x) if isinstance(x, str) else []
        return v if isinstance(v, list) else []
    except ValueError:
        return []


def niveaux_arrete(types: list, niveaux: list) -> tuple[int, int]:
    """(niveau général, niveau eau potable) d'un arrêté : le plus grave de ses zones, toutes puis AEP seules."""
    g = aep = 0
    for t, n in zip(types, niveaux):
        r = RANG.get(n, 0)
        g = max(g, r)
        if t == "AEP":
            aep = max(aep, r)
    return g, aep


def run() -> None:
    src = C.RAW / "secheresse" / "arretes.csv"
    if not src.exists():
        raise RuntimeError(f"{src} absent : lancer `robinet download --what secheresse`")
    df = pd.read_csv(src, dtype=str)
    aujourdhui = dt.date.today()
    n_jours = (aujourdhui - DEBUT).days + 1
    gen: dict[str, list[int]] = {}
    aep: dict[str, list[int]] = {}
    ignores = 0
    for _, r in df.iterrows():
        dep = (r.get("departement") or "").strip()
        g, a = niveaux_arrete(_liste(r.get("zones_alerte.type")), _liste(r.get("zones_alerte.niveau_gravite")))
        if not dep or not g or not isinstance(r.get("date_debut"), str):
            ignores += 1
            continue
        d0 = max(dt.date.fromisoformat(r["date_debut"][:10]), DEBUT)
        d1 = dt.date.fromisoformat(r["date_fin"][:10]) if isinstance(r.get("date_fin"), str) else aujourdhui
        d1 = min(d1, aujourdhui)
        if d1 < d0:
            continue
        i0, i1 = (d0 - DEBUT).days, (d1 - DEBUT).days
        for tab, niv in ((gen, g), (aep, a)):
            if not niv:
                continue
            jours = tab.setdefault(dep, [0] * n_jours)
            for i in range(i0, i1 + 1):
                if jours[i] < niv:
                    jours[i] = niv

    annees = list(range(DEBUT.year, aujourdhui.year + 1))

    def par_annee(jours: list[int]) -> dict[str, list[int]]:
        """Par année : jours passés à chaque niveau (le plus grave du jour), [vigilance, alerte, renforcée, crise]."""
        out = {}
        for a in annees:
            i0 = (dt.date(a, 1, 1) - DEBUT).days
            i1 = min((dt.date(a, 12, 31) - DEBUT).days, n_jours - 1)
            cnt = [0, 0, 0, 0]
            for v in jours[i0: i1 + 1]:
                if v:
                    cnt[v - 1] += 1
            if any(cnt):
                out[str(a)] = cnt
        return out

    out: dict = {"niveaux": NIVEAUX, "annees": [str(a) for a in annees], "maj": aujourdhui.isoformat(),
                 "depts": {d: par_annee(j) for d, j in gen.items()},
                 "depts_aep": {d: par_annee(j) for d, j in aep.items()},
                 "national": {}, "quotidien": {}}
    for a in annees:
        tot = [0, 0, 0, 0]
        en_crise = 0
        for d in out["depts"].values():
            c = d.get(str(a))
            if c:
                tot = [x + y for x, y in zip(tot, c)]
                en_crise += c[3] > 0
        out["national"][str(a)] = {"jours": tot, "depts_crise": en_crise, "depts_touches": sum(1 for d in out["depts"].values() if d.get(str(a)))}
        # Nombre de départements à chaque niveau, jour par jour (courbe de la saison).
        i0 = (dt.date(a, 1, 1) - DEBUT).days
        i1 = min((dt.date(a, 12, 31) - DEBUT).days, n_jours - 1)
        q = []
        for i in range(i0, i1 + 1):
            c = [0, 0, 0, 0]
            for j in gen.values():
                if j[i]:
                    c[j[i] - 1] += 1
            q.append(c)
        out["quotidien"][str(a)] = q
    _dump(C.WEB_DATA / "secheresse" / "historique.json", out)
    print(f"  sécheresse : {len(gen)} départements, {len(df) - ignores} arrêtés avec niveau, {ignores} ignorés (sans niveau)")
