#!/bin/sh
set -e

# Команда администратора внутри контейнера: `docker compose exec webpricer2 webpricer <команда>`.
# `docker compose exec` запускает процессы от root; CLI переключается на пользователя node,
# чтобы файлы в каталоге данных не оказались принадлежащими root (сервер их бы не открыл).
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=node --regid=node --init-groups node /app/apps/server/src/cli.ts "$@"
fi
exec node /app/apps/server/src/cli.ts "$@"
