// CORS middleware. Mount it before every route so preflights and error
// responses both carry the headers.
//
// On EC2 the UI is served from the same host on a different port (:80 -> :3000),
// which the browser still treats as cross-origin. Rather than pin the box's
// public address here - it changes when the instance is replaced, and again
// when we move to a DNS name - any origin whose hostname matches the one the
// request arrived on is trusted. That covers the raw IP today and the domain
// later with no config change.
//
// Add anything served from a *different* host (a CDN, a separate frontend
// instance) to CORS_ALLOWED_ORIGINS: comma separated, '*' allowed as a single
// hostname label, e.g. "https://*.example.com,https://app.other.com".

const devAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
];

const allowedMethods = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';
const defaultAllowedHeaders = 'Content-Type, Authorization, x-user-role, x-role';
const preflightMaxAge = '86400';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseConfiguredOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function buildOriginPatterns(configuredOrigins) {
  return [...devAllowedOrigins, ...configuredOrigins].map((pattern) =>
    // A '*' stands in for one hostname label, so https://*.example.com matches
    // https://app.example.com but not https://a.b.example.com.
    new RegExp(`^${pattern.split('*').map(escapeRegExp).join('[^./]*')}$`, 'i')
  );
}

function hostnameOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch (err) {
    return '';
  }
}

// Same hostname, any port or scheme - the :80/:3000 split on this EC2 box.
// Deliberately reads req.headers.host and not x-forwarded-host: the latter is
// attacker-settable on a direct request, which would hand out credentialed
// access to any origin that asked for it.
function isSameHostOrigin(origin, host) {
  const originHostname = hostnameOf(origin);
  return Boolean(originHostname) && originHostname === hostnameOf(`http://${host}`);
}

function createCorsMiddleware({ allowedOrigins = process.env.CORS_ALLOWED_ORIGINS } = {}) {
  const originPatterns = buildOriginPatterns(parseConfiguredOrigins(allowedOrigins));

  function isAllowedOrigin(origin, host) {
    if (!origin) return false;
    if (isSameHostOrigin(origin, host)) return true;
    return originPatterns.some((pattern) => pattern.test(origin));
  }

  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;

    res.setHeader('Vary', 'Origin');

    if (isAllowedOrigin(origin, req.headers.host)) {
      // Credentials are only legal alongside an explicit origin, never '*'.
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', allowedMethods);
    // Echo whatever the preflight asked for so custom headers (x-user-role,
    // x-role, ...) never need to be listed here one by one.
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || defaultAllowedHeaders
    );
    res.setHeader('Access-Control-Max-Age', preflightMaxAge);

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
}

module.exports = { createCorsMiddleware, isSameHostOrigin };
