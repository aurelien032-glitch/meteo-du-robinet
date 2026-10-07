"""Classe A–D par famille (situations.lettre), aux principes de l'indicateur global de l'ARS (infofactures)."""
from robinet.situations import FAMILLES, lettre


def test_sixieme_famille_en_fin_de_code():
    # Ajoutée en dernier : les codes à cinq chiffres des fichiers antérieurs gardent leur lecture.
    assert FAMILLES[:5] == ["pesticides", "azote", "pfas", "microbio", "metaux_mineraux"]
    assert FAMILLES[5] == "autres"


def test_conforme_et_reserves_en_a():
    assert lettre("pesticides", 0, 0, False) == "A"
    assert lettre("azote", 2, 0, False) == "A"  # 40 à 50 mg/L : réserve
    assert lettre("microbio", 1, 3, False) == "A"  # 95 % au moins : réserve (ARS : « bonne qualité » à 99 %)


def test_ponctuel_b_recurrent_c():
    assert lettre("pesticides", 1, 20, False) == "B"  # NC0
    assert lettre("pesticides", 2, 60, False) == "C"  # NC1
    assert lettre("autres", 1, 30, False) == "B"  # trente jours au plus
    assert lettre("autres", 1, 31, False) == "C"
    assert lettre("azote", 3, 10, False) == "B"  # au-dessus de 50 mg/L, ponctuellement
    assert lettre("microbio", 2, 45, False) == "C"
    assert lettre("pfas", 1, 5, False) == "B"  # limite applicable depuis 2023


def test_publics_sensibles_c_restriction_d():
    assert lettre("autres", 1, 5, True) == "C"
    assert lettre("pesticides", 3, 10, False) == "D"  # NC2 : restriction
    assert lettre("microbio", 3, 2, False) == "D"  # consigne d'ébullition
    assert lettre("metaux_mineraux", 2, 2, False) == "D"


def test_report_des_lettres_d_une_famille_non_analysee():
    """Petit réseau (2026-10-04) : famille non analysée dans l'année → lettre de sa dernière année analysée, en minuscule,
    cinq ans au plus ; une famille analysée reprend sa propre lettre."""
    from robinet.situations import reporter
    h = {}
    assert reporter({"R": "CA-AAA"}, h, 2020) == {"R": "CA-AAA"}
    assert reporter({"R": "-A-AAA"}, h, 2022) == {"R": "cA-AAA"}
    assert reporter({"R": "AA-AAA"}, h, 2023) == {}  # pesticides analysés : A, plus de report
    h2 = {}
    reporter({"S": "BA-AAA"}, h2, 2019)
    assert reporter({"S": "-A-AAA"}, h2, 2025) == {}  # six ans : trop ancien
    h3 = {}
    reporter({"T": "DA-AAA"}, h3, 2025)
    assert reporter({"T": "-A-AAA"}, h3, 2026, partiel=True) == {}  # année en cours : pas de D sans restriction


def test_grille_bacteriologique_de_l_ars():
    """Grille de l'indicateur (ARS Provence-Alpes-Côte d'Azur), vérifiée sur les synthèses 2025 (2026-10-05)."""
    from robinet.situations import lettre_bact
    assert lettre_bact(12, 0, 0) == "A"
    assert lettre_bact(12, 1, 2) == "A"  # 91,7 % sur 10 à 19 prélèvements, maximum sous 5
    assert lettre_bact(12, 1, 5) == "C"  # Avène 034000755 : 91 %, maximum 5 n/100 mL, restriction temporaire → C
    assert lettre_bact(26, 3, 3) == "D"  # Arboys-en-Bugey 001000268 : 88 % sur 26 → D
    assert lettre_bact(20, 1, 1) == "A"  # 95 % pile, 20 à 49 prélèvements
    assert lettre_bact(62, 1, 2) == "A"  # 98,4 % sur 50 à 99 prélèvements : 98 % au moins
    assert lettre_bact(60, 2, 2) == "B"  # 96,7 %
    assert lettre_bact(236, 6, 4) == "B"  # 97,5 % sur plus de 100
    assert lettre_bact(6, 1, 0) == "D"  # moins de 10 prélèvements en cinq ans : dernière ligne, 83 % → D


def test_cumul_bacteriologique_sur_les_annees_anterieures():
    from robinet.situations import cumul_bact
    par_an = {2025: {"R": (5, 1, 5.0)}, 2024: {"R": (7, 0, 0.0)}, 2023: {"R": (9, 3, 40.0)}}
    assert cumul_bact(par_an, "R", 2025) == (12, 1, 5.0, 2024)  # 2025 puis 2024 : 12 prélèvements, 2023 inutile
    assert cumul_bact({2025: {"R": (14, 0, 0.0)}}, "R", 2025) == (14, 0, 0.0, 2025)
    assert cumul_bact({2019: {"R": (20, 0, 0.0)}}, "R", 2025) is None  # au-delà de cinq ans
    assert cumul_bact(par_an, "S", 2025) is None
