"""Avis sanitaires de l'ARS : classement des conclusions de prélèvement (DIS_PLV.conclusionprel).

Chaque prélèvement du contrôle sanitaire porte une conclusion rédigée par l'ARS. Au-delà de « conforme /
non conforme », elle dit si la consommation de l'eau est restreinte, déconseillée à une partie de la
population, ou soumise à une consigne d'ébullition. C'est l'information la plus directement utile à un
habitant, et elle n'est portée par aucune colonne structurée : il faut la lire dans ce texte libre.

Le texte est très hétérogène (51 000 formulations distinctes sur 2023-2026, espaces parasites au milieu
des mots : « L a non-conformité », « d emandé »). On le compare donc « écrasé » : minuscules, sans accents,
sans aucun caractère autre que lettres et chiffres.

Il est lu phrase par phrase (décision de l'auteur du 2026-09-23, après des restrictions affichées à tort sur
le site, dont Rennes, où un simple rappel de la règle sur les chlorates passait pour une restriction) :
- une phrase qui énonce un seuil (« au-delà de laquelle l'eau ne doit pas être consommée ») ou une mesure
  seulement envisagée (« pourront être demandées si les anomalies persistent ») ne porte aucune consigne ;
- une restriction niée (« n'entraînant pas de mesure de restriction », « ne conduisent pas, à ce stade, à
  prononcer des restrictions »), levée, ou citée comme seuil est retirée de la phrase, quels que soient les
  mots intercalés, sans jamais déborder sur la phrase suivante ;
- une consigne limitée au point de prélèvement est un avis local, comme celle limitée à un bâtiment ;
- une cause que le texte écarte (« pesticides… inférieurs aux valeurs sanitaires », coliformes « sans risque
  sanitaire ») n'est pas une cause de la consigne.
"""
from __future__ import annotations

import re
import unicodedata
from typing import NamedTuple

# Ordre de gravité décroissant : un prélèvement prend la catégorie la plus grave qu'il mentionne.
CATEGORIES = ("interdiction", "ebullition", "sensibles")
LIBELLES = {
    "interdiction": "consommation interdite ou déconseillée à tous",
    "ebullition": "consigne d'ébullition",
    "sensibles": "déconseillée aux populations sensibles",
}

# Briques des motifs de négation. Le texte écrasé n'a plus de limites de mots (« pas » est aussi dans
# « dépassement ») : une négation est donc toujours ancrée sur un verbe d'une liste fermée, et seuls les mots
# intercalés entre elle et le nom de la consigne sont libres.
_NOM = r"(interdictions?|restrictions?|interdire|restreindre)"
_VERBE = (r"(necessit|necessair|entrain|justifi|condui|engendr|impos|impliqu|amen|motiv|declench|provoqu|induis|requi"
          r"|donn|oblig|depass|atteign|atteint)[a-z]{0,6}")
# Mots intercalés (« pas, à ce stade, à prononcer des »), sans franchir une opposition (« mais une restriction… »).
_ENTRE = r"(?:(?!mais|cependant|neanmoins|pourtant|enrevanche|sauf)[a-z0-9]){0,60}?"
_ADVERBES = r"(donc|desormais|toutefois|bien|aujourdhui|maintenant|entierement|completement|totalement)*"

# Formulations qui disent qu'il n'y a PAS de restriction en vigueur : retirées de la phrase avant la recherche des
# formulations positives, sinon « n'a pas nécessité de restriction de la consommation » serait lu comme une restriction.
NEGATIONS = [
    r"(na|n)?(toutefois)?pas(eu)?(ete)?(juge)?necessaire(de)?(prendre|mettre)?(en)?(place)?(des|de|une|la)?(mesures?)?(de)?restrictions?",
    r"(na|n)?(toutefois)?pas(encore)?necessite(de|des|une|la)?(mesures?)?(de)?restrictions?",
    r"nenecessite(nt)?pas(de|des|une|la)?(mesures?)?(de)?restrictions?",
    r"nejustifi(e|ent|ant)pas(de|des|une|la)?(mesures?)?(de)?restrictions?",
    r"sans(aucune)?(mesures?)?(de)?restrictions?", r"aucune(mesures?)?(de)?restrictions?", r"pasderestrictions?",
    r"ne(fait|font)pas(lobjet)?(de|dune|des)?restrictions?",
    r"restrictions?\w{0,40}?ne(sont|est)pas(requises?|necessaires?|justifiees?)",
    # verbe nié puis le nom : « n'entrainant pas de mesure de restriction », « ne conduisent pas, à ce stade, à
    # prononcer des restrictions », « ne justifie pas de prendre de mesures de restriction », « ne nécessitant pas
    # non plus de restriction », « ne dépasse pas la valeur imposant des restrictions »
    r"n(e)?" + _VERBE + r"(pas|plus|aucune?)" + _ENTRE + _NOM,
    # auxiliaire nié : « n'a (toutefois) pas nécessité », « n'y a pas eu nécessité de prendre », « n'a pas entraîné »
    r"n(e)?y?(a|ont|avait|avaient|aurait|auraient)(toutefois|donc|cependant|pourtant)?(pas|plus|point)(nonplus|eu|ete|encore)*"
    + _VERBE + _ENTRE + _NOM,
    # « Il n'y a pas eu de demande d'interdiction de consommation »
    r"n(e)?y?(a|avait|aurait|aura)(toutefois|donc|cependant)?(pas|plus|point|jamais)(eu|ete)?(de|d|aucune?)"
    r"(demandes?|mesures?|arretes?|decisions?)?(de|d)?" + _NOM,
    # « la consommation de l'eau n'est pas / plus interdite »
    r"n(e)?(est|sont|etait|etaient|a|ont)(pas|plus)(ete)?interdite?s?",
    # « ne fait pas (pour le moment) l'objet d'une restriction »
    r"ne(fait|font|faisait|faisaient)(pas|plus)" + _ENTRE + r"lobjet" + _ENTRE + _NOM,
    # le nom puis la négation : « une restriction de la consommation de l'eau n'a pas été nécessaire » (la négation
    # est exigée : sans elle, « consommation a été mise en place » passerait pour « … n'a été mise en place »)
    _NOM + _ENTRE + r"n(e)?(a|ont|est|sont|etait|etaient|avait|avaient)(toutefois|donc)*(pas|plus|jamais|point)(ete|eu)?"
    r"(necessaires?|requises?|justifiees?|prononcees?|envisagees?|mis(e|es)?enplace|decidees?|utiles?|demandees?)",
    # « sans (aucune) nécessité (toutefois) de (prendre une) restriction », « aucune nécessité de restriction »
    r"(sans|aucune|pasde)(aucune)?(necessite|besoin)" + _ENTRE + _NOM,
    # « pas d'interdiction », « aucune mesure de restriction », « sans aucune restriction »
    r"(aucune?|pasde|pasd|sans)(aucune?)?(mesures?)?(de|d)?" + _NOM,
    # « l'eau reste consommable (par l'ensemble de la population) »
    r"(reste|restent|demeure|est)(donc)?consommable(s)?(sansrestrictions?)?(par|pour)?(lensembledelapopulation|tous|toutelapopulation)?",
]
# Seuil cité, pas une consigne : retiré avant tout le reste, avec ce qui le précise (« ne dépassant pas le seuil de
# 4 µg/l, seuil de restriction d'usage pour les nourrissons recommandé par l'Anses » : sans cela, la négation couperait
# la phrase à « restriction » et laisserait « pour les nourrissons recommandé… », lu comme une recommandation).
SEUILS_CITES = [
    # « seuil de restriction d'usage pour les nourrissons recommandé par l'Anses », « inférieure au seuil sanitaire de
    # restriction », « valeurs sanitaires nécessitant une restriction », « seuils sanitaires pour lesquels une
    # restriction est prononcée », « valeur imposant des restrictions »
    r"seuil(s)?de(la)?restrictions?(dusages?)?(pour)?(les)?(nourrissons|femmesenceintes|populationssensibles)?(recommandee?s?)?(par)?(lanses|lars|ladgs)?",
    r"(seuil|valeur)s?(sanitaires?|maximales?)?(de|d|imposant|necessitant|entrainant|declenchant|justifiant|pours?lesquel(le)?s?"
    r"|pours?laquelle|pours?lequel)(une|des|la|les|l)?(mesures?)?(de|d)?" + _NOM + r"(dusages?)?(pour)?(les)?"
    r"(nourrissons|femmesenceintes|populationssensibles)?(recommandee?s?)?(par)?(lanses|lars|ladgs)?",
    # « inférieures aux seuils d'intervention sanitaire à partir desquels des mesures de restriction sont prononcées »
    r"seuils?dinterventionsanitaire\w{0,40}", r"apartirdu?(des)?quel(le)?s?(des|une|la)?(mesures?)?(de)?restrictions?\w{0,40}",
]
# Autres formulations qui ne sont pas une consigne en vigueur, retirées de la même façon. À la différence des
# négations, elles ne disent rien de la cause citée (une restriction levée a bien eu lieu, pour sa cause).
AUTRES_RETRAITS = [
    # levée d'une consigne antérieure : l'eau est de nouveau consommable (« L'interdiction de consommer l'eau est
    # (donc) levée », « une demande de levée d'interdiction a été émise », « a permis de lever l'interdiction »,
    # « l'arrêté d'interdiction… a été abrogé »). « ne peut être levée », « pourra être levée », « ne permet pas de
    # lever », « avant une éventuelle levée », « la levée ne pourra intervenir qu'après… » disent au contraire que la
    # consigne est maintenue.
    r"(?<!eventuelle)(?<!avantla)(?<!avantune)(?<!envuedela)(?<!pourla)(?<!permettraientla)(?<!permettraitla)(?<!permettrala)"
    r"(?<!permettrontla)(?<!permettrela)levee(de|des|du|d)?(la|les|l)?(mesures?)?(de|d)?" + _NOM
    + r"(?![a-z0-9]{0,60}?(nepourr|nepeut|nesera|interviendra|quapres|pourr(a|ont|ait)etre(realisee|prononcee|decidee)))",
    _NOM + r"[a-z0-9]{0,90}?(?<!ne)(?<!ser)(?<!pourr)(?<!devr)(?<!aur)((est|sont|a|ont|peut|peuvent)" + _ADVERBES + r"(ete|etre)?"
    r"|(?<!pas)(?<!plus)(?<!jamais)(?<!point)(?<!encore)ete)" + _ADVERBES + r"(levee|abrogee?)s?",
    r"(permet|permettent|permis|permettant)(de|d)?leve(r|e)?[a-z0-9]{0,30}?(les|la|l)?(mesures?|demandes?)?(de|d)?" + _NOM,
    r"fin(de|des|du|d)?(la|les|l)?" + _NOM,
    # consigne conditionnelle (« si ces mesures ne permettent pas…, la population devra être informée »)
    r"sicesmesuresnepermettentpas\w{0,250}",
    # consigne qui ne vise pas l'eau : « ne pas consommer de produits supplémentés en fluor (dentifrices) »
    r"nepasconsommer(de|des|du)(produits?|complements?|dentifrices?)",
]

# Phrases qui ne portent aucune consigne en vigueur : un seuil énoncé comme une règle, ou une mesure seulement
# envisagée. « sauf lorsque… », « sauf en cas d'ébullition », « même lorsque… » restent des consignes.
CONDITIONNELS = [
    # seuil énoncé comme une règle : relative (« au-delà de laquelle », « à partir duquel ») n'importe où ; « au-delà de
    # 15 µg/l », « au-delà de la limite » seulement en tête de phrase, car ailleurs c'est un constat (« des dépassements
    # au-delà de 15 µg/l », « présence de nitrates au-delà de la limite de qualité »)
    r"(audela|apartir|audessus)(de|du|des)?(laquelle|duquel|lequel|desquel(le)?s)",
    r"^(ilestrappelequ|ilconvientderappelerqu|pourrappel|rappel)?(audela|apartir|audessus)(de|du|des)(\d|la(valeur|limite)|seuil)",
    r"desque(la|le|les)(concentration|teneur|valeur|taux)",
    r"(?<!sauf)(?<!meme)lorsqu", r"(?<!sauf)(?<!meme)encasd",
    r"pourr(a|ont|ait|aient)(anouveau|egalement|alors|donc|eventuellement)?etre"
    r"(demandee|envisagee|mis(e|es)?enplace|prononcee|prise|decidee|imposee|etendue)s?",
    r"pourr(a|ont|ait|aient)(anouveau|egalement|alors)?fairelobjet",
    r"(serai|devrai)(t|ent)(alors|donc)?(etre)?(mis(e|es)?enplace|prononcee?s?|necessaires?|envisagee?s?|decidee?s?|imposee?s?"
    r"|demandee?s?|adeconseiller|deconseillee?s?)",
    r"entrainer(a|ont|ait|aient)(l|la|une|des|de)?(interdiction|restriction)",
]
# Reprise d'un seuil (« Au-delà de cette valeur, … une restriction d'usage est nécessaire ») : une règle, sauf si la
# phrase précédente vient de dire ce seuil dépassé (« Le résultat montre un dépassement du seuil de 4 µg/L. Au-delà de
# ce seuil, … des restrictions de consommation sont prononcées pour les nourrissons »).
_REPRISE = re.compile(r"(audela|audessus)(de)?(cette(valeur|limite|teneur|concentration)|ceseuil)")
_DEPASSEMENT = re.compile(r"(depassement|depasse|depassant|superieure?s?|excede)(de|du|des|a|au|aux|la|le|les)*(seuil|valeur|limite)")
# « si » ne se lit qu'avec ses limites de mots (sinon « ainsi », « physique »…) : cherché dans la phrase en mots.
# « sauf si », « même si » et l'interrogation indirecte (« ne permet pas de déterminer si des bactéries… et a nécessité
# une restriction ») ne sont pas des conditions.
_SI = re.compile(r"(\w+ )?\bsi (elle|elles|il|ils|la|le|les|l|ce|ces|cette|celle|celles|celui|ceux|un|une|de|des|du|nouveau)\b")
_SI_NON_CONDITIONNEL = {"sauf", "meme", "determiner", "savoir", "verifier", "preciser", "evaluer", "connaitre", "dire", "voir",
                        "rechercher", "etablir", "identifier", "demander", "confirmer", "controler", "examiner", "analyser"}

# Consignes pour toute la population, sans ambiguïté.
GENERAL_FORT = [
    r"impropres?ala(consommation|boisson)", r"nepasboire", r"neplusboire",
    r"interdiction(de|dela)?(consommation|consommer|boire)", r"consommationinterdite", r"interdite?alaconsommation",
    r"eaunonpotable", r"nedoit(pas|plus)etreconsommee", r"memeapres(une)?ebullition", r"memebouillie",
]
# Consignes génériques : pour tous, sauf si le texte les réserve à un public sensible.
GENERAL_FAIBLE = [
    r"restrictions?(de|dela|des)?(la)?(consommation|usages?alimentaires?)", r"restrictions?dusages?",
    r"nepasconsommer", r"nepasutiliser", r"nedoitpasetreutilisee", r"deconseillee?s?",
]
EBULLITION = [r"ebullition", r"bouillir", r"(etre|soit)bouillie"]
# « même après / même quand elle est portée à ébullition » : l'ébullition n'y suffit pas, ce n'est pas une consigne d'ébullition.
_EBULLITION_INUTILE = re.compile(r"meme(apres|quand|lorsque|si|en)[a-z]{0,40}?(ebullition|bouillie|bouillir)|memebouillie")
SENSIBLES = [
    r"nour?risson", r"femmes?enceintes?", r"populations?sensibles?", r"personnes?sensibles?", r"groupesensible",
    r"(personnes|populations)(a|aux)risques?", r"personnesfragil", r"personnesagees", r"immunodeprim",
    r"vulnerables?", r"biberons?", r"jeunesenfants", r"enfantsdemoinsde", r"enfantssusmentionnes", r"(pour|aux|par|concernant)lesenfants",
    r"dialys",
]
# Interdiction énoncée librement (« La consommation d'eau est interdite jusqu'au retour à la conformité », « Depuis le
# 10/07/2025, la consommation de l'eau est interdite par arrêté préfectoral », « l'usage de cette eau à des fins
# alimentaires est interdit pour les femmes enceintes ») : une forme d'« interdire » et un usage de l'eau dans la même
# phrase, négations, levées et conditionnels déjà écartés. Une substance interdite (« pesticides désormais
# interdits », « fongicide dont l'utilisation est interdite ») n'est pas une consigne.
_INTERDIT = re.compile(r"interdi(t|re|ction)")
_USAGE = re.compile(r"consomm|boisson|boire|usages?alimentaires?|finsalimentaires?|alimentationhumaine|preparationdes?aliments"
                    r"|brossagedesdents|(utilisation|usage)s?(de|d)?(l|cette)?eau|biberon")
_SUBSTANCE_INTERDITE = re.compile(
    r"(pesticides?|substances?|molecules?|fongicides?|herbicides?|insecticides?|phytosanitaires?|produits?)"
    r"(desormais|aujourdhui|actuellement|deja)?interdit|dont(l)?(utilisation|usage|emploi|commercialisation)(est|aete)?(desormais)?interdit")
# Public visé par l'interdiction : un public sensible nommé dans la phrase (les biberons désignent un usage, pas un
# public), sauf si la phrase vise aussi toute la population.
_PUBLIC = re.compile("|".join(p for p in SENSIBLES if "biberon" not in p))
_TOUS = re.compile(r"(lensemble|toute?s?)(de)?(la|les)?(population|abonnes|usagers|consommateurs)|partous|atous")
# « L'interdiction de consommer l'eau est levée pour la population générale sauf pour les femmes enceintes… » : la levée
# retirée, il reste une interdiction pour ce public.
_SAUF_PUBLIC = re.compile(r"sauf(pour|par|concernant|aux|a)?(les|la|des|le)?(" + "|".join(p for p in SENSIBLES if "biberon" not in p) + ")")

# Causes lues dans le même texte, pour dire « pourquoi » sans rejoindre les résultats d'analyse.
CAUSES = {
    "nitrates": r"nitrate",
    "bactériologie": r"microbiolog|bacteri|coli|enterocoque|germe|coliforme",
    "perchlorates": r"perchlorate",
    "pesticides": r"pesticide|metabolite|phytosanitaire|chloridazone|atrazine|chlorothalonil|desethyl|terbu|metolachlore"
                  r"|bentazone|flufenacet|dimethachlore|metazachlore|glyphosate|nicosulfuron|metaldehyde|dinoterb|simazine",
    "PFAS": r"pfas|perfluoro|polyfluoro",
    "turbidité": r"turbidite",
    "chlorure de vinyle": r"chlorurede?vinyle|cvm",
    "plomb": r"plomb(?!er)",  # pas « installations de plomberie »
    "arsenic": r"arsenic",
    "fluorures": r"fluor(?!o)",  # pas « perfluoro » / « polyfluoro » (PFAS)
    "sélénium": r"selenium",
    "aluminium": r"aluminium",
    "manganèse": r"manganese",
    "radioactivité": r"radio|tritium|uranium",
    "chlorites / chlorates": r"chlorite|(?<!per)chlorate",  # pas « perchlorate »
    "trihalométhanes": r"trihalomethane",
}
# Une cause que le texte écarte n'est pas une cause de la consigne (« la concentration des pesticides concernés reste
# inférieure aux valeurs sanitaires », « la présence seule de coliformes ne présente pas de risque sanitaire »).
# Le ministère ne classe une eau en restriction pour les pesticides (NC2) qu'au-delà de la valeur sanitaire (Vmax).
ECARTEES = [
    r"inferieure?s?(a|aux)(la|les)?(valeurs?|seuils?)sanitaires?",
    r"(sans|ne)depass(ement|er|e|ent)?(pas)?(des?|du|les?|la)?(seuils?|valeurs?)(sanitaires?|derogatoires?|maximales?)",
    r"valeurs?sanitaires?[a-z0-9]{0,40}?n(a|ont|est|sont)(pas|jamais)(ete)?(depassee|atteinte)s?",
    r"nepresente(nt)?(pas|aucun)(de|dun)?(risque|danger)", r"neconstitue(nt)?(pas|aucun)(de|dun|un)?(risque|danger)",
    r"nerepresente(nt)?(pas|aucun)(de|dun)?(risque|danger)", r"sans(aucun)?(risque|danger)",
    # « conforme aux normes bactériologiques », mais pas « NON CONFORME AUX… » ni « n'est pas conforme aux… »
    r"(?<!non)(?<!pas)(?<!plus)conformes?aux(normes|limites|exigences|references)(de(qualite)?)?(bacteriologiques?|microbiologiques?)",
    # « La référence de qualité (norme non impérative) relative à la numération des bactéries coliformes n'est pas
    # satisfaite », dans un texte dont l'interdiction vient des PFAS (arrêtés du 10/07/2025 dans les Ardennes)
    r"normenonimperative",
    r"(peut|peuvent)(donc|toutefois|neanmoins|cependant)?etreconsommee?s?(partous|parlensembledelapopulation)?(sansrestrictions?)?$",
    r"(reste|restent|demeure)(donc)?consommables?",
]

_NEG = [re.compile(p) for p in NEGATIONS]
_RETRAITS = [re.compile(p) for p in SEUILS_CITES] + _NEG + [re.compile(p) for p in AUTRES_RETRAITS]
_COND = [re.compile(p) for p in CONDITIONNELS]
_FORT, _FAIBLE = [re.compile(p) for p in GENERAL_FORT], [re.compile(p) for p in GENERAL_FAIBLE]
_EBU, _SENS = [re.compile(p) for p in EBULLITION], [re.compile(p) for p in SENSIBLES]
_CONSIGNE = re.compile("|".join(GENERAL_FORT + GENERAL_FAIBLE + EBULLITION))
_RECOMMANDATION = re.compile(r"deconseill|recommand|preconis|eviter|conseill|limiter|preferer|bouteille|precautions?dusage|nepaspreparer")
_SENSIBLE = re.compile("|".join(SENSIBLES))
_CAUSES = {k: re.compile(p) for k, p in CAUSES.items()}
_ECARTEES = [re.compile(p) for p in ECARTEES]
# Fin de phrase : ponctuation suivie d'un blanc, ou point collé à la phrase suivante (« préalable.Des mesures »).
_FIN = re.compile(r"(?<=[.!?;])\s+|(?<=[a-zà-ÿ)])\.(?=[A-ZÀ-Ý])")

# Avis limité à un bâtiment ou à un point d'usage (plomb, chlorure de vinyle) : à ne pas lire comme une restriction
# sur tout le réseau.
_LOCAL = re.compile(r"representative?s?(que)?pour(le|un)?(point|secteur|batiment)|nest(pas)?representati|pasrepresentati"
                    r"|batimentconcerne|pointdutilisation|pointdusage|reseauinterieur|secteurconcerne|nevautquepour")
# Consigne limitée au point de prélèvement (« ne pas boire l'eau à ce point de prélèvement », « à l'adresse du
# prélèvement ») : repère cherché dans la phrase même de la consigne, pas ailleurs dans le texte.
_POINT = re.compile(r"(a|au|sur|en)(ce|cet|seul)?point(de|d)(prelevement|echantillonnage|puisage)|uniquementsur(ce|le)point"
                    r"|(sur|a)(ce|cet|seul)point(?!de(vue|vigilance|attention))|aladressedu(prelevement|preleve)|acetteadresse"
                    r"|(etablissement|robinet|antenne)concernee?|personneconcernee|(cette|la)fontaine|antennedereseau|cetteantenne"
                    r"|(interdiction|restriction)s?localisee|localisee?s?au(garage|batiment|domicile|logement|robinet|seul|point"
                    r"|centre|ecole|etablissement|creche|ehpad|mairie|salle|gymnase|camping|hopital|restaurant|entreprise)")
# Consigne qui vise tout le réseau ou toute la commune : elle n'est pas locale, même si le texte dit ailleurs que des
# teneurs en plomb « ne sont représentatives que du point d'utilisation » (constat sur une mesure, pas une portée).
_RESEAU = re.compile(r"arrete(prefectoral|municipal)|(la|toutela|lensembledela)population|toutelacommune|lensembledesabonnes"
                     r"|surcereseau|(lensemble|tout)dureseau")


class Lecture(NamedTuple):
    cat: str | None       # catégorie d'avis en vigueur (CATEGORIES), None sans consigne
    local: bool           # consigne limitée à un bâtiment, un point d'usage ou au point de prélèvement
    causes: list[str]     # causes citées (clés de CAUSES), hors causes que le texte écarte


def ecraser(texte: str | None) -> str:
    """Minuscules, sans accents, sans rien d'autre que [a-z0-9] : insensible aux espaces parasites du texte ARS."""
    if not texte:
        return ""
    t = unicodedata.normalize("NFD", texte.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", t)


def _en_mots(texte: str) -> str:
    """Minuscules, sans accents, mots séparés par une espace : pour les mots trop courts pour le texte écrasé (« si »)."""
    t = unicodedata.normalize("NFD", texte.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9]", " ", t).split())


def phrases(texte: str | None) -> list[str]:
    return [p for p in _FIN.split(texte or "") if p.strip()]


# « élevée », « relevée » contiennent « levée » une fois le texte écrasé (« turbidité élevée, des restrictions… » se
# lirait « levée des restrictions ») : remplacés avant de chercher une levée.
_ELEVEE = re.compile(r"\b(re|ré|e|é)lev[ée]e?s?\b", re.I)


def conditionnelle(phrase: str, precedente: str = "") -> bool:
    """La phrase énonce-t-elle un seuil ou une mesure seulement envisagée, plutôt qu'une consigne en vigueur ?"""
    e = ecraser(phrase)
    if any(c.search(e) for c in _COND):
        return True
    if _REPRISE.search(e) and not _DEPASSEMENT.search(ecraser(precedente)):
        return True
    return any((m.group(1) or "").strip() not in _SI_NON_CONDITIONNEL for m in _SI.finditer(_en_mots(phrase)))


def _causes_de(e: str) -> list[tuple[int, str]]:
    return sorted((m.start(), k) for k, p in _CAUSES.items() for m in p.finditer(e))


def _visee(mentions: list[tuple[int, str]], debut: int, fin: int, precedente: list[tuple[int, str]]) -> set[str]:
    """Cause visée par une expression qui l'écarte : celle qu'elle nomme (« conforme aux normes bactériologiques »),
    sinon la plus proche avant elle dans la phrase, sinon la première après elle, sinon la dernière de la phrase
    précédente qui en nomme une (« Ces dépassements n'engendrent pas à ce jour de restriction »)."""
    dedans = {k for pos, k in mentions if debut <= pos < fin}
    if dedans:
        return dedans
    avant = [k for pos, k in mentions if pos < debut]
    apres = [k for pos, k in mentions if pos >= fin]
    if avant or apres:
        return {avant[-1] if avant else apres[0]}
    return {precedente[-1][1]} if precedente else set()


def _interdiction(t: str) -> str | None:
    """Interdiction énoncée dans la phrase (négations retirées) : « cible » si elle vise un public sensible,
    « generale » sinon, None si la phrase n'interdit rien."""
    u = _SUBSTANCE_INTERDITE.sub("", t)
    if _SAUF_PUBLIC.search(u):
        return "cible"
    if not (_INTERDIT.search(u) and _USAGE.search(u)):
        return None
    return "cible" if _PUBLIC.search(u) and not _TOUS.search(u) else "generale"


def _porte_consigne(t: str) -> bool:
    """La phrase (négations retirées) porte-t-elle une consigne : interdiction, restriction, ébullition, ou
    recommandation adressée à un public sensible ?"""
    return bool(_CONSIGNE.search(t) or _interdiction(t) or (_SENSIBLE.search(t) and _RECOMMANDATION.search(t)))


def lire(texte: str | None) -> Lecture:
    """Catégorie d'avis en vigueur, portée locale et causes d'une conclusion de l'ARS.

    Ordre de décision, sur les phrases qui portent une consigne en vigueur : une consigne d'ébullition l'emporte
    (la restriction ne vaut que sans ébullition, sauf « même après ébullition ») ; puis une consigne explicitement
    générale ; puis une consigne générique, attribuée aux publics sensibles si le texte en nomme ; enfin la simple
    mention d'un public sensible dans une recommandation.
    """
    tout = ecraser(texte)
    toutes_causes = [k for k, p in _CAUSES.items() if p.search(tout)]
    local_texte = bool(_LOCAL.search(tout))
    if not tout or not (_CONSIGNE.search(tout) or _SENSIBLE.search(tout) or _INTERDIT.search(tout)):
        return Lecture(None, local_texte, toutes_causes)
    gardees: list[str] = []          # phrases hors seuils et mesures envisagées, formulations sans consigne retirées
    portees: list[bool] = []         # pour chaque phrase de consigne : locale ?
    interdictions: set[str] = set()  # « generale » / « cible » : interdictions énoncées librement (_interdiction)
    ecartees: set[str] = set()
    confirmees: set[str] = set()     # causes nommées dans une phrase de consigne, sans y être écartées
    precedente: list[tuple[int, str]] = []
    phrase_precedente = ""
    for p in phrases(texte):
        e = ecraser(_ELEVEE.sub("haute", p))
        mentions = _causes_de(e)
        # expressions qui écartent une cause, négations comprises (« … n'entrainant pas de mesure de restriction »)
        ici: set[str] = set()
        for m in [m for pat in _ECARTEES + _NEG for m in pat.finditer(e)]:
            ici |= _visee(mentions, m.start(), m.end(), precedente)
        ecartees |= ici
        if mentions:
            precedente = mentions
        cond = conditionnelle(p, phrase_precedente)
        phrase_precedente = p
        if cond:
            continue
        t = e
        for n in _RETRAITS:
            t = n.sub("", t)
        gardees.append(t)
        if (i := _interdiction(t)):
            interdictions.add(i)
        if _porte_consigne(t):
            # portée lue dans la phrase de la consigne ; à défaut, dans le reste du texte
            portees.append(True if (_LOCAL.search(e) or _POINT.search(e)) else False if _RESEAU.search(e) else local_texte)
            confirmees |= {k for _, k in mentions} - ici
    causes = [k for k in toutes_causes if k not in ecartees - confirmees]
    local = all(portees) if portees else local_texte
    # « | » marque la fin d'une phrase : aucun motif ne le franchit.
    t = "|".join(gardees)

    def a(ps): return any(p.search(t) for p in ps)
    faible, ebu, sens = a(_FAIBLE), a(_EBU), a(_SENS)
    # Une interdiction suivie de près d'un public sensible, dans la même phrase (« ne doit pas être consommée par les
    # nourrissons », « interdiction de consommer pour les femmes enceintes »), ne vise que ce public.
    fort_general = fort_cible = False
    for p in _FORT:
        for m in p.finditer(t):
            suite = t[m.end(): m.end() + 80].split("|")[0]
            if any(q.search(suite) for q in _SENS):
                fort_cible = True
            else:
                fort_general = True
    if ebu and not _EBULLITION_INUTILE.search(t):
        cat = "ebullition"
    elif fort_general or "generale" in interdictions:
        cat = "interdiction"
    elif fort_cible or "cible" in interdictions:
        cat = "sensibles"
    elif faible:
        cat = "sensibles" if sens else "interdiction"
    elif sens and _RECOMMANDATION.search(t):
        cat = "sensibles"
    else:
        cat = None
    return Lecture(cat, local, causes)


def classer(texte: str | None) -> str | None:
    """Catégorie d'avis en vigueur selon la conclusion, ou None si elle n'en contient aucune."""
    return lire(texte).cat


def local(texte: str | None) -> bool:
    return lire(texte).local


def causes(texte: str | None) -> list[str]:
    return lire(texte).causes


# ----------------------------------------------------------------------------------------------
# Délégations sans information : « aucun avis » n'y veut pas dire qu'il n'y en a pas eu
# ----------------------------------------------------------------------------------------------
# Constat du 2026-09-24 : dans 17 départements (Isère, Savoie, Ardèche, Lozère, Paris…), aucune conclusion de 2023 à 2026
# n'évoque de consigne, pas même pour l'écarter, malgré des centaines de prélèvements non conformes en bactériologie
# (Isère : 584, sous trois formulations types). Ces délégations de l'ARS ne portent pas les consignes dans les conclusions.
# Vocabulaire d'une consigne prescrite, écartée (« n'entraînant pas de restriction ») ou rappelée : le préfiltre de lire()
# et les mots seuls (« restriction », « interdi- »…), sans deux faux signaux relevés le même jour (« ressource vulnérable
# aux pollutions », « herbicide interdit depuis 2024 »).
_EVOQUE = re.compile(r"restriction|interdi|bouill|ebullition|deconseill|nepasconsommer|nepasboire")
_FAUX_SIGNAUX = re.compile(r"ressources?(tres|particulierement)?vulnerables?|" + _SUBSTANCE_INTERDITE.pattern)


def evoque(texte: str | None) -> bool:
    """La conclusion parle-t-elle d'une consigne sanitaire, pour la prescrire, l'écarter ou en rappeler la règle ?"""
    e = _FAUX_SIGNAUX.sub("", ecraser(texte))
    return bool(e and (_CONSIGNE.search(e) or _SENSIBLE.search(e) or _EVOQUE.search(e)))


def sans_information(conclusions: int, evoquant: int) -> bool:
    """Règle de l'auteur (2026-09-24) : une année où aucune conclusion d'une délégation n'évoque de consigne, l'absence
    d'avis n'y dit rien. Zéro strict, année par année : une phrase toujours vraie à la lettre, jamais en conflit avec un
    avis affiché (tout avis classé compte parmi les conclusions qui évoquent une consigne). Sans conclusion, pas de jugement."""
    return conclusions > 0 and evoquant == 0


# ----------------------------------------------------------------------------------------------
# Pipeline : tables DuckDB puis fichiers du site (web/public/data/avis/)
# ----------------------------------------------------------------------------------------------
CODE = {"sensibles": 1, "ebullition": 2, "interdiction": 3}


def charger(con, years: list[int]) -> None:
    """Classe les conclusions des prélèvements et crée quatre tables :

    avis_textes(id, texte, cat, local, causes)                 une ligne par formulation porteuse d'un avis
    avis_plv(referenceprel, annee, dateprel, cdreseau, id)     un prélèvement porteur d'un avis, par réseau
    avis_lecture(cddept, annee, conclusions, evoquant)         prélèvements conclus par chaque délégation de l'ARS, et
                                                               ceux dont la conclusion évoque une consigne (evoque)
    avis_muets(cddept, annee)                                  délégations sans information cette année-là
                                                               (sans_information) ; cddept au format SISE (« 038 »),
                                                               égal au préfixe du code de chacun de ses réseaux
    Les conclusions sont lues dans les Parquet DIS déjà convertis (rapide, sans relancer l'étape 1).
    """
    import pandas as pd

    from . import dis

    sources = []
    for y in years:
        p = dis.parquet_paths(y)["plv"]
        if not p.exists():
            raise RuntimeError(f"{p} absent : relancer `robinet build -y {y} --force`")
        sources.append((y, p.as_posix()))
    union = " UNION ALL ".join(
        f"SELECT {y} AS annee, referenceprel, dateprel, cddept, cdreseau, conclusionprel FROM read_parquet('{p}')" for y, p in sources)
    con.execute(f"CREATE OR REPLACE TEMP VIEW plv_conclusions AS {union}")
    # Triées : un même corpus donne les mêmes numéros de texte d'une construction à l'autre (comparaisons possibles).
    textes = [r[0] for r in con.execute(
        "SELECT DISTINCT conclusionprel FROM plv_conclusions WHERE conclusionprel IS NOT NULL ORDER BY 1").fetchall()]
    lignes = []
    evoquant = []
    for t in textes:
        a = lire(t)
        if a.cat:
            lignes.append({"id": len(lignes), "texte": t, "cat": a.cat, "local": a.local, "causes": ",".join(a.causes)})
        # Un avis classé évoque toujours une consigne, même si un faux signal écarté par evoque() l'a porté.
        if a.cat or evoque(t):
            evoquant.append(t)
    df = pd.DataFrame(lignes, columns=["id", "texte", "cat", "local", "causes"])
    con.register("avis_textes_df", df)
    con.execute("CREATE OR REPLACE TABLE avis_textes AS SELECT * FROM avis_textes_df")
    con.unregister("avis_textes_df")
    con.execute("""
        CREATE OR REPLACE TABLE avis_plv AS
        SELECT DISTINCT p.referenceprel, p.annee, p.dateprel, p.cdreseau, t.id
        FROM plv_conclusions p JOIN avis_textes t ON p.conclusionprel = t.texte
        WHERE p.cdreseau IS NOT NULL AND p.cdreseau <> ''""")
    n = con.execute("SELECT count(DISTINCT referenceprel) FROM avis_plv").fetchone()[0]
    print(f"  avis ARS : {len(lignes):,} formulations porteuses d'un avis, {n:,} prélèvements")
    con.register("avis_evoquant_df", pd.DataFrame({"texte": evoquant}, columns=["texte"]))
    con.execute("""
        CREATE OR REPLACE TABLE avis_lecture AS
        SELECT p.cddept, p.annee, count(DISTINCT p.referenceprel) AS conclusions,
               count(DISTINCT p.referenceprel) FILTER (WHERE e.texte IS NOT NULL) AS evoquant
        FROM plv_conclusions p LEFT JOIN avis_evoquant_df e ON p.conclusionprel = e.texte
        WHERE p.cddept IS NOT NULL AND trim(coalesce(p.conclusionprel, '')) <> ''
        GROUP BY 1, 2""")
    con.unregister("avis_evoquant_df")
    muets = [(cd, int(a)) for cd, a, nc, ne in con.execute("SELECT * FROM avis_lecture ORDER BY 1, 2").fetchall()
             if sans_information(int(nc), int(ne))]
    con.execute("CREATE OR REPLACE TABLE avis_muets (cddept VARCHAR, annee INTEGER)")
    if muets:
        con.executemany("INSERT INTO avis_muets VALUES (?, ?)", muets)
    print(f"  délégations de l'ARS sans information de consigne : {len(muets)} (département × année)")


def publier(con, years: list[int]) -> None:
    """avis/national.json (compteurs, causes, départements, lecture des délégations) et avis/<dd>.json (avis par
    commune, avec le texte, et lecture des délégations dont les réseaux desservent ses communes).

    lecture : {délégation: {année: [prélèvements conclus, dont la conclusion évoque une consigne]}}
    sans_information : {année: [délégations sans information (sans_information)]}
    Une délégation porte le code du département qu'elle suit, au format du site (« 38 », « 2B », « 974 »).
    """
    from collections import defaultdict

    from . import config as C
    from .build import _dept_of_insee, _dump
    from .situations import _dept

    # Prélèvement × commune : un avis sur un réseau vaut pour toutes les communes qu'il dessert cette année-là.
    con.execute("""
        CREATE OR REPLACE TEMP VIEW avis_com AS
        SELECT DISTINCT cu.inseecommune, a.referenceprel, a.annee, a.dateprel, a.cdreseau, a.id, t.cat, t.local, t.causes
        FROM avis_plv a JOIN avis_textes t USING (id) JOIN com_reseau cu USING (cdreseau, annee)""")
    nat: dict = {"libelles": LIBELLES, "annees": {}, "causes": {}, "depts": {}}
    for annee, cat, loc, nplv, nres, ncom in con.execute("""
            SELECT annee, cat, local, count(DISTINCT referenceprel), count(DISTINCT cdreseau), count(DISTINCT inseecommune)
            FROM avis_com GROUP BY 1, 2, 3""").fetchall():
        a = nat["annees"].setdefault(str(annee), {})
        cle = "local" if loc else cat
        cur = a.setdefault(cle, {"plv": 0, "reseaux": 0, "communes": 0})
        # « local » regroupe plusieurs catégories : sommer est une approximation acceptable (ce sont des bâtiments
        # ou points d'usage distincts) ; les catégories réseau, elles, ne sont jamais sommées entre elles.
        cur["plv"] += int(nplv)
        cur["reseaux"] += int(nres)
        cur["communes"] += int(ncom)
    # Communes touchées par au moins un avis réseau (hors avis locaux), toutes catégories : pour la part par département.
    for annee, n in con.execute("""
            SELECT annee, count(DISTINCT inseecommune) FROM avis_com WHERE NOT local GROUP BY 1""").fetchall():
        nat["annees"].setdefault(str(annee), {})["communes_toutes"] = int(n)
    for annee, cat, cs, n in con.execute("""
            SELECT a.annee, t.cat, t.causes, count(DISTINCT a.referenceprel)
            FROM avis_plv a JOIN avis_textes t USING (id) WHERE NOT t.local GROUP BY 1, 2, 3""").fetchall():
        d = nat["causes"].setdefault(str(annee), {}).setdefault(cat, {})
        for c in (cs.split(",") if cs else ["non précisée"]):
            d[c] = d.get(c, 0) + int(n)
    par_dept: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    fiches: dict = defaultdict(lambda: {"textes": {}, "communes": defaultdict(list)})
    for insee, ref, annee, date, res, tid, cat, loc, cs in con.execute(
            "SELECT inseecommune, referenceprel, annee, dateprel, cdreseau, id, cat, local, causes FROM avis_com").fetchall():
        dd = _dept_of_insee(insee)
        if not loc:
            par_dept[dd][str(annee)][cat].add(insee)
        f = fiches[dd]
        f["textes"][str(tid)] = None
        f["communes"][insee].append([date, int(tid), res])
    textes = {int(i): (t, c, bool(l), cs) for i, t, c, l, cs in con.execute(
        "SELECT id, texte, cat, local, causes FROM avis_textes").fetchall()}
    for dd, by_year in par_dept.items():
        nat["depts"][dd] = {a: {cat: len(s) for cat, s in cats.items()} | {"toutes": len(set().union(*cats.values()))}
                            for a, cats in by_year.items()}
    lecture: dict = defaultdict(dict)
    for cd, annee, nc, ne in con.execute("SELECT * FROM avis_lecture ORDER BY 1, 2").fetchall():
        lecture[_dept(cd, "")][str(annee)] = [int(nc), int(ne)]
    muets: dict = {str(y): [] for y in years}
    for cd, annee in con.execute("SELECT cddept, annee FROM avis_muets ORDER BY 1, 2").fetchall():
        muets.setdefault(str(annee), []).append(_dept(cd, ""))
    nat["lecture"] = dict(lecture)
    nat["sans_information"] = muets
    _dump(C.WEB_DATA / "avis" / "national.json", nat)
    # Délégations dont les réseaux desservent les communes de chaque fichier : la fiche juge chaque réseau selon la
    # délégation qui le suit (préfixe de son code), pas selon le département de la commune (14 communes par an).
    delegations: dict = defaultdict(set)
    for insee, cd in con.execute("SELECT DISTINCT inseecommune, substr(cdreseau, 1, 3) FROM com_reseau").fetchall():
        delegations[_dept_of_insee(insee)].add(_dept(cd, ""))
    # Un fichier par département, même vide : la fiche commune le charge toujours, et un 404 attendu serait
    # affiché comme une panne par les autres encarts en cours de chargement (components/Chargement.tsx).
    for dd in C.DEPARTEMENTS:
        fiches.setdefault(dd, {"textes": {}, "communes": {}})
    for dd, f in fiches.items():
        out = {"textes": {}, "communes": {}}
        for tid in f["textes"]:
            t, c, l, cs = textes[int(tid)]
            out["textes"][tid] = {"t": t, "c": c, "l": l, "k": cs.split(",") if cs else []}
        for insee, lst in f["communes"].items():
            out["communes"][insee] = sorted({tuple(x) for x in map(tuple, lst)}, reverse=True)
        ici = sorted(delegations[dd] | {dd})
        out["lecture"] = {d: lecture[d] for d in ici if d in lecture}
        out["sans_information"] = {a: [d for d in ds if d in ici] for a, ds in muets.items()}
        _dump(C.WEB_DATA / "avis" / f"{dd}.json", out)
