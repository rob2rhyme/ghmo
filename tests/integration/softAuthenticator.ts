import crypto from "node:crypto";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * Minimal software WebAuthn authenticator for tests. Produces real, signed
 * registration ("none" attestation) and assertion responses with a P-256 key,
 * so the server verifies them exactly as it would a phone or security key.
 */
export class SoftAuthenticator {
  readonly credentialId = crypto.randomBytes(32);
  private readonly keys = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  private counter = 0;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
    private readonly userHandle: string
  ) {}

  get id() {
    return isoBase64URL.fromBuffer(this.credentialId);
  }

  private rpIdHash() {
    return crypto.createHash("sha256").update(this.rpId).digest();
  }

  private coseKey() {
    const jwk = this.keys.publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const map = new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, isoBase64URL.toBuffer(jwk.x)],
      [-3, isoBase64URL.toBuffer(jwk.y)]
    ]);
    return Buffer.from(isoCBOR.encode(map));
  }

  register(challenge: string, { prf = true } = {}) {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge, origin: this.origin, crossOrigin: false })
    );
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      this.rpIdHash(),
      Buffer.from([0x45]), // UP | UV | AT
      Buffer.alloc(4), // sign count 0
      Buffer.alloc(16), // AAGUID
      credIdLen,
      this.credentialId,
      this.coseKey()
    ]);
    const attestationObject = Buffer.from(
      isoCBOR.encode(
        new Map<string, unknown>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData]
        ]) as unknown as Parameters<typeof isoCBOR.encode>[0]
      )
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        attestationObject: isoBase64URL.fromBuffer(attestationObject),
        transports: ["internal"]
      },
      clientExtensionResults: prf ? { prf: { enabled: true } } : {}
    };
  }

  authenticate(challenge: string, { userVerified = true, origin = this.origin } = {}) {
    this.counter += 1;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const authData = Buffer.concat([this.rpIdHash(), Buffer.from([userVerified ? 0x05 : 0x01]), count]);
    const signedData = Buffer.concat([authData, crypto.createHash("sha256").update(clientDataJSON).digest()]);
    const signature = crypto.sign("sha256", signedData, this.keys.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        authenticatorData: isoBase64URL.fromBuffer(authData),
        signature: isoBase64URL.fromBuffer(signature),
        userHandle: isoBase64URL.fromBuffer(Buffer.from(this.userHandle))
      },
      clientExtensionResults: {}
    };
  }
}
