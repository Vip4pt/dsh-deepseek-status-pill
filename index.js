/**
 * Host half of the DeepSeek status pill.
 *
 * The pill itself is browser UI. What the Host owns is the one fact the page
 * cannot obtain on its own: the DeepSeek status service's Atom feed. The page is
 * served from the loopback Web carrier, so a cross-origin `fetch` from the
 * browser to `status.deepseek.com` would be refused by CORS; the Host fetches
 * and parses the feed instead and republishes one compact snapshot on a
 * same-origin route.
 *
 * ```
 * GET /deepseek-status/feed
 * ```
 *
 * The route is plain HTTP rather than a generated Remote method, so it carries
 * its own request policy: same-origin plus a custom header the Web carrier never
 * answers in a pre-flight (see {@link allowed}).
 *
 * The snapshot is deliberately feed-shaped. The feed is the only authority: its
 * newest entry describes the latest change. An entry whose `Status:` field is
 * still in progress is an open incident; a `resolved` newest entry means the
 * service is operational again.
 *
 * @module dsh-deepseek-status-pill
 */

/** Cordis plugin name. */
export const name = 'deepseek-status-pill';

/** The Web carrier serves the route; nothing else is required. */
export const inject = ['webServer'];

/** Route the Client pill reads. Exact match, so it never shadows another route. */
const ROUTE_PATH = '/deepseek-status/feed';

/** Custom header the Client must send. Non-simple, so a cross-site form or a
 * plain `fetch` cannot reach the route without a pre-flight this server never
 * answers. */
const GATE_HEADER = 'x-dsh-deepseek-status';

/** The public Atom feed published by the DeepSeek status service. */
const FEED_URL = 'https://status.deepseek.com/feed.atom';

/** Deadline of one feed request. */
const FEED_TIMEOUT_MS = 10_000;

/** Snapshot lifetime; also the minimum interval between upstream requests. */
const CACHE_MS = 45_000;

/** Longest feed body we will accept. The real feed is about 20 KiB. */
const MAX_BYTES = 512 * 1024;

/** Entries carried to the Client (newest first). */
const MAX_ENTRIES = 8;

/** Entry statuses that mean the incident is over. */
const RESOLVED_STATUSES = new Set(['resolved', 'postmortem', 'completed', 'closed', 'fixed']);

/** Entry statuses that mean the incident is still open. */
const ACTIVE_STATUSES = new Set([
  'investigating',
  'identified',
  'monitoring',
  'scheduled',
  'in-progress',
  'in_progress',
  'update',
  'degraded',
  'degraded-performance',
  'partial-outage',
  'major-outage',
  'outage',
]);

/** How long an entry with no readable `Status:` still counts as an open incident. */
const UNKNOWN_STATUS_FRESH_MS = 12 * 60 * 60 * 1000;

/**
 * Decode the XML entities an Atom document may contain.
 * @param text - encoded fragment.
 * @returns the decoded text.
 */
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Project one HTML fragment onto plain text, keeping paragraph breaks.
 * @param html - fragment already XML-decoded.
 * @returns readable text without markup.
 */
function htmlToText(html) {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Read one element's raw inner XML.
 * @param block - enclosing XML fragment.
 * @param tag - element name.
 * @returns the raw content, or null when the element is absent.
 */
function rawTag(block, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return match === null ? null : match[1];
}

/**
 * Read one element's text content.
 * @param block - enclosing XML fragment.
 * @param tag - element name.
 * @returns decoded text, or null when the element is absent.
 */
function textTag(block, tag) {
  const raw = rawTag(block, tag);
  if (raw === null) return null;
  const text = htmlToText(decodeEntities(raw));
  return text.length === 0 ? null : text;
}

/**
 * Read the first alternate link in one entry.
 * @param block - enclosing XML fragment.
 * @returns the href, or null when the entry carries no link.
 */
function linkTag(block) {
  const match = /<link\b[^>]*href="([^"]+)"/i.exec(block);
  return match === null ? null : decodeEntities(match[1]);
}

/**
 * Normalize one `Status:` value into the token set the Host classifies.
 * @param value - raw status text, already trimmed.
 * @returns a lowercase token, or `unknown`.
 */
function normalizeStatus(value) {
  const token = value.trim().toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');
  return token.length === 0 ? 'unknown' : token;
}

/**
 * Split one summary into the fields the pill shows.
 * @param summaryText - plain text of the entry summary.
 * @returns status, affected components, and the remaining narrative.
 */
function summaryFields(summaryText) {
  const statusMatch = /status\s*:\s*([^\n]+)/i.exec(summaryText);
  const componentsMatch = /affected components\s*:\s*([^\n]+)/i.exec(summaryText);
  const components = [];
  if (componentsMatch !== null) {
    for (const part of componentsMatch[1].split(',')) {
      const name = part.trim();
      if (name.length > 0) components.push(name);
    }
  }
  const detail = summaryText
    .split('\n')
    .filter((line) => !/^\s*status\s*:/i.test(line) && !/^\s*affected components\s*:/i.test(line))
    .join('\n')
    .trim();
  return {
    status: statusMatch === null ? 'unknown' : normalizeStatus(statusMatch[1]),
    components,
    detail: detail.length === 0 ? null : detail,
  };
}

/**
 * Parse one Atom entry into the shape the Client renders.
 * @param block - one `<entry>` body.
 * @returns the projected entry.
 */
function entryOf(block) {
  const summaryHtml = rawTag(block, 'summary');
  const summaryText = summaryHtml === null ? '' : htmlToText(decodeEntities(summaryHtml));
  const fields = summaryFields(summaryText);
  const updatedRaw = textTag(block, 'updated') ?? textTag(block, 'published');
  const updatedAt = updatedRaw === null ? null : Date.parse(updatedRaw);
  return {
    id: textTag(block, 'id'),
    title: textTag(block, 'title') ?? '',
    status: fields.status,
    components: fields.components,
    detail: fields.detail,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    updated: updatedRaw,
    link: linkTag(block),
  };
}

/**
 * Parse the Atom document into a feed-level update time and its entries.
 * @param xml - complete feed body.
 * @returns newest-first entries, or null when the document is not an Atom feed.
 */
function parseFeed(xml) {
  if (!/<feed\b/i.test(xml)) return null;
  const entries = [];
  const pattern = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = pattern.exec(xml)) !== null && entries.length < MAX_ENTRIES) {
    entries.push(entryOf(match[1]));
  }
  const updated = textTag(xml, 'updated');
  const updatedAt = updated === null ? null : Date.parse(updated);
  return {
    title: textTag(xml, 'title'),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    entries,
  };
}

/**
 * Decide the service state from the newest entry.
 * @param latest - newest entry, or null for an empty feed.
 * @returns `operational` or `incident`.
 */
function overallState(latest) {
  if (latest === null) return 'operational';
  if (RESOLVED_STATUSES.has(latest.status)) return 'operational';
  if (ACTIVE_STATUSES.has(latest.status)) return 'incident';
  if (latest.status === 'unknown') {
    return typeof latest.updatedAt === 'number' && Date.now() - latest.updatedAt < UNKNOWN_STATUS_FRESH_MS
      ? 'incident'
      : 'operational';
  }
  return 'incident';
}

/**
 * Turn one parsed feed into the snapshot the route publishes.
 * @param feed - parsed Atom feed.
 * @returns snapshot without fetch metadata.
 */
function snapshotOf(feed) {
  const latest = feed.entries[0] ?? null;
  return {
    state: overallState(latest),
    feedUpdatedAt: feed.updatedAt,
    latest,
    recent: feed.entries,
  };
}

/**
 * Fetch and parse the upstream Atom feed.
 * @returns the published snapshot.
 * @throws when the request fails, times out, or the body is not an Atom feed.
 */
async function fetchFeed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(FEED_URL, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
        'user-agent': 'dsh-deepseek-status-pill/1.0 (+https://status.deepseek.com)',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${FEED_URL}`);
    const body = await response.text();
    if (body.length > MAX_BYTES) throw new Error(`feed body exceeds ${MAX_BYTES} bytes`);
    const feed = parseFeed(body);
    if (feed === null) throw new Error('response is not an Atom feed');
    return snapshotOf(feed);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether one request may read the snapshot.
 *
 * The Web carrier applies no origin policy of its own, so the check lives here:
 * the custom header only our Client half sends, plus proof that the request came
 * from this origin.
 *
 * A same-origin `GET` from the page carries **no** `Origin` header — browsers
 * attach it to cross-origin requests and to non-`GET`/`HEAD` methods — so absence
 * of `Origin` is the normal Client case. Chromium then reports the site
 * relationship in `Sec-Fetch-Site`, and the browser-session cookie the carrier
 * already required is `SameSite=Strict`. A cross-site page cannot reach this
 * route at all: the custom header forces a pre-flight this server never answers.
 *
 * @param req - incoming HTTP request.
 * @returns whether the request passes the gate.
 */
function allowed(req) {
  if (req.headers[GATE_HEADER] !== '1') return false;
  const host = req.headers.host;
  if (typeof host !== 'string' || host.length === 0) return false;
  const origin = req.headers.origin;
  if (typeof origin === 'string') {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
}

/**
 * Send one JSON body.
 * @param res - pending response.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * Register the status feed route.
 * @param ctx - Host context carrying the Web carrier.
 */
export function apply(ctx) {
  /** Last successful snapshot and when it was taken; served alongside a failure
   * so the pill can still explain what it knows. */
  let lastGood;
  /** Last snapshot, successful or failed, with the instant it was produced. */
  let cache;
  /** Single-flight guard: concurrent readers share one upstream request. */
  let inflight;

  const read = async () => {
    const now = Date.now();
    if (cache !== undefined && now - cache.at < CACHE_MS) return cache.value;
    if (inflight !== undefined) return inflight;
    inflight = (async () => {
      let value;
      try {
        const fresh = await fetchFeed();
        lastGood = { ...fresh, at: Date.now() };
        value = { ok: true, error: null, fetchedAt: lastGood.at, lastSuccessAt: lastGood.at, ...fresh };
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        value = {
          ok: true,
          state: 'error',
          error: { message: message.slice(0, 300) },
          fetchedAt: Date.now(),
          lastSuccessAt: lastGood === undefined ? null : lastGood.at,
          ...(lastGood === undefined
            ? { feedUpdatedAt: null, latest: null, recent: [] }
            : { feedUpdatedAt: lastGood.feedUpdatedAt, latest: lastGood.latest, recent: lastGood.recent }),
        };
      } finally {
        inflight = undefined;
      }
      cache = { at: Date.now(), value };
      return value;
    })();
    return inflight;
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        handler: async (req, res) => {
          if (!allowed(req)) {
            json(res, 403, { ok: false, reason: 'forbidden' });
            return;
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            json(res, 405, { ok: false, reason: 'method-not-allowed' });
            return;
          }
          json(res, 200, { ...(await read()), source: FEED_URL, refreshMs: 60_000 });
        },
      }),
    'deepseek-status-pill: status feed route',
  );
}
