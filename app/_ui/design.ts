// Reads a design artboard from app/_ui/designs at build time (server only).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function design(name: 'Main' | 'Shop'): string {
  return readFileSync(join(process.cwd(), 'app/_ui/designs', `${name}.dc.html`), 'utf8');
}
