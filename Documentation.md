# StartupFinder API — Документация

Версия: 2.1
Базовый URL: `https://startup-finder.ru`

## Стек

- **Backend:** Node.js + Express 5
- **База данных:** PostgreSQL + Prisma ORM
- **Redis:** rate limiting, очереди (BullMQ)
- **Аутентификация:** JWT (срок действия 7 дней)
- **Frontend:** HTML/CSS/JS (в планах — Vue.js)

---

## Общие сведения

### Формат успешных ответов

Успешные ответы возвращают данные напрямую или объект с полями. Единого конверта нет (так сложилось исторически), но всегда есть HTTP-статус `2xx`.

### Формат ошибок (ЕДИНЫЙ)

Все ошибки возвращаются в едином формате:

```json
{
  "success": false,
  "error": {
    "code": "USER_EXISTS",
    "message": "Пользователь уже существует",
    "details": []
  }
}
```

- **`code`** — машиночитаемый код ошибки (см. таблицу ниже).
- **`message`** — человекочитаемое сообщение на русском.
- **`details`** — массив деталей (для `VALIDATION_ERROR` — какие поля не прошли валидацию).

**Breaking change:** если у вас фронт читает `response.error` или `response.message` — переделайте на `response.error.message`.

### HTTP-статусы

| Код | Значение |
|---|---|
| `200 OK` | Успех |
| `201 Created` | Ресурс создан |
| `400 Bad Request` | Валидация не прошла / неверные данные |
| `401 Unauthorized` | Нет токена или истёк |
| `403 Forbidden` | Доступ запрещён (не своё, или email не подтверждён) |
| `404 Not Found` | Ресурс не найден |
| `429 Too Many Requests` | Превышен rate limit |
| `500 Internal Server Error` | Ошибка на стороне сервера |

### Коды ошибок (поле `error.code`)

| Код | Когда возникает |
|---|---|
| `VALIDATION_ERROR` | Zod-валидация не прошла |
| `USER_EXISTS` | Регистрация на существующий email |
| `EMAIL_NOT_VERIFIED` | Попытка входа без подтверждения email |
| `INVALID_CODE` | Неверный код подтверждения или сброса |
| `CODE_EXPIRED` | Код сброса пароля истёк |
| `INVALID_CREDENTIALS` | Неверный email или пароль |
| `UNAUTHORIZED` | Нет токена / токен невалиден |
| `FORBIDDEN` | Действие запрещено для этого пользователя |
| `NOT_FOUND` | Ресурс не найден |
| `RATE_LIMIT_EXCEEDED` | Слишком много запросов |
| `FILE_TOO_LARGE` | Файл больше 5 МБ |
| `INVALID_FILE_TYPE` | Файл не является jpeg/png/webp/gif |

### Rate limiting

Ограничения запросов (по IP, для `/forgot-password` и `/support` — дополнительно по email):

| Группа эндпоинтов | Лимит |
|---|---|
| Общий `/api/*` | 100 запросов / минуту |
| `/register`, `/login`, `/verify`, `/reset-password` | 10 запросов / 15 минут |
| `/forgot-password`, `/support` | 3 запроса / час |

При превышении — `429 Too Many Requests`.

### Аутентификация

JWT-токен передаётся в заголовке:

```
Authorization: Bearer <token>
```

Срок действия: **7 дней**. При истечении — `401 Unauthorized`, нужно логиниться заново.

---

## Эндпоинты авторизации

### POST /api/register

Создаёт нового пользователя и отправляет код подтверждения на email.

**Тело запроса (JSON):**
```json
{
  "email": "user@example.com",
  "password": "минимум 6 символов"
}
```

**Ответ:**
- `201 Created`: `{ "message": "Пользователь создан. Проверьте почту." }`
- `400 VALIDATION_ERROR`: невалидный email или пароль короче 6 символов.
- `400 USER_EXISTS`: пользователь с таким email уже существует.

---

### POST /api/login

**Тело запроса (JSON):**
```json
{
  "email": "user@example.com",
  "password": "пароль"
}
```

**Ответ:**
- `200 OK`:
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "name",
      "description": "Frontend-разработчик",
      "contacts": ["@pidoras", "pidoras@example.com"],
      "avatar_url": "/uploads/avatar-xxx.jpg",
      "role": "Frontend-разработчик",
      "stack": "React, Node.js, PostgreSQL",
      "experience": 3,
      "level": 2,
      "github": "name"
    }
  }
  ```
- `401 INVALID_CREDENTIALS`: неверный email или пароль.
- `403 EMAIL_NOT_VERIFIED`: email не подтверждён (нужно отправить на `/api/verify`).

---

### POST /api/verify

Подтверждает email по 6-значному коду из письма.

**Тело запроса (JSON):**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Ответ:**
- `200 OK`:
  ```json
  {
    "message": "Email подтвержден!",
    "token": "eyJhbGciOi...",
    "user": { ... }
  }
  ```
- `400 INVALID_CODE`: неверный код или email уже подтверждён.

---

### POST /api/forgot-password

Отправляет код для сброса пароля.

**Тело запроса (JSON):**
```json
{
  "email": "user@example.com"
}
```

**Ответ:**
- `200 OK`: `{ "message": "Если пользователь с таким email существует, код отправлен." }`

 Ответ **одинаковый** независимо от того, существует ли пользователь — защита от энумерации.

- `429 RATE_LIMIT_EXCEEDED`: больше 3 запросов в час по этому email или IP.

---

### POST /api/reset-password

Меняет пароль по коду из письма.

**Тело запроса (JSON):**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "новый пароль (минимум 6 символов)"
}
```

**Ответ:**
- `200 OK`: `{ "message": "Пароль успешно изменен!" }`
- `400 INVALID_CODE`: неверный код или email.
- `400 CODE_EXPIRED`: срок действия кода истёк (15 минут).

---

## Эндпоинты пользователя

### GET /api/me

Возвращает текущего авторизованного пользователя.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ:**
- `200 OK`:
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "name": "Кирилл",
    "description": "Frontend-разработчик",
    "contacts": ["@kirill", "kirill@example.com"],
    "avatar_url": "/uploads/avatar-xxx.jpg",
    "role": "Frontend-разработчик",
    "stack": "React, Node.js, PostgreSQL",
    "experience": 3,
    "level": 2,
    "github": "kirill"
  }
  ```
- `401 UNAUTHORIZED`: нет токена или токен невалиден.
- `404 NOT_FOUND`: пользователь не найден.

---

### GET /api/users/:id

Публичный профиль пользователя + его стартапы.

**Параметры:** `id` в URL.

**Заголовки:** `Authorization: Bearer <token>` — **опционально**.

Если токен передан — бэкенд знает, что запрос от авторизованного пользователя, и может отдавать больше данных (например, контакты).

**Ответ:**
- `200 OK`:
  ```json
  {
    "user": {
      "id": 5,
      "name": "Иван",
      "description": "Backend-разработчик",
      "contacts": ["@ivan"],
      "avatar_url": "/uploads/avatar-yyy.jpg",
      "role": "Backend-разработчик",
      "stack": "Node.js, PostgreSQL, Redis",
      "experience": 5,
      "level": 3,
      "github": "ivan-dev"
    },
    "startups": [
      {
        "id": 10,
        "name": "TaskFlow",
        "description": "...",
        "is_paid": true,
        "stack": "...",
        "contacts": [...],
        "telegram": "@taskflow",
        "vacancies": ["Frontend", "QA"],
        "image_url": "/uploads/startup-xxx.jpg",
        "user_id": 5,
        "created_at": "2026-09-15T12:00:00.000Z",
        "author_name": "Иван",
        "author_avatar": "/uploads/avatar-yyy.jpg"
      }
    ]
  }
  ```
- `404 NOT_FOUND`: пользователь не найден.

 В публичном профиле **не отдаётся email**.

---

### PUT /api/profile

Обновляет профиль текущего пользователя.

**Заголовки:** `Authorization: Bearer <token>`

**Тип запроса:** `multipart/form-data` (FormData).

**Поля:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `name` | string | Нет | Имя / никнейм (до 50 символов) |
| `description` | string | Нет | О себе (до 500 символов) |
| `contacts` | string (JSON) | Нет | JSON-массив контактов |
| `image` | File | Нет | Аватар (jpeg/png/webp/gif, до 5 МБ) |
| `role` | string | Нет | Роль / специализация (до 100 символов) |
| `stack` | string | Нет | Стек технологий через запятую |
| `experience` | number | Нет | Опыт в годах (0–50) |
| `level` | number | Нет | Уровень: `1`=Junior, `2`=Middle, `3`=Senior, `4`=Lead |
| `github` | string | Нет | GitHub username (без `@`) |

**Ответ:**
- `200 OK`: обновлённый объект пользователя (те же поля, что в `GET /api/me`).
- `400 VALIDATION_ERROR`: невалидные данные.
- `400 FILE_TOO_LARGE`: файл больше 5 МБ.
- `400 INVALID_FILE_TYPE`: файл не картинка.
- `401 UNAUTHORIZED`: нет токена.

 Старый аватар **удаляется с диска** после успешного обновления.

---

### DELETE /api/users/:id

Удаляет аккаунт пользователя. Только свой — чужой удалить нельзя.

**Параметры:** `id` в URL (должен совпадать с id из токена).

**Заголовки:** `Authorization: Bearer <token>`

**Ответ:**
- `200 OK`: `{ "success": true }`
- `403 FORBIDDEN`: попытка удалить чужой аккаунт.

**Побочные эффекты:**
- Удаляются все стартапы пользователя.
- С диска удаляются аватар и все картинки его стартапов.
- Транзакция: либо всё удаляется, либо ничего.

---

## Эндпоинты стартапов

### GET /api/startups

Список стартапов с пагинацией и фильтрами.

**Параметры URL (query):**

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `limit` | number | 5 | Сколько вернуть (макс. 100) |
| `offset` | number | 0 | Смещение для пагинации |
| `payment` | string | `all` | `all` / `paid` / `free` |
| `stack` | string | — | Фильтр по стеку (через запятую) |

 Параметр `vacancy` пока **не реализован на сервере** — фильтрация по вакансиям делается на фронте. В планах — перенести на бэкенд.

**Заголовки:** `Authorization: Bearer <token>` — **опционально**. Если передан, бэкенд знает userId (нужно для логов).

**Ответ:**
- `200 OK`:
  ```json
  {
    "startups": [ { ...стартап... } ],
    "total": 42,
    "hasMore": true
  }
  ```

---

### GET /api/stats

Общая статистика платформы.

**Ответ:**
- `200 OK`:
  ```json
  {
    "startups": 12,
    "users": 45,
    "vacancies": 78
  }
  ```

---

### POST /api/startups

Создаёт новый стартап.

**Заголовки:** `Authorization: Bearer <token>`

**Тип запроса:** `multipart/form-data` (FormData).

**Поля:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `name` | string | ✅ | Название (до 100 символов) |
| `description` | string | ✅ | Описание (до 1000 символов) |
| `is_paid` | string (`"true"`/`"false"`) | Нет | Есть ли бюджет |
| `stack` | string | Нет | Стек через запятую |
| `telegram` | string | Нет | Telegram username (без `@`) |
| `contacts` | string (JSON) | Нет | JSON-массив контактов |
| `vacancies` | string (JSON) | Нет | JSON-массив вакансий |
| `image` | File | Нет | Картинка стартапа (до 5 МБ) |

**Ответ:**
- `201 Created`: созданный стартап.
- `400 VALIDATION_ERROR`: не указаны name или description.
- `401 UNAUTHORIZED`: нет токена.

---

### PUT /api/startups/:id

Обновляет стартап. Только свой.

**Параметры:** `id` в URL.

**Заголовки:** `Authorization: Bearer <token>`

**Тип запроса:** `multipart/form-data` (те же поля, что в POST).

**Ответ:**
- `200 OK`: обновлённый стартап.
- `403 FORBIDDEN`: попытка редактировать чужой стартап.
- `404 NOT_FOUND`: стартап не найден.

---

### DELETE /api/startups/:id

Удаляет стартап. Только свой.

**Ответ:**
- `200 OK`: `{ "message": "Проект удален" }`
- `403 FORBIDDEN`: попытка удалить чужой.
- `404 NOT_FOUND`: стартап не найден.

**Побочные эффекты:** картинка стартапа удаляется с диска.

---

## Поиск

### GET /api/search

Полнотекстовый поиск по стартапам (PostgreSQL `tsvector`/`tsquery`).

**Параметры URL:** `q` — строка поиска.

**Заголовки:** `Authorization: Bearer <token>` — опционально.

**Ответ:**
- `200 OK`: `{ "startups": [ { ...стартап... } ] }`
- `400 VALIDATION_ERROR`: `q` пустой.

**Особенности:**
- Понимает кавычки `"точная фраза"` и минус-слова `-исключить`.
- Ранжирование по релевантности (`ts_rank`).

---

## Поддержка

### POST /api/support

Отправляет обращение в поддержку.

**Тело запроса (JSON):**
```json
{
  "type": "Баг | Предложение | Жалоба",
  "name": "Кирилл",
  "email": "user@example.com",
  "subject": "Не работает форма регистрации",
  "message": "Подробное описание проблемы..."
}
```

**Ответ:**
- `200 OK`: `{ "message": "Спасибо за обращение!" }`
- `400 VALIDATION_ERROR`: невалидный email или пустое сообщение.
- `429 RATE_LIMIT_EXCEEDED`: больше 3 запросов в час.

**Побочные эффекты:**
- Обращение приходит на почту поддержки (внутренний email).
- Пользователю отправляется письмо-подтверждение «Спасибо, что помогаете делать сервис лучше».

---

## Загрузка файлов

Все изображения (аватары, картинки стартапов):
- **Форматы:** JPEG, PNG, WebP, GIF.
- **Максимум:** 5 МБ.
- **Проверка:** реальное содержимое файла (magic numbers), а не только `Content-Type`.
- **Хранение:** `/var/www/startupfinder/uploads/`.
- **Раздача:** через Nginx по URL `/uploads/имя_файла.ext`.

При обновлении (аватар/картинка стартапа) — старая версия удаляется с диска после успешной записи новой.

---

## Middleware (для разработчиков)

### authenticate()

Проверяет JWT-токен из заголовка `Authorization: Bearer <token>`. Если токен валиден — пишет `req.userId`. Если нет — возвращает `401 UNAUTHORIZED`.

**Используется на:**
- `GET /api/me`
- `PUT /api/profile`
- `DELETE /api/users/:id`
- `POST /api/startups`
- `PUT /api/startups/:id`
- `DELETE /api/startups/:id`

### upload

Multer + проверка `file-type`.
- Ограничивает размер (5 МБ).
- Проверяет содержимое файла (magic numbers).
- Отклоняет файлы, если они не картинки.

**Используется на:**
- `PUT /api/profile`
- `POST /api/startups`
- `PUT /api/startups/:id`

### rateLimiter

`rate-limiter-flexible` поверх Redis. Три пула:
- `apiRateLimit` — общий.
- `authRateLimit` — на авторизацию.
- `sensitiveRateLimit` — на forgot-password и support.

### errorHandler

Единый формат ошибок. Ловит **все** ошибки (включая async) и отдаёт:

```json
{
  "success": false,
  "error": {
    "code": "...",
    "message": "...",
    "details": []
  }
}
```

---

## Что в планах

- `vacancy` — фильтр по вакансиям на сервере (сейчас только на фронте).
- WebSocket-уведомления о новых стартапах.
- Экспорт OpenAPI/Swagger.
- Нагрузочное тестирование и оптимизация запросов.

---

## История изменений

### v2.1 (текущая)
- Добавлены поля `role`, `stack`, `experience`, `level`, `github` в модель User.
- Единый формат ошибок с полем `code`.
- Rate limiting на Redis.
- Фоновые задачи через BullMQ.
- Полнотекстовый поиск через `tsvector`.
- HTML-шаблоны писем.

### v2.0
- Полная переработка архитектуры (routes → controllers → services → prisma).
- Redis для rate-limit.
- Валидация через Zod.

### v1.0
- Изначальная версия.
