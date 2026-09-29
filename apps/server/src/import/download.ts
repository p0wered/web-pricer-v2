// Скачивание книги с DAV-сервера (HTTP GET с Basic Auth) во временный файл.
import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ImportError } from './import-errors.ts';

export interface DownloadOptions {
  url: string;
  username: string;
  password: string;
  destination: string;
  /** Обрыв, если сервер молчит дольше этого времени (мс). Общего лимита нет: файл большой. */
  idleTimeoutMs?: number;
  onProgress?: (bytes: number, totalBytes: number | null) => void;
  fetchImpl?: typeof fetch;
}

const CONNECT_ERROR_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function errorCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

const CONNECT_MESSAGE = 'Не удалось подключиться по указанному URL.';

export async function downloadFile(options: DownloadOptions): Promise<{ bytes: number }> {
  const { url, username, password, destination, onProgress } = options;
  const idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  let idleTimer: NodeJS.Timeout | undefined;
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(new Error('idle timeout')), idleTimeoutMs);
  };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ImportError('connect', 'Некорректный URL файла.');
  }

  touch();
  try {
    let response: Response;
    try {
      response = await fetchImpl(parsedUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new ImportError('connect', CONNECT_MESSAGE, { cause: error });
    }

    if (response.status === 401 || response.status === 403) {
      throw new ImportError('auth', 'Ошибка авторизации. Проверьте логин и пароль.');
    }
    if (!response.ok || !response.body) {
      throw new ImportError('http', `Сервер вернул ошибку HTTP ${response.status}.`);
    }

    const total = Number(response.headers.get('content-length')) || null;
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        touch();
        bytes += chunk.length;
        onProgress?.(bytes, total);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
        meter,
        createWriteStream(destination),
      );
    } catch (error) {
      const code = errorCode(error);
      if (controller.signal.aborted || (code && CONNECT_ERROR_CODES.has(code))) {
        throw new ImportError('connect', 'Соединение с сервером прервалось при скачивании файла.', {
          cause: error,
        });
      }
      throw error;
    }

    await assertZipFile(destination);
    return { bytes };
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Книга XLSX/XLSM — это zip-архив: первые байты «PK\x03\x04». */
async function assertZipFile(filePath: string): Promise<void> {
  const handle = await open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4), 0, 4, 0);
    if (bytesRead < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
      throw new ImportError(
        'format',
        'Скачанный файл не является книгой Excel. Проверьте URL файла.',
      );
    }
  } finally {
    await handle.close();
  }
}
