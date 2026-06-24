const SITE_ID_KEY = "yata-site-id";

/** Client-only. Call after mount (e.g. inside useEffect). */
export function getSiteId(): string {
  let siteId = sessionStorage.getItem(SITE_ID_KEY);
  if (!siteId) {
    siteId = crypto.randomUUID();
    sessionStorage.setItem(SITE_ID_KEY, siteId);
  }
  return siteId;
}
