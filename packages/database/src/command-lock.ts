import type { TransactionSql } from "postgres";
import type { WorkspaceScope } from "@tracepbl/domain";

// A missing receipt cannot be row-locked. Serialize the key before looking it up.
export async function lockCommand(tx: TransactionSql<Record<string, never>>, scope: WorkspaceScope, key: string) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`${scope.workspaceId}:${key}`},0))`;
}
