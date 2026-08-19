const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const os = require('os');
const compression = require('compression');
require('dotenv').config();
const rateLimit = require('express-rate-limit');

// общий лимит на API
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,        // окно — 1 минута
    max: 100,                   // максимум 100 запросов с IP
    message: { error: 'Слишком много запросов, попробуйте позже' }
});


// строгий лимит на чувствительные места
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,                    // 10 попыток входа за 15 минут
    message: { error: 'Слишком много попыток, попробуйте позже' }
});


const app = express();
app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use(compression());
// ==========================================
// 1. НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ (Multer)
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
// INFO RAM
setInterval(() => {
  const gb = "Свободно ОЗУ: " + (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + " GB";
  process.stdout.write("\r" + gb + "    ");
}, 20000);
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Поддерживаются только изображения!'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 МБ
});

// Делаем папку uploads доступной статически
app.use('/uploads', express.static('uploads'));

// ==========================================
// 2. БАЗОВЫЕ НАСТРОЙКИ И БД
// ==========================================
const allowedOrigins = [
    'https://gabyweb.ru', 
    'https://www.gabyweb.ru', 
    'https://startup-find-server.serveousercontent.com',
    'http://localhost:3000',
    'https://startup-finder.ru',
    'http://startup-finder.ru',
    'https://www.startup-finder.ru',
    'http://www.startup-finder.ru',
    'http://localhost',          // Стандартный адрес WebView на Android
    'capacitor://localhost',  
];

app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// express.json() нужен для обычных запросов, 
// но multer перехватит multipart/form-data для файлов
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: process.env.POSTGRESQL, 
    port: process.env.POSTGRESQLPORT,
    max: 20,        // макс соединений (по умолчанию 10)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.query('SELECT NOW()', (err) => {
    if (err) {
    if (err.code === 'ECONNREFUSED') {
    console.log('База данных выключена или не запущена');
    return;
    }
    console.log('Ошибка подключения к БД:', err)
    }
    else console.log('Подключено к PostgreSQL');
});

const JWT_SECRET = process.env.JWTKEY;

// ==========================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
// Безопасный парсинг JSON (защита от краша, если пришла пустая строка или "null")
const safeParseJSON = (str) => {
    if (!str || str === 'null' || str === '""') return null;
    if (Array.isArray(str)) return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return str; // Если это просто строка, возвращаем её
    }
};

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: process.env.TRANSPORTERPORT,
    secure: true,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    }
});

async function sendVerificationEmail(email, code) {
    await transporter.sendMail({
        from: '"StartupFinder" <noreply@startupfinder.com>',
        to: email,
        subject: 'Код подтверждения',
        text: `Ваш код подтверждения: ${code}`
    });
}

// ==========================================
// 4. MIDDLEWARE
// ==========================================
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Недействительный токен' });
    }
}

// ==========================================
// 5. МАРШРУТЫ АВТОРИЗАЦИИ
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email и пароль обязательны' });
        }

        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const defaultName = email.split('@')[0];

        await pool.query(
            'INSERT INTO users (email, password, verification_code, is_verified, name) VALUES ($1, $2, $3, $4, $5)',
            [email, hashedPassword, verificationCode, false, defaultName]
        );

        try {
            await sendVerificationEmail(email, verificationCode);
        } catch (mailError) {
            console.error('Ошибка отправки письма:', mailError);
        }

        res.status(201).json({ message: 'Пользователь создан. Проверьте почту.' });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        if (!user.is_verified) {
            return res.status(403).json({ error: 'Пожалуйста, подтвердите email.' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ 
            token, 
            user: { 
                id: user.id, 
                email: user.email,
                name: user.name,
                description: user.description,
                contacts: safeParseJSON(user.contacts),
                avatar_url: user.avatar_url,
            } 
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        const result = await pool.query(
            'SELECT id, email, name, description, contacts, avatar_url FROM users WHERE email = $1 AND verification_code = $2 AND is_verified = FALSE', 
            [email, code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Неверный код или пользователь уже подтвержден' });
        }

        const user = result.rows[0];
        await pool.query('UPDATE users SET is_verified = TRUE, verification_code = NULL WHERE id = $1', [user.id]);

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ 
            message: 'Email подтвержден!',
            token, 
            user: { 
                id: user.id, 
                email: user.email,
                name: user.name,
                description: user.description,
                contacts: safeParseJSON(user.contacts),
                avatar_url: user.avatar_url
            } 
        });
    } catch (error) {
        console.error('Ошибка подтверждения:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==========================================
// 6. МАРШРУТЫ ПОЛЬЗОВАТЕЛЯ
// ==========================================
app.get('/api/me', authenticate, async (req, res) => {
    try {
        // Добавили avatar_url в SELECT
        const result = await pool.query(
            'SELECT id, email, name, description, contacts, avatar_url FROM users WHERE id = $1', 
            [req.userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const user = result.rows[0];
        user.contacts = safeParseJSON(user.contacts); // Парсим перед отправкой
        res.json(user);
    } catch (error) {
        console.error('Ошибка /api/me:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const result = await pool.query(
            // email убрали — только публичные поля
            'SELECT id, name, description, contacts, avatar_url FROM users WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = result.rows[0];
        user.contacts = safeParseJSON(user.contacts);

        // Проекты автора — тем же JOIN, что и в /api/startups
        const startupsRes = await pool.query(`
            SELECT s.*, u.name AS author_name, u.avatar_url AS author_avatar
            FROM startups s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.user_id = $1
            ORDER BY s.created_at DESC
        `, [req.params.id]);

        // Формат, который ждёт фронт: { user, startups }
        res.json({ user, startups: startupsRes.rows });
    } catch (error) {
        console.error('Ошибка получения пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (req.userId !== id) {
            return res.status(403).json({ error: 'Можно удалить только свой аккаунт' });
        }

        await pool.query('DELETE FROM startups WHERE user_id = $1', [id]);
        // Потом сам аккаунт
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка удаления аккаунта: ', error);
        res.status(500).json({ error: 'Не удалось удалить аккаунт' });
    }
});

app.put('/api/profile', authenticate, upload.single('image'), async (req, res) => {
    try {
        const { name, description, contacts } = req.body;
        
        let parsedContacts = null;
        if (contacts) {
            try { parsedContacts = JSON.parse(contacts); } catch { parsedContacts = contacts; }
        }
        
        let avatarUrl;
        if (req.file) {
            avatarUrl = `/uploads/${req.file.filename}`;
        } else {
            const currentUser = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [req.userId]);
            avatarUrl = currentUser.rows[0]?.avatar_url || null;
        }

        const result = await pool.query(
            'UPDATE users SET name = $1, description = $2, contacts = $3, avatar_url = $4 WHERE id = $5 RETURNING id, email, name, description, contacts, avatar_url',
            [name || null, description || null, parsedContacts, avatarUrl, req.userId] // <-- parsedContacts передаем как есть
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==========================================
// 7. МАРШРУТЫ СТАРТАПОВ
// ==========================================
// === ПОЛУЧИТЬ СТАРТАПЫ (С ПАГИНАЦИЕЙ И ФИЛЬТРАЦИЕЙ) ===
app.get('/api/startups', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 5, 20);
        const offset = parseInt(req.query.offset) || 0;
        const payment = req.query.payment || 'all';
        const stack = req.query.stack ? req.query.stack.split(',').map(s => s.trim()).filter(Boolean) : [];
        const vacancy = (req.query.vacancy || '').trim();

        const params = [];
        const conditions = [];

        // Фильтр по оплате
        if (payment === 'paid') {
            conditions.push('s.is_paid = TRUE');
        } else if (payment === 'free') {
            conditions.push('s.is_paid = FALSE');
        }

        // Фильтр по стеку
        for (const tech of stack) {
            params.push(`%${tech}%`);
            conditions.push(`LOWER(s.stack::text) LIKE $${params.length}`);
        }

        // Фильтр по вакансии
        if (vacancy) {
            params.push(`%${vacancy}%`);
            conditions.push(`EXISTS (SELECT 1 FROM unnest(s.vacancies) AS v WHERE v ILIKE $${params.length})`);
        }

        // WHERE собирается один раз — без него не останется «голый AND»
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Общее количество с теми же фильтрами (без LIMIT/OFFSET)
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM startups s ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Сама пачка проектов + автор
        params.push(limit, offset);
        const dataResult = await pool.query(
            `SELECT s.id, s.name, s.description, s.is_paid, s.stack, s.contacts, s.telegram,
                    s.vacancies, s.image_url, s.user_id, s.created_at,
                    u.name AS author_name, u.avatar_url AS author_avatar
             FROM startups s
             LEFT JOIN users u ON u.id = s.user_id
             ${whereClause}
             ORDER BY s.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        res.json({
            startups: dataResult.rows,
            total,
            hasMore: offset + limit < total
        });
    } catch (error) {
        console.error('Ошибка получения стартапов: ', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// === СТАТИСТИКА
app.get('/api/stats', async (req, res) => {
    try {
        const [startupsRes, usersRes, vacanciesRes] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM startups'),
            pool.query('SELECT COUNT(*) FROM users WHERE is_verified = TRUE'),
            pool.query(`SELECT COALESCE(SUM(
                COALESCE(array_length(vacancies, 1), 0)
            ), 0) as total FROM startups`)
        ]);

        res.json({
            startups: parseInt(startupsRes.rows[0].count),
            users: parseInt(usersRes.rows[0].count),
            vacancies: parseInt(vacanciesRes.rows[0].total)
        });
    } catch (error) {
        console.error('Ошибка статистики:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/startups', authenticate, upload.single('image'), async (req, res) => {
    try {
        const { name, description, is_paid, stack, contacts, telegram, vacancies } = req.body;
        
        if (!name || !description) {
            return res.status(400).json({ error: 'Название и описание обязательны' });
        }

        let parsedVacancies = [];
        try { parsedVacancies = JSON.parse(vacancies || '[]'); } catch { parsedVacancies = []; }

        let parsedContacts = null;
        if (contacts) {
            try { parsedContacts = JSON.parse(contacts); } catch { parsedContacts = contacts; }
        }
        
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const isPaidBool = (is_paid === 'true' || is_paid === true);

        // Библиотека pg сама правильно преобразует их в формат PostgreSQL.
        const result = await pool.query(
            'INSERT INTO startups (name, description, is_paid, stack, contacts, telegram, vacancies, image_url, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [name, description, isPaidBool, stack, parsedContacts, telegram, parsedVacancies, imageUrl, req.userId]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка создания стартапа:', error);
        res.status(500).json({ error: 'Не удалось создать стартап' });
    }
});

app.put('/api/startups/:id', authenticate, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, is_paid, stack, contacts, telegram, vacancies } = req.body;

        const startup = await pool.query('SELECT user_id, image_url FROM startups WHERE id = $1', [id]);
        if (startup.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }
        if (startup.rows[0].user_id !== req.userId) {
            return res.status(403).json({ error: 'Нет прав на редактирование' });
        }

        let parsedVacancies = [];
        try { parsedVacancies = JSON.parse(vacancies || '[]'); } catch { parsedVacancies = []; }

        let parsedContacts = [];
        if (req.body.contacts) {
        try {
             parsedContacts = JSON.parse(req.body.contacts); // '["contact"]' → ['contact']
            if (!Array.isArray(parsedContacts)) parsedContacts = [parsedContacts];
             } catch {
             parsedContacts = [req.body.contacts];
         }
}

        const imageUrl = req.file ? `/uploads/${req.file.filename}` : startup.rows[0].image_url;
        const isPaidBool = (is_paid === 'true' || is_paid === true);

        // ВАЖНО: передаем массивы напрямую, без JSON.stringify
        const result = await pool.query(
            'UPDATE startups SET name = $1, description = $2, is_paid = $3, stack = $4, contacts = $5, telegram = $6, vacancies = $7, image_url = $8 WHERE id = $9 RETURNING *',
            [name, description, isPaidBool, stack, parsedContacts, telegram, parsedVacancies, imageUrl, id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка обновления стартапа:', error);
        res.status(500).json({ error: 'Ошибка обновления' });
    }
});

app.delete('/api/startups/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const startup = await pool.query('SELECT user_id FROM startups WHERE id = $1', [id]);
        
        if (startup.rows.length === 0) {
            return res.status(404).json({ error: 'Проект не найден' });
        }
        if (startup.rows[0].user_id !== req.userId) {
            return res.status(403).json({ error: 'Нет прав на удаление' });
        }

        await pool.query('DELETE FROM startups WHERE id = $1', [id]);
        res.json({ message: 'Проект удален' });
    } catch (error) {
        console.error('Ошибка удаления:', error);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ==========================================
// 8. СБРОС ПАРОЛЯ
// ==========================================
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const userResult = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
        
        // В целях безопасности всегда возвращаем одно и то же сообщение
        if (userResult.rows.length === 0) {
            return res.json({ message: 'Если пользователь с таким email существует, код отправлен.' });
        }

        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(
            'UPDATE users SET reset_code = $1, reset_code_expires = $2 WHERE id = $3',
            [resetCode, expiresAt, userResult.rows[0].id]
        );

        await transporter.sendMail({
            from: '"StartupFinder" <noreply@startupfinder.com>',
            to: email,
            subject: 'Сброс пароля',
            text: `Ваш код для сброса пароля: ${resetCode}. Он действителен 15 минут.`
        });

        res.json({ message: 'Если пользователь с таким email существует, код отправлен.' });
    } catch (error) {
        console.error('Ошибка forgot-password:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const userResult = await pool.query(
            'SELECT id, reset_code_expires FROM users WHERE email = $1 AND reset_code = $2',
            [email, code]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: 'Неверный код или email' });
        }

        const expiresAt = new Date(userResult.rows[0].reset_code_expires);
        if (expiresAt < new Date()) {
            return res.status(400).json({ error: 'Срок действия кода истек' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password = $1, reset_code = NULL, reset_code_expires = NULL WHERE id = $2',
            [hashedPassword, userResult.rows[0].id]
        );

        res.status(200).json({ message: 'Пароль успешно изменен!' });
    } catch (error) {
        console.error('Ошибка reset-password:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
app.get('/api/search', async (req, res) => {
    try {
    const query = req.query.q;
    if(!query) {
        res.status(400).json({message: "Запрос не может быть пустым!"});
        return;
    }
    const result = await pool.query("SELECT s.*, u.name AS author_name, u.avatar_url AS author_avatar FROM startups s LEFT JOIN users u ON u.id = s.user_id WHERE s.name ILIKE $1 OR s.description ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(s.vacancies) AS v WHERE v ILIKE $1) OR s.stack ILIKE $1", [`%${query}%`]);
    res.status(200).json({ startups: result.rows, 
     });
    }
    catch(error) {
        console.log('Ошибка поиска по названию', error);
        res.status(500).json({error: 'Ошибка сервера'});``
    }
})
app.post('/api/support', async (req, res) => {
    const supportRequests = new Map();
    const ip = req.ip;
    const last = supportRequests.get(ip);
    if (last && Date.now() - last < 60000) {
        return res.status(429).json({ error: 'Слишком много запросов. Подождите минуту.' });
    }
    supportRequests.set(ip, Date.now());
    const {type, name, email, subject, message} = req.body;
    if(!email || !message) {
        res.status(400).json({message: "Почта и описание проблемы обязательны!"});
        return;
    }
    try {
   await transporter.sendMail({
            from: '"StartupFinder Support" <StartupFinderSend@gmail.com>',
            to: 'StartupFinderSend@gmail.com',
            replyTo: email,
            subject: `[${type || 'Обращение'}] ${subject || 'Без темы'}`,
            text: `От: ${name || 'Аноним'} <${email}>\n\n${message}`,
            html: `
                <p><strong>От:</strong> ${name || 'Аноним'} &lt;${email}&gt;</p>
                <p><strong>Тип:</strong> ${type}</p>
                <p><strong>Тема:</strong> ${subject || '—'}</p>
                <hr>
                <p>${message.replace(/\n/g, '<br>')}</p>
            `
        });
    await transporter.sendMail({
        from: '"StartupFinder" <noreply@startupfinder.com>',
        to: email,
        subject: "Ваша жалоба успешно подана!",
        text: "Спасибо что помогаете делать сервис лучше! \n Мы рассмотрим поданную вами жалобу в ближайшее время и отправим вам ответ от поддержки на этот адресс электронной почты. \n --Startup Finder--"
    })
    res.status(200).json({message: "Спасибо за обращение!"});
}
catch(error) {
    console.log("Ошибка отправки письма в поддержку", error);
    res.status(500).json({message: "Ошибка отправления."})
}
})
// ==========================================
// 9. ЗАПУСК СЕРВЕРА
// ==========================================
const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));