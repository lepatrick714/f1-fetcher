import { promises as fs } from 'fs';
import * as path from 'path';

export class FileCache {
  constructor(private dir: string = path.join(process.cwd(), 'f1_data')) {}

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private filePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  async write(key: string, data: unknown): Promise<string> {
    await this.ensureDir();
    const dest = this.filePath(key);
    const tmp = `${dest}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, dest);
    return dest;
  }

  async read<T = any>(key: string): Promise<T | null> {
    const p = this.filePath(key);
    try {
      const txt = await fs.readFile(p, 'utf-8');
      return JSON.parse(txt) as T;
    } catch (err) {
      return null;
    }
  }

  async list(): Promise<string[]> {
    try {
      await this.ensureDir();
      const items = await fs.readdir(this.dir);
      return items.filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }
  }

  async stat(key: string): Promise<{ path: string; size: number; mtimeMs: number } | null> {
    const p = this.filePath(key);
    try {
      const st = await fs.stat(p);
      return { path: p, size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await this.list();
      await Promise.all(files.map(f => fs.unlink(path.join(this.dir, f))));
    } catch {
      // ignore
    }
  }
}