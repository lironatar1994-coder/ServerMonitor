import { internalSiteUrl, safeSiteUrl } from "../lib/siteLinks";

// Public-site links: the href stays clean for copying and sharing, while an ordinary
// click opens the site with ?monitor_internal=1 so this browser is never measured there.
export default function SiteLink({ href, children, ...props }) {
  const safe = safeSiteUrl(href);
  if (!safe) return null;
  const open = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.open(internalSiteUrl(safe), '_blank', 'noopener,noreferrer');
  };
  return <a {...props} href={safe} target="_blank" rel="noopener noreferrer" onClick={open}>{children}</a>;
}
