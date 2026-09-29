// Ввод паролей в CLI. В терминале ввод скрыт; если stdin — не терминал (скрипт, pipe),
// ответы читаются построчно из stdin: `printf 'новый\nновый\n' | webpricer password --reset`.
import { createInterface } from 'node:readline';

let pipedLines: string[] | null = null;

async function readPipedLines(): Promise<string[]> {
  if (!pipedLines) {
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) input += String(chunk);
    pipedLines = input.split(/\r?\n/);
  }
  return pipedLines;
}

function promptHiddenInTerminal(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Вопрос печатаем сами, а вывод readline (эхо вводимых символов) подавляем.
    process.stdout.write(question);
    (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

export async function promptHidden(question: string): Promise<string> {
  if (process.stdin.isTTY) return promptHiddenInTerminal(question);
  return (await readPipedLines()).shift() ?? '';
}
