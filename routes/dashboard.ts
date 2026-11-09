import type { FastifyInstance } from 'fastify';
import auth from './auth';
import cors from '@fastify/cors';
import { verifyAccessToken } from '../middlewares/auth';

export default async function (fastify: FastifyInstance): Promise<void> {
    await fastify.register(cors, {
        origin: process.env.CLIENT_URL || process.env.DASHBOARD_URL || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE']
    });

    await fastify.register(auth, { prefix: '/auth' });

    // Protected routes requiring valid dashboard session
    await fastify.register(async (protectedRoutes) => {
        protectedRoutes.addHook('preHandler', verifyAccessToken);

        protectedRoutes.get("/metrics", async (request, reply) => {
            const appid = request.user?.id!;

            const { rows } = await fastify.pg.query(
                `SELECT
                a.services,
                m.timestamp,
                m.data
             FROM apps a
             LEFT JOIN LATERAL (
                SELECT timestamp, data
                FROM metrics
                WHERE appid = a.appid
                ORDER BY timestamp DESC
                LIMIT 1
             ) m ON true
             WHERE a.appid = $1`,
                [appid]
            );

            if (!rows.length) {
                return reply.code(404).send({
                    success: false,
                    error: "Application not found"
                });
            }

            const latest = rows[0];

            const services = (latest.services ?? []).map(
                (service: string) => ({
                    name: service,
                    metrics: latest.data?.[service] ?? null
                })
            );

            return {
                success: true,
                hasMetrics: latest.timestamp !== null,
                timestamp: latest.timestamp,
                services
            };
        });
    });
}