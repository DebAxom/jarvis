import bcrypt from 'bcrypt';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
    interface FastifyRequest {
        appId: string | null;
    }
}

export async function authenticateApp(request: FastifyRequest,reply: FastifyReply) {
    const apiKey = request.headers['x-api-key'];
    const appId = request.headers['x-app-id'];

    if (typeof apiKey !== 'string' ||typeof appId !== 'string' ||!apiKey.trim() ||!appId.trim()) {
        return reply.code(401).send({
            success: false,
            error: 'Missing API credentials'
        });
    }

    try {
        const result = await request.server.pg.query<{id: string;api_key: string;}>(
            `SELECT id, api_key
             FROM apps
             WHERE id = $1`,
            [appId.trim()]
        );

        if (result.rowCount === 0) {
            return reply.code(401).send({
                success: false,
                error: 'Invalid API credentials'
            });
        }

        const app : any = result.rows[0];

        const validApiKey = await bcrypt.compare(apiKey,app.api_key);

        if (!validApiKey) {
            return reply.code(401).send({
                success: false,
                error: 'Invalid API credentials'
            });
        }

        request.appId = app.id;

    } catch (error) {
        request.log.error(error);

        return reply.code(500).send({
            success: false,
            error: 'Internal server error'
        });
    }
}
