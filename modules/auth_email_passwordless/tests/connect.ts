import { test, TestContext } from "../module.gen.ts";
import { faker } from "https://deno.land/x/deno_faker@v1.0.3/mod.ts";
import { IDENTITY_INFO_PASSWORDLESS } from "../utils/provider.ts";
import { checkLogin, getVerification, verifyProvider } from "./common.ts";
import { assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// MARK: Test Email/No Pass
test("connect_email_and_login_passwordless", async (ctx: TestContext) => {
	const email = faker.internet.email();

	const { user } = await ctx.modules.users.create({});
	const { token: { token: userToken } } = await ctx.modules.users.createToken({
		userId: user.id,
	});

	// MARK: Connect
	{
		const { token } = await ctx.modules.authEmailPasswordless.signIn({
			email,
			connectEmail: { userToken },
		});
		const { code } = await getVerification(ctx, token);
		await ctx.modules.authEmailPasswordless.verifyCode({
			token,
			code,
		});
	}

	await verifyProvider(ctx, userToken, email, IDENTITY_INFO_PASSWORDLESS);

	// MARK: Log in
	{
		const { token } = await ctx.modules.authEmailPasswordless.signIn({
			email,
			signIn: { createUser: false },
		});
		const { code } = await getVerification(ctx, token);
		const { userToken } = await ctx.modules.authEmailPasswordless.verifyCode({
			token,
			code,
		});
		assertExists(userToken);

		await checkLogin(ctx, user, userToken);
	}
});
