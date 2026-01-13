CREATE TABLE IF NOT EXISTS products (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    price    REAL NOT NULL,
    category TEXT,
    stock    INTEGER NOT NULL DEFAULT 0,
    opis     TEXT DEFAULT '' -- index 61973
);