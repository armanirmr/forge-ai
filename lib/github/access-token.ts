import "server-only";
import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";

/** Reads the provider credential from the encrypted Auth.js cookie on the server. */
export async function getGitHubAccessToken(): Promise<string | undefined> {
	const requestHeaders = await headers();
	const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
	const secureCookie = authUrl
		? new URL(authUrl).protocol === "https:"
		: process.env.NODE_ENV === "production";
	const token = await getToken({
		req: { headers: requestHeaders },
		secret: process.env.NEXTAUTH_SECRET,
		secureCookie,
	});
	return typeof token?.accessToken === "string" ? token.accessToken : undefined;
}
