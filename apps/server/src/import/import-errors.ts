// Ошибки импорта с кодом: по коду интерфейс показывает понятное сообщение
// (как в старой версии: 401 → «Ошибка авторизации…», недоступный хост → «Не удалось подключиться…»).

export type ImportErrorCode =
  | 'already_running' // уже идёт другой импорт
  | 'no_settings' // не заданы настройки импорта
  | 'secret' // не удаётся расшифровать пароль DAV (нет или сменился APP_SECRET)
  | 'auth' // DAV ответил 401/403
  | 'connect' // не удалось подключиться / таймаут
  | 'http' // DAV ответил другой ошибкой HTTP
  | 'format' // файл не является книгой Excel или повреждён
  | 'internal'; // прочее

export class ImportError extends Error {
  override name = 'ImportError';
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
