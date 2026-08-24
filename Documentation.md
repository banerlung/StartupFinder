# Документация API

## Авторизация

### POST /api/register
#### Что присылать (JSON Body):
{ "email": "string", "password": "string" }
#### Ответ сервера:
- Успех (201): { "message": "Пользователь создан. Проверьте почту." }
- Ошибка (400): { "error": "Пользователь уже существует" }

### POST /api/login
#### Что присылать (JSON Body):
{ "email": "string", "password": "string" }
#### Ответ сервера:
- Успех: { "token": "string", "user": { id, email, name, description, contacts, avatar_url } }
- Ошибка (401): { "error": "Неверный email или пароль" }
- Ошибка (403): { "error": "Пожалуйста, подтвердите email." }

### POST /api/verify
#### Что присылать (JSON Body):
{ "email": "string", "code": "string" }
#### Ответ сервера:
- Успех: { "message": "Email подтвержден!", "token": "string", "user": {...} }
- Ошибка (400): { "error": "Неверный код или пользователь уже подтвержден" }

## Маршруты пользователя

### GET /api/me
#### Что присылать: headers: { "Authorization": "Bearer <token>" }
#### Ответ сервера:
- Успех: объект пользователя (id, email, name, description, contacts, avatar_url)
- Ошибка (401): { "error": "Требуется авторизация" }
- Ошибка (404): { "error": "Пользователь не найден" }

### GET /api/users/:id
#### Что присылать: id пользователя в URL (токен не нужен)
#### Ответ сервера:
- Успех: { "user": {... без email}, "startups": [проекты автора] }
- Ошибка (404): { "error": "Пользователь не найден" }

### DELETE /api/users/:id
#### Что присылать: headers: { "Authorization": "Bearer <token>" }
#### Ответ сервера:
- Успех: { "success": true }
- Ошибка (403): { "error": "Можно удалить только свой аккаунт" } - токен валидный, но id чужой

### PUT /api/profile
#### Что присылать: multipart/form-data (FormData)
Поля: name (string), description (string), contacts (JSON-строка), image (File, опционально)
#### Ответ сервера:
- Успех: обновлённый объект пользователя
## Маршруты стартапов:
### GET /api/startups
#### Что передавать: Как параметр в URL: limit, offset, payment, stack, vacancy
#### Ответ сервера:
 - Успех: { startups: dataResult.rows, total, hasMore: offset + limit < total }
### GET /api/stats
#### Что передавать: ничего
#### Ответ сервера: 
- Успех: { startups: number, users: number, vacancies: number }
### POST /api/startups
#### Что передавать: multipart/form-data (FormData) + headers: { "Authorization": "Bearer <token>" }
Поля: name (string, обязательно), description (string, обязательно), 
is_paid ("true"/"false"), stack (string), telegram (string), 
contacts (JSON-строка), vacancies (JSON-строка), image (File, опционально)
#### Ответ сервера: 
- Успех: 201,  Созданный стартап
- Ошибка (400): { error: 'Название и описание обязательны' } - Название и описание в создании проекта обязательны.
### PUT /api/startups/:id 
#### Что передавать: Параметр id в URL и JSON { name, description, is_paid, stack, contacts, telegram, vacancies, image }
#### Ответ сервера:
- Успех: Измененный стартап
- Ошибка (404): { error: 'Проект не найден' }
- Ошибка (403): { error: 'Нет прав на редактирование' }
### DELETE /api/startups/:id 
#### Что передавать: id в параметре URL, JWT токен в заголовке
#### Ответ сервера: 
- Успех: { message: 'Проект удален' }
- Ошибка (404): { error: 'Проект не найден' }
- Ошибка (403): { error: 'Нет прав на удаление' }
## Сброс Пароля:
### POST /api/forgot-password
#### Что передавать: JSON: email
#### Ответ сервера: 
- Успех: { message: 'Если пользователь с таким email существует, код отправлен.' }
- Ошибка (404): { message: 'Если пользователь с таким email существует, код отправлен.' }
### POST /api/reset-password
#### Что передавать: JSON: { email, code, newPassword }
#### Ответ сервера: 
- Успех: { message: 'Пароль успешно изменен!' }
- Ошибка (400): { error: 'Неверный код или email' }
- Ошибка (400) Вариация 2: { error: 'Срок действия кода истек' }
## Поиск
### GET /api/search
#### Что передавать: Запрос q в параметре URL
#### Ответ сервера:
- Успех: { startups: result.rows }
- Ошибка (400): { message: "Запрос не может быть пустым!" }
## Поддержка:
### POST /api/support
#### Что присылать: JSON: { type, name, email, subject, message }
#### Ответ сервера:
- Успех: { message: "Спасибо за обращение!" }
- Ошибка (400): { message: "Почта и описание проблемы обязательны!" }
# Стек проекта:
## Backend: Node.js + Express.js
## Data Base: PostgreSql + Redis(скоро)
## Frontend: HTML CSS JS || Vue.js
# Общие сведения работы:
## Принципы работы:
### Авторизация и Аутентификация выполнятся через JWT токен со сроком действия 7 дней
### В backend есть 2 middleware функции authenticate() проверяет JWT токен. upload - проверяет изображение и вес изображения
### Эндпоинты в которые нужно передавать JWT токен:
#### - GET /api/me
#### - DELETE /api/users/
#### - PUT /api/profile
#### - POST /api/startups
#### - PUT /api/startups/:id
#### - DELETE /api/startups/:id




   
