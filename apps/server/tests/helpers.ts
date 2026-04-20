import { StatusList } from "@sd-jwt/jwt-status-list";
import { db, statusListsTable } from "@status-list-server/db";

export async function clearDb() {
  await db.delete(statusListsTable);
}

export function createTestStatusListJwt(bitsPerStatus: 1 | 2 | 4 | 8 = 1): string {
  const list = new StatusList([0, 0, 0, 0], bitsPerStatus);
  const lst = list.compressStatusList();
  const header = { alg: "ES256", typ: "statuslist+jwt" };
  const payload = {
    status_list: { bits: bitsPerStatus, lst },
    iss: "test",
    sub: "test",
    iat: 0,
  };
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.fakesig`;
}
