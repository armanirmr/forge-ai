import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const CREDENTIAL_SALT = Buffer.from("forgeai-user-ai-credentials", "utf8");
const CREDENTIAL_INFO = Buffer.from("aes-256-gcm:v1", "utf8");

function encryptionKey(): Buffer {
	const secret = process.env.NEXTAUTH_SECRET;
	if (!secret) throw new Error("NEXTAUTH_SECRET must be configured to protect saved AI credentials");
	return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), CREDENTIAL_SALT, CREDENTIAL_INFO, 32));
}

/** Encrypts a provider credential using an authenticated, versioned envelope. */
export function encryptUserCredential(userId: string, value: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	cipher.setAAD(Buffer.from(userId, "utf8"));
	const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
	return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypts a credential only for the account that originally saved it. */
export function decryptUserCredential(userId: string, envelope: string): string {
	const [version, ivText, tagText, ciphertextText, extra] = envelope.split(".");
	if (version !== "v1" || !ivText || !tagText || !ciphertextText || extra) {
		throw new Error("Saved AI credentials have an unsupported format. Save them again in Settings.");
	}

	try {
		const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
		decipher.setAAD(Buffer.from(userId, "utf8"));
		decipher.setAuthTag(Buffer.from(tagText, "base64url"));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertextText, "base64url")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		throw new Error("Saved AI credentials could not be decrypted. Save them again in Settings.");
	}
}
