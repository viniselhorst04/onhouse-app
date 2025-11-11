// backend/server.js

// 1. Importa as bibliotecas que acabamos de instalar
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./database.js'); // Importa a conexão com o banco de dados

// 2. Configuração inicial do nosso aplicativo servidor
const app = express();
const PORT = 3000; // A porta em que o servidor vai "ouvir"
const JWT_SECRET = 'onhouse-chave-super-secreta-123'; // Uma senha para o servidor criar os tokens

// 3. Configurações para o servidor entender as requisições
app.use(cors()); // Habilita o CORS para permitir a comunicação com o frontend
app.use(bodyParser.json()); // Faz o servidor entender o formato JSON

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
app.post('/api/login', (req, res) => { // Não precisa ser async se usarmos callbacks
  // Pega o 'username' e 'password' que o frontend enviou no corpo da requisição
  const { username, password } = req.body;
  console.log(`[API] Recebida tentativa de login para o usuário: ${username}`);

  const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
  db.get(sql, [username, password], (err, user) => {
    if (err) {
      res.status(500).json({ "message": err.message });
      return;
    }
    if (user) {
      // Se o login estiver correto...
      const userData = { name: user.name, role: user.role, avatar: user.avatar, initials: user.initials };
      const token = jwt.sign(
        { username: user.username, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      res.status(200).json({
        message: 'Login bem-sucedido!',
        token: token,
        user: userData
      });
    } else {
      res.status(401).json({ message: 'Usuário ou senha inválidos.' });
    }
  });
});

// ROTA PARA BUSCAR NOTIFICAÇÕES
app.get('/api/announcements', (req, res) => {
  console.log(`[API] Enviando lista de notificações.`);
  const sql = "SELECT * FROM announcements ORDER BY ts DESC";
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.status(200).json(rows);
  });
});

// ROTA PARA CRIAR UMA NOVA NOTIFICAÇÃO (PROTEGIDA)
// Usamos o `verifyToken` antes da lógica da rota. Só passa se o token for válido.
app.post('/api/announcements', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem postar.' });
  }

  console.log(`[API] Admin ${req.user.username} está criando uma nova notificação.`);
  const { title, text, img } = req.body;
  if (!title || !text) {
    return res.status(400).json({ message: 'Título e texto são obrigatórios.' });
  }

  const sql = `INSERT INTO announcements (title, text, img, ts) VALUES (?, ?, ?, ?)`;
  const params = [title, text, img || null, Date.now()];
  db.run(sql, params, function (err) {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, title, text, img: img || null, ts: params[3] });
  });
});

// ROTA PARA DELETAR UMA NOTIFICAÇÃO (PROTEGIDA)
app.delete('/api/announcements/:id', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado.' });
  }

  console.log(`[API] Admin ${req.user.username} está deletando a notificação ID: ${req.params.id}`);
  const sql = 'DELETE FROM announcements WHERE id = ?';
  db.run(sql, req.params.id, function (err) {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Notificação não encontrada.' });
    }
    res.status(200).json({ message: 'Notificação removida com sucesso.' });
  });
});

// --- ROTAS DE ENTREGAS ---

// ROTA PARA BUSCAR ENTREGAS (PROTEGIDA)
app.get('/api/deliveries', verifyToken, (req, res) => {
  console.log(`[API] Usuário ${req.user.username} está buscando a lista de entregas.`);
  
  let sql = "SELECT * FROM deliveries ORDER BY ts DESC";
  let params = [];

  // Se o usuário for um morador, filtre as entregas pelo nome dele
  if (req.user.role === 'condomino') {
    sql = "SELECT * FROM deliveries WHERE owner = ? ORDER BY ts DESC";
    params.push(req.user.name);
    console.log(`[API] Filtrando entregas para o morador: ${req.user.name}`);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.status(200).json(rows);
  });
});

// ROTA PARA ADICIONAR UMA NOVA ENTREGA (PROTEGIDA)
app.post('/api/deliveries', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem registrar entregas.' });
  }

  const { owner, info } = req.body;
  if (!owner || !info) {
    return res.status(400).json({ message: 'Destinatário e informação são obrigatórios.' });
  }

  console.log(`[API] Admin ${req.user.username} registrou nova entrega para ${owner}.`);
  const sql = `INSERT INTO deliveries (owner, info, ts) VALUES (?, ?, ?)`;
  const params = [owner, info, Date.now()];
  db.run(sql, params, function (err) {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, owner, info, ts: params[2] });
  });
});

// ROTA PARA LIBERAR VISITANTE (PROTEGIDA)
// Qualquer usuário logado pode chamar esta rota.
app.post('/api/visitor-releases', verifyToken, (req, res) => {
  const { name, unit } = req.body;
  const residentName = req.user.name; // Pegamos o nome do morador a partir do token

  if (!name || !unit) {
    return res.status(400).json({ message: 'Nome do visitante e unidade são obrigatórios.' });
  }

  console.log(`[API] ${residentName} está liberando o visitante ${name} para a unidade ${unit}.`);

  const title = 'Liberação de Visitante';
  const text = `O visitante ${name} foi liberado para a unidade ${unit} pelo(a) morador(a) ${residentName}.`;
  const sql = `INSERT INTO announcements (title, text, img, ts) VALUES (?, ?, ?, ?)`;
  const params = [title, text, null, Date.now()];
  db.run(sql, params, function (err) {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, title, text, img: null, ts: params[3] });
  });
});

// --- ROTAS DE RESERVAS ---

// ROTA PARA BUSCAR RESERVAS (PROTEGIDA)
app.get('/api/reservations', verifyToken, (req, res) => {
  console.log(`[API] Usuário ${req.user.username} está buscando a lista de reservas.`);
  const sql = "SELECT * FROM reservations ORDER BY date ASC"; // Ordena pela data da reserva
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.status(200).json(rows);
  });
});

// ROTA PARA CRIAR UMA NOVA RESERVA (PROTEGIDA)
app.post('/api/reservations', verifyToken, (req, res) => {
  const { place, owner, date } = req.body;
  
  if (!place || !owner || !date) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  console.log(`[API] Usuário ${req.user.username} está criando uma reserva para ${owner} no local ${place}.`);
  
  const sql = `INSERT INTO reservations (place, owner, date, ts) VALUES (?, ?, ?, ?)`;
  const params = [place, owner, date, Date.now()];
  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ "error": err.message });
    }
    res.status(201).json({ id: this.lastID, place, owner, date, ts: params[3] });
  });
});

// --- ROTAS DE USUÁRIOS (ADMIN) ---

// ROTA PARA BUSCAR TODOS OS USUÁRIOS (ADMIN)
app.get('/api/users', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado.' });
  }
  console.log(`[API] Admin ${req.user.username} está buscando a lista de usuários.`);
  // Seleciona todos os campos, exceto a senha, por segurança.
  const sql = "SELECT id, username, name, role, initials, avatar FROM users ORDER BY name ASC";
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ "error": err.message });
    }
    res.status(200).json(rows);
  });
});

// ROTA PARA CRIAR UM NOVO USUÁRIO (ADMIN)
app.post('/api/users', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado.' });
  }

  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  const initials = name.trim().split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  console.log(`[API] Admin ${req.user.username} está criando o usuário: ${username}`);

  const sql = `INSERT INTO users (username, password, name, role, initials) VALUES (?, ?, ?, ?, ?)`;
  const params = [username, password, name, role, initials];

  db.run(sql, params, function (err) {
    if (err) {
      // Trata o erro de username duplicado
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ message: 'Este nome de usuário já existe.' });
      }
      return res.status(500).json({ "error": err.message });
    }
    res.status(201).json({ id: this.lastID, username, name, role, initials });
  });
});

// 6. INICIA O SERVIDOR
// Faz o servidor começar a "ouvir" por conexões na porta que definimos
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor OnHouse está no ar e acessível na sua rede local na porta ${PORT}`);
});