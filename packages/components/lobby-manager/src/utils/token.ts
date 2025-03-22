const TOKEN_CHARACTERS =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 24;

export function generateToken(prefix: string): string {
	let randomPart = "";

	// Use crypto API if available (more secure)
	const randomValues = new Uint8Array(TOKEN_LENGTH);
	crypto.getRandomValues(randomValues);

	for (let i = 0; i < TOKEN_LENGTH; i++) {
		randomPart += TOKEN_CHARACTERS.charAt(
			randomValues[i] % TOKEN_CHARACTERS.length,
		);
	}

	// Format: prefix_randomString
	return `${prefix}_${randomPart}`;
}
