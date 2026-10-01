// Ввод паролей в CLI. В терминале вводимые символы показываются звёздочками — видно, что
// ввод идёт, а сам пароль не виден. Если stdin — не терминал (скрипт, pipe), ответы
// читаются построчно из stdin: `printf 'новый\nновый\n' | webpricer password --reset`.
import { createInterface } from 'node:readline';

/** Ввод прерван (Ctrl+C или конец ввода). */
export class PromptCancelledError extends Error {
  constructor() {
    super('Ввод прерван');
  }
}

interface LineReader {
  /** Строки stdin, ещё не отданные вопросам. */
  lines: string[];
  /** Вопросы, ждущие строки; `null` — stdin закончился. */
  waiting: ((line: string | null) => void)[];
}

let lineReader: LineReader | null = null;
let stdinEnded = false;

/** Следующая строка stdin, как только она пришла (не дожидаясь конца ввода). */
function readLine(): Promise<string | null> {
  if (!lineReader) {
    const reader: LineReader = { lines: [], waiting: [] };
    const rl = createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => {
      const waiter = reader.waiting.shift();
      if (waiter) waiter(line);
      else reader.lines.push(line);
    });
    rl.on('close', () => {
      stdinEnded = true;
      for (const waiter of reader.waiting.splice(0)) waiter(null);
    });
    lineReader = reader;
  }
  const reader = lineReader;
  const line = reader.lines.shift();
  if (line !== undefined) return Promise.resolve(line);
  if (stdinEnded) return Promise.resolve(null);
  return new Promise((resolve) => reader.waiting.push(resolve));
}

function promptHiddenInTerminal(question: string): Promise<string> {
  const { stdin, stdout } = process;
  return new Promise((resolve, reject) => {
    let answer = '';
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(answer);
    };

    function onData(chunk: string) {
      // Вставка из буфера приходит одним куском — разбираем посимвольно. Escape-
      // последовательности (стрелки, Home, F-клавиши) выкидываем целиком.
      // eslint-disable-next-line no-control-regex
      for (const char of chunk.replace(/\u001b(\[[0-9;?]*[ -/]*[@-~]|O.|.)?/g, '')) {
        switch (char) {
          case '\r':
          case '\n':
            finish();
            return;
          case '\u0003': // Ctrl+C
          case '\u0004': // Ctrl+D
            finish(new PromptCancelledError());
            return;
          case '\u007f': // Backspace
          case '\b':
            if (answer) {
              answer = Array.from(answer).slice(0, -1).join('');
              stdout.write('\b \b');
            }
            break;
          case '\u0015': // Ctrl+U — стереть всё введённое
            stdout.write('\b \b'.repeat(Array.from(answer).length));
            answer = '';
            break;
          default:
            // Прочие управляющие символы в пароль не попадают.
            if (char >= ' ') {
              answer += char;
              stdout.write('*');
            }
        }
      }
    }

    stdin.on('data', onData);
  });
}

export async function promptHidden(question: string): Promise<string> {
  if (process.stdin.isTTY) return promptHiddenInTerminal(question);
  // Без терминала вопрос всё равно печатаем — иначе непонятно, чего ждёт команда.
  process.stdout.write(question);
  const line = await readLine();
  process.stdout.write('\n');
  if (line === null) throw new PromptCancelledError();
  return line;
}
