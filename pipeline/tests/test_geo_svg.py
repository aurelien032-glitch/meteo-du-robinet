"""Contours SVG de la carte de l'accueil : projections, frontières partagées, simplification, format des tracés."""
import numpy as np
import pytest

from robinet.geo_svg import area, build_arcs, construire, dp, find_crossings, fmt_rel, inside, lambert93, polylabel, utm


def test_lambert93_origine_et_symetrie_autour_du_meridien_central():
    x, y = lambert93(3.0, 46.5)
    assert (float(x), float(y)) == pytest.approx((700000.0, 6600000.0), abs=1e-6)
    xe, ye = lambert93(5.0, 47.0)
    xo, yo = lambert93(1.0, 47.0)
    assert float(xe) - 700000 == pytest.approx(700000 - float(xo), abs=1e-6)
    assert float(ye) == pytest.approx(float(yo), abs=1e-6)
    # le nord est vers le haut, l'est vers la droite
    assert lambert93(3.0, 48.0)[1] > y and lambert93(4.0, 46.5)[0] > x


def test_utm_meridien_central_equateur_et_faux_nord_de_l_hemisphere_sud():
    x, y = utm(-63.0, 0.0, 20, False)
    assert (float(x), float(y)) == pytest.approx((500000.0, 0.0), abs=1e-6)
    x, y = utm(57.0, 0.0, 40, True)
    assert (float(x), float(y)) == pytest.approx((500000.0, 10000000.0), abs=1e-6)
    # un degré de latitude sur le méridien central vaut 0,9996 × 110,6 km environ
    assert float(utm(-63.0, 1.0, 20, False)[1]) == pytest.approx(0.9996 * 110574, rel=1e-3)


def test_douglas_peucker_garde_les_extremites_et_efface_une_bosse_plus_petite_que_la_tolerance():
    ligne = np.array([[0.0, 0.0], [5.0, 0.3], [10.0, 0.0], [15.0, 4.0], [20.0, 0.0]])
    assert dp(ligne, 1.0).tolist() == [[0.0, 0.0], [10.0, 0.0], [15.0, 4.0], [20.0, 0.0]]


def _carre(x0, code):
    return {"properties": {"code": code, "nom": code}, "geometry": {"type": "Polygon", "coordinates": [
        [[x0, 0], [x0 + 1, 0], [x0 + 1, 1], [x0, 1], [x0, 0]]]}}


def test_deux_voisins_partagent_un_seul_arc_pour_leur_frontiere():
    arcs, refs = build_arcs([_carre(0, "A"), _carre(1, "B")])
    arcs_a = {ai for ai, _ in refs[0][3]}
    arcs_b = {ai for ai, _ in refs[1][3]}
    commun = arcs_a & arcs_b
    assert len(commun) == 1
    assert {tuple(p) for p in arcs[commun.pop()]} == {(1, 0), (1, 1)}


def test_trace_relatif_au_dixieme_et_etiquette_a_l_interieur():
    carre = np.array([[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]])
    assert fmt_rel(carre) == "M0 0l10 0 0 10-10 0z"
    assert area(carre) == 100
    cx, cy = polylabel([carre])
    assert inside(cx, cy, carre) and (cx, cy) == pytest.approx((5.0, 5.0), abs=0.5)


def test_croisement_detecte_entre_segments_non_adjacents():
    a = np.array([[0.0, 0.0], [10.0, 10.0]])
    b = np.array([[0.0, 10.0], [10.0, 0.0]])
    c = np.array([[20.0, 0.0], [30.0, 0.0]])
    assert find_crossings([a, b, c]) == {(0, 1)}


def test_construire_deux_departements_voisins_et_un_drom():
    contours = {"features": [
        {"properties": {"code": "35", "nom": "Ille-et-Vilaine"}, "geometry": {"type": "Polygon", "coordinates": [
            [[-2.0, 47.6], [-1.0, 47.6], [-1.0, 48.6], [-2.0, 48.6], [-2.0, 47.6]]]}},
        {"properties": {"code": "53", "nom": "Mayenne"}, "geometry": {"type": "Polygon", "coordinates": [
            [[-1.0, 47.6], [-0.2, 47.6], [-0.2, 48.6], [-1.0, 48.6], [-1.0, 47.6]]]}},
        {"properties": {"code": "974", "nom": "La Réunion"}, "geometry": {"type": "Polygon", "coordinates": [
            [[55.2, -21.4], [55.8, -21.4], [55.8, -20.9], [55.2, -20.9], [55.2, -21.4]]]}},
    ]}
    doc, stats = construire(contours)
    assert [d["code"] for d in doc["departements"]] == ["35", "53"]
    assert [d["code"] for d in doc["outre_mer"]] == ["974"]
    assert stats["metro"]["croisements_restants"] == 0
    assert doc["outre_mer"][0]["projection"] == "EPSG:2975 (UTM 40S)"
    for d in doc["departements"] + doc["outre_mer"]:
        assert d["d"].startswith("M") and d["d"].endswith("z")
        assert 0 <= d["cx"] <= 1000 and 0 <= d["cy"] <= 1000
    ille, mayenne = doc["departements"]
    assert ille["cx"] < mayenne["cx"]  # l'ouest reste à gauche
