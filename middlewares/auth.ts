import type { FastifyRequest, FastifyReply } from 'fastify';

import { generateTokens, verifyToken, type TokenPayload } from '../utils/auth';

declare module 'fastify' {
	interface FastifyRequest {
		user?: { id: string };
	}
}

const cookieBase = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production'
};

function clearAuthCookies(reply: FastifyReply) {
	reply.clearCookie('accessToken', { path: '/' });
	reply.clearCookie('refreshToken', { path: '/' });
}

function deny(reply: FastifyReply) {
	clearAuthCookies(reply);

	return reply.status(401).send({
		error: 'Unauthorized'
	});
}

const isValid = (payload: TokenPayload | null): payload is TokenPayload => {
	return !!payload && typeof payload.userId === 'string';
};

export async function verifyAccessToken(request: FastifyRequest,reply: FastifyReply) {
	const { accessToken, refreshToken } = request.cookies;

	if (!accessToken && !refreshToken) {
		return deny(reply);
	}

	try {
		let payload: TokenPayload | null = accessToken ? await verifyToken<TokenPayload>(accessToken,process.env.ACCESS_SECRET) : null;

		let renewed = false;

		// Access token expired or invalid.
		// Try the refresh token.
		if (!isValid(payload)) {
			payload = refreshToken ? await verifyToken<TokenPayload>( refreshToken,process.env.REFRESH_SECRET): null;
			renewed = true;
		}

		if (!isValid(payload)) {
			return deny(reply);
		}

		// Verify that the app still exists.
		const result = await request.server.pg.query<{id: string}>(
			'SELECT id FROM apps WHERE appid = $1',
			[payload.userId]
		);

		if (result.rowCount === 0) {
			return deny(reply);
		}

		// Issue new tokens when using the refresh token.
		if (renewed) {
			const tokens = await generateTokens({
				userId: payload.userId
			});

			reply.setCookie(
				'accessToken',
				tokens.accessToken,
				{
					...cookieBase,
					maxAge: 15 * 60
				}
			);

			reply.setCookie(
				'refreshToken',
				tokens.refreshToken,
				{
					...cookieBase,
					maxAge: 15 * 24 * 60 * 60
				}
			);
		}

		request.user = {
			id: payload.userId
		};

	} catch (error) {
		request.log.error(error);

		return reply.status(500).send({
			error: 'Internal Server Error'
		});
	}
}