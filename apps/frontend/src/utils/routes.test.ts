import { describe, expect, it } from 'vitest';
import { isAdminPath } from './routes';

describe('isAdminPath', () => {
  it.each(['/admin', '/admin/', '/admin//', '/ADMIN', '/Admin/'])('opens the admin panel for %s', (pathname) => {
    expect(isAdminPath(pathname)).toBe(true);
  });

  it.each(['/', '', '/index.html', '/administrador', '/admin/registros', '/admin/x/', '/otra/admin', '/adminx'])(
    'shows the public form for %s',
    (pathname) => {
      expect(isAdminPath(pathname)).toBe(false);
    },
  );
});
