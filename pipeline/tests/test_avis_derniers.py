"""Dernier prélèvement conclu de chaque réseau et date d'arrêt des données (avis_site.derniers_prelevements, 25/09)."""
import duckdb

from robinet import avis_site as avis


def test_dernier_prelevement_conclu_et_date_d_arret():
    con = duckdb.connect()
    # Réseau de la Meuse sous arrêté PFAS : l'avis du 08/06/2026 est son dernier prélèvement CONCLU (celui du 23/07 n'a
    # pas de conclusion) ; un prélèvement sans réseau compte pour la date d'arrêt, pas pour un réseau ; années séparées.
    con.execute("""
        CREATE TEMP VIEW plv_conclusions AS SELECT * FROM (VALUES
            (2026, 'p1', '2026-06-08', '055', '055000810', 'Depuis le 05/07/2025, la consommation de l''eau est interdite.'),
            (2026, 'p2', '2026-07-23', '055', '055000810', '   '),
            (2026, 'p3', '2026-07-31', '005', '', 'Eau conforme.'),
            (2026, 'p4', '2026-07-29', '005', '005000810', 'Eau conforme.'),
            (2025, 'p5', '2025-12-30', '005', '005000810', 'Eau conforme.')
        ) t(annee, referenceprel, dateprel, cddept, cdreseau, conclusionprel)""")
    avis.derniers_prelevements(con)
    assert sorted(con.execute("SELECT * FROM avis_derniers").fetchall()) == [
        (2025, "005000810", "2025-12-30"),
        (2026, "005000810", "2026-07-29"),
        (2026, "055000810", "2026-06-08"),
    ]
    assert sorted(con.execute("SELECT * FROM avis_arret").fetchall()) == [(2025, "2025-12-30"), (2026, "2026-07-31")]
