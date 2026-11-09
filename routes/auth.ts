import type { FastifyInstance, FastifyReply } from 'fastify';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import cors from '@fastify/cors';
import { generateTokens } from '../utils/auth';

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	if (storedHash.includes(':')) {
		const [salt, key] = storedHash.split(':');
		if (!salt || !key) return false;
		const derivedKey = scryptSync(password, salt, 64);
		const keyBuffer = Buffer.from(key, 'hex');
		return derivedKey.length === keyBuffer.length && timingSafeEqual(derivedKey, keyBuffer);
	}
	return bcrypt.compare(password, storedHash);
}

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

	await fastify.register(cors, {
		origin: process.env.CLIENT_URL || process.env.DASHBOARD_URL || 'http://localhost:3000',
		credentials: false,
		methods: ["GET", "POST", "PATCH", "DELETE"]
	});

	fastify.post<{ Body: LoginBody }>('/login', loginRateLimit, async (request, reply) => {

		const { appId, password } = request.body ?? {};

		if (typeof appId !== 'string' || typeof password !== 'string' || !appId.trim() || !password) {
			return reply.status(400).send({
				error: 'App ID and password are required'
			});
		}

		try {
			const result = await fastify.pg.query<{ id: string; appid: string; name: string; password: string; }>(
				`SELECT id, appid, name, password FROM apps WHERE appid = $1`,
				[appId.trim()]
			);

			const app = result.rows[0];

			if (!app) {
				return reply.status(401).send({
					error: 'Invalid App ID or password'
				});
			}

			const passwordValid = await verifyPassword(password, app.password);

			if (!passwordValid) {
				return reply.status(401).send({
					error: 'Invalid App ID or password'
				});
			}

			const tokens = await generateTokens({ userId: app.appid });

			setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

			return reply.send({
				success: true,
				app: {
					id: app.id,
					appId: app.appid,
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