import {
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
} from "obscenity";
import { AccountServiceError } from "@/lib/account/service";
import { prisma } from "@/lib/prisma";

// Public nicknames are shown to other people, so they keep the language filter
// that used to live with the gallery moderation code.
const publicTextMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function normalizePublicNickname(value: string): { display: string; normalized: string } {
  const display = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return { display, normalized: display.toLocaleLowerCase("en-US") };
}

export function publicTextError(value: string): "blocked_language" | null {
  return publicTextMatcher.hasMatch(value.normalize("NFKC")) ? "blocked_language" : null;
}

export async function updatePublicNickname(userId: string, draft: string) {
  const value = normalizePublicNickname(draft);

  if (!value.display) {
    await prisma.user.update({
      where: { id: userId },
      data: { publicNickname: null, publicNicknameNormalized: null },
    });
    return { publicNickname: null };
  }

  if (value.display.length < 2 || value.display.length > 40 || /[\p{Cc}\p{Cf}]/u.test(value.display)) {
    throw new AccountServiceError("invalid_nickname", "Use 2 to 40 visible characters.");
  }

  if (publicTextError(value.display)) {
    throw new AccountServiceError("nickname_rejected", "Choose a different public nickname.");
  }

  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        publicNickname: value.display,
        publicNicknameNormalized: value.normalized,
      },
      select: { publicNickname: true },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AccountServiceError("nickname_taken", "That nickname is already in use.");
    }
    throw error;
  }
}
