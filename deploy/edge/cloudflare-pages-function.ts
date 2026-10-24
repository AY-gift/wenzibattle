/**
 * Example: Cloudflare Pages Function. Copy to functions/s/[game].ts in the deployed site and set
 * SITE_URL (e.g. https://example.com/) in the project's environment variables. Then build the
 * games with VITE_SHARE_BASE=https://example.com/s/arena (and /s/soccer, /s/basketball).
 */
import { handleShare } from './share-og';

interface Env {
  SITE_URL: string;
}

export const onRequestGet = ({ request, env }: { request: Request; env: Env }): Response => handleShare(request, { siteUrl: env.SITE_URL });
