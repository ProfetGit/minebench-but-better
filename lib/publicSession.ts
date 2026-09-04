import { createHmac } from "node:crypto";

// The anonymous browser session used for presence. The cookie name is
// unchanged from when this lived with the arena code, so existing sessions
// survive the removal.
export const PUBLIC_SESSION_COOKIE = "mb_session";

export const PUBLIC_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export function readPublicSessionId(cookieHeader: string | null): string | null {
  const match = (cookieHeader ?? "").match(
    new RegExp(`(?:^|;\\s*)${PUBLIC_SESSION_COOKIE}=([^;]+)`),
  );
  return match?.[1]?.trim() || null;
}

export function appendPublicSessionCookie(response: Response, sessionId: string): void {
  response.headers.append(
    "Set-Cookie",
    `${PUBLIC_SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${PUBLIC_SESSION_COOKIE_OPTIONS.maxAge}; HttpOnly; SameSite=Lax${PUBLIC_SESSION_COOKIE_OPTIONS.secure ? "; Secure" : ""}`,
  );
}

function identitySecret(): string {
  const value = [
    process.env.PUBLIC_IDENTITY_HMAC_SECRET,
    process.env.VOTE_BLOCK_HMAC_SECRET,
    process.env.ADMIN_TOKEN,
    process.env.NEXTAUTH_SECRET,
  ].find((candidate) => candidate?.trim())?.trim();
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return "minebench-local-identity-secret";
  throw new Error("A server signing secret is required to hash presence identities");
}

export function identityHmac(value: string): string {
  return createHmac("sha256", identitySecret()).update(value).digest("hex");
}

// Only trusted when a proxy in front of the app is known to set the header.
export function trustedClientIp(headers: Headers): string | null {
  const trustedProxy =
    process.env.VERCEL === "1" ||
    ["1", "true", "yes", "on"].includes(
      process.env.TRUST_X_FORWARDED_FOR?.trim().toLowerCase() ?? "",
    );
  if (!trustedProxy) return null;
  const direct =
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-vercel-forwarded-for");
  return (
    direct?.split(",")[0]?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  );
}

export function hashClientIp(ip: string | null): string | null {
  return ip ? identityHmac(`ip:${ip}`) : null;
}
