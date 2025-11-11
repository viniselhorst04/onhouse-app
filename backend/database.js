// backend/database.js
const sqlite3 = require('sqlite3').verbose();

// Cria ou abre o arquivo do banco de dados
const db = new sqlite3.Database('./onhouse.db', (err) => {
  if (err) {
    console.error('Erro ao abrir o banco de dados', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
    // Cria as tabelas se elas não existirem
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        role TEXT,
        avatar TEXT,
        initials TEXT
      )`, (err) => {
        if (err) console.error("Erro ao criar tabela users", err);
        // Insere usuários padrão se a tabela estiver vazia
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
          if (row.count === 0) {
            db.run(`INSERT INTO users (username, password, name, role, initials) VALUES (?, ?, ?, ?, ?)`,
              ['admin', '1234', 'Admin', 'admin', 'AD']);
            db.run(`INSERT INTO users (username, password, name, role, initials) VALUES (?, ?, ?, ?, ?)`,
              ['helo', 'cond', 'Heloisa Ferraz', 'condomino', 'HF']);
            console.log("Usuários padrão inseridos.");
          }
        });
      });

      db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        text TEXT,
        img TEXT,
        ts INTEGER
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT,
        info TEXT,
        ts INTEGER
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place TEXT,
        owner TEXT,
        date TEXT,
        ts INTEGER
      )`);
    });
  }
});

module.exports = db;