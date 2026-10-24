import hmac
import json
import math
import os
import secrets
import time
import unicodedata
import urllib.parse
import urllib.request
from functools import wraps
from flask import Flask, render_template, jsonify, request, g, session, redirect, url_for, send_file, abort
import sqlite3
import re
from pathlib import Path

from dotenv import load_dotenv

from translations import DEFAULT_LANGUAGE, LANGUAGES, TRANSLATIONS

# lit le fichier .env à côté de app.py (les variables déjà définies dans l'environnement priment)
load_dotenv(Path(__file__).with_name(".env"))

DATABASE = Path(__file__).with_name("twin_cities.db")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
# Pas de mot de passe par défaut : sans ADMIN_PASSWORD, le back-office est inaccessible.
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
FLAGS_DIR = Path(__file__).with_name("static") / "flags"
FLAGS_DIR.mkdir(parents=True, exist_ok=True)

# Mappe le nom de pays (colonne Villes.pays, en français) vers le code ADM0_A3
# du jeu de données Natural Earth utilisé par la carte choroplèthe du front-office.
COUNTRY_ISO_MAP = {
    "Afghanistan": "AFG", "Afrique du Sud": "ZAF", "Albanie": "ALB", "Algérie": "DZA",
    "Allemagne": "DEU", "Andorre": "AND", "Angola": "AGO", "Arabie saoudite": "SAU",
    "Argentine": "ARG", "Arménie": "ARM", "Australie": "AUS", "Autriche": "AUT",
    "Azerbaïdjan": "AZE", "Bahamas": "BHS", "Belgique": "BEL", "Biélorussie": "BLR",
    "Bolivie": "BOL", "Bosnie-Herzégovine": "BIH", "Brésil": "BRA", "Bulgarie": "BGR",
    "Burkina Faso": "BFA", "Bénin": "BEN", "Cambodge": "KHM", "Cameroun": "CMR",
    "Canada": "CAN", "Cap-Vert": "CPV", "Chili": "CHL", "Chypre": "CYP",
    "Chypre du Nord": "CYN", "Colombie": "COL", "Corée du Nord": "PRK",
    "Corée du Sud": "KOR", "Costa Rica": "CRI", "Croatie": "HRV", "Cuba": "CUB",
    "Curaçao": "CUW", "Côte d'Ivoire": "CIV", "Danemark": "DNK", "Djibouti": "DJI",
    "Espagne": "ESP", "Estonie": "EST", "Finlande": "FIN", "France": "FRA",
    "Gabon": "GAB", "Gambie": "GMB", "Ghana": "GHA", "Groenland": "GRL",
    "Grèce": "GRC", "Guatemala": "GTM", "Guinée-Bissau": "GNB", "Géorgie": "GEO",
    "Haïti": "HTI", "Honduras": "HND", "Hongrie": "HUN", "Inde": "IND",
    "Indonésie": "IDN", "Irak": "IRQ", "Iran": "IRN", "Irlande": "IRL",
    "Islande": "ISL", "Israël": "ISR", "Italie": "ITA", "Japon": "JPN",
    "Jordanie": "JOR", "Kazakhstan": "KAZ", "Kirghizistan": "KGZ", "Koweït": "KWT",
    "Laos": "LAO", "Lesotho": "LSO", "Lettonie": "LVA", "Liban": "LBN",
    "Libye": "LBY", "Liechtenstein": "LIE", "Lituanie": "LTU", "Luxembourg": "LUX",
    "Macédoine du Nord": "MKD", "Madagascar": "MDG", "Malaisie": "MYS",
    "Malawi": "MWI", "Mali": "MLI", "Maroc": "MAR", "Mauritanie": "MRT",
    "Mexique": "MEX", "Moldavie": "MDA", "Mongolie": "MNG", "Monténégro": "MNE",
    "Mozambique": "MOZ", "Namibie": "NAM", "Nicaragua": "NIC", "Niger": "NER",
    "Nigeria": "NGA", "Norvège": "NOR", "Nouvelle-Zélande": "NZL", "Oman": "OMN",
    "Ouzbékistan": "UZB", "Pakistan": "PAK", "Panama": "PAN", "Paraguay": "PRY",
    "Pays-Bas": "NLD", "Philippines": "PHL", "Pologne": "POL", "Portugal": "PRT",
    "Pérou": "PER", "Qatar": "QAT", "Roumanie": "ROU", "Royaume-Uni": "GBR",
    "Russie": "RUS", "République arabe sahraouie démocratique": "SAH",
    "République dominicaine": "DOM", "République du Congo": "COG",
    "République démocratique du Congo": "COD", "République populaire de Chine": "CHN",
    "Salvador": "SLV", "Sao Tomé-et-Principe": "STP", "Serbie": "SRB",
    "Sierra Leone": "SLE", "Slovaquie": "SVK", "Slovénie": "SVN", "Somalie": "SOM",
    "Soudan": "SDN", "Suisse": "CHE", "Suriname": "SUR", "Suède": "SWE",
    "Syrie": "SYR", "Sénégal": "SEN", "Taïwan": "TWN", "Tchéquie": "CZE",
    "Thaïlande": "THA", "Timor oriental": "TLS", "Tripolitaine italienne": "LBY",
    "Tunisie": "TUN", "Turkménistan": "TKM", "Turquie": "TUR", "Ukraine": "UKR",
    "Uruguay": "URY", "Venezuela": "VEN", "Vietnam": "VNM", "Zambie": "ZMB",
    "Égypte": "EGY", "Émirats arabes unis": "ARE", "Équateur": "ECU",
    "État de Palestine": "PSX", "États-Unis": "USA", "Éthiopie": "ETH",
    "îles Féroé": "FRO",
}

app = Flask(__name__, static_folder="static", template_folder="templates")
# Sans FLASK_SECRET, une clé aléatoire est générée : les sessions sont perdues au redémarrage.
app.secret_key = os.environ.get("FLASK_SECRET") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")
if not ADMIN_PASSWORD:
    app.logger.warning("ADMIN_PASSWORD non défini : la connexion au back-office est désactivée.")


def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()


def query_db(query, args=(), one=False):
    cur = get_db().execute(query, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv


def execute_db(query, args=()):
    db = get_db()
    cur = db.execute(query, args)
    db.commit()
    rowid = cur.lastrowid
    cur.close()
    return rowid


EUROPEAN_COUNTRIES = [
    "Albanie", "Allemagne", "Andorre", "Autriche", "Belgique", "Biélorussie",
    "Bosnie-Herzégovine", "Bulgarie", "Chypre", "Chypre du Nord", "Croatie",
    "Danemark", "Espagne", "Estonie", "Finlande", "France", "Grèce", "Hongrie",
    "Irlande", "Islande", "Italie", "Lettonie", "Liechtenstein", "Lituanie",
    "Luxembourg", "Macédoine du Nord", "Moldavie", "Monténégro", "Norvège",
    "Pays-Bas", "Pologne", "Portugal", "Roumanie", "Royaume-Uni", "Russie",
    "Serbie", "Slovaquie", "Slovénie", "Suisse", "Suède", "Tchéquie", "Ukraine",
    "îles Féroé",
]

ASIAN_COUNTRIES = [
    "Afghanistan", "Arabie saoudite", "Arménie", "Azerbaïdjan", "Cambodge",
    "Corée du Nord", "Corée du Sud", "Géorgie", "Inde", "Indonésie", "Irak",
    "Iran", "Israël", "Japon", "Jordanie", "Kazakhstan", "Kirghizistan",
    "Koweït", "Laos", "Liban", "Malaisie", "Mongolie", "Oman", "Ouzbékistan",
    "Pakistan", "Philippines", "Qatar", "République populaire de Chine",
    "Syrie", "Taïwan", "Thaïlande", "Timor oriental", "Turkménistan",
    "Turquie", "Vietnam", "Émirats arabes unis", "État de Palestine",
]

OCEANIAN_COUNTRIES = ["Australie", "Nouvelle-Zélande"]

AFRICAN_COUNTRIES = [
    "Afrique du Sud", "Algérie", "Angola", "Burkina Faso", "Bénin", "Cameroun",
    "Cap-Vert", "Côte d'Ivoire", "Djibouti", "Gabon", "Gambie", "Ghana",
    "Guinée-Bissau", "Lesotho", "Libye", "Madagascar", "Malawi", "Mali",
    "Maroc", "Mauritanie", "Mozambique", "Namibie", "Niger", "Nigeria",
    "République arabe sahraouie démocratique", "République du Congo",
    "République démocratique du Congo", "Sao Tomé-et-Principe",
    "Sierra Leone", "Somalie", "Soudan", "Sénégal", "Tripolitaine italienne",
    "Tunisie", "Zambie", "Égypte", "Éthiopie",
]

NORTH_AMERICAN_COUNTRIES = [
    "Bahamas", "Canada", "Costa Rica", "Cuba", "Curaçao", "Groenland",
    "Guatemala", "Haïti", "Honduras", "Mexique", "Nicaragua", "Panama",
    "République dominicaine", "Salvador", "États-Unis",
]

SOUTH_AMERICAN_COUNTRIES = [
    "Argentine", "Bolivie", "Brésil", "Chili", "Colombie", "Paraguay",
    "Pérou", "Suriname", "Uruguay", "Venezuela", "Équateur",
]


def _build_continent_sql(continent, countries):
    in_clause = ", ".join("'" + c.replace("'", "''") + "'" for c in countries)
    return f"UPDATE Villes SET continent = '{continent}' WHERE pays IN ({in_clause})"


BATCH_DEFINITIONS = [
    ("Corriger le continent Europe", _build_continent_sql("Europe", EUROPEAN_COUNTRIES)),
    ("Corriger le continent Asie", _build_continent_sql("Asie", ASIAN_COUNTRIES)),
    ("Corriger le continent Océanie", _build_continent_sql("Océanie", OCEANIAN_COUNTRIES)),
    ("Corriger le continent Afrique", _build_continent_sql("Afrique", AFRICAN_COUNTRIES)),
    ("Corriger le continent Amérique du Nord", _build_continent_sql("Amérique du Nord", NORTH_AMERICAN_COUNTRIES)),
    ("Corriger le continent Amérique du Sud", _build_continent_sql("Amérique du Sud", SOUTH_AMERICAN_COUNTRIES)),
    (
        "Correction Habitants",
        "UPDATE Villes SET habitants = NULL "
        "WHERE typeof(habitants) NOT IN ('integer', 'real') OR habitants = 0",
    ),
    (
        "Villes sans habitants",
        "SELECT pays, COUNT(*) AS nombre_villes FROM Villes "
        "WHERE typeof(habitants) NOT IN ('integer', 'real') OR habitants = 0 "
        "GROUP BY pays ORDER BY nombre_villes DESC",
    ),
]


def ensure_batchs_table():
    conn = sqlite3.connect(DATABASE)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS Batchs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                Libelle_batch TEXT NOT NULL,
                Batch_SQL TEXT NOT NULL
            )
            """
        )
        # rename the legacy single "fix all continents" batch to the new Europe-only label
        conn.execute(
            "UPDATE Batchs SET Libelle_batch = ? WHERE Libelle_batch = ?",
            ("Corriger le continent Europe", "Corriger les continents"),
        )
        conn.execute(
            "UPDATE Batchs SET Libelle_batch = ? WHERE Libelle_batch = ?",
            ("Villes sans habitants", "Liste des habitants"),
        )
        for label, sql in BATCH_DEFINITIONS:
            # garde le SQL des batchs déjà en base synchronisé avec les définitions du code
            conn.execute("UPDATE Batchs SET Batch_SQL = ? WHERE Libelle_batch = ?", (sql, label))
            conn.execute(
                """
                INSERT INTO Batchs (Libelle_batch, Batch_SQL)
                SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM Batchs WHERE Libelle_batch = ?)
                """,
                (label, sql, label),
            )
        conn.commit()
    finally:
        conn.close()


ensure_batchs_table()


COUNTRY_CODE_OVERRIDES = {
    "france": "fr",
    "canada": "ca",
    "china": "cn",
    "japan": "jp",
    "united states": "us",
    "united states of america": "us",
    "united kingdom": "gb",
    "south korea": "kr",
    "north korea": "kp",
    "ivory coast": "ci",
    "czech republic": "cz",
    "viet nam": "vn",
    "russia": "ru",
    "laos": "la",
    "taiwan": "tw",
    "syria": "sy",
    "moldova": "md",
    "bolivia": "bo",
    "venezuela": "ve",
    "united arab emirates": "ae",
    "south africa": "za",
    "new zealand": "nz",
    "argentina": "ar",
    "brazil": "br",
    "australia": "au",
    "germany": "de",
    "spain": "es",
    "italy": "it",
    "mexico": "mx",
    "india": "in",
    "netherlands": "nl",
    "switzerland": "ch",
    "sweden": "se",
    "norway": "no",
    "belgium": "be",
    "denmark": "dk",
    "finland": "fi",
    "austria": "at",
    "portugal": "pt",
    "greece": "gr",
}

# Ajouts pour noms de pays courants en français
FRENCH_COUNTRY_OVERRIDES = {
    "royaume uni": "gb",
    "royaume-uni": "gb",
    "royaume unis": "gb",
    "royaume-unis": "gb",
    "royaumes unis": "gb",
    "royaumes-unis": "gb",
    "etats-unis": "us",
    "etats unis": "us",
    "etats-unis d amerique": "us",
    "etats unis d amerique": "us",
    "etats-unis d'amerique": "us",
    "italie": "it",
    "allemagne": "de",
    "espagne": "es",
    "pays bas": "nl",
    "pays-bas": "nl",
    "hollande": "nl",
    "suisse": "ch",
    "belgique": "be",
    "portugal": "pt",
    "grece": "gr",
    "grèce": "gr",
    "suede": "se",
    "suède": "se",
    "norvege": "no",
    "norvège": "no",
    "danemark": "dk",
    "finlande": "fi",
    "autriche": "at",
    "hongrie": "hu",
    "irlande": "ie",
    "pologne": "pl",
    "roumanie": "ro",
    "republique tcheque": "cz",
    "republique tchèque": "cz",
    "republique-tcheque": "cz",
    "republique-tchèque": "cz",
    "republique populaire de chine": "cn",
    "afrique du sud": "za",
    "afrique-du-sud": "za",
    "chili": "cl",
    "argentine": "ar",
    "bresil": "br",
    "mexique": "mx",
    "inde": "in",
    "canada": "ca",
    "chine": "cn",
    "japon": "jp",
    "coree du sud": "kr",
    "coree du nord": "kp",
    "cote d'ivoire": "ci",
    "cote ivoire": "ci",
    "côte d'ivoire": "ci",
    "cote divoire": "ci",
    "niger": "ne",
    "senegal": "sn",
    "madagascar": "mg",
    "colombie": "co",
    "perou": "pe",
    "pérou": "pe",
    "egypte": "eg",
    "maroc": "ma",
    "tunisie": "tn",
    "algerie": "dz",
    "algérie": "dz",
    "emirats arabes unis": "ae",
    "bolivie": "bo",
    "venezuela": "ve",
    "equateur": "ec",
    "ukraine": "ua",
    "russie": "ru",
    "malaisie": "my",
    "singapour": "sg",
    "thailande": "th",
    "arabie saoudite": "sa",
    "republique dominicaine": "do",
    "pays de galles": "gb",
    "islande": "is",
    "malte": "mt",
    "monaco": "mc",
    "vatican": "va",
    "liban": "lb",
    "georgie": "ge",
    "kazakhstan": "kz",
    "azerbaidjan": "az",
    "serbie": "rs",
    "croatie": "hr",
}

# ajouts supplémentaires observés dans les logs / variantes françaises
FRENCH_COUNTRY_OVERRIDES.update({
    "albanie": "al",
    "bosnie herzegovine": "ba",
    "bosnie-herzegovine": "ba",
    "bosnie herzegovine": "ba",
    "tchequie": "cz",
    "tchéquie": "cz",
    "mauritanie": "mr",
    "bulgarie": "bg",
    "syrie": "sy",
    "cuba": "cu",
    "honduras": "hn",
    "panama": "pa",
    "costa rica": "cr",
    "nicaragua": "ni",
    "salvador": "sv",
    "philippines": "ph",
    "paraguay": "py",
    "uruguay": "uy",
    "bielorussie": "by",
    "biélorussie": "by",
    "namibie": "na",
    "iran": "ir",
    "turquie": "tr",
    "palestine": "ps",
    "etat de palestine": "ps",
    "curaçao": "cw",
    "curacao": "cw",
})

# Handle historical/regional names observed in imports
FRENCH_COUNTRY_OVERRIDES.update({
    "tripolitaine": "ly",
    "tripolitaine italienne": "ly",
})

# Pays présents dans la base sans drapeau car non couverts par les dictionnaires
# ci-dessus, et pour lesquels le fallback restcountries.com (API v3.1, dépréciée)
# ne fonctionne plus.
FRENCH_COUNTRY_OVERRIDES.update({
    "afghanistan": "af",
    "andorre": "ad",
    "angola": "ao",
    "armenie": "am",
    "australie": "au",
    "burkina faso": "bf",
    "cambodge": "kh",
    "cameroun": "cm",
    "cap vert": "cv",
    "chypre": "cy",
    "chypre du nord": "cy",
    "estonie": "ee",
    "gambie": "gm",
    "ghana": "gh",
    "guatemala": "gt",
    "guinee bissau": "gw",
    "haiti": "ht",
    "indonesie": "id",
    "israel": "il",
    "jordanie": "jo",
    "koweit": "kw",
    "lesotho": "ls",
    "lettonie": "lv",
    "liechtenstein": "li",
    "lituanie": "lt",
    "luxembourg": "lu",
    "macedoine du nord": "mk",
    "malawi": "mw",
    "mali": "ml",
    "moldavie": "md",
    "mongolie": "mn",
    "montenegro": "me",
    "mozambique": "mz",
    "nigeria": "ng",
    "nouvelle zelande": "nz",
    "oman": "om",
    "ouzbekistan": "uz",
    "qatar": "qa",
    "republique arabe sahraouie democratique": "eh",
    "republique du congo": "cg",
    "republique democratique du congo": "cd",
    "sao tome et principe": "st",
    "sierra leone": "sl",
    "slovaquie": "sk",
    "slovenie": "si",
    "soudan": "sd",
    "suriname": "sr",
    "timor oriental": "tl",
    "turkmenistan": "tm",
    "vietnam": "vn",
    "zambie": "zm",
    "ethiopie": "et",
})


def normalize_country_name(name):
    # remove accents, normalize whitespace and punctuation
    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    value = value.strip().lower()
    # replace various dashes with space
    value = re.sub(r"[-–—]", " ", value)
    # remove apostrophes and typographic quotes
    value = re.sub(r"[’'`\"]", "", value)
    # remove any remaining characters that are not alnum or space
    value = re.sub(r"[^a-z0-9\s]", "", value)
    # collapse multiple spaces
    value = re.sub(r"\s+", " ", value).strip()
    return value


def country_flag_filename(country):
    normalized = normalize_country_name(country)
    return f"{normalized.replace(' ', '_')}.png"


def get_country_code(country):
    normalized = normalize_country_name(country)
    # Remplacer les traits d'union par des espaces pour mieux matcher
    normalized = normalized.replace("-", " ")
    # If the normalized value is already a 2-letter ISO code, accept it
    if len(normalized) == 2 and normalized.isalpha():
        return normalized.lower()
    if normalized in COUNTRY_CODE_OVERRIDES:
        return COUNTRY_CODE_OVERRIDES[normalized]

    if normalized in FRENCH_COUNTRY_OVERRIDES:
        return FRENCH_COUNTRY_OVERRIDES[normalized]

    return None


def fetch_flag_image(country):
    code = get_country_code(country)
    if not code:
        return None

    # prefer storing flags by ISO2 code (e.g. 'fr.png') to avoid duplicates
    filename_code = f"{code.lower()}.png"
    file_path_code = FLAGS_DIR / filename_code
    if file_path_code.exists():
        return file_path_code

    url = f"https://flagcdn.com/w40/{code}.png"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = resp.read()
            if data:
                file_path_code.write_bytes(data)
                return file_path_code
    except Exception:
        pass

    # fallback: try old-style filename based on provided country string
    filename_alt = country_flag_filename(country)
    file_path_alt = FLAGS_DIR / filename_alt
    if file_path_alt.exists():
        return file_path_alt

    return None


@app.route("/flag")
def flag_image():
    country = request.args.get("country", "").strip()
    if not country:
        abort(404)
    code = get_country_code(country)
    # prefer code-based file
    if code:
        file_path = FLAGS_DIR / f"{code.lower()}.png"
        if not file_path.exists():
            file_path = fetch_flag_image(country)
            if not file_path:
                # final fallback: try filename based on provided country
                alt = FLAGS_DIR / country_flag_filename(country)
                if alt.exists():
                    return send_file(alt, mimetype="image/png")
                abort(404)
        return send_file(file_path, mimetype="image/png")

    # no code found: try filename based on provided country
    file_path = FLAGS_DIR / country_flag_filename(country)
    if not file_path.exists():
        file_path = fetch_flag_image(country)
        if not file_path:
            abort(404)
    return send_file(file_path, mimetype="image/png")


def safe_next_url(target, default="admin"):
    # n'accepte qu'un chemin local, pour éviter les redirections vers un site externe
    if target and target.startswith("/") and not target.startswith("//") and "\\" not in target:
        return target
    return url_for(default)


def get_lang():
    if "lang" not in g:
        lang = request.cookies.get("lang")
        if lang not in LANGUAGES:
            lang = request.accept_languages.best_match(LANGUAGES) or DEFAULT_LANGUAGE
        g.lang = lang
    return g.lang


def t(key, **params):
    text = TRANSLATIONS[get_lang()].get(key) or TRANSLATIONS[DEFAULT_LANGUAGE].get(key, key)
    return text.format(**params) if params else text


@app.context_processor
def inject_i18n():
    return {"lang": get_lang(), "languages": LANGUAGES, "t": t}


def i18n_payload():
    """Données transmises au JavaScript : textes de la langue courante et codes ISO des pays."""
    countries = query_db("SELECT DISTINCT pays FROM Villes")
    codes = {}
    for row in countries:
        code = get_country_code(row["pays"])
        if code:
            codes[row["pays"]] = code
    return {"lang": get_lang(), "messages": TRANSLATIONS[get_lang()], "countryCodes": codes}


app.jinja_env.globals["i18n_payload"] = i18n_payload


@app.route("/lang/<code>")
def set_language(code):
    if code not in LANGUAGES:
        abort(404)
    response = redirect(safe_next_url(request.args.get("next"), default="home"))
    response.set_cookie("lang", code, max_age=365 * 24 * 3600, samesite="Lax")
    return response


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return round(6371 * 2 * math.asin(math.sqrt(a)))


def twin_distance_km(ville1_id, ville2_id):
    rows = query_db("SELECT id, latitude, longitude FROM Villes WHERE id IN (?, ?)", (ville1_id, ville2_id))
    coords = {row["id"]: row for row in rows}
    if ville1_id not in coords or ville2_id not in coords:
        return None
    a, b = coords[ville1_id], coords[ville2_id]
    return haversine_km(a["latitude"], a["longitude"], b["latitude"], b["longitude"])


def get_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]


app.jinja_env.globals["csrf_token"] = get_csrf_token


@app.before_request
def csrf_protect():
    # toute requête modifiante doit renvoyer le jeton de session (en-tête pour l'API, champ pour les formulaires)
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    sent = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token") or ""
    expected = session.get("csrf_token", "")
    if not expected or not hmac.compare_digest(sent, expected):
        if request.path.startswith("/api/"):
            return jsonify({"error": t("error.csrf")}), 400
        abort(400, t("error.csrf"))
    return None


def is_logged_in():
    return session.get("admin_logged_in", False)


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not is_logged_in():
            if request.path.startswith("/api/"):
                return jsonify({"error": t("error.auth_required")}), 401
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped_view


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/stats")
def stats_page():
    return render_template("stats.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        data = request.form
        username = data.get("username", "")
        password = data.get("password", "")
        if ADMIN_PASSWORD and hmac.compare_digest(username, ADMIN_USER) and hmac.compare_digest(password, ADMIN_PASSWORD):
            session.clear()
            session["admin_logged_in"] = True
            session["admin_user"] = username
            return redirect(safe_next_url(request.args.get("next")))
        return render_template("login.html", error=t("login.error"))
    return render_template("login.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/admin")
@login_required
def admin():
    return redirect(url_for("admin_cities"))


@app.route("/admin/cities")
@login_required
def admin_cities():
    return render_template("admin_cities.html")


@app.route("/admin/twins")
@login_required
def admin_twins():
    return render_template("admin_twins.html")


@app.route("/admin/batchs")
@login_required
def admin_batchs():
    return render_template("admin_batchs.html")


@app.route("/api/cities")
def api_cities():
    q = request.args.get("q", "").strip()
    habitants_op = request.args.get("habitants_op", "").strip()
    habitants_val_raw = request.args.get("habitants_val", "").strip()

    conditions = []
    params = []

    extra_countries = [c for c in request.args.getlist("pays") if c][:50]
    if q:
        like = f"%{q}%"
        country_clause = ""
        if extra_countries:
            country_clause = " OR pays IN (" + ", ".join("?" * len(extra_countries)) + ")"
        conditions.append(f"(nom LIKE ? OR pays LIKE ?{country_clause})")
        params.extend([like, like, *extra_countries])

    if habitants_op in (">", "<") and habitants_val_raw:
        try:
            habitants_val = float(habitants_val_raw)
        except ValueError:
            habitants_val = None
        if habitants_val is not None:
            conditions.append(f"typeof(habitants) IN ('integer', 'real') AND habitants {habitants_op} ?")
            params.append(habitants_val)

    base = "SELECT id, nom, habitants, pays, continent, latitude, longitude FROM Villes"
    if conditions:
        where_clause = " AND ".join(conditions)
        rows = query_db(f"{base} WHERE {where_clause} ORDER BY nom LIMIT 200", tuple(params))
    else:
        rows = query_db(f"{base} ORDER BY nom LIMIT 200")
    return jsonify([dict(row) for row in rows])


@app.route("/api/cities/<int:city_id>")
def api_city(city_id):
    city = query_db("SELECT * FROM Villes WHERE id = ?", (city_id,), one=True)
    if city is None:
        return jsonify({"error": t("error.city_not_found")}), 404

    twin_rows = query_db(
        """
        SELECT
            t.id,
            t.distance_km,
            v2.id AS twin_id,
            v2.nom AS twin_nom,
            v2.pays AS twin_pays,
            v2.continent AS twin_continent,
            v2.latitude AS twin_latitude,
            v2.longitude AS twin_longitude
        FROM TwinCities t
        JOIN Villes v2 ON (v2.id = t.ville1_id OR v2.id = t.ville2_id)
        WHERE ? IN (t.ville1_id, t.ville2_id)
          AND v2.id != ?
        ORDER BY t.distance_km ASC
        """,
        (city_id, city_id),
    )

    result = dict(city)
    result["twins"] = [dict(row) for row in twin_rows]
    return jsonify(result)


@app.route("/api/map")
def api_map():
    cities = query_db(
        "SELECT id, nom, pays, continent, latitude, longitude FROM Villes"
    )
    links = query_db(
        "SELECT ville1_id, ville2_id, distance_km FROM TwinCities"
    )
    return jsonify({
        "cities": [dict(row) for row in cities],
        "links": [dict(row) for row in links],
    })


@app.route("/api/stats")
def api_stats():
    totals = query_db("SELECT COUNT(*) AS total_cities FROM Villes", (), one=True)
    total_links = query_db("SELECT COUNT(*) AS total_links FROM TwinCities", (), one=True)
    avg_distance = query_db("SELECT AVG(distance_km) AS avg_distance FROM TwinCities", (), one=True)
    min_distance = query_db("SELECT MIN(distance_km) AS min_distance FROM TwinCities", (), one=True)
    max_distance = query_db("SELECT MAX(distance_km) AS max_distance FROM TwinCities", (), one=True)
    total_countries = query_db(
        """
        SELECT COUNT(DISTINCT v.pays) AS total_countries
        FROM Villes v
        JOIN (
            SELECT ville1_id AS id FROM TwinCities
            UNION ALL
            SELECT ville2_id AS id FROM TwinCities
        ) t ON v.id = t.id
        """,
        (),
        one=True,
    )
    country_counts = query_db(
        """
        SELECT v.pays AS label, COUNT(DISTINCT v.id) AS value
        FROM Villes v
        JOIN (
            SELECT ville1_id AS id FROM TwinCities
            UNION ALL
            SELECT ville2_id AS id FROM TwinCities
        ) t ON v.id = t.id
        GROUP BY v.pays
        ORDER BY value DESC
        LIMIT 10
        """
    )
    country_map_counts = query_db(
        """
        SELECT v.pays AS label, COUNT(DISTINCT v.id) AS value
        FROM Villes v
        JOIN (
            SELECT ville1_id AS id FROM TwinCities
            UNION ALL
            SELECT ville2_id AS id FROM TwinCities
        ) t ON v.id = t.id
        GROUP BY v.pays
        """
    )
    country_map = [
        {"code": COUNTRY_ISO_MAP[row["label"]], "name": row["label"], "value": row["value"]}
        for row in country_map_counts
        if row["label"] in COUNTRY_ISO_MAP
    ]
    continent_counts = query_db(
        """
        SELECT v.continent AS label, COUNT(DISTINCT v.id) AS value
        FROM Villes v
        JOIN (
            SELECT ville1_id AS id FROM TwinCities
            UNION ALL
            SELECT ville2_id AS id FROM TwinCities
        ) t ON v.id = t.id
        GROUP BY v.continent
        ORDER BY value DESC
        """
    )

    twin_pairs_sql = """
        SELECT a.nom AS ville1, a.pays AS pays1, b.nom AS ville2, b.pays AS pays2, t.distance_km
        FROM TwinCities t
        JOIN Villes a ON a.id = t.ville1_id
        JOIN Villes b ON b.id = t.ville2_id
        WHERE t.distance_km IS NOT NULL
        ORDER BY t.distance_km {order}
        LIMIT 10
    """
    longest = query_db(twin_pairs_sql.format(order="DESC"))
    shortest = query_db(twin_pairs_sql.format(order="ASC"))
    top_cities = query_db(
        """
        SELECT v.nom AS label, v.pays AS pays, COUNT(*) AS value
        FROM Villes v
        JOIN TwinCities t ON v.id IN (t.ville1_id, t.ville2_id)
        GROUP BY v.id
        ORDER BY value DESC, v.nom
        LIMIT 10
        """
    )
    # portée géographique : même pays, même continent (pays différents) ou intercontinental
    scope = query_db(
        """
        SELECT
            SUM(a.pays = b.pays) AS same_country,
            SUM(a.pays <> b.pays AND a.continent = b.continent) AS same_continent,
            SUM(a.continent <> b.continent) AS intercontinental
        FROM TwinCities t
        JOIN Villes a ON a.id = t.ville1_id
        JOIN Villes b ON b.id = t.ville2_id
        """,
        one=True,
    )

    return jsonify({
        "longest": [dict(row) for row in longest],
        "shortest": [dict(row) for row in shortest],
        "top_cities": [dict(row) for row in top_cities],
        "scope": {key: scope[key] or 0 for key in scope.keys()},
        "total_countries": total_countries["total_countries"],
        "total_cities": totals["total_cities"],
        "total_links": total_links["total_links"],
        "avg_distance": round(avg_distance["avg_distance"] or 0, 1),
        "min_distance": round(min_distance["min_distance"] or 0, 1),
        "max_distance": round(max_distance["max_distance"] or 0, 1),
        "countries": [dict(row) for row in country_counts],
        "continents": [dict(row) for row in continent_counts],
        "country_map": country_map,
    })


@app.route("/api/admin/cities")
@login_required
def api_admin_cities():
    rows = query_db(
        "SELECT id, nom, habitants, pays, continent, latitude, longitude, id_wikidata, search_twin FROM Villes ORDER BY nom"
    )
    return jsonify([dict(row) for row in rows])


@app.route("/api/admin/cities", methods=["POST"] )
@login_required
def api_admin_add_city():
    # Log raw request body for debugging invalid JSON / bad requests
    try:
        raw_body = request.get_data(as_text=True)
    except Exception:
        raw_body = None
    app.logger.debug(f"api_admin_add_city raw body: {raw_body}")

    try:
        data = request.get_json(silent=True) or {}
    except Exception as e:
        app.logger.exception("Failed parsing JSON in api_admin_add_city")
        return jsonify({"error": t("error.invalid_json")}), 400
    required = ["nom", "pays", "continent", "latitude", "longitude", "habitants"]
    if not all(field in data for field in required):
        app.logger.debug(f"api_admin_add_city missing fields, data: {data}")
        return jsonify({"error": t("error.missing_city_fields")}), 400

    # Validate habitants as integer (allow strings that can be cast)
    try:
        if data.get("habitants") is None:
            raise ValueError()
        habitants_val = int(data.get("habitants"))
    except Exception:
        app.logger.debug(f"api_admin_add_city invalid habitants, data: {data}")
        return jsonify({"error": t("error.population_int")}), 400
    # If id_wikidata provided, avoid duplicate: return existing id
    raw_wd = (data.get("id_wikidata") or "").strip()
    id_wd = normalize_qid(raw_wd) if raw_wd else ""
    if raw_wd and not id_wd:
        return jsonify({"error": t("error.invalid_qid")}), 400
    if id_wd:
        existing = query_db("SELECT id FROM Villes WHERE id_wikidata = ?", (id_wd,), one=True)
        if existing:
            return jsonify({"id": existing["id"], "existed": True}), 200

    try:
        city_id = execute_db(
        "INSERT INTO Villes (nom, habitants, pays, continent, latitude, longitude, id_wikidata) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            data["nom"],
            habitants_val,
            data["pays"],
            data["continent"],
            data["latitude"],
            data["longitude"],
            id_wd or None,
        ),
        )
    except sqlite3.IntegrityError as e:
        app.logger.exception("IntegrityError inserting city")
        return jsonify({"error": t("error.db_constraint")}), 400
    except Exception:
        app.logger.exception("Unexpected error inserting city")
        return jsonify({"error": t("error.city_create")}), 500
    # Pré‑télécharger le drapeau du pays si possible (ne bloque pas en cas d'erreur)
    try:
        fetch_flag_image(data["pays"])
    except Exception:
        pass

    return jsonify({"id": city_id, "existed": False}), 201


@app.route("/api/admin/cities/<int:city_id>", methods=["PUT"])
@login_required
def api_admin_update_city(city_id):
    existing = query_db("SELECT * FROM Villes WHERE id = ?", (city_id,), one=True)
    if existing is None:
        return jsonify({"error": t("error.city_not_found")}), 404
    # les champs absents de la requête conservent leur valeur actuelle
    data = {**dict(existing), **(request.get_json(silent=True) or {})}
    if not data.get("nom") or not data.get("pays"):
        return jsonify({"error": t("error.name_country_required")}), 400
    try:
        if data.get("habitants") in (None, ""):
            data["habitants"] = None
        else:
            data["habitants"] = int(data["habitants"])
    except (TypeError, ValueError):
        return jsonify({"error": t("error.population_int")}), 400

    raw_wd = (data.get("id_wikidata") or "").strip()
    data["id_wikidata"] = normalize_qid(raw_wd) if raw_wd else None
    if raw_wd and not data["id_wikidata"]:
        return jsonify({"error": t("error.invalid_qid")}), 400
    duplicate = data["id_wikidata"] and query_db(
        "SELECT id, nom FROM Villes WHERE id_wikidata = ? AND id <> ?", (data["id_wikidata"], city_id), one=True
    )
    if duplicate:
        return jsonify({"error": t("error.qid_used", qid=data["id_wikidata"], city=duplicate["nom"])}), 409

    execute_db(
        "UPDATE Villes SET nom = ?, habitants = ?, pays = ?, continent = ?, latitude = ?, longitude = ?, id_wikidata = ? WHERE id = ?",
        (
            data.get("nom"),
            data.get("habitants"),
            data.get("pays"),
            data.get("continent"),
            data.get("latitude"),
            data.get("longitude"),
            data.get("id_wikidata"),
            city_id,
        ),
    )
    # Si le pays a été modifié, essayer de pré‑télécharger le drapeau
    try:
        pays = data.get("pays")
        if pays:
            fetch_flag_image(pays)
    except Exception:
        pass

    return jsonify({"id": city_id})


@app.route("/api/admin/cities/<int:city_id>", methods=["DELETE"])
@login_required
def api_admin_delete_city(city_id):
    execute_db("DELETE FROM TwinCities WHERE ville1_id = ? OR ville2_id = ?", (city_id, city_id))
    execute_db("DELETE FROM Villes WHERE id = ?", (city_id,))
    return jsonify({"deleted": city_id})


@app.route("/api/admin/cities/<int:city_id>/search_twin", methods=["POST"])
@login_required
def api_admin_mark_search_twin(city_id):
    execute_db("UPDATE Villes SET search_twin = 1 WHERE id = ?", (city_id,))
    return jsonify({"id": city_id, "search_twin": True})


@app.route("/api/admin/twins")
@login_required
def api_admin_twins():
    rows = query_db(
        "SELECT id, ville1_id, ville2_id, distance_km FROM TwinCities ORDER BY id"
    )
    return jsonify([dict(row) for row in rows])


@app.route("/api/admin/batchs")
@login_required
def api_admin_batchs():
    rows = query_db(
        "SELECT id, Libelle_batch AS libelle_batch, Batch_SQL AS batch_sql FROM Batchs ORDER BY id"
    )
    return jsonify([dict(row) for row in rows])


@app.route("/api/admin/batchs/<int:batch_id>/execute", methods=["POST"])
@login_required
def api_admin_execute_batch(batch_id):
    batch = query_db(
        "SELECT Batch_SQL AS batch_sql FROM Batchs WHERE id = ?", (batch_id,), one=True
    )
    if not batch:
        abort(404)
    sql = batch["batch_sql"]
    db = get_db()
    started = time.perf_counter()
    try:
        cur = db.execute(sql)
        if sql.strip().lower().startswith("select"):
            columns = [description[0] for description in cur.description]
            rows = [dict(zip(columns, row)) for row in cur.fetchall()]
            cur.close()
            duration_ms = round((time.perf_counter() - started) * 1000, 1)
            return jsonify({"columns": columns, "rows": rows, "duration_ms": duration_ms})
        db.commit()
        rows_affected = cur.rowcount
        cur.close()
    except sqlite3.Error as exc:
        return jsonify({"error": str(exc)}), 400
    duration_ms = round((time.perf_counter() - started) * 1000, 1)
    return jsonify({"rows_affected": rows_affected, "duration_ms": duration_ms})


WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
QID_RE = re.compile(r"^Q?(\d{1,12})$", re.IGNORECASE)


def normalize_qid(value):
    """Renvoie l'identifiant Wikidata sous la forme 'Q123', ou None s'il est invalide.

    La validation est stricte car l'identifiant est inséré dans les requêtes SPARQL.
    """
    match = QID_RE.match((value or "").strip())
    return f"Q{match.group(1)}" if match else None


def run_sparql(query, timeout=20):
    params = urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(f"{WIKIDATA_SPARQL_URL}?{params}")
    req.add_header("Accept", "application/sparql-results+json")
    req.add_header("User-Agent", "TwinCities/1.0 (https://github.com/arribo44/TWINCITIES)")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp).get("results", {}).get("bindings", [])


def parse_wikidata_point(value):
    # les coordonnées arrivent sous la forme "Point(LON LAT)"
    match = re.search(r"Point\(([-0-9eE.+]+) ([-0-9eE.+]+)\)", value or "")
    if not match:
        return None, None
    return float(match.group(2)), float(match.group(1))


def fetch_wikidata_city(qid):
    """Nom, pays, continent, population la plus récente et coordonnées d'une ville Wikidata."""
    bindings = run_sparql(
        "SELECT ?itemLabel ?countryLabel ?itemContinentLabel ?countryContinentLabel ?coord ?population ?popDate WHERE {\n"
        f"  BIND(wd:{qid} AS ?item)\n"
        "  OPTIONAL { ?item wdt:P17 ?country. OPTIONAL { ?country wdt:P30 ?countryContinent. } }\n"
        "  OPTIONAL { ?item wdt:P30 ?itemContinent. }\n"
        "  OPTIONAL { ?item wdt:P625 ?coord. }\n"
        "  OPTIONAL { ?item p:P1082 ?popStmt. ?popStmt ps:P1082 ?population. OPTIONAL { ?popStmt pq:P585 ?popDate. } }\n"
        '  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }\n'
        "}\n"
    )
    value = lambda b, key: b.get(key, {}).get("value")
    name = next((value(b, "itemLabel") for b in bindings if value(b, "itemLabel")), None)
    # sans libellé, le service renvoie l'identifiant lui-même : l'élément n'existe pas
    if not name or name == qid:
        return None

    country = next((value(b, "countryLabel") for b in bindings if value(b, "countryLabel")), None)
    latitude = longitude = None
    for b in bindings:
        latitude, longitude = parse_wikidata_point(value(b, "coord"))
        if latitude is not None:
            break

    # continent de la ville en priorité, sinon celui du pays
    item_continents = {value(b, "itemContinentLabel") for b in bindings} - {None}
    country_continents = {value(b, "countryContinentLabel") for b in bindings} - {None}
    candidates = sorted(item_continents or country_continents)
    continent = candidates[0] if candidates else None
    if len(candidates) > 1 and country:
        # pays transcontinental (Russie, Turquie…) : on reprend le continent déjà utilisé en base pour ce pays
        known = query_db(
            "SELECT continent FROM Villes WHERE pays = ? GROUP BY continent ORDER BY COUNT(*) DESC LIMIT 1",
            (country,),
            one=True,
        )
        if known and known["continent"] in candidates:
            continent = known["continent"]

    # population la plus récente ; une valeur sans date ne sert que s'il n'y en a aucune datée
    population = population_date = None
    for b in bindings:
        try:
            pop = int(float(value(b, "population")))
        except (TypeError, ValueError):
            continue
        date = value(b, "popDate")
        if date and (population_date is None or date > population_date):
            population, population_date = pop, date
        elif population is None and population_date is None:
            population = pop

    return {
        "wikidata": qid,
        "nom": name,
        "pays": country,
        "continent": continent,
        "habitants": population,
        "population_date": population_date[:10] if population_date else None,
        "latitude": latitude,
        "longitude": longitude,
    }


@app.route("/api/admin/wikidata_city")
@login_required
def api_admin_wikidata_city():
    qid = normalize_qid(request.args.get("wikidata"))
    if not qid:
        return jsonify({"error": t("error.invalid_qid")}), 400
    try:
        city = fetch_wikidata_city(qid)
    except Exception as e:
        app.logger.exception("Erreur SPARQL ville")
        return jsonify({"error": t("error.sparql"), "details": str(e)}), 502
    if city is None:
        return jsonify({"error": t("error.wikidata_not_found", qid=qid)}), 404
    existing = query_db("SELECT id, nom FROM Villes WHERE id_wikidata = ?", (qid,), one=True)
    city["existing"] = dict(existing) if existing else None
    return jsonify(city)


@app.route("/api/admin/wikidata_twins")
@login_required
def api_admin_wikidata_twins():
    wikidata = normalize_qid(request.args.get("wikidata"))
    if not wikidata:
        return jsonify({"error": t("error.invalid_qid")}), 400
    wd_uri = f"wd:{wikidata}"
    sparql = (
        "SELECT ?twin ?twinLabel ?countryLabel ?continentLabel ?countryContinentLabel ?coord "
        "?population ?popDate ?subjectContinentLabel ?subjectCountryContinentLabel WHERE {\n"
        f"  {wd_uri} wdt:P190 ?twin .\n"
        "  OPTIONAL { ?twin wdt:P17 ?country. OPTIONAL { ?country wdt:P30 ?countryContinent. } }\n"
        "  OPTIONAL { ?twin wdt:P30 ?continent. }\n"
        "  OPTIONAL { ?twin wdt:P625 ?coord. }\n"
        # population statements (P1082) with optional point in time qualifier (P585)
        "  OPTIONAL { ?twin p:P1082 ?popStmt . ?popStmt ps:P1082 ?population . OPTIONAL { ?popStmt pq:P585 ?popDate. } }\n"
        f"  OPTIONAL {{ {wd_uri} wdt:P30 ?subjectContinent. }}\n"
        f"  OPTIONAL {{ {wd_uri} wdt:P17 ?subjectCountry. OPTIONAL {{ ?subjectCountry wdt:P30 ?subjectCountryContinent. }} }}\n"
        "  SERVICE wikibase:label { bd:serviceParam wikibase:language \"fr,en\". }\n"
        "}\n"
        "ORDER BY ?twinLabel\n"
    )

    url = "https://query.wikidata.org/sparql"
    params = urllib.parse.urlencode({"query": sparql})
    req = urllib.request.Request(f"{url}?{params}")
    req.add_header("Accept", "application/sparql-results+json")
    req.add_header("User-Agent", "TwinCities/1.0 (https://localhost)")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.load(resp)
    except Exception as e:
        return jsonify({"error": t("error.sparql"), "details": str(e)}), 502

    # Aggregate results per twin and keep the most recent population when available
    results_map = {}
    subject_continent = None
    for binding in data.get("results", {}).get("bindings", []):
        twin_uri = binding.get("twin", {}).get("value")
        twin_q = twin_uri.rsplit("/", 1)[-1] if twin_uri else None
        label = binding.get("twinLabel", {}).get("value")
        country = binding.get("countryLabel", {}).get("value")
        continent = binding.get("continentLabel", {}).get("value") or binding.get("countryContinentLabel", {}).get("value")
        if subject_continent is None:
            subject_continent = binding.get("subjectContinentLabel", {}).get("value") or binding.get("subjectCountryContinentLabel", {}).get("value")
        coord_raw = binding.get("coord", {}).get("value")
        lat = lon = None
        if coord_raw:
            # coord_raw typically "Point(LON LAT)"
            m = re.search(r"Point\(([-0-9eE.+]+) ([-0-9eE.+]+)\)", coord_raw)
            if m:
                lon = float(m.group(1))
                lat = float(m.group(2))

        pop_val = binding.get("population", {}).get("value")
        pop_date = binding.get("popDate", {}).get("value")
        # normalize population to int when possible
        try:
            pop_val_int = int(float(pop_val)) if pop_val is not None else None
        except Exception:
            pop_val_int = None

        existing = results_map.get(twin_q)
        if not existing:
            results_map[twin_q] = {
                "wikidata": twin_q,
                "label": label,
                "country": country,
                "continent": continent,
                "latitude": lat,
                "longitude": lon,
                "population": pop_val_int,
                "population_date": pop_date,
            }
        else:
            # update coords/labels if missing
            if existing.get("latitude") is None and lat is not None:
                existing["latitude"] = lat
                existing["longitude"] = lon
            if not existing.get("country") and country:
                existing["country"] = country
            if not existing.get("continent") and continent:
                existing["continent"] = continent

            # prefer population with more recent pop_date
            if pop_val_int is not None:
                if existing.get("population_date") is None and pop_date is not None:
                    existing["population"] = pop_val_int
                    existing["population_date"] = pop_date
                elif pop_date is not None and existing.get("population_date") is not None:
                    try:
                        if pop_date > existing["population_date"]:
                            existing["population"] = pop_val_int
                            existing["population_date"] = pop_date
                    except Exception:
                        pass
                elif existing.get("population") is None:
                    existing["population"] = pop_val_int
                    existing["population_date"] = pop_date

    results = list(results_map.values())

    # Pré‑télécharger les drapeaux des pays retournés pour éviter des 404 côté client
    for res in results:
        try:
            if res.get("country"):
                fetch_flag_image(res.get("country"))
        except Exception:
            pass

    return jsonify({"subject_continent": subject_continent, "results": results})


def fetch_wikidata_population(id_wikidata):
    """Looks up the most recent population (P1082) for a Wikidata id. Returns None if not found."""
    wd = normalize_qid(id_wikidata)
    if not wd:
        return None

    wd_uri = f"wd:{wd}"
    sparql = (
        "SELECT ?population ?date WHERE {\n"
        f"  {wd_uri} p:P1082 ?popStmt .\n"
        "  ?popStmt ps:P1082 ?population .\n"
        "  OPTIONAL { ?popStmt pq:P585 ?date. }\n"
        " }\n"
    )

    url = "https://query.wikidata.org/sparql"
    params = urllib.parse.urlencode({"query": sparql})
    req = urllib.request.Request(f"{url}?{params}")
    req.add_header("Accept", "application/sparql-results+json")
    req.add_header("User-Agent", "TwinCities/1.0 (https://localhost)")
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.load(resp)

    best_pop = None
    best_date = None
    for b in data.get("results", {}).get("bindings", []):
        pop = b.get("population", {}).get("value")
        date = b.get("date", {}).get("value")
        try:
            pop_int = int(float(pop)) if pop is not None else None
        except Exception:
            pop_int = None
        if pop_int is None:
            continue
        # choose most recent date; if no date, prefer existing only if no dated values
        if date:
            if best_date is None or date > best_date:
                best_date = date
                best_pop = pop_int
        else:
            if best_pop is None and best_date is None:
                best_pop = pop_int

    return best_pop


@app.route("/api/admin/cities/<int:city_id>/wikidata_population", methods=["POST"])
@login_required
def api_admin_update_population_from_wikidata(city_id):
    # Fetch city and ensure it has an id_wikidata
    city = query_db("SELECT id, nom, id_wikidata FROM Villes WHERE id = ?", (city_id,), one=True)
    if city is None:
        return jsonify({"error": t("error.city_not_found")}), 404
    try:
        id_wd = city["id_wikidata"]
    except Exception:
        id_wd = None
    if not id_wd:
        return jsonify({"error": t("error.no_wikidata_id")}), 400

    try:
        best_pop = fetch_wikidata_population(id_wd)
    except Exception as e:
        app.logger.exception("Erreur SPARQL population")
        return jsonify({"error": t("error.sparql"), "details": str(e)}), 502

    if best_pop is None:
        return jsonify({"error": t("error.population_not_found")}), 404

    try:
        execute_db("UPDATE Villes SET habitants = ? WHERE id = ?", (best_pop, city_id))
    except Exception:
        app.logger.exception("Erreur updating population in DB")
        return jsonify({"error": t("error.update_internal")}), 500

    # Try to prefetch flag for this city after update
    try:
        row = query_db("SELECT pays FROM Villes WHERE id = ?", (city_id,), one=True)
        if row and row["pays"]:
            fetch_flag_image(row["pays"])
    except Exception:
        pass

    return jsonify({"id": city_id, "population": best_pop})


@app.route("/api/admin/habitants/correction", methods=["POST"])
@login_required
def api_admin_correction_habitants():
    data = request.json or {}
    pays = data.get("pays")
    if not pays:
        return jsonify({"error": t("error.country_required")}), 400

    cities = query_db(
        """
        SELECT id, id_wikidata FROM Villes
        WHERE pays = ? AND (typeof(habitants) NOT IN ('integer', 'real') OR habitants = 0)
        """,
        (pays,),
    )
    total = len(cities)
    updated = 0
    for city in cities:
        id_wd = city["id_wikidata"]
        if not id_wd:
            continue
        try:
            population = fetch_wikidata_population(id_wd)
            if population is None:
                continue
            execute_db("UPDATE Villes SET habitants = ? WHERE id = ?", (population, city["id"]))
            updated += 1
        except Exception:
            app.logger.exception("Erreur correction habitants pour la ville %s", city["id"])
            continue

    return jsonify({"updated": updated, "total": total})


@app.route("/api/admin/twins", methods=["POST"])
@login_required
def api_admin_add_twin():
    data = request.get_json(silent=True) or {}
    try:
        a = int(data["ville1_id"])
        b = int(data["ville2_id"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": t("error.twin_ids_required")}), 400
    if a == b:
        return jsonify({"error": t("error.self_twin")}), 400
    distance = twin_distance_km(a, b)
    if distance is None:
        return jsonify({"error": t("error.city_not_found")}), 404
    # avoid duplicate twin links in either order
    existing = query_db(
        "SELECT id FROM TwinCities WHERE (ville1_id = ? AND ville2_id = ?) OR (ville1_id = ? AND ville2_id = ?)",
        (a, b, b, a),
        one=True,
    )
    if existing:
        return jsonify({"id": existing["id"], "existed": True}), 200

    twin_id = execute_db(
        "INSERT INTO TwinCities (ville1_id, ville2_id, distance_km) VALUES (?, ?, ?)",
        (a, b, distance),
    )
    return jsonify({"id": twin_id, "existed": False}), 201


@app.route("/api/admin/twins/<int:twin_id>", methods=["PUT"])
@login_required
def api_admin_update_twin(twin_id):
    existing = query_db("SELECT ville1_id, ville2_id FROM TwinCities WHERE id = ?", (twin_id,), one=True)
    if existing is None:
        return jsonify({"error": t("error.twin_not_found")}), 404
    data = request.get_json(silent=True) or {}
    try:
        a = int(data.get("ville1_id", existing["ville1_id"]))
        b = int(data.get("ville2_id", existing["ville2_id"]))
    except (TypeError, ValueError):
        return jsonify({"error": t("error.invalid_city_ids")}), 400
    if a == b:
        return jsonify({"error": t("error.self_twin")}), 400
    distance = twin_distance_km(a, b)
    if distance is None:
        return jsonify({"error": t("error.city_not_found")}), 404
    execute_db(
        "UPDATE TwinCities SET ville1_id = ?, ville2_id = ?, distance_km = ? WHERE id = ?",
        (a, b, distance, twin_id),
    )
    return jsonify({"id": twin_id})


@app.route("/api/admin/twins/<int:twin_id>", methods=["DELETE"])
@login_required
def api_admin_delete_twin(twin_id):
    execute_db("DELETE FROM TwinCities WHERE id = ?", (twin_id,))
    return jsonify({"deleted": twin_id})


@app.errorhandler(404)
def page_not_found(error):
    if request.path.startswith("/api/") or request.path == "/flag":
        return jsonify({"error": t("error.not_found")}), 404
    fact = None
    try:
        # un jumelage tiré au hasard, pour agrémenter la page d'erreur
        fact = query_db(
            """
            SELECT v1.nom AS ville1, v1.pays AS pays1, v2.nom AS ville2, v2.pays AS pays2, t.distance_km
            FROM TwinCities t
            JOIN Villes v1 ON v1.id = t.ville1_id
            JOIN Villes v2 ON v2.id = t.ville2_id
            WHERE t.distance_km IS NOT NULL
            ORDER BY RANDOM() LIMIT 1
            """,
            one=True,
        )
    except sqlite3.Error:
        app.logger.exception("Impossible de tirer un jumelage pour la page 404")
    return render_template("404.html", path=request.path, fact=fact), 404


@app.after_request
def set_secure_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


if __name__ == "__main__":
    app.run(
        debug=os.environ.get("FLASK_DEBUG") == "1",
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_PORT", "5000")),
    )
