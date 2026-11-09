import type { FastifyInstance } from "fastify";
import { authenticateApp } from "../middlewares/app_auth";
import cors from "@fastify/cors";

function parseTimestamp(ts?: string): Date | null {
    if (!ts) return new Date();
    const parsed = new Date(ts);
    return isNaN(parsed.getTime()) ? null : parsed;
}

export default async function (fastify: FastifyInstance) {
    await fastify.register(cors, {
        origin: "*",
        credentials: false,
        methods: ["GET", "POST", "PATCH", "DELETE"]
    });

    fastify.addHook("preHandler", authenticateApp);

    // POST /events
    fastify.post("/events", async (request, reply) => {
        const { events } = request.body as {
            events: {
                timestamp?: string;
                service: string;
                category: string;
                msg: string;
                endpoint?: string;
                trace_id?: string;
                metadata?: Record<string, unknown>;
            }[];
        };

        if (!Array.isArray(events) || !events.length || events.length > 500 || events.some(e => !e || typeof e.service !== "string" || !e.service.trim() || typeof e.category !== "string" || !e.category.trim() || typeof e.msg !== "string" || !e.msg.trim())) {
            return reply.code(400).send({
                success: false,
                error: "Invalid events. Provide 1-500 valid events."
            });
        }

        const appid = request.appId!;
        const values: unknown[] = [];
        const rowsSql: string[] = [];

        for (let idx = 0; idx < events.length; idx++) {
            const event: any = events[idx];
            const ts = parseTimestamp(event.timestamp);

            if (!ts) {
                return reply.code(400).send({
                    success: false,
                    error: `Invalid timestamp in event at index ${idx}`
                });
            }

            const offset = idx * 8;
            rowsSql.push(
                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
            );
            values.push(
                appid,
                event.service.trim(),
                ts,
                event.category.trim(),
                event.msg.trim(),
                event.endpoint ?? null,
                event.trace_id ?? null,
                JSON.stringify(
                    typeof event.metadata === "object" && event.metadata !== null && !Array.isArray(event.metadata)
                        ? event.metadata
                        : {}
                )
            );
        }

        await fastify.pg.query(
            `INSERT INTO events (
                appid, service, timestamp, category,
                msg, endpoint, trace_id, metadata
            )
            VALUES ${rowsSql.join(", ")}`,
            values
        );

        return reply.code(202).send({
            success: true,
            received: events.length
        });
    });

    // POST /metrics
    fastify.post("/metrics", async (request, reply) => {
        const { timestamp, data } = request.body as {
            timestamp?: string;
            data: Record<string, Record<string, number>>;
        };

        if (!data || typeof data !== "object" || Array.isArray(data) || !Object.keys(data).length || Object.values(data).some(serviceMetrics =>
            !serviceMetrics ||
            typeof serviceMetrics !== "object" ||
            Array.isArray(serviceMetrics) ||
            !Object.keys(serviceMetrics).length ||
            Object.values(serviceMetrics).some(value => typeof value !== "number" || !Number.isFinite(value))
        )
        ) {
            return reply.code(400).send({
                success: false,
                error: "Invalid metrics payload"
            });
        }

        const ts = parseTimestamp(timestamp);
        if (!ts) {
            return reply.code(400).send({
                success: false,
                error: "Invalid timestamp format"
            });
        }

        await fastify.pg.query(
            `INSERT INTO metrics (appid, timestamp, data)
             VALUES ($1, $2, $3)`,
            [
                request.appId!,
                ts,
                JSON.stringify(data)
            ]
        );

        return reply.code(202).send({
            success: true,
            received: Object.keys(data).length
        });
    });
}