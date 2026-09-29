#!/bin/sh
set -e

# Каталог данных монтируется с хоста и может принадлежать root:
# выдаём права пользователю node и запускаем приложение уже от него.
mkdir -p /app/data
chown -R node:node /app/data

exec setpriv --reuid=node --regid=node --init-groups "$@"
