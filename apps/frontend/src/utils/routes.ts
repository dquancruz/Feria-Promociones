// The app has two screens and no router: the admin panel lives at /admin and everything
// else is the public form. A trailing slash and letter case don't change which one it is.
export function isAdminPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '').toLowerCase() === '/admin';
}
