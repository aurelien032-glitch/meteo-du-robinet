"""Tests des règles qui décident des chiffres affichés : familles, seuils, codes SISPEA, vraisemblance."""
import duckdb
import pandas as pd
import pytest

from robinet.build import _bound
from robinet.check import compare
from robinet.geo import _dept_of, _round_coords
from robinet.sispea import _clean_code, _clean_dept, _norm_code
from robinet.themes import FAMILY_CASE, FAMILY_PRIORITY


def famille(cdparametre, lib, limitequal, unite):
    con = duckdb.connect()
    con.execute("CREATE TABLE r (cdparametre VARCHAR, libminparametre VARCHAR, limitequal VARCHAR, cdunitereference VARCHAR)")
    con.execute("INSERT INTO r VALUES (?, ?, ?, ?)", [cdparametre, lib, limitequal, unite])
    return con.execute(f"SELECT {FAMILY_CASE} FROM r").fetchone()[0]


@pytest.mark.parametrize("args, attendu", [
    (("6378", "Chloridazone desphényl", "<=0,1 µg/L", "133"), "pesticides"),
    (("1103", "Aldrine", "<=0,03 µg/L", "133"), "pesticides"),
    (("6276", "Total des pesticides analysés", "<=0,5 µg/L", "133"), "pesticides"),
    (("8847", "Somme de 20 substances perfluoroalkylées (PFAS)", "<=0,1 µg/L", "133"), "pfas"),
    (("1457", "Acrylamide", "<=0.1 µg/L", "133"), "organiques"),
    (("1340", "Nitrates (en NO3)", "<=50 mg/L", "162"), "azote"),
    (("1449", "Escherichia coli /100ml - MF", "<=0 n/(100mL)", "226"), "microbio"),
    (("1382", "Plomb", "<=10 µg/L", "133"), "metaux_mineraux"),
    (("2098", "Activité Tritium (3H)", "", "9"), "radioactivite"),
    (("5901", "Odeur (qualitatif)", "", "X"), "organoleptique"),
    (("1302", "pH", "", "264"), "physico_chimie"),
])
def test_familles(args, attendu):
    assert famille(*args) == attendu


def test_moyenne_communale_ponderee_par_analyses_avec_valeur_numerique():
    """Certains paramètres (saveur, odeur…) sont surtout organoleptiques : valtraduite ne parse pas en nombre
    (TRY_CAST échoue) sur la plupart des lignes, donc reseau_param.vmean y est NULL pour la grande majorité
    des réseaux. Pondérer par n (toutes les analyses de la ligne) plutôt que n_val (celles qui ont vraiment
    contribué à vmean) diluait la moyenne communale d'un facteur pouvant dépasser 10 : un réseau à vmean NULL
    et n=1000 comptait quand même son n=1000 au dénominateur, pour 0 au numérateur."""
    con = duckdb.connect()
    con.execute("CREATE TABLE reseau_param (cdreseau VARCHAR, n INTEGER, n_val INTEGER, vmean DOUBLE)")
    con.executemany("INSERT INTO reseau_param VALUES (?, ?, ?, ?)", [
        ("R1", 10, 10, 2.0),    # réseau avec de vraies valeurs numériques
        ("R2", 1000, 0, None),  # réseau organoleptique : 1000 analyses, aucune valeur numérique (vmean NULL)
    ])
    moyenne_correcte = con.execute("SELECT sum(vmean * n_val) / nullif(sum(n_val), 0) FROM reseau_param").fetchone()[0]
    moyenne_buggee = con.execute("SELECT sum(vmean * n) / sum(n) FROM reseau_param").fetchone()[0]
    assert moyenne_correcte == 2.0  # seul R1 a une valeur : la moyenne est la sienne, non diluée par R2
    assert moyenne_buggee < 0.1  # l'ancienne formule diluait presque à zéro (2.0 * 10 / 1010)


def test_famille_decidee_par_parametre_et_non_par_ligne():
    """Un métabolite requalifié en cours d'année garde une limite sur une partie des lignes seulement :
    la famille du paramètre doit rester « pesticides », de façon déterministe."""
    con = duckdb.connect()
    con.execute("CREATE TABLE r (cdparametre VARCHAR, libminparametre VARCHAR, limitequal VARCHAR, cdunitereference VARCHAR)")
    con.executemany("INSERT INTO r VALUES (?, ?, ?, ?)", [
        ("8865", "Métabolite X", "<=0,1 µg/L", "133"),
        ("8865", "Métabolite X", "", "133"),
        ("8865", "Métabolite X", "", "133"),
    ])
    con.execute(f"CREATE TABLE res AS SELECT cdparametre, {FAMILY_CASE} AS famille FROM r")
    fam = con.execute(f"SELECT arg_min(famille, {FAMILY_PRIORITY}) FROM res GROUP BY cdparametre").fetchone()[0]
    assert fam == "pesticides"


@pytest.mark.parametrize("seuil, op, attendu", [
    ("<=0,1 µg/L", "<=", 0.1),
    ("<=50 mg/L", "<=", 50.0),
    (">=6,5 et <=9 unité pH", ">=", 6.5),
    (">=6,5 et <=9 unité pH", "<=", 9.0),
    ("<=0.01 µg/L", "<=", 0.01),
    ("", "<=", None),
    ("<=20 µg(Se)/L", "<=", 20.0),
])
def test_bornes_de_seuil(seuil, op, attendu):
    con = duckdb.connect()
    val = con.execute(f"SELECT {_bound(repr(seuil), op)}").fetchone()[0]
    assert val == attendu


def test_depassement_ne_compte_pas_les_resultats_sous_seuil():
    """Un résultat « <0,005 » est stocké à 0 : jamais au-dessus d'une limite."""
    con = duckdb.connect()
    lim = _bound("'<=0,1 µg/L'", "<=")
    assert con.execute(f"SELECT 0.0 > {lim}").fetchone()[0] is False
    assert con.execute(f"SELECT 0.15 > {lim}").fetchone()[0] is True


@pytest.mark.parametrize("col, attendu", [
    ("D102.0", "D102.0"), ("d102_0", "D102.0"), ("p103_2b", "P103.2B"), ("P103.2B", "P103.2B"),
    ("vp_056", "VP.056"), ("VP.056", "VP.056"), ("DC.184", "DC.184"),
    ("Verif_D101.0", None), ("calculauto_d101_0", None), ("Nom collectivité", None),
])
def test_normalisation_codes_sispea(col, attendu):
    assert _norm_code(col) == attendu


def test_nettoyage_codes_insee_et_departements():
    insee = _clean_code(pd.Series(["1010.0", ".", "35238", "nan"]), 5).tolist()
    assert insee[0] == "01010" and insee[2] == "35238"
    assert pd.isna(insee[1]) and pd.isna(insee[3])
    assert _clean_dept(pd.Series(["001", "8", "02A", "971", "35"])).tolist() == ["01", "08", "2A", "971", "35"]


def test_geo_helpers():
    assert _round_coords([[2.123456789, 48.98765432]]) == [[2.1235, 48.9877]]
    assert _dept_of({"code": "97101"}) == "971"
    assert _dept_of({"code": "2A004"}) == "2A"
    assert _dept_of({"code": "35238", "departement": "35"}) == "35"


def test_dept_of_replie_saint_martin_et_saint_barthelemy():
    """Saint-Martin (978) et Saint-Barthélemy (977) n'ont ni fiche ni seuils SISPEA propres : repliés sur la
    Guadeloupe (971), comme _dept_of_insee côté build. Le GeoJSON Etalab brut les tague pourtant 977/978 via
    sa propriété `departement`, qui contournait le repli avant ce test (communes/977.json et 978.json
    isolés, sans contour ni fiche)."""
    assert _dept_of({"code": "97701", "departement": "977"}) == "971"
    assert _dept_of({"code": "97801", "departement": "978"}) == "971"


def _annee(n_plv, nc_bact, n_com=34000):
    return {"plv": {"n": n_plv, "nc_bact": nc_bact, "ne_bact": n_plv, "nc_chim": 0, "ne_chim": n_plv},
            "n_communes": n_com, "n_reseaux": 23000, "fam": {"pesticides": {"n": 5_000_000}}}


def test_vraisemblance_accepte_les_variations_normales():
    nat = {"annees": {"2024": _annee(291_000, 5_500), "2025": _annee(295_000, 4_659)}}
    assert all(e.ok for e in compare(nat))


def test_vraisemblance_refuse_un_millesime_tronque():
    nat = {"annees": {"2024": _annee(291_000, 5_500), "2025": _annee(120_000, 4_659)}}
    mauvais = [e for e in compare(nat) if not e.ok]
    assert any(e.mesure == "n_plv" for e in mauvais)


def test_vraisemblance_tolere_une_hausse_d_analyses_mais_pas_une_chute():
    a, b = _annee(291_000, 5_500), _annee(295_000, 4_659)
    a["fam"]["pfas"] = {"n": 7_000}
    b["fam"]["pfas"] = {"n": 349_000}
    assert all(e.ok for e in compare({"annees": {"2024": a, "2025": b}}) if e.mesure == "analyses_pfas")
    b["fam"]["pesticides"] = {"n": 2_000_000}  # contre 5 000 000 l'année d'avant
    assert not all(e.ok for e in compare({"annees": {"2024": a, "2025": b}}) if e.mesure == "analyses_pesticides")


def test_vraisemblance_ignore_les_millesimes_partiels():
    nat = {"annees": {"2025": _annee(295_000, 4_659), "2026": _annee(136_000, 1_700)}}
    assert compare(nat, partiel=[2026]) == []


# --- Avis sanitaires de l'ARS : formulations réelles (DIS_PLV.conclusionprel), espaces parasites compris ---
from robinet.avis import classer, local  # noqa: E402


@pytest.mark.parametrize("texte, attendu", [
    # restrictions générales
    ("elle fait l’obj et d’une mesure d’interdiction de consommation permanente pour préserv er la santé", "interdiction"),
    ("L a non-conformité porte sur au moins un paramètre microbiologique et a nécessité une restriction de consommation de l'eau.", "interdiction"),
    ("Par arrêté prefectoral, l'eau ne doit pas être consommée.", "interdiction"),
    ("Eau de mauvaise qualité contenant des oocystes de cryptosporidium la r endant impropre à la boisson", "interdiction"),
    ("LA RESTRICTION DE CONSOMMATION DE L'EAU EST MAINTENUE", "interdiction"),
    # ébullition
    ("CETTE EAU NE DOIT PAS ETRE UTILISEE POUR LA CONSOMMATION HUMAINE SANS EBULLITION PREALABLE.", "ebullition"),
    ("l'eau doit être bouillie 2 minutes avant d'être consommée", "ebullition"),
    # publics sensibles
    ("En attendant, cette eau est déconseillée aux populations sensibles (femmes enceintes, nourrissons).", "sensibles"),
    ("L'eau peut être utilisée pour les usages sanitaires courants mais ne doit pas être consommée par les nourrissons et les femmes enceintes", "sensibles"),
    ("l'interdiction de consommer cette eau pour les femmes enceintes et les nourrissons de moins de 6 mois", "sensibles"),
    ("les recommandations de l’ARS, en termes de restriction d’usage alimentaire, doivent être respectées pour les populations à risques.", "sensibles"),
    ("perchlorate entre 4µg/l et 15µg/l, l'Anses préconise de ne pas préparer de biberons avec l'eau du robinet pour les nourrissons", "sensibles"),
    # pas d'avis en vigueur : négations, seuils cités, levées, conditionnels
    ("L a non-conformité porte sur au moins un paramètre microbiologique et n' a toutefois pas nécessité de restriction de la  consommation de l'eau.", None),
    ("La non conformité concernant la turbidité n'a pas nécessité de restrict ion de la consommation de l'eau.", None),
    ("L'eau peut être consommée sans restriction d'usage.", None),
    ("L’EAU PEUT DONC ETRE CONSOMMEE SANS RESTRICTION.", None),
    ("Présence de Flufénacet ESA a une teneur supérieure à la limite de qual ité. L'eau reste consommable par l'ensemble de la population.", None),
    ("présence de perchlorate dans une concentration toutefois inférieure au seuil de 4µg/l, seuil de restriction d'usage pour les nourrissons recommandé par l'Anses.", None),
    ("Les restrictions de consommation précédemment mises en place pour cette  eau peuvent être levées.", None),
    ("Ces c oncentrations restent inférieures aux seuils d'intervention sanitaire à partir desquels des mesures de restriction de consommation de l'eau sont prononcées.", None),
    ("ces valeurs ne sont pas représentatives de la qualité de l'eau pour l'ensemble des consommateurs du réseau de distribution.", None),
    ("Eau d'alimentation conforme aux exigences de qualité en vigueur pour l'ensemble des paramètres mesurés.", None),
    (None, None),
])
def test_avis_ars(texte, attendu):
    assert classer(texte) == attendu


def test_avis_ars_local():
    """Un avis limité à un bâtiment ou à un point d'usage est signalé comme tel."""
    t = ("Cette teneur en plomb n’est représentative que pour le point d’utilisation d’eau concerné. "
         "En attendant, cette eau est déconseillée dans le bâtiment concerné pour des usages alimentaires.")
    assert classer(t) == "interdiction" and local(t)
    assert not local("L a non-conformité porte sur au moins un paramètre microbiologique et a nécessité une restriction de consommation.")


def test_avis_causes_ne_confondent_pas_les_substances_voisines():
    from robinet.avis import causes
    assert causes("teneur en perchlorates supérieure à 4 µg/L") == ["perchlorates"]
    assert "chlorites / chlorates" in causes("non-conformité concernant les chlorates")
    assert causes("acide perfluorooctanoïque et substances polyfluoroalkylées") == ["PFAS"]
    assert "fluorures" in causes("teneur en fluorures supérieure à 1,5 mg/L")


# --- Faux positifs et faux négatifs relevés le 2026-09-23 (Rennes affichée en restriction par erreur) --------------
# Lecture phrase par phrase : négation par verbe nié, rappel de règle et mesure envisagée ignorés, portée au point de
# prélèvement locale, causes écartées par le texte retirées. Textes réels, espaces parasites compris.
RENNES = ("Eau d'alimentation conforme aux exigences de qualité en vigueur pour l'ensemble des paramètres mesurés. Cependant, il "
          "convient de signaler la présence de trace de pesticide et la mise en évidence de chlorates. La réglementation fixe une "
          "limite de qualité à 700 µg/l pour le param ètre chlorates, lorsqu'une  méthode de désinfection des eaux destinées à la "
          "cons ommation humaine qui en génére est utilisée. Au delà de cette valeur, il est recommandé de ne pas consommer cette "
          "eau, une restriction d'usa ge est nécessaire. La valeur la plus faible possible de ce paramètre d oit être visée sans "
          "pour autant compromettre  la désinfection. Compte tenu de la teneur mesurée en chlorates sur ce prélèvement, un suivi "
          "re nforcé sera mis en place sur ce paramètre.")
CHERBOURG_0909 = ("Ce prélèvement a été réalisé dans le cadre du suivi renforcé PFAS mis en place en sortie station Asselinerie. Les "
                  "résultats de ce dernier confirment le dépassement de la limite de qualité de 0.1 µg/l fixée pour la somme des 20 "
                  "PFAS recherchés. Un arrêté préfectoral modificatif de restriction de  consommation d’ea u a été pris le 9/09/2025. "
                  "La restriction reste en vigueur pour les zo nes sans solution technique")


@pytest.mark.parametrize("texte, attendu", [
    # rappel de règle : Rennes (texte 1621 de avis/35.json, 22/07/2026), radon sous sa valeur sanitaire
    (RENNES, None),
    ("La valeur mesurée reste toutefois inférieure à la valeur sanitaire maximale (1000 Bq/L) au-delà de laquelle l'eau ne doit "
     "pas être consommée.", None),
    ("Il est déconseillé de bo ire l'eau du robinet de manière régulière lorsque la concentration en radon dissous dans l'eau "
     "est supérieure à 1000 Bq/L.", None),
    # … mais une reprise de seuil vaut consigne quand la phrase précédente vient de le dire dépassé
    ("Le résultat montre un dépassement du seuil de de 4 μg/L en perchlorate . Au‐delà de ce seuil, par principe de précaution, "
     "des restrictions de consommation sont prononcées pour les nourrissons de moin s de 6 mois.", "sensibles"),
    # … et « au-delà de » après un nom est un constat, pas une règle
    ("Du fait de la présence de nitrates au delà de la limite de qualité, cette eau est déconseillée aux populations sensibles "
     "(femmes enceintes, nourrissons)pour des usages alimentaires.", "sensibles"),
    # mesure seulement envisagée
    ("A l'issue de cette période des mesures de restriction de conso mmation de l'eau pourront être demandées dans les secteurs "
     "incr iminés si les anomalies persistent.", None),
    ("Une restriction d'usage pour les femmes encein tes et nourrissons sera mise en place si ce dépassement est confirmé.", None),
    ("Un nouveau dépassement de la limite de qualité entrainera l’interdiction de la consommation d ’eau à des fins alimentaires.", None),
    # exceptions et formulations au présent qui restent des consignes
    ("La population devra être avertie qu'actuellement l'eau ne peut être utilisée pour l'alimentation humaine sans désinfection "
     "ou ébullition prolongée préalable.", "ebullition"),
    ("L'interdiction d'utiliser cette eau pour les usages alimentaires, sauf lorsque cette eau a été portée à ébullition est "
     "maintenue (le CVM étant volatil).", "ebullition"),
    ("L'analyse de l'eau présente une flore interférente trop importante qui ne permet pas de déterminer si des bactéries "
     "coliformes et des Escher ichia coli sont présents dans cette eau au moment du prélèvement et a nécessité une restriction "
     "de la consommation de l'eau.", "interdiction"),
    # négations : Dammartin-en-Goële (chlorothalonil), Châteaudun, modèle PFAS de l'ARS Bourgogne-Franche-Comté…
    ("Eau d’alimentation présentant un dépassement de la valeur indicative p our le paramètre chlorothalonil R471811 (métabolite "
     "non pertinent) n'e ntrainant pas de mesure de restriction d'usage.", None),
    ("Toutefois, la teneur mesurée ne nécessite pas de restriction de consommation de l’eau. Les résultats d'analyses de ce "
     "prélèvement ont également mis en éviden ce un dépassement de la valeur indicative de 0,9 µg/L sur un métabolit e de "
     "pesticide non pertinent, ne nécessitant pas non plus de restricti on de consommation de l’eau.", None),
    ("Les modalités de gestion sont basées sur l’application du principe de proportionnalité au regard des connaissances et "
     "expertises du moment e t ne conduisent pas, à ce stade, à prononcer des restrictions d’usages de l’eau.", None),
    ("La valeur observée reste cependant inférieure à la valeur sanitaire définies par l’ANSES et ne fait pas pour le moment "
     "l'objet d'une restriction d'usage de l'eau.", None),
    ("Ce dépa ssement de limite de qualité, comparé aux données connues de la molécule-mère, ne justifie pas de prendre de "
     "mesures de restriction d’usage de l’eau.", None),
    ("Aucune nécessité de res triction de la consommation de l'eau.", None),
    ("A noter de plus le dépassement pour les bactéries coliformes sans nécessité toutefois de restriction de la consommation "
     "de l'eau.", None),
    ("Une restriction de la consommation de l'eau n'a pas été nécessaire.", None),
    ("Il n'y a pas eu nécessité de prendre une restrictio n de la consommation de l'eau.", None),
    ("Il n'y a pas eu de demande d'interdiction de consommation au regard de la rapidité d'intervention.", None),
    ("Ces dépassements n’engendrent pas à ce jour, de restricti on des usages de l’eau.", None),
    ("La teneur en bentazone (pesticide) est supérieure à la limite de quali té mais inférieure au seuil sanitaire de "
     "restriction d'usage.", None),
    ("Présence de métabolites du chloridazone qui dépasse la valeur réglemen taire de 0,1 µg/l mais ne dépasse pas la valeur "
     "imposant des restricti ons de consommation.", None),
    ("Par ailleurs, l’analyse a révélé la présence de perchlorate ne dépassant pas le seuil de 4µg/l, seuil de restriction "
     "d'usage pour les nourrissons recommandé par l'Anses.", None),
    # … sans prendre pour une négation ce qui n'en est pas une
    ("Une interdiction de consommation a été prononcée le 06/07/2026.", "interdiction"),
    ("La turbidité est élevée, des restrictions d'usage de l'eau ont été prononcées.", "interdiction"),
    # levées : « est (donc) levée », « a permis de lever » ; mais « ne peut être levée », « n'a pas encore été levée »,
    # « qui permettraient la levée » disent que la consigne est maintenue
    ("L'interdiction de consommer l'eau est levée.", None),
    ("Les résultats du recontrôle réalisés le 26/06/23 sont conformes, l'int erdiction de consommer est donc levée.", None),
    ("Les résultats d'analyses montrent la conformité de l'eau sur l'ensemble de ce secteur ce qui a permis de lever "
     "l'interdiction de consommation de l'eau émise pour ce secteur.", None),
    ("CF alerte du 10/11/25. L'interdiction de consommer l'eau ne peut être levée.", "interdiction"),
    ("L'interdiction de consommer l'eau n'a pas encore été levée.", "interdiction"),
    ("L'arrêté préfectoral du 05/05/2025 reste applicable dans l'attente de la consolidation des résultats en PFAS qui "
     "permettraient la levée de l'interdiction de consommer l'eau à des fins de boisson pour les personnes sensibles (femmes "
     "enceintes et allaitantes, nourrissons de moins de 2 ans, personnes immunodéprimées).", "sensibles"),
    ("L'interdiction de consommer l'eau est levée pour la population générale sauf pour les femmes enceintes e t les nourrissons "
     "de moins de 6 mois.", "sensibles"),
    # interdictions énoncées librement, jusque-là ignorées (arrêtés PFAS de 2025, bactériologie)
    ("Depuis le 10/07/2025, la consommation de l'eau est interdite par arrêté préfectoral à des fins de boisson. Les autres "
     "usages restent autorisés", "interdiction"),
    ("La consommation d'eau est interdite jusqu'au retour à la conformité démontrée par une nouvelle analyse.", "interdiction"),
    ("Dans ces conditions, vous informerez la population que l'usage de cette eau à des fins alimentaires est interdit pour les "
     "femmes enceintes et les nourrissons.", "sensibles"),
    ("DEPUIS LE 15 OCTOBRE 2025, LA CONSOMMATION DE L'EAU A DES FINS DE BOISSON ET DE PREPARATION DE BIBERONS EST INTERDITE.",
     "interdiction"),
    ("Par arrêté municipal n°2024-043 du 26/07/2024 modifié par l’arrêté municipal n° 2024-079 du 29/11/2024, l'utilisation "
     "d'eau du robinet en eau de boisson est interdite pour les enfants jusqu’à 10 ans inclus.", "sensibles"),
    ("La consommation de cette eau est interdite à toute la population par arrêté préfectoral du 24 octobre 2018 "
     "(bactériologie). Cette eau ne doit pas être consommée par les femmes enceintes et les n ourrissons de moins de 6 moins "
     "même quand elle est portée à ébullition.", "interdiction"),
    # une substance interdite n'est pas une consigne
    ("Eau d’alimentation non conforme aux exigences de qualité fixées pour les paramètres suivants : chlorothalonil R471811 "
     "(sous-produits issus de la dégradation de pesticides désormais interdits).", None),
    # consignes qui ne visent pas l'eau, ou mal lues jusque-là
    ("Le taux de fluorures dépasse la limite de qualité. Il est recommandé à la population de ne pas consommer des produits "
     "supplémentés en fluor tel que les dentifrices pouvant en contenir.", None),
    ("NE PAS CONSOMMER AVANT D'AVOIR FAIT BOUILLIR L'EAU PENDANT 20 MIN.", "ebullition"),
    ("L'excès de consommation des fluorures doit faire l'objet d'une attention particulière, notamment pour les enfants de moins "
     "de 12 ans. Selon l'avis de l’AFSSA de 2001 et du point II.2 de la circulaire du 15/12/2004, cette eau ne doit pas être "
     "consommée par les enfants susmentionnés.", "sensibles"),
    # une restriction réelle reste une restriction, même si le texte commence par « Eau conforme » (Cherbourg-en-Cotentin)
    (CHERBOURG_0909, "interdiction"),
    ("Eau d'alimentation conforme aux exigences de qualité en vigueur pour l'ensemble des paramètres mesurés. Depuis le "
     "02/08/2025, une restriction de la consommation de l'eau est en vigueur en raison des teneurs élevées en PFAS.", "interdiction"),
])
def test_avis_ars_lecture_par_phrase(texte, attendu):
    assert classer(texte) == attendu


def test_avis_ars_portee_du_point_de_prelevement():
    """Évry-Courcouronnes (04/02/2025) : une consigne limitée au point de prélèvement est un avis local ; le repère doit être
    dans la phrase de la consigne, et une consigne pour toute la population ou par arrêté préfectoral n'est jamais locale."""
    evry = ("Cependant, on peut noter la présence de germes aérobies. Si la présence de ce type de micro-organismes à cette "
            "concentration ne constitue pas un risque sanitaire, elle est cependant le témoin d’une dégradation de la qualité de "
            "l’eau, signe d'une défaillance de la désinfection ou d'une dégradation de l'eau au cours de la distribution ou au "
            "point de prélèvement (stagnation, vieillissement des installations, des canalisations). Une demande de contrôle a "
            "été demandée à l'exploitant pour vérifier le réseau public en amont du point, En attendant, de revenir à des valeurs "
            "conformes, nous vous recommando ns de ne pas boire l’eau à ce point de prélèvement.")
    assert classer(evry) == "interdiction" and local(evry)
    assert local("CETTE EAU NE DOIT PAS ETRE UTILISEE POUR LA CONSOMMATION HUMAINE AU SEUL POINT DE PRELEVEMENT.")
    reseau = ("Présence de germes au point de prélèvement. La non-conformité porte sur au moins un paramètre microbiologique et "
              "a nécessité une restriction de consommation de l'eau.")
    assert classer(reseau) == "interdiction" and not local(reseau)
    # la note sur le plomb (« représentatives que du point d'utilisation ») ne rend pas locale l'interdiction PFAS
    pfas = ("Les trois paramètres analysés sont conformes aux exigences de qualité mais ne sont représentatifs que du point "
            "d'utilisation et du moment où ils ont été mesurés. Depuis le 10/07/2025, la consommation de l'eau est interdite par "
            "arrêt é préfectoral à des fins de boisson. Les autres usages restent autoris és.")
    assert classer(pfas) == "interdiction" and not local(pfas)
    assert not local(CHERBOURG_0909)


def test_avis_ars_causes_ecartees_par_le_texte():
    """Une cause que le texte dit sous la valeur sanitaire ou sans risque n'est pas la cause de la consigne : la restriction
    due à E. coli ne fait pas un réseau « pesticides NC2 » (définition ministérielle : dépassement de la Vmax)."""
    from robinet.avis import causes
    e_coli = ("Eau d’alimentation non conforme aux limites de qualité en vigueur pour le paramètre E. Coli, Entérocoques, "
              "desphénylchloridazone et méth yl-desphénylchloridazone (la concentration des pesticides concernés re ste inférieure "
              "aux valeurs sanitaires) et non satisfaisante aux référe nces de qualité pour le paramètre bactéries coliformes. En "
              "attendant, il conv ient de prévenir l’ensemble de la population de ne pas utiliser cette eau pour des usages "
              "alimentaires.")
    assert classer(e_coli) == "interdiction" and causes(e_coli) == ["bactériologie"]
    pfas = ("Eau d’alimentation non conforme à la limite de qualité réglementaire pour le paramètre chloridazone desphenyl mais "
            "sans dépasser les valeurs dérogatoires. L'eau est interdite à la consommation par arrêté préfectoral du 10 jui llet "
            "2025 en raison de dépassement de la limite de qualité pour les PF AS.")
    assert causes(pfas) == ["PFAS"]
    # « Ces dépassements n'engendrent pas… » : le sujet est nommé dans la phrase précédente
    turbidite = ("L'eau présente une turbidité excessive qui lui confère un aspect trouble, diminue l'efficacité de la "
                 "désinfection et renforce les risques de contamination microbiologique et nécessite une interdiction de "
                 "consommation. L’eau distribuée est non-conforme, suite à des dépassements de la limite de qualité pour les "
                 "pesticides « Flufénacet, Flufénacet OXA, Mé taldéhyde ». Ces dépassements n’engendrent pas à ce jour, de "
                 "restricti on des usages de l’eau.")
    assert "pesticides" not in causes(turbidite) and "turbidité" in causes(turbidite)
    arsenic = ("Eau d'alimentation non conforme à la limite de qualité réglementaire p our le paramètre ARSENIC. La consommation "
               "régulière de l'eau pour la boisson est décon seillée. Eau d'a limentation ne satisfaisant pas aux références de "
               "qualité microbiologique réglementaires en vigueur en raison de la présence de germes de type coliformes. Toutefois, "
               "la présence seule et en faible nombre de coliformes, en l'absence de tout autre germe d'origine fécale, ne présente "
               "pas de risque sanitaire pour le consommateur.")
    assert causes(arsenic) == ["arsenic"]
    # « NON CONFORME AUX NORMES BACTERIOLOGIQUES » n'écarte pas la bactériologie, « conforme aux normes… » l'écarte
    assert "bactériologie" in causes("1)EAU NON CONFORME AUX NORMES BACTERIOLOGIQUES (forte contamination fécale). EAU IMPROPRE "
                                     "A LA CONSOMMATION HUMAINE - RISQUE SANITAIRE IMPORTANT nécessitant une restriction des "
                                     "usages de l'eau (prise d'un arrêté municipal).")
    assert causes("Teneur en nitrates supérieure à la limite de qualité rendant l'eau IMPROPRE A LA CONSOMMATION HUMAINE. EAU "
                  "CONFORME AUX NORMES BACTERIOLOGIQUES COLIFORMES TOTAUX") == ["nitrates"]
    # une vraie restriction « pesticides » garde sa cause
    assert causes("Le résultat du recontrôle est toujours non conforme à la limite de qua lité pour le paramètre « pesticides » "
                  "par substance individuelle et/ou la somme des pesticides. L'eau ne doit pas être consommée.") == ["pesticides"]
    assert causes("La consommation d'eau reste interdite du fait du dépassement récurrent de Terbuméthon Déséthyl.") == ["pesticides"]
    assert causes(CHERBOURG_0909) == ["PFAS"]
    # « installations de plomberie » n'est pas du plomb
    assert "plomb" not in causes("L'eau peut présenter un goût métallique et une coloration qui tache le linge et les "
                                 "installations de plomberie. L'eau ne doit pas être consommée.")


def test_avis_ars_manganese():
    """Fonsorbes (07/07/2026) : restriction pour les enfants de moins de 4 ans à cause du manganèse, cause jusque-là absente."""
    from robinet.avis import causes
    t = ("Eau d'alimentation non conforme aux exigences de qualité en vigueur. L a non-conformité concernant le manganèse a "
         "nécessité une restriction d e la consommation de l'eau pour les enfants de moins de 4 ans. Des mes ures correctives "
         "ont été demandées à l'exploitant.")
    assert classer(t) == "sensibles" and causes(t) == ["manganèse"]


# --- Délégations sans information (constat du 2026-09-24) : une conclusion « évoque » une consigne quand elle la prescrit,
# l'écarte ou en rappelle la règle ; une délégation dont aucune conclusion de l'année n'en parle ne renseigne pas. -------
ISERE = "Eau d'alimentation non-conforme aux limites de qualité et conforme aux références de qualité."


@pytest.mark.parametrize("texte, attendu", [
    # conclusions types de l'Isère (trois formulations pour 877 prélèvements non conformes, 2023-2026)
    (ISERE, False),
    ("Eau d'alimentation conforme aux exigences de qualité en vigueur pour l'ensemble des paramètres mesurés.", False),
    # faux signaux : ressource vulnérable (Charente-Maritime, Deux-Sèvres), substance interdite (Dordogne)
    ("Eau d'alimentation conforme aux limites de qualité. Toutefois l’eau pr ovient d’une ressource vulnérable aux pollutions "
     "et fait l’objet d’un suivi resserré car la valeur indicative de 0,9 µg/L pour le métabolite R471811 est dépassée.", False),
    ("La limite de qualité réglementaire pour le métolachlore (herbicide interdit depuis 2024) est de 0,1 µg/L.", False),
    # consigne écartée : la conclusion renseigne (Finistère 2026, Yvelines, Dordogne 2026)
    ("Dans l’attente de leurs résultats, aucune restriction des usages de l’eau n’est préconisée.", True),
    ("Non-conformité n'entrainant pas de mesure de restriction de consommation.", True),
    ("Les concentrations relevées ne nécessitent pas de restri ction d’usage.", True),
    # consigne prescrite, y compris sans le mot « restriction » (Martinique, Charente-Maritime)
    ("Eau non potable au moment du prélèvement. Un prélèvement de confirmation de ces résultats sera effectué.", True),
    ("Eau de mauvaise qualité bactériologique impropre à la consommation humaine.", True),
    # rappel de règle (Rennes, 22/07/2026)
    (RENNES, True),
    (None, False),
])
def test_avis_evoque_une_consigne(texte, attendu):
    from robinet.avis import evoque
    assert evoque(texte) is attendu


def test_avis_sans_information_zero_strict_dans_l_annee():
    from robinet.avis import sans_information
    assert sans_information(8237, 0)        # Isère 2025
    assert not sans_information(4889, 10)   # Gironde 2024 : dix conclusions en parlent
    assert not sans_information(0, 0)       # aucune conclusion : pas de jugement


def test_avis_classe_evoque_toujours_une_consigne():
    """Un texte porteur d'un avis évoque une consigne : une délégation qui a des avis n'est jamais « sans information »."""
    from robinet.avis import evoque
    avis = [
        "elle fait l’obj et d’une mesure d’interdiction de consommation permanente pour préserv er la santé",
        "CETTE EAU NE DOIT PAS ETRE UTILISEE POUR LA CONSOMMATION HUMAINE SANS EBULLITION PREALABLE.",
        "l'eau doit être bouillie 2 minutes avant d'être consommée",
        "En attendant, cette eau est déconseillée aux populations sensibles (femmes enceintes, nourrissons).",
        "perchlorate entre 4µg/l et 15µg/l, l'Anses préconise de ne pas préparer de biberons avec l'eau du robinet pour les nourrissons",
        "Eau de mauvaise qualité contenant des oocystes de cryptosporidium la r endant impropre à la boisson",
        CHERBOURG_0909,
    ]
    assert all(classer(t) for t in avis)
    assert all(evoque(t) for t in avis)


def test_causes_des_familles_sont_des_causes_lues():
    """Chaque cause qui vaut restriction pour une famille (situations.py) doit exister dans avis.CAUSES, à l'accent près."""
    from robinet.avis import CAUSES
    from robinet.situations import CAUSES_FAMILLE
    assert {c for liste in CAUSES_FAMILLE.values() for c in liste} <= set(CAUSES)


@pytest.mark.parametrize("code, info, attendu", [
    ("6219", {"l": "Perchlorate", "f": "physico_chimie"}, "perchlorate"),
    ("8858", {"l": "acide trifluoroacétique", "f": "physico_chimie"}, "tfa"),
    ("6853", {"l": "OXA metolachlore", "f": "physico_chimie"}, "metabolites"),
    ("7727", {"l": "CGA 369873", "f": "physico_chimie"}, "metabolites"),
    ("6561", {"l": "Acide sulfonique de perfluorooctane (PFOS)", "f": "pfas"}, "pfas"),
    ("1481", {"l": "Acide dichloroacétique", "f": "physico_chimie"}, "haloacetiques"),
    ("1580", {"l": "1,4 dioxane", "f": "physico_chimie"}, "autres"),
    # une substance qui a une limite n'est pas « hors grille », même si son libellé ressemble à un métabolite
    ("6854", {"l": "ESA metolachlore", "f": "pesticides", "lim": "<=0,1 µg/L"}, None),
    ("8847", {"l": "Somme de 20 PFAS", "f": "pfas", "lim": "<=0,1 µg/L"}, None),
    ("1398", {"l": "Chlore libre", "f": "physico_chimie"}, None),
])
def test_hors_grille_groupes(code, info, attendu):
    from robinet.horsgrille import groupe
    assert groupe(code, info) == attendu


def test_hors_grille_reperes():
    from robinet.horsgrille import reperes
    assert [r["v"] for r in reperes("6219", "perchlorate")] == [4, 15]
    assert [r["v"] for r in reperes("6853", "metabolites")] == [0.9]
    assert reperes("8858", "tfa") == []  # aucun repère cité par les ARS pour le TFA


def test_secheresse_niveau_d_un_arrete():
    """Le niveau d'un arrêté est celui de sa zone la plus grave ; le niveau « eau potable » ne lit que les zones AEP."""
    from robinet.build_secheresse import niveaux_arrete
    assert niveaux_arrete(["SUP", "SOU", "SUP"], ["vigilance", "crise", "alerte"]) == (4, 0)
    assert niveaux_arrete(["SUP", "AEP"], ["alerte_renforcee", "alerte"]) == (3, 2)
    assert niveaux_arrete([], []) == (0, 0)
    assert niveaux_arrete(["SUP"], ["inconnu"]) == (0, 0)


def test_nappes_classe_du_mois():
    """Rang centile parmi les mêmes mois passés, classes de l'IPS du BRGM ; moins de 15 années : pas de classe."""
    from robinet.build_nappes import classe
    hist = [float(v) for v in range(20)]  # 20 années, niveaux 0 à 19
    assert classe(-1, hist) == 0          # sous toutes les années : très bas
    assert classe(9.5, hist) == 3         # au milieu : autour de la normale
    assert classe(25, hist) == 6          # au-dessus de toutes : très haut
    assert classe(2.5, hist) == 1         # 15 % des années plus basses : bas
    assert classe(5, hist[:14]) is None   # historique trop court


def test_nappes_bord_de_bande_egal_seuil_de_classe():
    """Juste sous le bord bas de la bande normale, la classe est « très bas » ; juste au-dessus, « bas »."""
    import math

    from robinet.build_nappes import classe
    h = sorted(float(v) for v in range(30))
    bord_bas = h[max(0, math.ceil(0.1 * len(h)) - 1)]
    assert classe(bord_bas - 0.01, h) == 0
    assert classe(bord_bas + 0.01, h) == 1
    bord_haut = h[max(0, math.ceil(0.9 * len(h)) - 1)]
    assert classe(bord_haut + 0.01, h) == 6


@pytest.mark.parametrize("nom, profonde", [
    ("Albien", True),
    ("Cenomanien", True),
    ("Système aquifère de l'Albien et du Néocomien", True),
    ("Système aquifère du Cénomanien", True),
    ("Partie captive de la nappe des grès du Trias inférieur", True),
    # zones mixtes : leur partie superficielle ou peu profonde reste comptée
    ("Systèmes aquifères de la nappe de Beauce et du Cénomanien et Bassin hydrographique de l'Aigre", False),
    ("Beauce", False),
    ("Bassin hydrographique du Clain", False),
])
def test_zre_seules_les_nappes_profondes_pures_sont_exclues(nom, profonde):
    from robinet.build_ressource import ZRE_PROFONDES
    assert bool(ZRE_PROFONDES.fullmatch(nom)) is profonde


def test_point_dans_polygone_avec_trou():
    from robinet.build_ressource import en_zre
    carre = [(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)]
    trou = [(4, 4), (6, 4), (6, 6), (4, 6), (4, 4)]
    zones = [{"nom": "Test", "type": "ZRESout", "profonde": False, "bbox": (0, 0, 10, 10), "polys": [(carre, [trou])]}]
    assert en_zre((2, 2), "SOUT", zones)
    assert not en_zre((5, 5), "SOUT", zones)       # dans le trou
    assert not en_zre((2, 2), "CONT", zones)       # prise en rivière : une ZRE souterraine ne la concerne pas
    assert not en_zre((12, 2), "SOUT", zones)      # hors de la zone


def test_evolution_des_prelevements_comparable():
    """Moyennes sur trois ans ; pas d'évolution publiée si le nombre d'ouvrages déclarants a trop changé."""
    from robinet.build_ressource import evolution_comparable
    stable = {("A", f"o{i}"): {2011: 10, 2012: 10, 2013: 10, 2021: 11, 2022: 11, 2023: 11} for i in range(10)}
    evol, ratio = evolution_comparable(stable, 2023, 2013)
    assert evol["A"] == 10.0 and ratio["A"] == 1.0
    # année récente sans déclaration : ne compte pas pour zéro
    trou = {("A", f"o{i}"): {2011: 10, 2012: 10, 2013: 10, 2021: 11, 2023: 11} for i in range(10)}
    assert evolution_comparable(trou, 2023, 2013)[0]["A"] == 10.0
    # trois fois plus d'ouvrages déclarants qu'avant : non comparable
    nouveaux = dict(stable) | {("A", f"n{i}"): {2021: 5, 2022: 5, 2023: 5} for i in range(20)}
    assert "A" not in evolution_comparable(nouveaux, 2023, 2013)[0]
