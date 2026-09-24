"""Carte des départements de l'accueil (maquette du 23/09) : contours SVG simplifiés → geo/departements-svg.json.

Porté du script de la maquette (docs/maquette-2026-09-23/extraction/geo_svg.py), à une différence près : les
projections sont calculées en numpy (formules exactes, sans pyproj), Lambert-93 pour la métropole et UTM pour les
DROM, sur l'ellipsoïde GRS80 de leurs systèmes officiels.

- Topologie : les frontières partagées sont découpées en arcs (à la TopoJSON) et simplifiées UNE fois
  (Douglas–Peucker) : deux départements voisins gardent exactement la même frontière.
- Contrôle : aucune intersection entre segments non adjacents, vérifiée sur les coordonnées ARRONDIES écrites
  dans le fichier ; tolérance réduite localement tant qu'il en reste.
- Point d'étiquette : pôle d'inaccessibilité (« polylabel ») du plus grand polygone.

Entrée : geo/departements.json (écrit par `robinet geo`). Sortie : geo/departements-svg.json, un viewBox 1000 × 1000
pour la métropole et une boîte 200 × 200 par département d'outre-mer.
"""
from __future__ import annotations

import heapq
import json
import math
from pathlib import Path

import numpy as np

from . import config as C

EPS_METRO = 0.9       # tolérance Douglas–Peucker, unités du viewBox 1000
EPS_DROM = 0.55       # tolérance Douglas–Peucker, unités du viewBox 200
MIN_ILE_METRO = 2.5   # aire mini (unités²) d'une île secondaire gardée : ≈ 0,9 px² à 600 px de large
MIN_ILE_DROM = 1.5
DEC = 1               # décimales écrites

# GRS80, ellipsoïde de RGF93 (Lambert-93) et des systèmes des DROM (RGAF09, RGFG95, RGR92, RGM04)
A_GRS80 = 6378137.0
F_GRS80 = 1 / 298.257222101
E_GRS80 = math.sqrt(F_GRS80 * (2 - F_GRS80))

# Zone UTM officielle de chaque DROM : (zone, hémisphère sud) et code EPSG
DROM_UTM = {"971": (20, False), "972": (20, False), "973": (22, False), "974": (40, True), "976": (38, True)}
EPSG_DROM = {"971": 5490, "972": 5490, "973": 2972, "974": 2975, "976": 4471}


def lambert93(lon, lat):
    """Lambert-93 (EPSG:2154) : conique conforme sécante à 44° et 49° N, origine 3° E et 46° 30′ N placée en
    (700 000, 6 600 000) m, sur GRS80. Degrés en entrée, mètres en sortie."""
    e = E_GRS80

    def m(phi):
        return np.cos(phi) / np.sqrt(1 - (e * np.sin(phi)) ** 2)

    def t(phi):
        return np.tan(np.pi / 4 - phi / 2) / ((1 - e * np.sin(phi)) / (1 + e * np.sin(phi))) ** (e / 2)

    phi1, phi2, phi0, lam0 = (math.radians(v) for v in (44.0, 49.0, 46.5, 3.0))
    n = (math.log(m(phi1)) - math.log(m(phi2))) / (math.log(t(phi1)) - math.log(t(phi2)))
    f = m(phi1) / (n * t(phi1) ** n)
    rho0 = A_GRS80 * f * t(phi0) ** n
    rho = A_GRS80 * f * t(np.radians(lat)) ** n
    theta = n * (np.radians(lon) - lam0)
    return 700000 + rho * np.sin(theta), 6600000 + rho0 - rho * np.cos(theta)


def utm(lon, lat, zone: int, sud: bool):
    """Mercator transverse universelle sur GRS80, série de Krüger à l'ordre 6 (Karney, 2011) : précision
    millimétrique dans la zone. Degrés en entrée, mètres en sortie."""
    n = F_GRS80 / (2 - F_GRS80)
    a_rect = A_GRS80 / (1 + n) * (1 + n ** 2 / 4 + n ** 4 / 64 + n ** 6 / 256)
    alpha = [
        n / 2 - 2 * n ** 2 / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180 - 127 * n ** 5 / 288 + 7891 * n ** 6 / 37800,
        13 * n ** 2 / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440 + 281 * n ** 5 / 630 - 1983433 * n ** 6 / 1935360,
        61 * n ** 3 / 240 - 103 * n ** 4 / 140 + 15061 * n ** 5 / 26880 + 167603 * n ** 6 / 181440,
        49561 * n ** 4 / 161280 - 179 * n ** 5 / 168 + 6601661 * n ** 6 / 7257600,
        34729 * n ** 5 / 80640 - 3418889 * n ** 6 / 1995840,
        212378941 * n ** 6 / 319334400,
    ]
    e = E_GRS80
    phi = np.radians(lat)
    lam = np.radians(lon) - math.radians(-183 + 6 * zone)
    t = np.sinh(np.arctanh(np.sin(phi)) - e * np.arctanh(e * np.sin(phi)))
    xi_p = np.arctan2(t, np.cos(lam))
    eta_p = np.arctanh(np.sin(lam) / np.sqrt(1 + t * t))
    xi, eta = xi_p, eta_p
    for j, a_j in enumerate(alpha, start=1):
        xi = xi + a_j * np.sin(2 * j * xi_p) * np.cosh(2 * j * eta_p)
        eta = eta + a_j * np.cos(2 * j * xi_p) * np.sinh(2 * j * eta_p)
    return 500000 + 0.9996 * a_rect * eta, (10000000 if sud else 0) + 0.9996 * a_rect * xi


# ------------------------------------------------------------------ algorithme de la maquette, repris tel quel
def polys_of(f):
    c = f["geometry"]["coordinates"]
    return [c] if f["geometry"]["type"] == "Polygon" else c


def clean_ring(r):
    pts = [tuple(p) for p in r]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    out = []
    for p in pts:
        if not out or out[-1] != p:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


# ------------------------------------------------------------------ topologie (arcs partagés)
def build_arcs(features):
    rings = []  # (code, poly_idx, ring_idx, pts)
    for f in features:
        for pi, poly in enumerate(polys_of(f)):
            for ri, r in enumerate(poly):
                pts = clean_ring(r)
                if len(pts) >= 3:
                    rings.append((f["properties"]["code"], pi, ri, pts))
    neigh: dict = {}
    for _, _, _, pts in rings:
        n = len(pts)
        for i, v in enumerate(pts):
            pair = frozenset((pts[i - 1], pts[(i + 1) % n]))
            neigh.setdefault(v, set()).add(pair)
    junction = {v for v, s in neigh.items() if len(s) > 1}

    arcs: list[list] = []
    index: dict = {}

    def add_arc(seq):
        k, rk = tuple(seq), tuple(reversed(seq))
        if k in index:
            return (index[k], False)
        if rk in index:
            return (index[rk], True)
        index[k] = len(arcs)
        arcs.append(list(seq))
        return (index[k], False)

    ring_refs = []
    for code, pi, ri, pts in rings:
        js = [i for i, v in enumerate(pts) if v in junction]
        if not js:
            # anneau sans jonction : forme canonique (départ au plus petit sommet, sens le plus petit)
            m = min(range(len(pts)), key=lambda i: pts[i])
            fwd = pts[m:] + pts[:m]
            bwd = [fwd[0]] + list(reversed(fwd[1:]))
            if tuple(bwd) < tuple(fwd):
                ref = add_arc(bwd + [bwd[0]])
                refs = [(ref[0], not ref[1])]
            else:
                refs = [add_arc(fwd + [fwd[0]])]
        else:
            k = js[0]
            rot = pts[k:] + pts[:k]
            refs, cur = [], [rot[0]]
            for v in rot[1:]:
                cur.append(v)
                if v in junction:
                    refs.append(add_arc(cur))
                    cur = [v]
            cur.append(rot[0])
            refs.append(add_arc(cur))
        ring_refs.append((code, pi, ri, refs))
    return arcs, ring_refs


# ------------------------------------------------------------------ Douglas–Peucker
def dp(pts: np.ndarray, eps: float) -> np.ndarray:
    n = len(pts)
    if n <= 2:
        return pts
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        seg = pts[a + 1:b]
        d = q - p
        L = float(d @ d)
        if L == 0:
            dist = np.hypot(*(seg - p).T)
        else:
            t = np.clip(((seg - p) @ d) / L, 0, 1)
            proj = p + np.outer(t, d)
            dist = np.hypot(*(seg - proj).T)
        i = int(np.argmax(dist))
        if dist[i] > eps:
            m = a + 1 + i
            keep[m] = True
            stack.append((a, m))
            stack.append((m, b))
    return pts[keep]


# ------------------------------------------------------------------ intersections de segments
def orient(ax, ay, bx, by, cx, cy):
    return np.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))


def find_crossings(arc_pts: list[np.ndarray], cell=8.0):
    """Paires (arc_i, arc_j) dont deux segments non adjacents se coupent."""
    segs, owner = [], []
    for ai, p in enumerate(arc_pts):
        if len(p) < 2:
            continue
        s = np.hstack([p[:-1], p[1:]])
        segs.append(s)
        owner.append(np.full(len(s), ai))
    S = np.vstack(segs)
    O = np.concatenate(owner)
    grid: dict = {}
    x0 = np.minimum(S[:, 0], S[:, 2]); x1 = np.maximum(S[:, 0], S[:, 2])
    y0 = np.minimum(S[:, 1], S[:, 3]); y1 = np.maximum(S[:, 1], S[:, 3])
    for k in range(len(S)):
        for gx in range(int(x0[k] // cell), int(x1[k] // cell) + 1):
            for gy in range(int(y0[k] // cell), int(y1[k] // cell) + 1):
                grid.setdefault((gx, gy), []).append(k)
    bad = set()
    seen = set()
    for ids in grid.values():
        if len(ids) < 2:
            continue
        ids = np.array(ids)
        A = S[ids]
        n = len(ids)
        I, Jx = np.triu_indices(n, 1)
        a, b = A[I], A[Jx]
        # segments qui partagent une extrémité : adjacents, ignorés
        share = (
            ((a[:, 0] == b[:, 0]) & (a[:, 1] == b[:, 1])) | ((a[:, 0] == b[:, 2]) & (a[:, 1] == b[:, 3]))
            | ((a[:, 2] == b[:, 0]) & (a[:, 3] == b[:, 1])) | ((a[:, 2] == b[:, 2]) & (a[:, 3] == b[:, 3]))
        )
        o1 = orient(a[:, 0], a[:, 1], a[:, 2], a[:, 3], b[:, 0], b[:, 1])
        o2 = orient(a[:, 0], a[:, 1], a[:, 2], a[:, 3], b[:, 2], b[:, 3])
        o3 = orient(b[:, 0], b[:, 1], b[:, 2], b[:, 3], a[:, 0], a[:, 1])
        o4 = orient(b[:, 0], b[:, 1], b[:, 2], b[:, 3], a[:, 2], a[:, 3])
        proper = (o1 * o2 < 0) & (o3 * o4 < 0)
        # contact / chevauchement colinéaire (sommet posé sur un segment)
        touch = ((o1 == 0) | (o2 == 0) | (o3 == 0) | (o4 == 0)) & (o1 * o2 <= 0) & (o3 * o4 <= 0)
        bbox = (np.maximum(np.minimum(a[:, 0], a[:, 2]), np.minimum(b[:, 0], b[:, 2])) <= np.minimum(np.maximum(a[:, 0], a[:, 2]), np.maximum(b[:, 0], b[:, 2]))) & (
            np.maximum(np.minimum(a[:, 1], a[:, 3]), np.minimum(b[:, 1], b[:, 3])) <= np.minimum(np.maximum(a[:, 1], a[:, 3]), np.maximum(b[:, 1], b[:, 3])))
        hit = (~share) & (proper | (touch & bbox))
        for k in np.nonzero(hit)[0]:
            si, sj = ids[I[k]], ids[Jx[k]]
            key = (min(si, sj), max(si, sj))
            if key in seen:
                continue
            seen.add(key)
            bad.add((int(O[si]), int(O[sj])))
    return bad



def cut_loops(s: np.ndarray, max_area: float = 15.0) -> np.ndarray:
    """Supprime les petites boucles d'une polyligne qui se recoupe (goulet ou aber plus étroit que l'arrondi)."""
    closed = len(s) > 3 and (s[0] == s[-1]).all()
    for _ in range(50):
        n = len(s)
        if n < 5:
            return s
        A = np.hstack([s[:-1], s[1:]])
        I, Jx = np.triu_indices(len(A), 2)
        if closed:
            m = ~((I == 0) & (Jx == len(A) - 1))
            I, Jx = I[m], Jx[m]
        a, b = A[I], A[Jx]
        o1 = orient(a[:, 0], a[:, 1], a[:, 2], a[:, 3], b[:, 0], b[:, 1])
        o2 = orient(a[:, 0], a[:, 1], a[:, 2], a[:, 3], b[:, 2], b[:, 3])
        o3 = orient(b[:, 0], b[:, 1], b[:, 2], b[:, 3], a[:, 0], a[:, 1])
        o4 = orient(b[:, 0], b[:, 1], b[:, 2], b[:, 3], a[:, 2], a[:, 3])
        hit = (o1 * o2 <= 0) & (o3 * o4 <= 0) & ~((o1 == 0) & (o2 == 0))
        bbox = (np.maximum(np.minimum(a[:, 0], a[:, 2]), np.minimum(b[:, 0], b[:, 2])) <= np.minimum(np.maximum(a[:, 0], a[:, 2]), np.maximum(b[:, 0], b[:, 2]))) & (
            np.maximum(np.minimum(a[:, 1], a[:, 3]), np.minimum(b[:, 1], b[:, 3])) <= np.minimum(np.maximum(a[:, 1], a[:, 3]), np.maximum(b[:, 1], b[:, 3])))
        idx = np.nonzero(hit & bbox)[0]
        if not len(idx):
            return s
        k = idx[np.argmin(Jx[idx] - I[idx])]
        i, j = int(I[k]), int(Jx[k])
        p1, p2, p3, p4 = s[i], s[i + 1], s[j], s[j + 1]
        d1, d2 = p2 - p1, p4 - p3
        den = d1[0] * d2[1] - d1[1] * d2[0]
        if den == 0:
            X = p3.copy()
        else:
            t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den
            X = np.round(p1 + t * d1, DEC)
        loop = np.vstack([X, s[i + 1:j + 1]])
        if abs(area(loop)) > max_area:
            return s
        s = np.vstack([s[:i + 1], X[None, :], s[j + 1:]])
        keep = np.ones(len(s), dtype=bool)
        keep[1:] = np.any(s[1:] != s[:-1], axis=1)
        s = s[keep]
    return s

# ------------------------------------------------------------------ géométrie utilitaire
def area(r: np.ndarray) -> float:
    x, y = r[:, 0], r[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y))


def point_seg_dist2(px, py, r):
    a = r
    b = np.roll(r, -1, axis=0)
    d = b - a
    L = (d ** 2).sum(1)
    L[L == 0] = 1e-12
    t = np.clip(((px - a[:, 0]) * d[:, 0] + (py - a[:, 1]) * d[:, 1]) / L, 0, 1)
    qx = a[:, 0] + t * d[:, 0]
    qy = a[:, 1] + t * d[:, 1]
    return float(((px - qx) ** 2 + (py - qy) ** 2).min())


def inside(px, py, r):
    x, y = r[:, 0], r[:, 1]
    x2, y2 = np.roll(x, -1), np.roll(y, -1)
    cond = ((y > py) != (y2 > py)) & (px < (x2 - x) * (py - y) / np.where(y2 - y == 0, 1e-12, y2 - y) + x)
    return bool(np.count_nonzero(cond) % 2)


def signed_dist(px, py, rings):
    ins = False
    d2 = math.inf
    for r in rings:
        if inside(px, py, r):
            ins = not ins
        d2 = min(d2, point_seg_dist2(px, py, r))
    return (1 if ins else -1) * math.sqrt(d2)


def polylabel(rings, precision=0.5):
    outer = rings[0]
    minx, miny = outer.min(0)
    maxx, maxy = outer.max(0)
    w, h = maxx - minx, maxy - miny
    size = min(w, h)
    if size == 0:
        return float(minx), float(miny)
    hcell = size / 2
    heap = []
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            cx, cy = x + hcell, y + hcell
            d = signed_dist(cx, cy, rings)
            heapq.heappush(heap, (-(d + hcell * math.sqrt(2)), d, cx, cy, hcell))
            y += size
        x += size
    # meilleur départ : centroïde
    a = area(outer)
    xs, ys = outer[:, 0], outer[:, 1]
    xs2, ys2 = np.roll(xs, -1), np.roll(ys, -1)
    f = xs * ys2 - xs2 * ys
    ccx = float(((xs + xs2) * f).sum() / (6 * a)) if a else float(xs.mean())
    ccy = float(((ys + ys2) * f).sum() / (6 * a)) if a else float(ys.mean())
    best = (signed_dist(ccx, ccy, rings), ccx, ccy)
    bb = (signed_dist(minx + w / 2, miny + h / 2, rings), minx + w / 2, miny + h / 2)
    if bb[0] > best[0]:
        best = bb
    while heap:
        _, d, cx, cy, hc = heapq.heappop(heap)
        if d > best[0]:
            best = (d, cx, cy)
        if d + hc * math.sqrt(2) - best[0] <= precision:
            continue
        hc /= 2
        for dx, dy in ((-hc, -hc), (hc, -hc), (-hc, hc), (hc, hc)):
            nx, ny = cx + dx, cy + dy
            nd = signed_dist(nx, ny, rings)
            heapq.heappush(heap, (-(nd + hc * math.sqrt(2)), nd, nx, ny, hc))
    return best[1], best[2]


# ------------------------------------------------------------------ pipeline d'un ensemble de contours
def fmt_rel(r: np.ndarray) -> str:
    """Anneau en commandes relatives : « M x y l dx dy … z », coordonnées au dixième (entiers ×10, sans cumul d'erreur)."""
    q = np.round(r * 10 ** DEC).astype(np.int64)

    def num(v):
        s = f"{v / 10 ** DEC:.{DEC}f}".rstrip("0").rstrip(".") if DEC else str(v)
        if s.startswith("0."):
            s = s[1:]
        elif s.startswith("-0."):
            s = "-" + s[2:]
        return s if s not in ("", "-") else "0"

    out = [f"M{num(q[0, 0])} {num(q[0, 1])}l"]
    prev = q[0]
    first = True
    for p in q[1:]:
        dx, dy = p - prev
        a, b = num(int(dx)), num(int(dy))
        sep = "" if first else ("" if a.startswith("-") else " ")
        out.append(f"{sep}{a}{'' if b.startswith('-') else ' '}{b}")
        prev = p
        first = False
    out.append("z")
    return "".join(out)


def process(features, to_xy, eps0, min_ile, label):
    arcs, ring_refs = build_arcs(features)
    arcs_xy = [np.array([to_xy(p) for p in a]) for a in arcs]

    def ring_orig(refs):
        pts = []
        for ai, rev in refs:
            a = arcs_xy[ai][::-1] if rev else arcs_xy[ai]
            pts.extend(a[:-1].tolist())
        return np.array(pts)

    # polygones secondaires et trous trop petits : écartés AVANT la simplification (et leurs arcs propres)
    outer_area = {}
    for code, pi, ri, refs in ring_refs:
        if ri == 0:
            outer_area[(code, pi)] = abs(area(ring_orig(refs)))
    main = {}
    for (code, pi), a in outer_area.items():
        if code not in main or a > outer_area[(code, main[code])]:
            main[code] = pi
    active_rings, dropped = [], {}
    for code, pi, ri, refs in ring_refs:
        a = abs(area(ring_orig(refs)))
        if pi != main[code] and outer_area[(code, pi)] < min_ile:
            if ri == 0:
                dropped[code] = dropped.get(code, 0) + 1
            continue
        if ri > 0 and a < min_ile / 2:
            dropped[f"{code} (trou)"] = dropped.get(f"{code} (trou)", 0) + 1
            continue
        active_rings.append((code, pi, ri, refs, a))
    active_arcs = sorted({ai for *_, refs, _a in active_rings for ai, _ in refs})
    eps = {i: eps0 for i in active_arcs}

    def simplify(i, e):
        s = dp(arcs_xy[i], e)
        s = np.round(s, DEC)
        keep = np.ones(len(s), dtype=bool)
        keep[1:] = np.any(s[1:] != s[:-1], axis=1)
        s = s[keep]
        # pointes (aller-retour sur place) créées par l'arrondi
        changed = True
        while changed and len(s) > 3:
            changed = False
            a, b, c = s[:-2], s[1:-1], s[2:]
            cross = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
            dot = (b[:, 0] - a[:, 0]) * (c[:, 0] - b[:, 0]) + (b[:, 1] - a[:, 1]) * (c[:, 1] - b[:, 1])
            spike = (cross == 0) & (dot <= 0)
            if spike.any():
                k = int(np.nonzero(spike)[0][0]) + 1
                s = np.delete(s, k, axis=0)
                changed = True
        return cut_loops(s)

    simp = {i: simplify(i, eps[i]) for i in active_arcs}

    def ring_xy(refs):
        pts = []
        for ai, rev in refs:
            a = simp[ai][::-1] if rev else simp[ai]
            pts.extend(a[:-1].tolist())
        return np.array(pts)

    def crossings():
        lst = [simp[i] for i in active_arcs]
        bad = find_crossings(lst)
        return {(active_arcs[i], active_arcs[j]) for i, j in bad}

    def degenerate():
        out = set()
        for code, pi, ri, refs, ao in active_rings:
            r = ring_xy(refs)
            if len(r) < 3 or abs(area(r)) < 0.5 * ao:
                out.update(ai for ai, _ in refs)
        return out

    candidates = lambda e0: [e0 / 2, e0 / 4, max(0.1, e0 / 8), e0 * 1.5, e0 * 2.5, e0 * 4]
    for it in range(12):
        bad = crossings()
        degen = degenerate()
        if not bad and not degen:
            break
        todo = sorted({i for pair in bad for i in pair} | degen)
        for i in todo:
            base = len(crossings())
            best = (base, eps[i], simp[i])
            for e in candidates(eps0):
                simp[i] = simplify(i, e)
                n = len(crossings())
                if n < best[0] or (n == best[0] and i in degen and e < best[1]):
                    best = (n, e, simp[i])
                if n == 0:
                    break
            eps[i], simp[i] = best[1], best[2]
    final_bad = crossings()

    by_dept: dict = {}
    for code, pi, ri, refs, ao in active_rings:
        by_dept.setdefault(code, {}).setdefault(pi, {})[ri] = ring_xy(refs)
    out = {}
    for f in features:
        code = f["properties"]["code"]
        polys = by_dept[code]
        parts, kept = [], {}
        for pi in sorted(polys):
            rs = polys[pi]
            rings_out = []
            for ri in sorted(rs):
                r = rs[ri]
                if len(r) < 3:
                    continue
                a = area(r)
                if (ri == 0 and a < 0) or (ri > 0 and a > 0):
                    r = r[::-1]
                rings_out.append(r)
                parts.append(fmt_rel(r))
            kept[pi] = rings_out
        cx, cy = polylabel(kept[main[code]], precision=0.25)
        out[code] = {"d": "".join(parts), "cx": round(cx, 1), "cy": round(cy, 1), "rings_abs": kept}
    stats = {"arcs_actifs": len(active_arcs), "points_source": int(sum(len(arcs_xy[i]) for i in active_arcs)),
             "points_simplifies": int(sum(len(simp[i]) for i in active_arcs)), "croisements_restants": len(final_bad),
             "croisements_detail": sorted(final_bad), "iles_ou_trous_ecartes": dropped,
             "tolerances_modifiees": {str(i): eps[i] for i in active_arcs if eps[i] != eps0}}
    return out, stats


# ------------------------------------------------------------------ projection, document, commande
def _ajuste(pts: np.ndarray, projette, cote: float, marge: float):
    """Projection mise à l'échelle dans une boîte cote × cote (marge comprise), centrée, y vers le bas."""
    X, Y = projette(pts[:, 0], pts[:, 1])
    minx, maxx, miny, maxy = X.min(), X.max(), Y.min(), Y.max()
    k = (cote - 2 * marge) / max(maxx - minx, maxy - miny)
    ox, oy = (cote - k * (maxx - minx)) / 2, (cote - k * (maxy - miny)) / 2
    cache: dict = {}

    def to_xy(p):
        if p not in cache:
            x, y = projette(np.array([p[0]]), np.array([p[1]]))
            cache[p] = (ox + k * (float(x[0]) - minx), oy + k * (maxy - float(y[0])))
        return cache[p]

    return to_xy, k


def construire(contours: dict) -> tuple[dict, dict]:
    """Document departements-svg.json et statistiques de simplification, depuis les contours GeoJSON."""
    metro = [f for f in contours["features"] if not str(f["properties"]["code"]).startswith("97")]
    drom = [f for f in contours["features"] if str(f["properties"]["code"]).startswith("97")]

    # métropole : Lambert-93, ajustée dans 1000 × 1000 (marge 10), centrée
    tous = np.array([p for f in metro for poly in polys_of(f) for r in poly for p in r])
    to_xy, k = _ajuste(tous, lambert93, 1000, 10.0)
    res, stats = process(metro, to_xy, EPS_METRO, MIN_ILE_METRO, "métropole")
    deps = []
    for f in sorted(metro, key=lambda f: f["properties"]["code"]):
        c = f["properties"]["code"]
        deps.append({"code": c, "nom": f["properties"]["nom"], "d": res[c]["d"], "cx": res[c]["cx"], "cy": res[c]["cy"]})

    # DROM : chacun dans sa propre boîte 200 × 200, projection UTM officielle, marge 6
    outre, drom_stats = [], {}
    for f in sorted(drom, key=lambda f: f["properties"]["code"]):
        c = f["properties"]["code"]
        zone, sud = DROM_UTM[c]
        pts = np.array([p for poly in polys_of(f) for r in poly for p in r])
        to_xy_d, kk = _ajuste(pts, lambda lon, lat, zone=zone, sud=sud: utm(lon, lat, zone, sud), 200, 6.0)
        r, st = process([f], to_xy_d, EPS_DROM, MIN_ILE_DROM, c)
        drom_stats[c] = st
        outre.append({"code": c, "nom": f["properties"]["nom"], "viewBox": "0 0 200 200", "d": r[c]["d"], "cx": r[c]["cx"],
                      "cy": r[c]["cy"], "km_par_unite": round(1 / kk / 1000, 3),
                      "projection": f"EPSG:{EPSG_DROM[c]} (UTM {zone}{'S' if sud else 'N'})"})

    doc = {
        "viewBox": "0 0 1000 1000",
        "projection": "Lambert-93 (EPSG:2154, conique conforme, GRS80), calculée en numpy ; y vers le bas ; ajusté dans 1000 × 1000 avec 10 unités de marge, centré",
        "km_par_unite": round(1 / k / 1000, 4),
        "source": "geo/departements.json (Etalab / IGN Admin Express, déjà simplifié par le pipeline)",
        "simplification": f"Douglas–Peucker par arc partagé (frontières communes identiques des deux côtés), tolérance {EPS_METRO} unité (réduite localement si croisement) ; îles secondaires < {MIN_ILE_METRO} unité² écartées ; coordonnées à {DEC} décimale",
        "rendu": "fill-rule nonzero ou evenodd : les trous (enclaves) sont en sens inverse de l'extérieur ; stroke-linejoin round conseillé",
        "departements": deps,
        "outre_mer": outre,
    }
    return doc, {"metro": stats, "drom": drom_stats}


def run() -> Path:
    src = C.WEB_DATA / "geo" / "departements.json"
    if not src.exists():
        raise RuntimeError("geo/departements.json absent : lancer `robinet geo`")
    doc, stats = construire(json.loads(src.read_text(encoding="utf-8")))
    out = C.WEB_DATA / "geo" / "departements-svg.json"
    txt = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    out.write_text(txt, encoding="utf-8")
    m = stats["metro"]
    restants = m["croisements_restants"] + sum(s["croisements_restants"] for s in stats["drom"].values())
    print(f"  → {out.relative_to(C.ROOT).as_posix()} ({len(txt.encode('utf-8')) / 1e3:.0f} ko) : {len(doc['departements'])} départements"
          f" et {len(doc['outre_mer'])} DROM, {m['points_simplifies']} points sur {m['points_source']}, {restants} croisement(s) restant(s)")
    return out
