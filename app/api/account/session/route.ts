import { claimAnonymousSession, syncAuthUser } from "@/lib/auth/account";
import { getAuthenticatedAuthUser } from "@/lib/auth/request";
import {
  appendPublicSessionCookie,
  readPublicSessionId,
} from "@/lib/publicSession";
import { serializeAccount } from "@/lib/account/service";
import { apiJson, apiServiceError } from "@/lib/api/response";

export const runtime = "nodejs";

function rotateSession(response: Response): Response {
  appendPublicSessionCookie(response, crypto.randomUUID());
  return response;
}

export async function POST(request: Request) {
  const authUser = await getAuthenticatedAuthUser(request);
  if (!authUser) {
    return apiJson({
      error: { code: "authentication_required", message: "Sign in to continue." },
    }, 401);
  }
  try {
    const account = await syncAuthUser(authUser);
    if (!account) {
      return apiJson({
        error: { code: "authentication_required", message: "Account unavailable." },
      }, 401);
    }
    await claimAnonymousSession(
      account.id,
      readPublicSessionId(request.headers.get("cookie")),
    );
    return rotateSession(apiJson({ account: serializeAccount(account) }));
  } catch (error) {
    return apiServiceError(error);
  }
}

export async function DELETE() {
  return rotateSession(apiJson({ ok: true }));
}
