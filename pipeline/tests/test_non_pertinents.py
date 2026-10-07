"""Métabolites non pertinents (Anses) : sans limite de qualité dès l'année de l'avis, comme l'indicateur de l'ARS."""
import duckdb

from robinet.themes import NON_PERTINENTS, limite_qualite


def _lim(cd: str, annee: int, lim: str = "<=0,1 µg/L"):
    sql = f"SELECT {limite_qualite('lim', str(annee))} FROM (SELECT '{cd}' AS cdparametre, '{lim}' AS lim)"
    return duckdb.sql(sql).fetchone()[0]


def test_r471811_sans_limite_des_2024():
    assert NON_PERTINENTS["8865"] == 2024
    assert _lim("8865", 2023) == "<=0,1 µg/L"  # encore pertinent en 2023
    assert _lim("8865", 2024) is None  # toute l'année de l'avis, comme l'ARS
    assert _lim("8865", 2026) is None


def test_les_autres_parametres_gardent_leur_limite():
    assert _lim("1340", 2024, "<=50 mg/L") == "<=50 mg/L"
    assert _lim("7717", 2025) == "<=0,1 µg/L"


def _juges(tmp_path, annee: int, lignes: list[tuple[str, str, float, str | None]]) -> dict[tuple[str, str], float]:
    """Valeurs jugées (themes.resultats_juges) de lignes (prélèvement, paramètre, valeur, limite)."""
    from robinet.themes import resultats_juges

    f = (tmp_path / "result.parquet").as_posix()
    duckdb.sql("SELECT * FROM (VALUES " + ", ".join(f"('{p}', '{c}', CAST({v} AS DOUBLE), {repr(l) if l else 'NULL'})" for p, c, v, l in lignes)
               + ") t(referenceprel, cdparametre, valtraduite, limitequal)").write_parquet(f)
    return {(p, c): v for p, c, v in duckdb.sql(f"SELECT referenceprel, cdparametre, val_jugee FROM ({resultats_juges(f, annee)})").fetchall()}


def test_total_qui_inclut_r471811_juge_sans_lui(tmp_path):
    # 2024 : total = substances + R471811 (inclus) → jugé sans lui ; second prélèvement : total = substances (exclu).
    lignes = [
        ("P1", "6276", 0.751, "<=0,5 µg/L"), ("P1", "8865", 0.658, None), ("P1", "1234", 0.093, "<=0,1 µg/L"),
        ("P2", "6276", 0.09, "<=0,5 µg/L"), ("P2", "8865", 0.6, None), ("P2", "1234", 0.09, "<=0,1 µg/L"),
    ]
    v = _juges(tmp_path, 2024, lignes)
    assert abs(v[("P1", "6276")] - 0.093) < 1e-9
    assert v[("P2", "6276")] == 0.09
    assert v[("P1", "8865")] == 0.658  # le métabolite lui-même n'est pas modifié (sa limite est retirée ailleurs)


def test_total_inchange_avant_l_avis(tmp_path):
    v = _juges(tmp_path, 2023, [("P1", "6276", 0.751, "<=0,5 µg/L"), ("P1", "8865", 0.658, "<=0,1 µg/L"), ("P1", "1234", 0.093, "<=0,1 µg/L")])
    assert v[("P1", "6276")] == 0.751


def test_metabolites_du_tableau_de_l_anses():
    # Tableau de l'Anses de juillet 2025 : ESA-métolachlore (30/09/2022), diméthénamide ESA (26/01/2022), AMPA (05/06/2025).
    assert NON_PERTINENTS["6854"] == 2022 and NON_PERTINENTS["6865"] == 2022 and NON_PERTINENTS["1907"] == 2025
    assert _lim("1907", 2024) == "<=0,1 µg/L"  # AMPA pertinent par défaut avant l'avis
    assert _lim("1907", 2025) is None


def test_total_qui_inclut_un_metabolite_mais_pas_l_autre(tmp_path):
    # Réseau 001000589, 2024 : total 0,751 = substances 0,093 + R471811 0,658 ; l'ESA-métolachlore (1,277), déjà
    # non pertinent, n'y est pas compté. Seul R471811 est retiré.
    lignes = [("P1", "6276", 0.751, "<=0,5 µg/L"), ("P1", "8865", 0.658, None), ("P1", "6854", 1.277, None), ("P1", "1234", 0.093, "<=0,1 µg/L")]
    v = _juges(tmp_path, 2024, lignes)
    assert abs(v[("P1", "6276")] - 0.093) < 1e-9


def test_les_sommes_d_une_substance_ne_sont_pas_touchees(tmp_path):
    # 6282 (atrazine et ses métabolites) n'est pas un total général : jamais corrigé.
    v = _juges(tmp_path, 2024, [("P1", "6282", 0.6, "<=0,5 µg/L"), ("P1", "8865", 0.5, None)])
    assert v[("P1", "6282")] == 0.6
