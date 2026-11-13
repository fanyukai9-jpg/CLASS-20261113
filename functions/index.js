const crypto = require("node:crypto");
const { getAuth } = require("firebase-admin/auth");
const { initializeApp } = require("firebase-admin/app");
const { defineSecret, defineString } = require("firebase-functions/params");
const { onRequest } = require("firebase-functions/v2/https");

initializeApp();

const LINE_CHANNEL_ID = defineString("LINE_CHANNEL_ID");
const LINE_CHANNEL_SECRET = defineSecret("LINE_CHANNEL_SECRET");
const APP_ORIGIN = defineString("APP_ORIGIN", {
  default: "https://class-20261016.web.app",
});

const LINE_AUTH_BASE = "https://access.line.me/oauth2/v2.1";
const LINE_API_BASE = "https://api.line.me/oauth2/v2.1";
const COOKIE_MAX_AGE = 10 * 60;

function getAppOrigin() {
  const url = new URL(APP_ORIGIN.value());
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("APP_ORIGIN must use HTTPS outside localhost");
  }
  return url.origin;
}

function setNoStoreHeaders(res) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
}

function cookieHeader(name, value, secure, maxAge = COOKIE_MAX_AGE) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/api/line",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function readCookie(req, name) {
  const cookies = String(req.get("cookie") || "").split(";");
  for (const item of cookies) {
    const [key, ...valueParts] = item.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

function matchesState(expected, actual) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function clearAuthCookies(res, secure) {
  res.append("Set-Cookie", cookieHeader("line_oauth_state", "", secure, 0));
  res.append("Set-Cookie", cookieHeader("line_oauth_nonce", "", secure, 0));
}

function redirectToApp(res, origin, { token, error } = {}) {
  const target = new URL("/", origin);
  if (token) {
    target.hash = new URLSearchParams({ lineToken: token }).toString();
  } else if (error) {
    target.searchParams.set("lineError", error);
  }
  res.redirect(303, target.toString());
}

async function exchangeCode(code, redirectUri, channelId, channelSecret) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: channelId,
    client_secret: channelSecret,
  });
  const response = await fetch(`${LINE_API_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("LINE token exchange failed");
  return response.json();
}

async function verifyIdToken(idToken, channelId, nonce) {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: channelId,
    nonce,
  });
  const response = await fetch(`${LINE_API_BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("LINE ID token verification failed");

  const profile = await response.json();
  if (
    profile.iss !== "https://access.line.me" ||
    String(profile.aud) !== channelId ||
    !profile.sub ||
    profile.nonce !== nonce ||
    !Number.isFinite(Number(profile.exp)) ||
    Number(profile.exp) <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("LINE ID token claims did not match");
  }
  return profile;
}

async function getOrCreateFirebaseUser(profile) {
  const uid = `line_${crypto.createHash("sha256").update(profile.sub).digest("hex")}`;
  const displayName = typeof profile.name === "string" && profile.name.trim()
    ? profile.name.trim().slice(0, 128)
    : "LINE 使用者";
  const photoURL = typeof profile.picture === "string" && profile.picture.startsWith("https://")
    ? profile.picture
    : undefined;
  const profileData = { displayName };
  if (photoURL) profileData.photoURL = photoURL;

  let user;
  try {
    user = await getAuth().getUser(uid);
    await getAuth().updateUser(uid, profileData);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await getAuth().createUser({ uid, ...profileData });
  }
  return user;
}

exports.lineAuth = onRequest(
  { region: "asia-east1", secrets: [LINE_CHANNEL_SECRET] },
  async (req, res) => {
    setNoStoreHeaders(res);

    let origin;
    try {
      origin = getAppOrigin();
    } catch (error) {
      console.error("Invalid APP_ORIGIN configuration");
      res.status(500).send("LINE login is not configured.");
      return;
    }

    const channelId = LINE_CHANNEL_ID.value();
    const callbackUrl = new URL("/api/line/callback", origin).toString();
    const secureCookie = origin.startsWith("https://");
    const path = req.path.replace(/\/+$/, "") || "/";

    if (req.method !== "GET") {
      res.status(405).send("Method not allowed.");
      return;
    }

    if (path === "/api/line/login") {
      const state = crypto.randomBytes(32).toString("base64url");
      const nonce = crypto.randomBytes(32).toString("base64url");
      res.append("Set-Cookie", cookieHeader("line_oauth_state", state, secureCookie));
      res.append("Set-Cookie", cookieHeader("line_oauth_nonce", nonce, secureCookie));

      const authorizeUrl = new URL(`${LINE_AUTH_BASE}/authorize`);
      authorizeUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: channelId,
        redirect_uri: callbackUrl,
        state,
        scope: "openid profile",
        nonce,
      }).toString();
      res.redirect(302, authorizeUrl.toString());
      return;
    }

    if (path !== "/api/line/callback") {
      res.status(404).send("Not found.");
      return;
    }

    const state = String(req.query.state || "");
    const nonce = readCookie(req, "line_oauth_nonce");
    const expectedState = readCookie(req, "line_oauth_state");
    clearAuthCookies(res, secureCookie);

    if (req.query.error) {
      redirectToApp(res, origin, {
        error: req.query.error === "access_denied" ? "cancelled" : "login_failed",
      });
      return;
    }

    if (!matchesState(expectedState, state) || !nonce || !req.query.code) {
      redirectToApp(res, origin, { error: "login_failed" });
      return;
    }

    try {
      const tokens = await exchangeCode(
        String(req.query.code),
        callbackUrl,
        channelId,
        LINE_CHANNEL_SECRET.value(),
      );
      if (!tokens.id_token) throw new Error("LINE did not return an ID token");

      const profile = await verifyIdToken(tokens.id_token, channelId, nonce);
      const user = await getOrCreateFirebaseUser(profile);
      const customToken = await getAuth().createCustomToken(user.uid, { provider: "line" });
      redirectToApp(res, origin, { token: customToken });
    } catch (error) {
      console.error("LINE login callback failed", error.code || error.name || "unknown");
      redirectToApp(res, origin, { error: "login_failed" });
    }
  },
);
