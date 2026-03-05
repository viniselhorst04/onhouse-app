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
  ssl: { rejectUnauthorized: false },
  family: 4 // Força o uso de IPv4 para evitar erros de conexão (ENETUNREACH) no Render
});

// Log de diagnóstico para confirmar que a versão correta subiu
console.log("🔧 Tentando conectar ao banco com configuração IPv4...");

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

    // --- MIGRATION & SEEDING ---
    // 1. Adiciona colunas condo_id em tabelas antigas se não existirem
    const tables = ['users', 'announcements', 'deliveries', 'reservations'];
    for (const table of tables) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS condo_id INTEGER REFERENCES condos(id)`);
    }

    // 2. Garante que o condomínio Demo existe
    let demoId;
    const condoCheck = await pool.query("SELECT id FROM condos WHERE slug = 'demo'");
    if (condoCheck.rows.length > 0) {
      demoId = condoCheck.rows[0].id;
    } else {
      console.log("Criando condomínio Demo...");
      const newCondo = await pool.query(`INSERT INTO condos (name, slug, config) VALUES ($1, $2, $3) RETURNING id`, ['Condomínio Demo', 'demo', '{"theme": "default"}']);
      demoId = newCondo.rows[0].id;
    }

    // 3. Atualiza dados órfãos (sem condomínio) para o Demo
    for (const table of tables) {
      await pool.query(`UPDATE ${table} SET condo_id = $1 WHERE condo_id IS NULL`, [demoId]);
    }

    // 4. Garante usuários padrão no Demo (se não existirem)
    const userCheck = await pool.query("SELECT id FROM users WHERE username = 'admin' AND condo_id = $1", [demoId]);
    if (userCheck.rows.length === 0) {
      console.log("Criando usuários padrão...");
      await pool.query(`INSERT INTO users (condo_id, username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5, $6)`, [demoId, 'admin', '1234', 'Admin', 'admin', 'AD']);
      await pool.query(`INSERT INTO users (condo_id, username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5, $6)`, [demoId, 'helo', 'cond', 'Heloisa Ferraz', 'condomino', 'HF']);
    }

    // 5. Ajusta constraint de unicidade (remove global, adiciona por condomínio)
    try {
      await pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key");
      await pool.query("ALTER TABLE users ADD CONSTRAINT users_username_condo_unique UNIQUE (username, condo_id)");
    } catch (err) {
      // Ignora erro se constraint não existir ou já estiver correta
    }

    console.log('Conectado e inicializado no banco de dados PostgreSQL.');
  } catch (err) {
    console.error('Erro ao inicializar o banco de dados', err.stack);
    if (err.message && err.message.includes('password authentication failed')) {
      console.error('\n💡 DICA: A senha do banco de dados está incorreta.');
      console.error('   Verifique o arquivo .env na pasta backend e confirme a variável DATABASE_URL.\n');
    }
    process.exit(1); // Encerra a aplicação se não conseguir conectar/inicializar o DB
  }
}

initializeDatabase();

module.exports = {
  query: (text, params) => pool.query(text, params),
};