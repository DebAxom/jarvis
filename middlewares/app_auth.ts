import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
    interface FastifyRequest {
        appId: string | null;
    }
}

async function verifyApiKey(providedApiKey: string, storedApiKey: string): Promise<boolean> {
    if (storedApiKey.length === 64) {
        const hashedProvided = createHash('sha256').update(providedApiKey).digest('hex');
        const a = Buffer.from(hashedProvided, 'hex');
        const b = Buffer.from(storedApiKey, 'hex');
        return a.length === b.length && timingSafeEqual(a, b);
    }
    return bcrypt.compare(providedApiKey, storedApiKey);
}

export async function authenticateApp(request: FastifyRequest, reply: FastifyReply) {
    const apiKey = request.headers['x-api-key'];
    const appId = request.headers['x-app-id'];

    if (typeof apiKey !== 'string' || typeof appId !== 'string' || !apiKey.trim() || !appId.trim()) {
        return reply.code(401).send({
            success: false,
            error: 'Missing API credentials'
        });
    }

    try {
        const result = await request.server.pg.query<{ id: string; appid: string; api_key: string; }>(
            `SELECT id, appid, api_key
             FROM apps
             WHERE appid = $1`,
            [appId.trim()]
        );

        const app = result.rows[0];

        if (!app) {
            return reply.code(401).send({
                success: false,
                error: 'Invalid API credentials'
            });
        }

        const validApiKey = await verifyApiKey(apiKey, app.api_key);

        if (!validApiKey) {
            return reply.code(401).send({
                success: false,
                error: 'Invalid API credentials'
            });
        }

        request.appId = app.appid;

    } catch (error) {
        request.log.error(error);

        return reply.code(500).send({
            success: false,
            error: 'Internal server error'
        });
    }
}
