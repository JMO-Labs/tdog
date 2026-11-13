/** `/bench` (renderer harness) exists only in dev builds. */
export function isBenchRoute(dev: boolean, pathname: string): boolean {
  return dev && /^\/bench\/?$/.test(pathname);
}
