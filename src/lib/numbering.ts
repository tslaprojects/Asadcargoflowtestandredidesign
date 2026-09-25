import "server-only";
import type { Tx } from "@/lib/db/prisma";

const SEQ = {
  load: { seq: "load_number_seq", prefix: "CF-L-" },
  order: { seq: "order_number_seq", prefix: "CF-O-" },
  contract: { seq: "contract_number_seq", prefix: "CF-C-" },
} as const;

/** Человекочитаемый номер из последовательности PostgreSQL: CF-L-000001, CF-O-000001, CF-C-000001. */
export async function nextPublicNumber(tx: Tx, kind: keyof typeof SEQ): Promise<string> {
  const { seq, prefix } = SEQ[kind];
  const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('"${seq}"') AS n`);
  return `${prefix}${String(Number(rows[0].n)).padStart(6, "0")}`;
}
