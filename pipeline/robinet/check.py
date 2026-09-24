"""Garde-fou de vraisemblance : compare les totaux nationaux d'un millésime au précédent.

Un changement de format chez le producteur, un zip tronqué ou une règle de calcul cassée se voient d'abord
dans les totaux. On refuse un écart trop grand plutôt que de publier un chiffre faux.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from . import config as C

SEUIL_COMPTES = 0.15   # écart relatif toléré sur les volumes (prélèvements, communes, analyses)
SEUIL_TAUX = 1.5       # écart absolu toléré en points sur les taux de conformité


@dataclass
class Ecart:
    annee: int
    mesure: str
    avant: float
    apres: float
    ecart: float
    ok: bool

    def __str__(self) -> str:
        flag = "ok " if self.ok else "!! "
        return f"{flag}{self.annee} {self.mesure:<28} {self.avant:>12,.1f} → {self.apres:>12,.1f}  ({self.ecart:+.1%})"


def _rates(a: dict) -> dict[str, float]:
    p = a["plv"]
    out = {"n_plv": p.get("n", 0), "n_communes": a["n_communes"], "n_reseaux": a["n_reseaux"]}
    if p.get("ne_bact"):
        out["conf_bact_%"] = 100 * (1 - p["nc_bact"] / p["ne_bact"])
    if p.get("ne_chim"):
        out["conf_chim_%"] = 100 * (1 - p["nc_chim"] / p["ne_chim"])
    for fam, v in a["fam"].items():
        out[f"analyses_{fam}"] = v["n"]
    return out


def compare(national: dict, partiel: list[int] | None = None) -> list[Ecart]:
    """Écarts entre millésimes complets consécutifs. Les millésimes partiels ne sont pas comparés."""
    partiel = set(partiel or [])
    annees = sorted(int(a) for a in national["annees"] if int(a) not in partiel)
    ecarts: list[Ecart] = []
    for prev, cur in zip(annees, annees[1:]):
        r0, r1 = _rates(national["annees"][str(prev)]), _rates(national["annees"][str(cur)])
        for k in r1:
            if k not in r0 or not r0[k]:
                continue
            if k.endswith("_%"):
                diff = r1[k] - r0[k]
                ecarts.append(Ecart(cur, k, r0[k], r1[k], diff / 100, abs(diff) <= SEUIL_TAUX))
            else:
                rel = (r1[k] - r0[k]) / r0[k]
                # Le nombre d'analyses d'une famille peut exploser légitimement (PFAS : ×9 entre 2024 et 2025
                # avec la nouvelle obligation de recherche) ; seule une chute est suspecte.
                ok = rel >= -SEUIL_COMPTES if k.startswith("analyses_") else abs(rel) <= SEUIL_COMPTES
                ecarts.append(Ecart(cur, k, r0[k], r1[k], rel, ok))
        # Une mesure qui existait l'an dernier et disparaît cette année (dénominateur tombé à zéro, famille
        # absente) ne serait jamais visitée par « for k in r1 » : c'est pourtant le pire cas, un chiffre qui
        # s'efface silencieusement plutôt qu'un chiffre qui varie.
        for k in r0:
            if r0[k] and k not in r1:
                ecarts.append(Ecart(cur, k, r0[k], 0.0, -1.0, False))
    return ecarts


def run(strict: bool = False) -> bool:
    national = json.loads((C.WEB_DATA / "national.json").read_text(encoding="utf-8"))
    meta = json.loads((C.WEB_DATA / "meta.json").read_text(encoding="utf-8"))
    ecarts = compare(national, meta.get("partiel"))
    bad = [e for e in ecarts if not e.ok]
    for e in ecarts:
        if not e.ok or e.mesure in ("n_plv", "n_communes", "conf_bact_%", "conf_chim_%"):
            print("  " + str(e))
    print(f"  {len(ecarts)} comparaisons, {len(bad)} hors tolérance")
    if bad and strict:
        raise SystemExit(1)
    return not bad
