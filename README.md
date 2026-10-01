# WebPricer

### Запуск сервиса через Docker

Все команды выполняются в терминале из корня проекта.

### 1. Настройте файл окружения

Скопируйте файл `.env.example` в `.env`

Откройте файл и заполните обязательные поля:

- `APP_SECRET` - секретный ключ. Сгенерируйте его, выполнив следующую команду:

  ```bash
  openssl rand -hex 32
  ```

- `APP_INITIAL_PASSWORD` - пароль для входа в приложение (не короче 8 символов).

При необходимости измените необязательные поля:

- `SESSION_TTL_MINUTES` - время жизни сессии без активности в минуты.


- `TRUST_PROXY` - при true приложение работает за обратным прокси (HTTPS)
и берёт IP клиента из X-Forwarded-For. При false - если приложение открыто напрямую,
без прокси.


- `COOKIE_SECURE` - флаг secure у cookie сессии. Auto — если запрос пришёл по HTTPS
(за прокси — по X-Forwarded-Proto), true — всегда, false — никогда.


- `SCHEDULE_TIMEZONE` - часовой пояс расписания импорта.


- `LOG_LEVEL` - уровень логов: fatal | error | warn | info | debug | trace | silent

### 2. Запустите приложение

```bash
docker compose up -d --build
```

После запуска приложение доступно по адресу `http://localhost:9091`. Войдите с паролем из
`APP_INITIAL_PASSWORD`.

### 3. Загрузите данные

1. Откройте **Настройки**.
2. В блоке **Источник файла** укажите URL файла, логин и пароль.
3. В блоке **Расписание** выберите, как часто обновлять данные.
4. Нажмите **Запустить импорт**.

Дальше данные будут обновляться автоматически по расписанию.

### Дополнительно

Сменить пароль:

```bash
docker compose exec webpricer2 webpricer password
```

Если пароль забыт - задать новый без ввода старого:

```bash
docker compose exec webpricer2 webpricer password --reset
```

Посмотреть время следующего импорта:

```bash
docker compose exec webpricer2 webpricer schedule
```

Запустить импорт из терминала:

```bash
docker compose exec webpricer2 webpricer import
```

Данные и настройки хранятся в папке `data/` и при обновлении сохраняются.

## Для разработчиков

Нужен Node.js 22.18 или новее.

```bash
npm install
```

```bash
npm run dev
```

Фронт - `http://localhost:5173`, сервер - `http://localhost:3000`. Для работы сервера нужен
`.env` с `APP_SECRET` (см. шаг 1 выше).

Перед коммитом - форматирование, линтер, типы и тесты одной командой:

```bash
npm run check
```

Команды администратора локально запускаются через `npm run cli`, например загрузка из
локального файла:

```bash
npm run cli -- import --file /путь/к/Pricer.xlsm
```

Тесты на настоящих данных (файл в репозиторий не входит):

```bash
PRICER_XLSX=/путь/к/Pricer.xlsm PRICER_CATALOG=data/catalog.sqlite npm test
```

### Структура

- `apps/server` - сервер (Fastify)
- `apps/web` - интерфейс (React + Vite + Tailwind)
- `packages/shared` - общие схемы API и типы
- `tools/benchmark` - замеры скорости поиска

Решения и план разработки - в [PLAN.md](PLAN.md), замеры против старой версии - в
[docs/benchmarks.md](docs/benchmarks.md).
