import Fastify from 'fastify';
import postgres from '@fastify/postgres';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import routes from './routes/index';

const app = Fastify({ trustProxy: true, logger: true });

try {
	await app.register(postgres, {
		connectionString: process.env.DATABASE_URL,
		ssl: { rejectUnauthorized: true }
	});
} catch (err) {
	console.error('DB/Redis error:', err);
	process.exit(1);
}

await app.register(cookie);

await app.register(rateLimit, {
	max: 300,
	timeWindow: '1 minute',
	skipOnError: true,
	errorResponseBuilder: (_req, context) => ({
		statusCode: 429,
		error: 'Too Many Requests',
		message: `You hit the limit! Try again in ${context.after}.`
	})
});

app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
	try {
		await Promise.all([app.pg.query('SELECT 1')]);
		return reply.status(200).send({ status: 'ok' });
	} catch {
		return reply.status(503).send({ status: 'degraded' });
	}
});

await app.register(routes);

try {
	await app.listen({ host: '0.0.0.0', port: 5000 });
} catch (err) {
	app.log.error(err);
	process.exit(1);
}