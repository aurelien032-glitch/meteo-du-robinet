"""Pression sur la ressource en eau potable, par département → site (ressource/national.json).

Ce n'est PAS un bilan besoins/ressources au sens des volumes autorisés : ceux-ci figurent dans les arrêtés de
DUP des captages et dans la base des ARS, non publiés en données ouvertes. On rassemble ici ce qui l'est :
- prélèvements d'eau potable (BNPE) : volume, évolution sur cinq ans, part en nappe, part dans une zone de
  répartition des eaux (ZRE, déficit structurel reconnu entre ressource et besoins) ;
- besoins et pertes déclarés par les services (SISPEA) : consommation domestique par habitant, part de l'eau
  mise en distribution perdue en fuites, avancement de la protection des captages (indicateur P108.3) ;
- tension observée : nappes basses (piézométrie) et jours de restriction sécheresse (arrêtés).
Aucun score composite : chaque indicateur est montré pour lui-même, avec sa couverture.
"""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET

import duckdb

from . import config as C
from .build import _dump, _n

GML = "{http://www.opengis.net/gml/3.2}"
SA = "{http://xml.sandre.eaufrance.fr/}"
# ZRE souterraines qui ne visent qu'une nappe profonde ou captive : leur emprise au sol couvre des régions entières
# (l'Albien sous le Bassin parisien), alors qu'un forage peu profond situé dessus n'exploite pas cette nappe. Sans
# le niveau capté de chaque ouvrage, on ne peut pas les attribuer : elles sont exclues (liste documentée).
# Seules les zones qui ne visent QUE de telles nappes sont exclues ; une zone mixte (« nappe de Beauce et du Cénomanien
# et bassin de l'Aigre ») garde sa partie superficielle ou peu profonde.
ZRE_PROFONDES = re.compile(
    r"(syst[èe]me aquif[èe]re (de l'|du )?)?(albien( et du n[ée]ocomien)?|c[ée]nomanien)|partie captive de la nappe.*", re.I)


def _anneaux(poly) -> list[list[tuple[float, float]]]:
    out = []
    for pl in poly.iter(f"{GML}posList"):
        v = [float(x) for x in pl.text.split()]
        out.append([(v[i + 1], v[i]) for i in range(0, len(v) - 1, 2)])  # GML EPSG:4326 : latitude puis longitude
    return out


def charger_zre() -> list[dict]:
    """Zones de répartition des eaux : nom, type (ZRESup, ZRESout, Mixte), polygones (lon, lat) et emprise."""
    src = C.RAW / "zre" / "zre_fxx.gml"
    if not src.exists():
        raise RuntimeError(f"{src} absent : lancer `robinet download --what zre`")
    zones = []
    for m in ET.parse(src).getroot().iter(f"{SA}ZRE_FXX"):
        nom = (m.findtext(f"{SA}NomZone") or "").strip()
        typ = (m.findtext(f"{SA}TypeZRE") or "").strip()
        polys = []
        for p in m.iter(f"{GML}Polygon"):
            ext = p.find(f"{GML}exterior")
            ints = p.findall(f"{GML}interior")
            polys.append((_anneaux(ext)[0], [a for i in ints for a in _anneaux(i)]))
        if not polys:
            continue
        xs = [x for e, _ in polys for x, _ in e]
        ys = [y for e, _ in polys for _, y in e]
        zones.append({"nom": nom, "type": typ, "polys": polys, "bbox": (min(xs), min(ys), max(xs), max(ys)),
                      "profonde": bool(ZRE_PROFONDES.fullmatch(nom))})
    return zones


def _dans(pt, anneau) -> bool:
    x, y = pt
    dedans = False
    j = len(anneau) - 1
    for i in range(len(anneau)):
        xi, yi = anneau[i]
        xj, yj = anneau[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dedans = not dedans
        j = i
    return dedans


def en_zre(pt: tuple[float, float], milieu: str, zones: list[dict]) -> bool:
    """Un ouvrage est « en ZRE » s'il est dans une zone du même type de ressource (nappe ou cours d'eau), hors ZRE profondes."""
    for z in zones:
        if z["profonde"]:
            continue
        if z["type"] == "ZRESout" and milieu != "SOUT" or z["type"] == "ZRESup" and milieu != "CONT":
            continue
        x0, y0, x1, y1 = z["bbox"]
        if not (x0 <= pt[0] <= x1 and y0 <= pt[1] <= y1):
            continue
        for ext, trous in z["polys"]:
            if _dans(pt, ext) and not any(_dans(pt, t) for t in trous):
                return True
    return False


def evolution_comparable(par_ouvrage: dict, an: int, an_ref: int, ecart_max: float = 0.15):
    """Évolution des prélèvements d'un groupe (département) entre deux périodes de trois ans, si elle est comparable.

    Les volumes sont des moyennes sur trois ans (une année sans déclaration ne compte pas pour zéro). L'évolution n'est
    publiée que si le nombre d'ouvrages déclarants a varié de moins de `ecart_max` : sinon l'arrivée de nouveaux
    déclarants (Mayotte : 13 ouvrages en 2012, 35 en 2023) se lirait comme une hausse des prélèvements. On ne peut pas
    apparier les ouvrages un à un : leurs identifiants ont changé entre les deux périodes dans une partie de la BNPE.
    Renvoie ({groupe: évolution en %}, {groupe: rapport du nombre d'ouvrages récents / anciens}).
    """
    recents, anciens = range(an - 2, an + 1), range(an_ref - 2, an_ref + 1)
    vol: dict = {}
    nb: dict = {}
    for (g, _), parts in par_ouvrage.items():
        for per, annees in (("r", recents), ("a", anciens)):
            for a in annees:
                if parts.get(a):
                    vol[(g, per, a)] = vol.get((g, per, a), 0.0) + parts[a]
                    nb[(g, per, a)] = nb.get((g, per, a), 0) + 1
    evol, ratio = {}, {}
    for g in {k[0] for k in vol}:
        def moy(tab, per, annees):
            vs = [tab[(g, per, a)] for a in annees if (g, per, a) in tab]
            return sum(vs) / len(vs) if vs else None
        vr, va = moy(vol, "r", recents), moy(vol, "a", anciens)
        nr, na = moy(nb, "r", recents), moy(nb, "a", anciens)
        if not (vr and va and nr and na):
            continue
        ratio[g] = _n(nr / na, 2)
        if abs(nr / na - 1) <= ecart_max:
            evol[g] = _n(100 * (vr / va - 1), 1)
    return evol, ratio


def run() -> None:
    from .apis import bnpe_aep, bnpe_ouvrages

    out: dict = {"depts": {}, "national": {}}
    # --- Prélèvements (BNPE) -------------------------------------------------------------------------
    milieu = {o["code_ouvrage"]: o.get("code_type_milieu") for o in bnpe_ouvrages()}
    zones = charger_zre()
    rows = bnpe_aep()
    an_bnpe = max(r["annee"] for r in rows)
    # Cinq ans, pas dix : le nombre d'ouvrages déclarants à la BNPE a crû de 29 % en dix ans (France), ce qui rend une
    # comparaison décennale trompeuse ; sur cinq ans il est stable (+3 %) et 88 départements restent comparables.
    an_ref10 = an_bnpe - 5
    cache_zre: dict[str, bool] = {}
    vol: dict[tuple[str, int], float] = {}
    par_ouvrage: dict[tuple[str, str], dict[int, float]] = {}  # (département, ouvrage) → année → volume
    sout: dict[str, float] = {}
    zre: dict[str, float] = {}
    for r in rows:
        v, dd, a = r.get("volume") or 0.0, r.get("code_departement"), r.get("annee")
        if not dd or not v:
            continue
        vol[(dd, a)] = vol.get((dd, a), 0.0) + v
        par_ouvrage.setdefault((dd, r["code_ouvrage"]), {})[a] = par_ouvrage.get((dd, r["code_ouvrage"]), {}).get(a, 0.0) + v
        if a != an_bnpe:
            continue
        mil = milieu.get(r["code_ouvrage"])
        if mil == "SOUT":
            sout[dd] = sout.get(dd, 0.0) + v
        if r.get("longitude") is not None and r.get("latitude") is not None:
            k = r["code_ouvrage"]
            if k not in cache_zre:
                cache_zre[k] = en_zre((r["longitude"], r["latitude"]), mil or "", zones)
            if cache_zre[k]:
                zre[dd] = zre.get(dd, 0.0) + v
    evol, couv = evolution_comparable(par_ouvrage, an_bnpe, an_ref10)
    for dd in {d for d, _ in vol}:
        v = vol.get((dd, an_bnpe))
        out["depts"].setdefault(dd, {}).update({
            "prel_m3": _n(v, 0), "prel_evol": evol.get(dd), "prel_evol_ouvrages": couv.get(dd),
            "part_nappe": _n(100 * sout.get(dd, 0) / v, 1) if v else None,
            "part_zre": _n(100 * zre.get(dd, 0) / v, 1) if v else None,
            "serie_prel": {str(a): _n(vol[(dd, a)], 0) for (d, a) in sorted(vol) if d == dd},
        })
    tot = sum(v for (d, a), v in vol.items() if a == an_bnpe)
    evol_nat, _ = evolution_comparable({("FR", o): s for (_, o), s in par_ouvrage.items()}, an_bnpe, an_ref10)
    out["national"].update({"annee_bnpe": an_bnpe, "annee_bnpe_ref": an_ref10, "prel_m3": _n(tot, 0),
                            "prel_evol": evol_nat.get("FR"),
                            "part_zre": _n(100 * sum(zre.values()) / tot, 1) if tot else None,
                            "part_nappe": _n(100 * sum(sout.values()) / tot, 1) if tot else None,
                            "zre_exclues": sorted({z["nom"] for z in zones if z["profonde"] and z["nom"]}),
                            "n_zre": len(zones)})

    # --- Besoins, pertes, protection (SISPEA, dernier millésime assez déclaré) -------------------------
    nat_sis = json.loads((C.WEB_DATA / "sispea" / "national.json").read_text(encoding="utf-8"))
    an_sis = max(int(a) for a, v in nat_sis["annees"].items() if (v["prix"].get("n") or 0) >= 3000)
    con = duckdb.connect()
    con.execute(f"CREATE VIEW s AS SELECT * FROM read_parquet('{(C.OUT / 'sispea' / 'services.parquet').as_posix()}') WHERE annee = {an_sis}")
    # Seuls les services qui distribuent (volumes consommés déclarés) : les services de production déclarent aussi une
    # population, et la somme des « habitants desservis » dépasserait la population française.
    sql = """
        SELECT dept,
               sum("D101.0") FILTER (WHERE "VP.063" IS NOT NULL) AS pop_dom,
               sum("VP.063") FILTER (WHERE "VP.063" IS NOT NULL AND "D101.0" IS NOT NULL) AS dom,
               sum("D101.0") FILTER (WHERE "VP.063" IS NOT NULL AND "D101.0" IS NOT NULL) AS pop_dom_ok,
               sum(coalesce("VP.059", 0) + coalesce("VP.060", 0) - coalesce("VP.061", 0))
                   FILTER (WHERE "VP.063" IS NOT NULL AND "VP.201" IS NOT NULL) AS distrib,
               sum("VP.063" + "VP.201" + coalesce("VP.220", 0) + coalesce("VP.221", 0))
                   FILTER (WHERE "VP.063" IS NOT NULL AND "VP.201" IS NOT NULL) AS conso,
               sum("P108.3" * "D101.0") FILTER (WHERE "P108.3" IS NOT NULL AND "D101.0" IS NOT NULL)
                   / sum("D101.0") FILTER (WHERE "P108.3" IS NOT NULL AND "D101.0" IS NOT NULL) AS protection,
               avg("P108.3") AS protection_moy
        FROM s WHERE dept IS NOT NULL GROUP BY ROLLUP (dept)"""
    for dd, pop_dom, dom, pop_ok, distrib, conso, prot, prot_moy in con.execute(sql).fetchall():
        d = {
            "conso_l_hab_j": _n(1000 * dom / pop_ok / 365, 0) if dom and pop_ok else None,
            "pertes_pct": _n(100 * (distrib - conso) / distrib, 1) if distrib and conso and distrib > conso else None,
            "pertes_m3": _n(distrib - conso, 0) if distrib and conso and distrib > conso else None,
            "protection": _n(prot, 1), "protection_moy": _n(prot_moy, 1),
        }
        if dd is None:
            out["national"].update(d | {"annee_sispea": an_sis})
        else:
            out["depts"].setdefault(dd, {}).update(d)

    # --- Tension observée : nappes et restrictions ----------------------------------------------------
    nap = json.loads((C.WEB_DATA / "nappes" / "national.json").read_text(encoding="utf-8"))
    ref = nap["mois_ref"]
    douze = nap["mois"][-12:]
    for dd, par_mois in nap["depts"].items():
        c = par_mois.get(ref)
        t = sum(c) if c else 0
        bas12 = [sum(par_mois[m][:3]) / sum(par_mois[m]) for m in douze if m in par_mois and sum(par_mois[m])]
        out["depts"].setdefault(dd, {}).update({
            "nappes_basses": _n(100 * (c[0] + c[1]) / t, 0) if t >= 3 else None,
            "nappes_sous_normale_12m": _n(100 * sum(bas12) / len(bas12), 0) if len(bas12) >= 6 else None,
            "n_piezo": t,
        })
    cn = nap["historique"].get(ref)
    bas12n = [sum(nap["historique"][m][:3]) / sum(nap["historique"][m]) for m in douze if sum(nap["historique"].get(m, [0]))]
    out["national"].update({
        "mois_nappes": ref,
        "nappes_basses": _n(100 * (cn[0] + cn[1]) / sum(cn), 0) if cn and sum(cn) else None,
        "nappes_sous_normale_12m": _n(100 * sum(bas12n) / len(bas12n), 0) if bas12n else None,
    })
    sech = json.loads((C.WEB_DATA / "secheresse" / "historique.json").read_text(encoding="utf-8"))
    an_sech = int(sech["annees"][-1]) - 1  # dernière année complète
    cinq = [str(a) for a in range(an_sech - 4, an_sech + 1)]
    for dd, par_an in sech["depts"].items():
        j = par_an.get(str(an_sech), [0, 0, 0, 0])
        out["depts"].setdefault(dd, {}).update({
            "jours_crise_ar": j[2] + j[3],
            "jours_crise_ar_5ans": _n(sum(par_an.get(a, [0, 0, 0, 0])[2] + par_an.get(a, [0, 0, 0, 0])[3] for a in cinq) / 5, 0),
        })
    out["national"].update({"annee_secheresse": an_sech, "annees_secheresse_5": cinq})
    _dump(C.WEB_DATA / "ressource" / "national.json", out)
    n = out["national"]
    print(f"  ressource : prélèvements AEP {an_bnpe} {n['prel_m3'] / 1e9:.2f} Md m³ ({n['prel_evol']} % sur 5 ans), "
          f"{n['part_zre']} % en ZRE ; SISPEA {an_sis} : {n['conso_l_hab_j']} L/hab/j, pertes {n['pertes_pct']} %, "
          f"protection {n['protection']} % (moyenne simple {n['protection_moy']} %)")
