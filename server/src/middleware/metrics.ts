import type { Request, Response, NextFunction } from 'express';

interface RouteMetric {
  count: number;
  totalMs: number;
  maxMs: number;
  errors: number;
}

// In-memory metrics (resets on restart — sufficient for MVP)
const metrics = {
  requestCount: 0,
  errorCount: 0,
  startedAt: new Date().toISOString(),
  routes: new Map<string, RouteMetric>(),
};

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  metrics.requestCount++;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const routeKey = `${req.method} ${req.route?.path || req.path}`;

    const route = metrics.routes.get(routeKey) || { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    route.count++;
    route.totalMs += duration;
    if (duration > route.maxMs) route.maxMs = duration;
    if (res.statusCode >= 400) route.errors++;
    metrics.routes.set(routeKey, route);

    if (res.statusCode >= 500) metrics.errorCount++;
  });

  next();
}

export function getMetrics() {
  const uptimeMs = Date.now() - new Date(metrics.startedAt).getTime();
  const topRoutes = Array.from(metrics.routes.entries())
    .map(([path, data]) => ({
      path,
      count: data.count,
      avgMs: Math.round(data.totalMs / data.count),
      maxMs: data.maxMs,
      errors: data.errors,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    uptime: {
      ms: uptimeMs,
      human: formatUptime(uptimeMs),
      startedAt: metrics.startedAt,
    },
    requests: {
      total: metrics.requestCount,
      errors: metrics.errorCount,
      errorRate: metrics.requestCount > 0
        ? `${((metrics.errorCount / metrics.requestCount) * 100).toFixed(2)}%`
        : '0%',
    },
    topRoutes,
  };
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
