const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'products.db');
const MIGRATION_FILE = path.join(__dirname, 'db', 'migration_V1_create_products.sql');

// --- Инициализация БД и миграции ---
const db = new sqlite3.Database(DB_FILE);

const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
db.exec(migrationSql, (err) => {
  if (err) {
    console.error('Error running migration', err);
    process.exit(1);
  } else {
    ensureOpisColumn() // opis (61973)
      .then(() => console.log('Migration OK (opis column ready)'))
      .catch((e) => {
        console.error('Error ensuring opis column', e);
        process.exit(1);
      });
  }
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // фронт

app.get('/db', (req, res) => {
  res.setHeader('Content-Type1', 'application/x-sqlite3');
  res.setHeader('Content-Disposition', 'inline; filename="products.db"');
  res.sendFile(DB_FILE);
});

// --- вспомогательная валидация (для кодов 400) ---
function validateProduct(body) {
  const errors = [];

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push('name is required');
  }
  const price = Number(body.price);
  if (Number.isNaN(price) || price < 0) {
    errors.push('price must be non-negative number');
  }
  const stock = Number(body.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) {
    errors.push('stock must be non-negative integer');
  }

  // opis (index 61973)
  const opis = (body.opis ?? '').toString().trim();
  if (opis.length > 2000) {
    errors.push('opis is too long (max 2000 chars)');
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      name: body.name?.trim(),
      price,
      category: (body.category || '').trim(),
      stock,
      opis // index 61973
    }
  };
}

// --- ensure DB has "opis" column (index 61973) ---
function ensureOpisColumn() {
  return new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(products);', (err, columns) => {
      if (err) return reject(err);
      const hasOpis = Array.isArray(columns) && columns.some((c) => c.name === 'opis');
      if (hasOpis) return resolve();
      db.run('ALTER TABLE products ADD COLUMN opis TEXT DEFAULT "";', (err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

// --- ENDPOINTS ---
// GET /products  (список)
app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

// GET /products/:id
app.get('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' }); // 400
  }

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' }); // 404
    res.json(row);
  });
});

// POST /products
app.post('/products', (req, res) => {
  const { valid, errors, value } = validateProduct(req.body);
  if (!valid) {
    return res.status(400).json({ errors }); // 400 bad request
  }

  db.run(
    // opis (index 61973)
    'INSERT INTO products (name, price, category, stock, opis) VALUES (?, ?, ?, ?, ?)',
    [value.name, value.price, value.category, value.stock, value.opis],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      db.get('SELECT * FROM products WHERE id = ?', [this.lastID], (err2, row) => {
        if (err2) return res.status(500).json({ error: 'DB error' });
        res.status(201).json(row); // 201 created
      });
    }
  );
});

// PUT /products/:id
app.put('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { valid, errors, value } = validateProduct(req.body);
  if (!valid) {
    return res.status(400).json({ errors });
  }

  db.run(
    // opis (index 61973)
    'UPDATE products SET name = ?, price = ?, category = ?, stock = ?, opis = ? WHERE id = ?',
    [value.name, value.price, value.category, value.stock, value.opis, id],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      db.get('SELECT * FROM products WHERE id = ?', [id], (err2, row) => {
        if (err2) return res.status(500).json({ error: 'DB error' });
        res.json(row); // 200 OK
      });
    }
  );
});

// DELETE /products/:id
app.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  db.run('DELETE FROM products WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.status(204).send(); // 204 no content
  });
});

// -------------------------
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});