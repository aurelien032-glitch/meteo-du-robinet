"""Vue communale de /carte : service de chaque commune, mode de gestion, consommation et fuites service par service."""
import pytest

from robinet.build_sispea import (
    COLONNES_CARTE,
    IND_MAIN,
    VOLUMES_PLAUSIBLES_SQL,
    _mode,
    _texte,
    communes_carte,
    conso_l_hab_j,
    fiches_services,
    pertes_pct,
    service_des_communes,
    services_declares,
    volumes_invraisemblables,
)
from robinet.sispea import _etape, dedoublonner


def _ligne(insee, annee, sid, nom, coll, mode, op=None, pop_com=None, statut=None, **ind):
    """Ligne de service_des_communes : 11 colonnes descriptives, puis IND_MAIN."""
    return [insee, annee, sid, nom, coll, mode, op, None, pop_com, None, statut] + [ind.get(k.replace(".", "_")) for k in IND_MAIN]


def test_mode_et_texte_comme_le_site():
    assert [_mode(m) for m in ("Régie avec prestation de service", "Delegation", "DÉLÉGATION", ".", None)] == ["r", "d", "d", None, None]
    assert _texte(" . ") is None and _texte("") is None and _texte(None) is None
    assert _texte(" SIAEP de la Vallée ") == "SIAEP de la Vallée"


def test_consommation_par_habitant():
    assert conso_l_hab_j(36_500, 1_000) == pytest.approx(100)
    # Volume vendu nul ou population absente : pas de valeur, jamais « 0 L/hab/j ».
    assert conso_l_hab_j(0, 1_000) is None
    assert conso_l_hab_j(36_500, None) is None
    assert conso_l_hab_j(float("nan"), 1_000) is None


def test_pertes_comme_le_departement():
    # 100 produits + 20 importés − 10 exportés = 110 distribués ; 80 + 5 + 2 + 1 = 88 consommés : 20 % perdus.
    assert pertes_pct(100, 20, 10, 80, 5, 2, 1) == pytest.approx(20)
    assert pertes_pct(100, None, None, 80, 20, None, None) is None  # consommation égale à l'eau distribuée
    assert pertes_pct(100, None, None, 0, 0, None, None) is None  # rien de vendu : pas « 100 % de pertes »
    assert pertes_pct(100, None, None, None, 20, None, None) is None  # volumes domestiques non déclarés


def test_un_service_par_commune_et_par_annee():
    rows = [
        _ligne("35238", 2024, "S1", "eau potable : 01-Rennes-St Jacques", "EAU DU BASSIN RENNAIS", "Régie",
               D102_0=2.456, P104_3=87.25, P107_2=0.61, P108_3=80),
        _ligne("35047", 2024, "S1", "eau potable : 01-Rennes-St Jacques", "EAU DU BASSIN RENNAIS", "Régie", D102_0=2.456),
        _ligne("50129", 2024, "S2", "eau potable", ".", "Delegation"),
        _ligne("35080", 2024, "S3", "eau potable : Communauté de Communes Bretagne Romantique",
               "Communauté de Communes Bretagne Romantique (CCBR)", "Délégation"),
        _ligne("01001", 2024, None, None, None, None),
        _ligne("35238", 2023, "S1", "eau potable : 01-Rennes-St Jacques", "EAU DU BASSIN RENNAIS", "Régie", D102_0=2.30),
    ]
    out = communes_carte(rows, {("S1", 2024): (132.4, 12.34)})
    assert sorted(out) == [2023, 2024]
    a = out[2024]
    assert a["communes"] == {"35238": "S1", "35047": "S1", "50129": "S2", "35080": "S3"}  # commune sans service : absente
    # Entité déjà contenue dans le nom de la collectivité : pas répétée.
    assert a["services"]["S3"][:3] == ["Communauté de Communes Bretagne Romantique (CCBR)", None, "d"]
    assert dict(zip(COLONNES_CARTE, a["services"]["S1"])) == {
        "nom": "EAU DU BASSIN RENNAIS", "entite": "01-Rennes-St Jacques", "mode": "r",
        "prix": 2.46, "rend": 87.2, "renouv": 0.61, "protection": 80.0, "conso": 132, "pertes": 12.3}
    # Ni collectivité ni entité renseignées : le service reste, sans nom, sans valeurs.
    assert a["services"]["S2"] == [None, None, "d", None, None, None, None, None, None]
    assert out[2023]["services"]["S1"][COLONNES_CARTE.index("prix")] == 2.3


def test_fiche_service_datee_par_une_seule_declaration():
    """Nom, mode, exploitant et statut de la déclaration des indicateurs, pas de la ligne « En attente de saisie » que
    l'année en cours ouvre pour presque tous les services (relecture du 25/09, la CEBR redevenue « 01-Rennes »)."""
    import duckdb
    con = duckdb.connect()
    ind = ", ".join(f'"{i}" DOUBLE' for i in IND_MAIN)
    con.execute(f"""CREATE TABLE s (id_service VARCHAR, annee INTEGER, nom_service VARCHAR, nom_coll VARCHAR, dept VARCHAR,
                    mode_gestion VARCHAR, nom_operateur VARCHAR, statut VARCHAR, pop DOUBLE, {ind})""")
    cols = 'id_service, annee, nom_service, nom_coll, dept, mode_gestion, nom_operateur, statut, pop, "D102.0", "P104.3"'
    con.executemany(f"INSERT INTO s ({cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        ("77654", 2022, "eau potable : 01-Rennes", "CEBR", "35", "Régie", None, "Publié", 120000, 2.6, 92.0),
        ("77654", 2024, "eau potable : 01-Rennes-St Jacques", "CEBR", "35", "Délégation", ".", "Publié", 121480, 2.72, 93.3),
        ("77654", 2026, "eau potable : 01-Rennes", "CEBR", "35", "Régie", "Veolia", "En attente de saisie", None, None, None),
        ("90290", 2025, "eau potable : Service Valognes", "CA DU COTENTIN", "50", "Delegation", "SAUR", "En cours de saisie",
         3544, None, None),
    ])
    s = services_declares(con)
    assert {k: s["77654"][k] for k in ("nom", "mode", "op", "statut", "pop", "annee_ind")} == {
        "nom": "eau potable : 01-Rennes-St Jacques", "mode": "Délégation", "op": ".", "statut": "Publié", "pop": 121480,
        "annee_ind": 2024}
    assert s["77654"]["ind"] == {"D102.0": 2.72, "P104.3": 93.3}
    # Sans indicateurs déclarés : la dernière déclaration, et pas d'année d'indicateurs.
    assert (s["90290"]["nom"], s["90290"]["op"], s["90290"]["annee_ind"], s["90290"]["ind"]) == (
        "eau potable : Service Valognes", "SAUR", None, {})
    assert list(s) == ["77654", "90290"]  # dans l'ordre des identifiants, le même à chaque exécution


def test_une_declaration_par_service_et_par_annee():
    """Andernos-les-Bains (48139) déclaré deux fois en 2021 : la déclaration publiée l'emporte sur celle en cours de
    saisie, quel que soit l'ordre du fichier (constat du 27/09 : son taux de renouvellement valait None ou 0,49 selon
    l'exécution de `robinet sispea`)."""
    import pandas as pd
    lu = pd.DataFrame([
        ("48139", 2021, "En cours de saisie", 1.38, 77.0, None),
        ("77654", 2021, "Confirme / publie", 2.6, 92.0, 0.5),
        ("48139", 2021, "Confirme / publie", 1.38, 77.0, 0.49),
        # L'étape de validation passe avant le nombre d'indicateurs, graphie accentuée des millésimes récents comprise.
        ("90290", 2023, "En attente de vérification", 2.1, 80.0, 0.3),
        ("90290", 2023, "Publié non vérifié", 2.1, None, None),
        # À la même étape, la ligne qui porte le plus d'indicateurs.
        ("555", 2023, "Vérifié", 1.9, None, None),
        ("555", 2023, "Vérifié", 1.9, 70.0, None),
        # À égalité parfaite, la première du fichier.
        ("600", 2023, None, 1.0, None, None),
        ("600", 2023, None, 2.0, None, None),
        # Sans identifiant, rien à départager : les lignes restent.
        (None, 2023, "Vérifié", None, None, None),
        (None, 2023, "Vérifié", None, None, None),
    ], columns=["id_service", "annee", "statut", "D102.0", "P104.3", "P107.2"]).astype({"id_service": "string", "statut": "string"})
    d = dedoublonner(lu)
    assert d.index.tolist() == [1, 2, 4, 6, 7, 9, 10]  # l'ordre du fichier est conservé
    assert d.loc[2, ["statut", "P107.2"]].tolist() == ["Confirme / publie", 0.49]
    assert list(d.columns) == list(lu.columns)
    # Fichier lu à l'envers : les mêmes déclarations, sauf à égalité parfaite.
    assert sorted(dedoublonner(lu.iloc[::-1]).index) == [1, 2, 4, 6, 8, 9, 10]
    # Toutes les graphies rencontrées de 2020 à 2026.
    assert [_etape(t) for t in ("Confirme / publie", "Confirmé / publié", "Publie non verifie", "Publié non vérifié",
                                "Verifie", "Vérifié", "En cours de verification", "En cours de vérification",
                                "En attente de verification", "En attente de vérification", "En cours de saisie",
                                "En attente de saisie", None, pd.NA, "Autre")] == [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7]


def test_service_des_communes_ne_depend_pas_de_l_ordre_de_lecture():
    """Le service d'une commune ne dépend que des valeurs, jamais de l'ordre de la composition : en 2020, elle rattache
    la commune 50142 deux fois au service 90357, un secteur par ligne, et dept/50.json changeait d'une exécution à
    l'autre (constat du 27/09)."""
    import duckdb

    def choix(composition):
        con = duckdb.connect()
        ind = ", ".join(f'"{i}" DOUBLE' for i in IND_MAIN)
        con.execute(f"""CREATE TABLE s (id_service VARCHAR, annee INTEGER, nom_service VARCHAR, nom_coll VARCHAR,
                        mode_gestion VARCHAR, nom_operateur VARCHAR, pop DOUBLE, {ind})""")
        con.executemany('INSERT INTO s (id_service, annee, nom_service, pop, "D102.0", "P104.3") VALUES (?, ?, ?, ?, ?, ?)', [
            ("S1", 2024, "eau potable : SIE du Plateau", 2_000, 2.1, None),
            ("S2", 2024, "eau potable : Syndicat de production", 90_000, None, 88.0),
            ("90357", 2020, "eau potable : Saint-Lô Agglo", 40_000, None, None),
        ])
        con.execute("""CREATE TABLE c (insee VARCHAR, annee INTEGER, id_service VARCHAR, nom_service VARCHAR,
                       nom_coll VARCHAR, mode_gestion VARCHAR, nom_operateur VARCHAR, population DOUBLE, secteur VARCHAR,
                       statut_donnees VARCHAR, distribution VARCHAR)""")
        con.executemany("INSERT INTO c VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", composition)
        return {(r[0], r[1]): (r[2], r[3], r[9], r[10]) for r in service_des_communes(con)}

    composition = [
        # Le prix l'emporte sur la population du service.
        ("35238", 2024, "S2", None, None, None, None, 1_200, None, "Publié", "Oui"),
        ("35238", 2024, "S1", None, None, None, None, 1_200, None, "Publié", "Oui"),
        # Même service, même population : le secteur départage.
        ("50142", 2020, "90357", None, None, None, None, 1_573, "Sud", "Publié", "Oui"),
        ("50142", 2020, "90357", None, None, None, None, 1_573, "Nord", "Publié", "Oui"),
        # Service absent des déclarations, lignes égales jusqu'au secteur : le reste de la ligne départage.
        ("61001", 2020, "70001", "eau potable : SIAEP B", None, None, None, 300, None, "Publié", "Oui"),
        ("61001", 2020, "70001", "eau potable : SIAEP A", None, None, None, 300, None, "Publié", "Oui"),
    ]
    assert choix(composition) == choix(composition[::-1]) == {
        ("35238", 2024): ("S1", "eau potable : SIE du Plateau", None, "Publié"),
        ("50142", 2020): ("90357", "eau potable : Saint-Lô Agglo", "Nord", "Publié"),
        ("61001", 2020): ("70001", "eau potable : SIAEP A", None, "Publié"),
    }


def test_run_refuse_un_parquet_non_dedoublonne(tmp_path, monkeypatch):
    """Deux déclarations d'un même service pour une même année (Parquet écrit avant sispea.dedoublonner) : run() s'arrête
    plutôt que de produire des fichiers qui changent d'une exécution à l'autre."""
    import pandas as pd

    from robinet import build_sispea, config

    (tmp_path / "sispea").mkdir()
    pd.DataFrame({"id_service": ["48139", "48139", "77654"], "annee": [2021, 2021, 2021],
                  "statut": ["En cours de saisie", "Confirme / publie", "Confirme / publie"],
                  "mode_gestion": ["Régie"] * 3, "D101.0": [11_000.0, 11_000.0, 240_000.0], "pop_desservie": [None] * 3,
                  }).to_parquet(tmp_path / "sispea" / "services.parquet", index=False)
    monkeypatch.setattr(config, "OUT", tmp_path)
    monkeypatch.setattr(config, "WEB_DATA", tmp_path / "web")
    with pytest.raises(RuntimeError, match="1 déclaration"):
        build_sispea.run([2021])
    assert not (tmp_path / "web").exists()


def test_service_sans_declaration_decrit_par_sa_composition():
    """Vérification du 27/09 : 351134 (CA Privas Centre Ardèche) figure dans la composition 2025 sans aucune
    déclaration. Sa fiche n'avait ni nom ni département, rangée dans « 00 », et restait en chargement ; la recherche,
    elle, le proposait en Ardèche. Même source et même règle que la recherche : la commune la plus peuplée."""
    capca = ("eau potable : Dunières et Les Ollières", "CA Privas Centre Ardèche (CAPCA)", "Délégation", "VEOLIA")
    rows = [
        _ligne("07083", 2025, "351134", *capca, pop_com=448.0, statut="En attente de saisie"),
        _ligne("07167", 2025, "351134", *capca, pop_com=1044.0, statut="En attente de saisie"),
        # Service de la seule Bélis en 2021 (les douze autres communes de la CC Coeur Haute Lande en ont un qui déclare).
        _ligne("40033", 2020, "78272", "eau potable", "Communauté de communes Coeur Haute Lande", "Régie", pop_com=165.0),
        _ligne("40033", 2021, "78272", "eau potable", "Communauté de communes Coeur Haute Lande", "Régie", pop_com=165.0),
        _ligne("35238", 2025, "77654", "eau potable : 01-Rennes", "CEBR", "Régie", "Veolia", 225081.0, "En attente de saisie"),
    ]
    declares = {
        "77654": {"nom": "eau potable : 01-Rennes-St Jacques", "coll": "CEBR", "dept": "35", "mode": "Délégation",
                  "op": ".", "statut": "Publié", "pop": 121480, "annee_ind": 2024, "ind": {"D102.0": 2.72}},
        "90290": {"nom": "eau potable : Service Valognes", "coll": "CA DU COTENTIN", "dept": "50", "mode": "Delegation",
                  "op": "SAUR", "statut": "En cours de saisie", "pop": 3544, "annee_ind": None, "ind": {}},
    }
    s = fiches_services(rows, declares)
    assert s["351134"] == {
        "annee_communes": 2025, "communes": ["07083", "07167"], "nom": "eau potable : Dunières et Les Ollières",
        "coll": "CA Privas Centre Ardèche (CAPCA)", "dept": "07", "mode": "Délégation", "op": "VEOLIA",
        "statut": "En attente de saisie", "sans_declaration": True}
    assert (s["78272"]["dept"], s["78272"]["annee_communes"], s["78272"]["communes"]) == ("40", 2021, ["40033"])
    # Un service qui déclare garde sa déclaration, pas la ligne de sa commune ; sans communes, il garde sa fiche.
    assert s["77654"] == {**declares["77654"], "annee_communes": 2025, "communes": ["35238"]}
    assert s["90290"] == declares["90290"]
    assert all(v.get("dept") for v in s.values())


def test_zeros_impossibles_sans_valeur():
    """Prix ou rendement nuls, consommation arrondie à zéro : pas de donnée, plutôt qu'une valeur fausse sur la carte."""
    rows = [_ligne("01001", 2024, "S1", "eau potable", "SIE", "Régie", D102_0=0.0, P104_3=0.0, P107_2=0.0, P108_3=0.0)]
    s = dict(zip(COLONNES_CARTE, communes_carte(rows, {("S1", 2024): (0.4, 3.0)})[2024]["services"]["S1"]))
    assert (s["prix"], s["rend"], s["conso"]) == (None, None, None)
    # Aucun renouvellement ni aucune protection engagée sont des situations réelles : zéro reste une valeur.
    assert (s["renouv"], s["protection"], s["pertes"]) == (0.0, 0.0, 3.0)


def test_pertes_ecartent_les_declarations_invraisemblables():
    """Choix de l'auteur (2026-09-25) : deux signes concordants, plus de 1 500 L distribués par habitant et par jour ET
    plus de la moitié de l'eau perdue ; un seul ne suffit pas."""
    # Vallée Sud Grand Paris, 2024 : 288 Mm³ produits, 1,36 importés, 60,75 exportés ; 53,9 + 7,8 consommés.
    vsgp = (288e6, 1_363_964, 60_753_104, 53.9e6, 7.8e6, None, None)
    assert pertes_pct(*vsgp) == pytest.approx(73.0, abs=0.1)  # sans la population, rien ne le signale
    assert pertes_pct(*vsgp, pop=411_601) is None
    # Station de montagne : 2 740 L/hab/j distribués, mais 30 % perdus : gardée.
    assert pertes_pct(1e6, None, None, 0.6e6, 0.1e6, None, None, pop=1_000) == pytest.approx(30)
    # Réseau rural qui perd 60 % de son eau, à 250 L/hab/j distribués : gardé.
    assert pertes_pct(91_250, None, None, 30_000, 6_500, None, None, pop=1_000) == pytest.approx(60)
    assert volumes_invraisemblables(228.6e6, 61.7e6, None) is False


def test_regle_des_volumes_la_meme_en_sql():
    """VOLUMES_PLAUSIBLES_SQL (agrégats de /services et /ressource) dit la même chose que volumes_invraisemblables."""
    import duckdb
    con = duckdb.connect()
    con.execute('''CREATE TABLE s ("VP.059" DOUBLE, "VP.060" DOUBLE, "VP.061" DOUBLE, "VP.063" DOUBLE, "VP.201" DOUBLE,
                   "VP.220" DOUBLE, "VP.221" DOUBLE, "D101.0" DOUBLE, pop_desservie DOUBLE)''')
    lignes = [
        (288e6, 1_363_964, 60_753_104, 53.9e6, 7.8e6, None, None, 411_601, None),  # invraisemblable
        (288e6, 1_363_964, 60_753_104, 53.9e6, 7.8e6, None, None, None, 411_601),  # population de repli
        (288e6, 1_363_964, 60_753_104, 53.9e6, 7.8e6, None, None, None, None),  # population inconnue : gardée
        (1e6, None, None, 0.6e6, 0.1e6, None, None, 1_000, None),  # station de montagne
        (91_250, None, None, 30_000, 6_500, None, None, 1_000, None),  # réseau rural
    ]
    con.executemany("INSERT INTO s VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", lignes)
    plausibles = [r[0] for r in con.execute(f"SELECT {VOLUMES_PLAUSIBLES_SQL} FROM s").fetchall()]
    assert plausibles == [False, False, True, True, True]


def test_historique_sans_cache_lit_l_instantane_fige(tmp_path, monkeypatch):
    """L'API de l'historique SISPEA est retirée (HTTP 410, 28/09/2026) : sans son cache, comme sur la machine du
    rafraîchissement automatique, l'historique 2008-2019 vient de l'instantané figé du dépôt."""
    import duckdb

    from robinet import build_sispea as B
    from robinet import config as C
    monkeypatch.setattr(C, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(C, "OUT", tmp_path / "out")
    assert B.api_history_to_parquet() == C.SISPEA_HISTORIQUE_FIGE
    n, debut, fin, indicateurs = duckdb.sql(
        f"SELECT count(*), min(annee), max(annee), count(DISTINCT code_indicateur) "
        f"FROM read_parquet('{C.SISPEA_HISTORIQUE_FIGE.as_posix()}')").fetchone()
    assert (debut, fin, indicateurs) == (2008, 2019, 12) and n > 800_000
