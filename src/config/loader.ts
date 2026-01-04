import fs from 'fs';
import { TokenConfig } from '../types';

export class TokenConfigLoader {
  static load(path: string): TokenConfig {
    // TODO: Default tokens if not exists
    if (!fs.existsSync(path)) {
      throw new Error(`Token config not found: ${path}`);
    }
    const raw = fs.readFileSync(path, 'utf-8');
    return JSON.parse(raw);
  }
}
