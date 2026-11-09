import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { verifyAccessToken } from '../middlewares/auth';

export default async function (fastify: FastifyInstance): Promise<void> {
    await fastify.register(cors, {
        origin: process.env.CLIENT_URL || process.env.DASHBOARD_URL || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE']
    });

    fastify.addHook('preHandler', verifyAccessToken);

    fastify.get("/metrics", async (request, reply) => {
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

    fastify.get("/services", async (request, reply) => {
        const appid = request.user?.id!;

        const { rows } = await fastify.pg.query(
            `SELECT
            a.services,
            COALESCE(s.service_stats, '[]'::jsonb) AS service_stats
         FROM apps a
         LEFT JOIN LATERAL (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', service,
                    'latest_event', latest_event,
                    'event_count', event_count
                )
            ) AS service_stats
            FROM (
                SELECT
                    e.service,
                    MAX(e.timestamp) AS latest_event,
                    COUNT(*) AS event_count
                FROM events e
                WHERE e.appid = a.appid
                  AND e.timestamp >= NOW() - INTERVAL '24 hours'
                GROUP BY e.service
            ) stats
         ) s ON true
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

        const statsMap = new Map(
            latest.service_stats.map((service: any) => [
                service.name,
                service
            ])
        );

        const services = (latest.services ?? []).map((name: string) => {
            const stats = statsMap.get(name) as any;

            return {
                name,
                latest_event: stats?.latest_event ?? null,
                events_24h: Number(stats?.event_count ?? 0)
            };
        });

        return {
            success: true,
            services
        };
    });

    fastify.get("/events/recent", async (request, reply) => {
        const appid = request.user?.id!;

        const { limit: rawLimit } = request.query as {
            limit?: string;
        };

        const limit = Math.min(
            Math.max(parseInt(rawLimit ?? "5", 10) || 5, 1),
            100
        );

        const { rows } = await fastify.pg.query(
            `SELECT
            id,
            timestamp,
            service,
            category,
            msg,
            endpoint,
            trace_id,
            metadata
         FROM events
         WHERE appid = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
            [appid, limit]
        );

        return {
            success: true,
            count: rows.length,
            events: rows
        };
    });
}