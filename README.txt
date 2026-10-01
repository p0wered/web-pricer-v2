--- Запуск сервиса через Docker ---
Все команды выполняются в терминале из корня проекта.

< 1. Настройте файл окружения >
Скопируйте файл .env.example в .env
Откройте файл и заполните обязательные поля:

APP_SECRET - секретный ключ. Сгенерируйте его, выполнив следующую команду: openssl rand -hex 32
APP_INITIAL_PASSWORD - пароль для входа в приложение (не короче 8 символов).

При необходимости измените необязательные поля:

SESSION_TTL_MINUTES - время жизни сессии без активности в минуты.
TRUST_PROXY - при true приложение работает за обратным прокси (HTTPS) и берёт IP клиента из X-Forwarded-For. При false - если приложение открыто напрямую, без прокси.
COOKIE_SECURE - флаг secure у cookie сессии. Auto — если запрос пришёл по HTTPS (за прокси — по X-Forwarded-Proto), true — всегда, false — никогда.
SCHEDULE_TIMEZONE - часовой пояс расписания импорта.
LOG_LEVEL - уровень логов: fatal | error | warn | info | debug | trace | silent

< 2. Запустите приложение >
docker compose up -d --build

После запуска приложение доступно по адресу http://localhost:9091. Войдите с паролем из APP_INITIAL_PASSWORD.

< 3. Загрузите данные >
Откройте настройки.
В блоке Источник файла укажите URL файла, логин и пароль.
В блоке Расписание выберите, как часто обновлять данные.
Нажмите Запустить импорт.

Дальше данные будут обновляться автоматически по расписанию.

--- Дополнительно ---

Сменить пароль:
docker compose exec webpricer2 webpricer password

Если пароль забыт - задать новый без ввода старого:
docker compose exec webpricer2 webpricer password --reset

Посмотреть время следующего импорта:
docker compose exec webpricer2 webpricer schedule

Запустить импорт из терминала:
docker compose exec webpricer2 webpricer import

Данные и настройки хранятся в папке data/ и при обновлении сохраняются.
