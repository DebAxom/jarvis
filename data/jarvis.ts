type Event = {
    timestamp?: string;
    service: string;
    category: "error" | "business" | "security" | "system";
    msg: string;
    endpoint?: string;
    trace_id?: string;
    metadata?: Record<string, unknown>;
};

type Metrics = {
    service: string;
    metrics: Record<string, number>;
};

export default class JARVIS {
    private api_key: string;
    private app_name: string;
    private base_url: string;

    private events: Event[] = [];
    private metrics: Metrics[] = [];

    constructor(
        api_key: string,
        app_name: string,
        base_url = "https://api.nitshack9.com"
    ) {
        this.api_key = api_key;
        this.app_name = app_name;
        this.base_url = base_url.replace(/\/$/, "");
    }

    private async request(endpoint: string, body: unknown) {
        const response = await fetch(`${this.base_url}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.api_key,
                "x-app-id": this.app_name
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(
                `JARVIS API error: ${response.status} ${response.statusText}`
            );
        }

        return response.json();
    }

    pushEvent(event: Omit<Event, "timestamp">) {
        this.events.push({
            ...event,
            timestamp: new Date().toISOString()
        });
    }

    pushMetrics(metrics: Metrics) {
        this.metrics.push(metrics);
    }

    async send() {
        const events = this.events.splice(0);
        const metrics = this.metrics.splice(0);

        const results: {
            events?: unknown;
            metrics?: unknown;
        } = {};

        const errors: unknown[] = [];

        // Send events
        if (events.length) {
            try {
                results.events = await this.request("/api/events", {
                    events
                });
            } catch (error) {
                this.events.unshift(...events);
                errors.push(error);
            }
        }

        // Send metrics
        if (metrics.length) {
            try {
                results.metrics = await this.request("/api/metrics", {
                    timestamp: new Date().toISOString(),
                    data: Object.fromEntries(
                        metrics.map(m => [m.service, m.metrics])
                    )
                });
            } catch (error) {
                this.metrics.unshift(...metrics);
                errors.push(error);
            }
        }

        if (errors.length) {
            throw new AggregateError(errors, "Some JARVIS data failed to send");
        }

        return {
            events: events.length,
            metrics: metrics.length,
            results
        };
    }
}
