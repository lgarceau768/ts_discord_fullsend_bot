import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readSqlFile(relativePath: string): string {
  const filePath = path.join(SRC_DIR, relativePath);
  return readFileSync(filePath, 'utf-8');
}
