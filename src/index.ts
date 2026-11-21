interface Env {
	ASSETS: Fetcher;
}

/**
 * Worker entry. Static pages are served from ./public by the assets layer;
 * this handler only runs for /api/* (see run_worker_first in wrangler.jsonc).
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (pathname === "/api/health") {
			return Response.json({ success: true, data: { status: "tenang" } });
		}

		if (pathname.startsWith("/api/")) {
			return Response.json(
				{ success: false, error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan" } },
				{ status: 404 },
			);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
