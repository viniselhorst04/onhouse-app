// backend/database.js
const { Pool } = require('pg');

// IMPORTANTE: A Render injeta a URL de conexão automaticamente como uma variável de ambiente.
// Não cole a sua URL aqui diretamente por segurança.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERRO: DATABASE_URL não definida. Crie um arquivo .env na pasta backend.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
  try {
    // Teste de conexão
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado ao banco de dados PostgreSQL!');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS condos (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL, -- Identificador único (ex: 'vila-verde')
        config JSONB -- Cores, logo, funcionalidades ativas
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        condo_id INTEGER REFERENCES condos(id),
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        avatar TEXT,
        initials TEXT,
        UNIQUE (username, condo_id) -- Username único apenas dentro do mesmo condomínio
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        condo_id INTEGER REFERENCES condos(id),
        title TEXT,
        text TEXT,
        img TEXT,
        ts BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id SERIAL PRIMARY KEY,
        condo_id INTEGER REFERENCES condos(id),
        owner TEXT,
        info TEXT,
        ts BIGINT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        condo_id INTEGER REFERENCES condos(id),
        place TEXT,
        owner TEXT,
        date TEXT,
        ts BIGINT
      );
    `);

    // Cria um condomínio padrão e usuários se não existirem
    const { rows } = await pool.query("SELECT COUNT(*) as count FROM condos");
    if (rows[0].count === '0') {
      console.log("Criando condomínio Demo e usuários padrão...");
      const condoRes = await pool.query(`INSERT INTO condos (name, slug, config) VALUES ($1, $2, $3) RETURNING id`, ['Condomínio Demo', 'demo', '{"theme": "default"}']);
      const condoId = condoRes.rows[0].id;

      await pool.query(`INSERT INTO users (condo_id, username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5, $6)`, [condoId, 'admin', '1234', 'Admin', 'admin', 'AD']);
      await pool.query(`INSERT INTO users (condo_id, username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5, $6)`, [condoId, 'helo', 'cond', 'Heloisa Ferraz', 'condomino', 'HF']);
      console.log("Dados iniciais inseridos com sucesso.");
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