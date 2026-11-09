const BASE_URL = 'http://localhost:5000';

export class ApiError extends Error {
	constructor(status, message, data) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.data = data;
	}
}

// Called when the session is dead (any 401). Register once at app startup.
let onUnauthorized = null;
let handling401 = false;

export const setUnauthorizedHandler = (fn) => {
	onUnauthorized = fn;
};

async function request(method, endpoint, body) {
	const hasBody = body !== undefined;

	let res;
	try {
		res = await fetch(BASE_URL + endpoint, {
			method,
			credentials: 'include',
			// Only send Content-Type with a body, or Fastify rejects empty JSON bodies
			headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
			body: hasBody ? JSON.stringify(body) : undefined
		});
	} catch {
		throw new ApiError(0, 'Network error. Check your connection.');
	}

	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		/* non-JSON response (e.g. proxy error page) */
	}

	if (!res.ok) {
		if (res.status === 401 && !handling401) {
			handling401 = true; // parallel requests shouldn't trigger multiple redirects
			onUnauthorized?.();
			setTimeout(() => (handling401 = false), 1000);
		}
		throw new ApiError(res.status, data?.error ?? data?.message ?? `Request failed (${res.status})`, data);
	}

	return data;
}

export const Get = (endpoint) => request('GET', endpoint);
export const Post = (endpoint, body = {}) => request('POST', endpoint, body);
export const Patch = (endpoint, body = {}) => request('PATCH', endpoint, body);
export const Delete = (endpoint) => request('DELETE', endpoint);