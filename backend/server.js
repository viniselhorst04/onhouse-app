// backend/server.js

// 1. Importa as bibliotecas que acabamos de instalar
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./database.js'); // Importa a conexão com o banco de dados

// 2. Configuração inicial do nosso aplicativo servidor
const app = express();
const PORT = process.env.PORT || 3000; // A porta em que o servidor vai "ouvir"
const JWT_SECRET = process.env.JWT_SECRET || 'onhouse-chave-super-secreta-123'; // Usa variável de ambiente ou fallback

// Opções do CORS: Permite requisições apenas do seu site na Netlify
const corsOptions = {
  origin: '*', // Permite qualquer origem (Resolve o erro de CORS definitivamente)
  optionsSuccessStatus: 200
};

// 3. Configurações para o servidor entender as requisições
app.use(cors(corsOptions)); // Habilita o CORS para todas as requisições
app.use(bodyParser.json()); // Faz o servidor entender o formato JSON

// Rota de teste para verificar rapidamente se o servidor está online
app.get('/', (req, res) => {
  res.send('Backend OnHouse está Online e Conectado! 🚀');
});

// Middleware de Autenticação (Nosso "Guarda")
// Esta função vai verificar se o token enviado pelo frontend é válido.
function verifyToken(req, res, next) {
  const bearerHeader = req.headers['authorization'];

  if (typeof bearerHeader !== 'undefined') {
    // O token vem no formato "Bearer <token>", então separamos o token.
    const bearerToken = bearerHeader.split(' ')[1];
    
    jwt.verify(bearerToken, JWT_SECRET, (err, authData) => {
      if (err) {
        return res.sendStatus(403); // 403 Forbidden - Token inválido ou expirado
      }
      // Se o token for válido, adicionamos os dados do usuário na requisição
      req.user = authData;
      next(); // Continua para a próxima função (a rota em si)
    });
  } else {
    // Se nenhum token foi enviado
    res.sendStatus(401); // 401 Unauthorized
  }
}


// 5. CRIAÇÃO DA ROTA DE LOGIN
// Este é o "endereço" que o seu frontend vai chamar: http://localhost:3000/api/login
app.post('/api/login', async (req, res) => {
  // Agora recebemos também o 'condoSlug' (código do condomínio)
  const { username, password, condoSlug } = req.body;
  console.log(`[API] Login: ${username} em ${condoSlug}`);

  try {
    // 1. Achar o condomínio
    const condoRes = await db.query("SELECT id, name, config FROM condos WHERE slug = $1", [condoSlug || 'demo']);
    if (condoRes.rows.length === 0) {
      return res.status(404).json({ message: 'Condomínio não encontrado.' });
    }
    const condo = condoRes.rows[0];

    // 2. Achar o usuário DENTRO desse condomínio
    const sql = "SELECT * FROM users WHERE condo_id = $1 AND username = $2 AND password = $3";
    const { rows } = await db.query(sql, [condo.id, username, password]);
    const user = rows[0];

    if (user) {
      const userData = { name: user.name, role: user.role, avatar: user.avatar, initials: user.initials, condoName: condo.name };
      const token = jwt.sign(
        { id: user.id, username: user.username, name: user.name, role: user.role, condo_id: condo.id }, // Inclui condo_id no token
        JWT_SECRET,
        { expiresIn: '24h' } // Aumentei a expiração
      );
      res.status(200).json({
        message: 'Login bem-sucedido!',
        token: token,
        user: userData
      });
    } else {
      res.status(401).json({ message: 'Usuário ou senha inválidos.' });
    }
  } catch (err) {
    res.status(500).json({ "message": err.message });
  }
});

// ROTA PARA BUSCAR NOTIFICAÇÕES
app.get('/api/announcements', verifyToken, async (req, res) => {
  console.log(`[API] Usuário ${req.user.username} está buscando a lista de notificações.`);
  const sql = "SELECT * FROM announcements WHERE condo_id = $1 ORDER BY ts DESC";
  try {
    const { rows } = await db.query(sql, [req.user.condo_id]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ "error": err.message });
  }
});

// ROTA PARA CRIAR UMA NOVA NOTIFICAÇÃO (PROTEGIDA)
// Usamos o `verifyToken` antes da lógica da rota. Só passa se o token for válido.
app.post('/api/announcements', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem postar.' });
  }

  console.log(`[API] Admin ${req.user.username} está criando uma nova notificação.`);
  const { title, text, img } = req.body;
  if (!title || !text) {
    return res.status(400).json({ message: 'Título e texto são obrigatórios.' });
  }

  const sql = `INSERT INTO announcements (condo_id, title, text, img, ts) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
  const params = [req.user.condo_id, title, text, img || null, Date.now()];
  try {
    const { rows } = await db.query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ "error": err.message });
  }
});

// ROTA PARA DELETAR UMA NOTIFICAÇÃO (PROTEGIDA)
app.delete('/api/announcements/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado.' });
  }

  console.log(`[API] Admin ${req.user.username} está deletando a notificação ID: ${req.params.id}`);
  const sql = 'DELETE FROM announcements WHERE id = $1 AND condo_id = $2';
  try {
    const result = await db.query(sql, [req.params.id, req.user.condo_id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Notificação não encontrada.' });
    }
    res.status(200).json({ message: 'Notificação removida com sucesso.' });
  } catch (err) {
    res.status(500).json({ "error": err.message });
  }
});

// --- ROTAS DE ENTREGAS ---

// ROTA PARA BUSCAR ENTREGAS (PROTEGIDA)
app.get('/api/deliveries', verifyToken, async (req, res) => {
  console.log(`[API] Usuário ${req.user.username} está buscando a lista de entregas.`);
  
  let sql = "SELECT * FROM deliveries WHERE condo_id = $1 ORDER BY ts DESC";
  let params = [req.user.condo_id];

  // Se o usuário for um morador, filtre as entregas pelo nome dele
  if (req.user.role === 'condomino') {
    sql = "SELECT * FROM deliveries WHERE condo_id = $1 AND owner = $2 ORDER BY ts DESC";
    params.push(req.user.name); // params agora tem [condo_id, owner]
    console.log(`[API] Filtrando entregas para o morador: ${req.user.name}`);
  }

  try {
    const { rows } = await db.query(sql, params);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ "error": err.message });
  }
});

// ROTA PARA ADICIONAR UMA NOVA ENTREGA (PROTEGIDA)
app.post('/api/deliveries', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem registrar entregas.' });
  }

  const { owner, info } = req.body;
  if (!owner || !info) {
    return res.status(400).json({ message: 'Destinatário e informação são obrigatórios.' });
  }

  console.log(`[API] Admin ${req.user.username} registrou nova entrega para ${owner}.`);
  const sql = `INSERT INTO deliveries (condo_id, owner, info, ts) VALUES ($1, $2, $3, $4) RETURNING *`;
  const params = [req.user.condo_id, owner, info, Date.now()];
  try {
    const { rows } = await db.query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ "error": err.message });
  }
});

// ROTA PARA LIBERAR VISITANTE (PROTEGIDA)
// Qualquer usuário logado pode chamar esta rota.
app.post('/api/visitor-releases', verifyToken, async (req, res) => {
  const { name, unit } = req.body;
  const residentName = req.user.name; // Pegamos o nome do morador a partir do token

  if (!name || !unit) {
    return res.status(400).json({ message: 'Nome do visitante e unidade são obrigatórios.' });
  }

  console.log(`[API] ${residentName} está liberando o visitante ${name} para a unidade ${unit}.`);

  const title = 'Liberação de Visitante';
  const text = `O visitante ${name} foi liberado para a unidade ${unit} pelo(a) morador(a) ${residentName}.`;
  const sql = `INSERT INTO announcements (condo_id, title, text, img, ts) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
  const params = [req.user.condo_id, title, text, null, Date.now()];
  try {
    const { rows } = await db.query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ "error": err.message });
  }
});

// --- ROTAS DE RESERVAS ---

// ROTA PARA BUSCAR RESERVAS (PROTEGIDA)
app.get('/api/reservations', verifyToken, async (req, res) => {
  console.log(`[API] Usuário ${req.user.username} está buscando a lista de reservas.`);
  const sql = "SELECT * FROM reservations WHERE condo_id = $1 ORDER BY date ASC"; // Ordena pela data da reserva
  try {
    const { rows } = await db.query(sql, [req.user.condo_id]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ "error": err.message });
  }
});

// ROTA PARA CRIAR UMA NOVA RESERVA (PROTEGIDA)
app.post('/api/reservations', verifyToken, async (req, res) => {
  const { place, owner, date } = req.body;
  
  if (!place || !owner || !date) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  console.log(`[API] Usuário ${req.user.username} está criando uma reserva para ${owner} no local ${place}.`);
  
  const sql = `INSERT INTO reservations (condo_id, place, owner, date, ts) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
  const params = [req.user.condo_id, place, owner, date, Date.now()];
  try {
    const { rows } = await db.query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ "error": err.message });
  }
});

// --- ROTAS DE USUÁRIOS (ADMIN) ---

// ROTA PARA BUSCAR TODOS OS USUÁRIOS (ADMIN)
app.get('/api/users', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado.' });
  }
  console.log(`[API] Admin ${req.user.username} está buscando a lista de usuários.`);
  // Seleciona todos os campos, exceto a senha, por segurança.
  const sql = "SELECT id, username, name, role, initials, avatar FROM users WHERE condo_id = $1 ORDER BY name ASC";
  try {
    const { rows } = await db.query(sql, [req.user.condo_id]);
    res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ "error": err.message });
  }
});

// ROTA PARA CRIAR UM NOVO USUÁRIO (ADMIN)
app.post('/api/users', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado.' });
  }

  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  const initials = name.trim().split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  console.log(`[API] Admin ${req.user.username} está criando o usuário: ${username}`);

  const sql = `INSERT INTO users (condo_id, username, password, name, role, initials) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, name, role, initials`;
  const params = [req.user.condo_id, username, password, name, role, initials];

  try {
    const { rows } = await db.query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    // Trata o erro de username duplicado
    if (err.code === '23505') { // Código de erro para violação de constraint UNIQUE no PostgreSQL
      return res.status(409).json({ message: 'Este nome de usuário já existe.' });
    }
    return res.status(500).json({ "error": err.message });
  }
});

// 6. INICIA O SERVIDOR
// Faz o servidor começar a "ouvir" por conexões na porta que definimos
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor OnHouse está no ar e acessível na sua rede local na porta ${PORT}`);
});