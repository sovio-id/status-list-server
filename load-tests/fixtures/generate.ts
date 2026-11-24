import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, gzipSync } from "node:zlib";

export type BitsPerStatus = 1 | 2 | 4 | 8;

const MIN_BITSTRING_BITS = 131072;

const b64url = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

/**
 * Builds a structurally valid status list JWT. The server only parses the
 * token (it does not verify the signature), so a fake signature is enough.
 * `lst` is a zlib-deflated status list, matching @sd-jwt/jwt-status-list.
 */
export function createStatusListJwt(bitsPerStatus: BitsPerStatus = 1): string {
  const totalStatuses = 4;
  const numBytes = Math.ceil((totalStatuses * bitsPerStatus) / 8);
  const lst = deflateSync(Buffer.alloc(numBytes)).toString("base64url");

  const header = { alg: "ES256", typ: "statuslist+jwt" };
  const payload = {
    status_list: { bits: bitsPerStatus, lst },
    iss: "load-test",
    sub: "load-test",
    iat: 0,
  };

  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.fakesig`;
}

/** Multibase 'u' base64url gzip of 131072 zero bits (W3C BitstringStatusList). */
export function createEncodedList(): string {
  const bytes = gzipSync(Buffer.alloc(MIN_BITSTRING_BITS / 8));
  return `u${bytes.toString("base64url")}`;
}

export function createBitstringCredential(
  subjectOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "https://example.com/status-lists/load-test",
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: "did:key:z6MktestIssuer",
    validFrom: new Date(0).toISOString(),
    credentialSubject: {
      id: "https://example.com/status-lists/load-test#list",
      type: "BitstringStatusList",
      statusPurpose: "revocation",
      encodedList: createEncodedList(),
      ...subjectOverrides,
    },
  };
}

export const createTokenCreateBody = (id: string, bits: BitsPerStatus = 1) => ({
  id,
  jwt: createStatusListJwt(bits),
});

export const createTokenPatchBody = (bits: BitsPerStatus = 1) => ({
  jwt: createStatusListJwt(bits),
});

export const createBitstringCreateBody = (id: string) => ({
  id,
  vc: createBitstringCredential(),
});

export const createBitstringPatchBody = () => ({
  vc: createBitstringCredential(),
});

if (import.meta.main) {
  const outDir =
    process.argv[2] ?? join(import.meta.dir, "..", ".run", "fixtures");
  mkdirSync(outDir, { recursive: true });

  const write = (name: string, data: unknown) =>
    writeFileSync(join(outDir, name), `${JSON.stringify(data, null, 2)}\n`);

  const sampleId = "00000000-0000-4000-8000-000000000000";
  write("token-create.json", createTokenCreateBody(sampleId));
  write("token-patch.json", createTokenPatchBody());
  write("bitstring-create.json", createBitstringCreateBody(sampleId));
  write("bitstring-patch.json", createBitstringPatchBody());

  console.log(`Fixtures written to ${outDir}`);
}
