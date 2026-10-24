import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).with_name("twin_cities.db")
CREATION_VILLES = """
CREATE TABLE IF NOT EXISTS Villes (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    habitants INTEGER,
    pays TEXT NOT NULL,
    continent TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL
);
"""

CREATION_TWIN = """
CREATE TABLE IF NOT EXISTS TwinCities (
    id INTEGER PRIMARY KEY,
    ville1_id INTEGER NOT NULL,
    ville2_id INTEGER NOT NULL,
    distance_km REAL,
    FOREIGN KEY(ville1_id) REFERENCES Villes(id),
    FOREIGN KEY(ville2_id) REFERENCES Villes(id)
);
"""

INSERT_VILLES = """
INSERT OR IGNORE INTO Villes (id, nom, habitants, pays, continent, latitude, longitude, id_wikidata) VALUES
    (1, 'Lyon', 515695, 'France', 'Europe', 45.764043, 4.835659, 'Q1358'),
    (2, 'Saint-Étienne', 173089, 'France', 'Europe', 45.439695, 4.387178, 'Q102'),
    (3, 'Montréal', 1780000, 'Canada', 'Amérique du Nord', 45.5016889, -73.567255, 'Q1325'),
    (4, 'Shanghai', 24150000, 'République populaire de Chine', 'Asie', 31.230416, 121.473701, 'Q715'),
    (5, 'San Francisco', 883305, 'États-Unis', 'Amérique du Nord', 37.774929, -122.419416, 'Q62'),
    (6, 'Tokyo', 13929286, 'Japon', 'Asie', 35.689487, 139.691711, 'Q1490');
"""

INSERT_TWINS = """
INSERT OR IGNORE INTO TwinCities (id, ville1_id, ville2_id, distance_km) VALUES
    (1, 1, 2, 60),
    (2, 1, 3, 6065),
    (3, 3, 4, 10450),
    (4, 4, 5, 10260),
    (5, 5, 6, 8270);
"""

with sqlite3.connect(DB_PATH) as connection:
    # ensure base tables exist (without id_wikidata column yet)
    connection.executescript(CREATION_VILLES)
    connection.executescript(CREATION_TWIN)

    # ensure id_wikidata column exists
    columns = [row[1] for row in connection.execute("PRAGMA table_info(Villes)").fetchall()]
    if "id_wikidata" not in columns:
        connection.execute("ALTER TABLE Villes ADD COLUMN id_wikidata TEXT")

    # ensure search_twin column exists
    columns = [row[1] for row in connection.execute("PRAGMA table_info(Villes)").fetchall()]
    if "search_twin" not in columns:
        connection.execute("ALTER TABLE Villes ADD COLUMN search_twin INTEGER NOT NULL DEFAULT 0")

    # now safe to insert rows including id_wikidata
    connection.executescript(INSERT_VILLES)
    connection.executescript(INSERT_TWINS)

print(f"Database created or updated at {DB_PATH}")
