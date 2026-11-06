CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eleves (
  id TEXT PRIMARY KEY,
  classe_id TEXT NOT NULL,
  prenom TEXT NOT NULL,
  code_individuel TEXT NOT NULL UNIQUE,
  FOREIGN KEY (classe_id) REFERENCES classes(id)
);

CREATE TABLE IF NOT EXISTS sorties_ecran (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eleve_id TEXT NOT NULL,
  type_evenement TEXT NOT NULL, -- 'hidden', 'visible', 'offline'
  horodatage DATETIME DEFAULT CURRENT_TIMESTAMP
);