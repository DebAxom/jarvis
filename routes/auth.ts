import type { FastifyInstance, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { generateTokens } from '../utils/auth';

interface LoginBody {
	appId: string;
	password: string;
}

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
	const base = {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax' as const
	};

	reply.setCookie('accessToken', accessToken, {
		...base,
		maxAge: 15 * 60 // 15 minutes
	});

	reply.setCookie('refreshToken', refreshToken, {
		...base,
		maxAge: 15 * 24 * 60 * 60 // 15 days
	});
}

function clearAuthCookies(reply: FastifyReply): void {
	reply.clearCookie('accessToken', { path: '/' });
	reply.clearCookie('refreshToken', { path: '/' });
}

const loginRateLimit = {
	config: {
		rateLimit: {
			max: 10,
			timeWindow: '10 minutes'
		}
	}
};

export default async function (fastify: FastifyInstance): Promise<void> {

	fastify.post<{ Body: LoginBody }>('/login', loginRateLimit, async (request, reply) => {

		const { appId, password } = request.body ?? {};

		if (typeof appId !== 'string' || typeof password !== 'string' || !appId.trim() || !password) {
			return reply.status(400).send({
				error: 'App ID and password are required'
			});
		}

		try {
			const result = await fastify.pg.query<{ id: string; name: string; password: string; }>(
				`SELECT id, name, password FROM apps WHERE appid = $1`,
				[appId.trim()]
			);

			if (result.rowCount === 0) {
				return reply.status(401).send({
					error: 'Invalid App ID or password'
				});
			}

			const app: any = result.rows[0];

			const passwordValid = await bcrypt.compare(password,app.password);

			if (!passwordValid) {
				return reply.status(401).send({
					error: 'Invalid App ID or password'
				});
			}

			const tokens = await generateTokens({userId: app.id as string});

			setAuthCookies(reply,tokens.accessToken,tokens.refreshToken);

			return reply.send({
				success: true,
				app: {
					id: app.id,
					name: app.name
				}
			});

		} catch (error) {
			request.log.error(error);

			return reply.status(500).send({
				error: 'Internal server error'
			});
		}
	});

	fastify.post('/logout', async (_request, reply) => {

		clearAuthCookies(reply);

		return reply.send({
			success: true
		});
	});
}