// backend/database.js
const { Pool } = require('pg');
const { URL } = require('url');
const dns = require('dns');

// IMPORTANTE: A Render injeta a URL de conexão automaticamente como uma variável de ambiente.
// Não cole a sua URL aqui diretamente por segurança.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERRO: DATABASE_URL não definida. Crie um arquivo .env na pasta backend.");
}

const dbUrl = new URL(connectionString);

let poolPromise = null;

// Função para obter o pool, resolvendo DNS para IPv4 manualmente
function getPool() {
  if (poolPromise) return poolPromise;

  poolPromise = new Promise((resolve) => {
    dns.resolve4(dbUrl.hostname, (err, addresses) => {
      const host = (err || !addresses.length) ? dbUrl.hostname : addresses[0];
      if (host !== dbUrl.hostname) console.log(`✅ DNS IPv4 resolvido: ${host}`);

      const pool = new Pool({
        user: decodeURIComponent(dbUrl.username),
        password: decodeURIComponent(dbUrl.password),
        host: host, // Usa o IP resolvido diretamente
        port: dbUrl.port,
        database: dbUrl.pathname.split('/')[1],
        ssl: { rejectUnauthorized: false, servername: dbUrl.hostname }, // servername é necessário quando usamos IP
      });
      resolve(pool);
    });
  });
  return poolPromise;
}

async function initializeDatabase() {
  try {
    const db = await getPool();
    await db.query(`
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

    await db.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT,
        text TEXT,
        img TEXT,
        ts BIGINT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id SERIAL PRIMARY KEY,
        owner TEXT,
        info TEXT,
        ts BIGINT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        place TEXT,
        owner TEXT,
        date TEXT,
        ts BIGINT
      );
    `);

    const { rows } = await db.query("SELECT COUNT(*) as count FROM users");
    if (rows[0].count === '0') {
      await db.query(`INSERT INTO users (username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5)`, ['admin', '1234', 'Admin', 'admin', 'AD']);
      await db.query(`INSERT INTO users (username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5)`, ['helo', 'cond', 'Heloisa Ferraz', 'condomino', 'HF']);
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
  query: async (text, params) => {
    const db = await getPool();
    return db.query(text, params);
  },
};