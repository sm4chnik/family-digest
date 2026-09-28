import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { getOpenRound } from "../db/rounds";
import { listUserIdsWithSubmissionForRound } from "../db/submissions";
import { listOnboardedUsers } from "../db/users";
import { isInDnd } from "../time/dnd";

export async function listMissingSubmitters(
  env: Env,
  now = new Date(),
): Promise<{ roundId: number; missing: UserRow[]; skippedDnd: number } | null> {
  const open = await getOpenRound(env.DB);
  if (!open) return null;

  const submitted = await listUserIdsWithSubmissionForRound(env.DB, open.id);
  const users = await listOnboardedUsers(env.DB);
  const missing: UserRow[] = [];
  let skippedDnd = 0;

  for (const user of users) {
    if (submitted.has(user.telegram_id)) continue;
    if (isInDnd(user, now)) {
      skippedDnd += 1;
      continue;
    }
    missing.push(user);
  }

  return { roundId: open.id, missing, skippedDnd };
}
