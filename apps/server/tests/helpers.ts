import { gzipSync } from "node:zlib";
import { StatusList } from "@sd-jwt/jwt-status-list";
import { db, statusListsTable } from "@status-list-server/db";

export const EMPTY_ENCODED_LIST = `u${gzipSync(
  Buffer.alloc(131072 / 8),
).toString("base64url")}`;

export async function clearDb() {
  await db.delete(statusListsTable);
}

export function createTestStatusListJwt(
  bitsPerStatus: 1 | 2 | 4 | 8 = 1,
): string {
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

export type TestBitstringStatusListCredential = {
  "@context": string[];
  id: string;
  type: string[];
  issuer: string;
  validFrom: string;
  credentialSubject: {
    id?: string;
    type: string;
    statusPurpose: string;
    encodedList: string;
    statusSize?: number;
    ttl?: number;
  };
};

export function createTestBitstringCredential(
  overrides: Partial<TestBitstringStatusListCredential> = {},
  subjectOverrides: Partial<
    TestBitstringStatusListCredential["credentialSubject"]
  > = {},
): TestBitstringStatusListCredential {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "https://example.com/status-lists/1",
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: "did:key:z6MktestIssuer",
    validFrom: new Date(0).toISOString(),
    credentialSubject: {
      id: "https://example.com/status-lists/1#list",
      type: "BitstringStatusList",
      statusPurpose: "revocation",
      encodedList: EMPTY_ENCODED_LIST,
      ...subjectOverrides,
    },
    ...overrides,
  };
}
