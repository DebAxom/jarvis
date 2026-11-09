import type { FastifyInstance } from 'fastify';
import dashboard from './dashboard';
import api from './api';

export default async function (fastify: FastifyInstance): Promise<void> {
	await fastify.register(dashboard, { prefix: '/dashboard' });
	await fastify.register(api, { prefix: '/api' });
}
