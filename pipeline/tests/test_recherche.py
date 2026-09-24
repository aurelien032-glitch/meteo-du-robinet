"""Index de la recherche unique : ordre des communes, services à jour, dernier état des réseaux, codes en écarts."""
import duckdb

from robinet.recherche import (colonnes, ecarts, index_communes, index_reseaux, index_services, noms_departements, poids,
                               population_communes)


def _parquet(con, path, sql):
    path.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY ({sql}) TO '{path.as_posix()}' (FORMAT PARQUET)")
    return path


def test_poids_ordonne_sans_publier_la_population():
    assert [poids(x) for x in (225081, 46803, 90, 1, 0, None)] == [71, 62, 26, 0, 0, 0]
    assert poids(1000) < poids(1200) < poids(1500)  # un cran vaut environ 19 %


def test_communes_par_code_poids_de_la_derniere_composition(tmp_path):
    con = duckdb.connect()
    comp = _parquet(con, tmp_path / "composition.parquet", """
        SELECT * FROM (VALUES (2024, '35238', 221272.0), (2025, '35238', 225081.0), (2025, '35238', 225081.0),
                              (2025, '35288', 46803.0), (2024, '11309', 90.0)) t(annee, insee, population)""")
    pop = population_communes(con, comp)
    assert pop == {"35238": 225081.0, "35288": 46803.0, "11309": 90.0}
    communes = [{"c": "11309", "n": "Rennes-le-Château", "d": "11"}, {"c": "35288", "n": "Saint-Malo", "d": "35"},
                {"c": "99999", "n": "Sans population", "d": "99"}, {"c": "35238", "n": "Rennes", "d": "35"}]
    assert index_communes(communes, pop) == [
        ["11309", "Rennes-le-Château", 26], ["35238", "Rennes", 71], ["35288", "Saint-Malo", 62], ["99999", "Sans population", 0]]


def test_services_a_jour_seulement_mode_normalise_poids_de_la_derniere_annee_renseignee(tmp_path):
    con = duckdb.connect()
    comp = _parquet(con, tmp_path / "composition.parquet", """
        SELECT * FROM (VALUES
            (2025, '50129', 78000.0, '320874', 'eau potable : AEP-Régie', 'CA DU COTENTIN', 'Régie'),
            (2025, '50615', 3500.0, '90290', 'eau potable : Service Valognes', 'CA DU COTENTIN', 'Delegation'),
            (2025, '35238', 225081.0, '77654', 'eau potable', 'Collectivité Eau du Bassin Rennais (CEBR)', '.'),
            (2025, '97101', 20000.0, '555', 'eau potable', 'Syndicat guadeloupéen', NULL),
            (2022, '50001', 800.0, '11111', 'eau potable', 'Ancien syndicat', 'Régie')
        ) t(annee, insee, population, id_service, nom_service, nom_coll, mode_gestion)""")
    serv = _parquet(con, tmp_path / "services.parquet", """
        SELECT * FROM (VALUES
            (2024, '320874', 'CA DU COTENTIN', 'eau potable : AEP-Régie', '50', 'Regie', 133611.0, NULL),
            (2026, '320874', 'CA DU COTENTIN', 'eau potable : AEP-Régie', '50', 'Régie', NULL, NULL),
            (2025, '77654', 'Collectivité Eau du Bassin Rennais (CEBR)', 'eau potable : 01-Rennes', '35', 'Délégation', 121480.0, NULL),
            (2025, '90290', 'CA DU COTENTIN', 'eau potable : Service Valognes', '50', 'Delegation', NULL, 3544.0),
            (2022, '11111', 'Ancien syndicat', 'eau potable', '50', 'Régie', 900.0, NULL)
        ) t(annee, id_service, nom_coll, nom_service, dept, mode_gestion, "D101.0", pop_desservie)""")
    assert index_services(con, serv, comp) == [
        ["555", "Syndicat guadeloupéen", None, "971", 0, None],
        ["77654", "Collectivité Eau du Bassin Rennais (CEBR)", "01-Rennes", "35", poids(121480), "delegation"],
        ["90290", "CA DU COTENTIN", "Service Valognes", "50", poids(3544), "delegation"],
        ["320874", "CA DU COTENTIN", "AEP-Régie", "50", poids(133611), "regie"],
    ]


def test_reseaux_dernier_nom_et_communes_de_la_derniere_annee(tmp_path):
    con = duckdb.connect()
    for annee, lignes in {
        2024: "('35238', '035004230', 'CEBR_VILLEJEAN'), ('35051', '035004230', 'CEBR_VILLEJEAN'), ('50129', '050000645', 'ASSELINERIE')",
        2025: "('35238', '035004230', 'CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES'), ('35051', '035004230', 'CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES'), "
              "('35024', '035004230', 'CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES'), ('35999', '', 'SANS CODE')",
    }.items():
        _parquet(con, tmp_path / "agg" / str(annee) / "com_udi.parquet",
                 f"SELECT inseecommune, cdreseau, nomreseau, {annee} AS annee FROM (VALUES {lignes}) t(inseecommune, cdreseau, nomreseau)")
    assert index_reseaux(con, (tmp_path / "agg" / "*" / "com_udi.parquet").as_posix()) == [
        ["035004230", "CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES", 3],
        ["050000645", "ASSELINERIE", 1],
    ]


# Même exemple que `relireCodes` dans web/src/lib/recherche.test.ts : ce que l'un écrit, l'autre le relit.
CODES = ["01001", "01002", "01004", "19999", "2A001", "2A004", "2B002", "21001", "97101", "97102", "97102", "555", "77654",
         "320874", "035004230", "050000645", "SANS-CHIFFRE", "X1"]
ECARTS = ["01001", 1, 2, 18995, "2A001", 3, "2B002", "21001", 76100, 1, "97102", "555", "77654", "320874", "035004230",
          14996415, "SANS-CHIFFRE", "X1"]


def test_codes_en_ecarts_code_complet_quand_prefixe_largeur_ou_ordre_changent():
    assert ecarts(CODES) == ECARTS
    assert ecarts([]) == []


def test_colonnes_nommees_codes_en_ecarts():
    assert colonnes([["35238", "Rennes", 71], ["35239", "Retiers", 49]], "cnp") == {
        "c": ["35238", 1], "n": ["Rennes", "Retiers"], "p": [71, 49]}


def test_noms_des_departements_depuis_les_contours():
    contours = {"features": [{"properties": {"code": "35", "nom": "Ille-et-Vilaine"}, "geometry": None},
                             {"properties": {"code": "2A", "nom": "Corse-du-Sud"}, "geometry": None},
                             {"properties": {"code": "971", "nom": "Guadeloupe"}, "geometry": None}]}
    assert noms_departements(contours) == {"35": "Ille-et-Vilaine", "2A": "Corse-du-Sud", "971": "Guadeloupe"}
