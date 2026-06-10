/** Wykrywa rozjazd HTML (nowy deploy) vs cache JS (stary bundle) i przeładowuje stronę. */
export function ensureFreshBundle(appVersion: string): void {
  if (import.meta.env.DEV) return;

  const script = document.querySelector('script[type="module"][src*="index-"]');
  const currentSrc = script?.getAttribute('src') ?? '';
  const currentFile = currentSrc.split('/').pop() ?? '';
  if (!currentFile) return;

  const reloadGuard = `dpd-bundle-sync:${appVersion}`;

  void fetch(location.pathname + location.search, { cache: 'no-store' })
    .then((r) => r.text())
    .then((html) => {
      const match = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
      if (!match) return;
      const expectedFile = match[0].split('/').pop() ?? '';
      if (!expectedFile || currentFile === expectedFile) return;
      if (sessionStorage.getItem(reloadGuard) === expectedFile) return;
      sessionStorage.setItem(reloadGuard, expectedFile);
      const url = new URL(location.href);
      url.searchParams.set('_b', appVersion);
      location.replace(url.toString());
    })
    .catch(() => undefined);
}
