// backend/database.js
const { Pool } = require('pg');

// IMPORTANTE: A Render injeta a URL de conexão automaticamente como uma variável de ambiente.
// Não cole a sua URL aqui diretamente por segurança.
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  // Se estiver rodando na Render, SSL é necessário.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        avatar TEXT,
        initials TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT,
        text TEXT,
        img TEXT,
        ts BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id SERIAL PRIMARY KEY,
        owner TEXT,
        info TEXT,
        ts BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        place TEXT,
        owner TEXT,
        date TEXT,
        ts BIGINT
      );
    `);

    const { rows } = await pool.query("SELECT COUNT(*) as count FROM users");
    if (rows[0].count === '0') {
      await pool.query(`INSERT INTO users (username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5)`, ['admin', '1234', 'Admin', 'admin', 'AD']);
      await pool.query(`INSERT INTO users (username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5)`, ['helo', 'cond', 'Heloisa Ferraz', 'condomino', 'HF']);
      console.log("Usuários padrão inseridos.");
    }

    console.log('Conectado e inicializado no banco de dados PostgreSQL.');
  } catch (err) {
    console.error('Erro ao inicializar o banco de dados', err.stack);
    process.exit(1); // Encerra a aplicação se não conseguir conectar/inicializar o DB
  }
}

initializeDatabase();

module.exports = {
  query: (text, params) => pool.query(text, params),
};