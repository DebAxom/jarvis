import type { FastifyInstance } from "fastify";
import { authenticateApp } from "../middlewares/app_auth";
import cors from "@fastify/cors";

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

        if (
            !Array.isArray(events) ||
            !events.length ||
            events.length > 500 ||
            events.some(e =>
                !e ||
                typeof e.service !== "string" ||
                !e.service.trim() ||
                typeof e.category !== "string" ||
                !e.category.trim() ||
                typeof e.msg !== "string" ||
                !e.msg.trim()
            )
        ) {
            return reply.code(400).send({
                success: false,
                error: "Invalid events. Provide 1-500 valid events."
            });
        }

        const appid = request.appId!;

        const client = await fastify.pg.connect();

        try {
            await client.query("BEGIN");

            for (const event of events) {
                await client.query(
                    `INSERT INTO events (
                        appid, service, timestamp, category,
                        msg, endpoint, trace_id, metadata
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [
                        appid,
                        event.service,
                        event.timestamp ?? new Date(),
                        event.category,
                        event.msg,
                        event.endpoint ?? null,
                        event.trace_id ?? null,
                        JSON.stringify(event.metadata ?? {})
                    ]
                );
            }

            await client.query("COMMIT");

            return reply.code(202).send({
                success: true,
                received: events.length
            });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
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
            Object.values(serviceMetrics).some( value => typeof value !== "number" || !Number.isFinite(value))
        )
        ) {
            return reply.code(400).send({
                success: false,
                error: "Invalid metrics payload"
            });
        }

        await fastify.pg.query(
            `INSERT INTO metrics (appid, timestamp, data)
             VALUES ($1, $2, $3)`,
            [
                request.appId!,
                timestamp ?? new Date(),
                JSON.stringify(data)
            ]
        );

        return reply.code(202).send({
            success: true,
            received: Object.keys(data).length
        });
    });
}