import { createHash } from 'node:crypto';

function normalizePath(path: string): string {
  if (/^[/\\]/.test(path) || /^[A-Za-z]:[/\\]/.test(path)) {
    throw new Error(`非法文件路径: ${path}`);
  }
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (
    !normalized ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`非法文件路径: ${path}`);
  }
  return normalized;
}

export function computeBuildHash(files: Iterable<[string, string | Uint8Array]>): string {
  const entries = [...files]
    .map(([path, content]) => {
      const normalized = normalizePath(path);
      const bytes =
        typeof content === 'string' ? Buffer.from(content, 'utf-8') : Buffer.from(content);
      return {
        path: normalized,
        value: `${Buffer.byteLength(normalized, 'utf-8')}:${normalized}:${createHash('sha256')
          .update(bytes)
          .digest('hex')}`,
      };
    })
    .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));

  return `sha256:${createHash('sha256')
    .update(entries.map((entry) => entry.value).join('\n'))
    .digest('hex')}`;
}
