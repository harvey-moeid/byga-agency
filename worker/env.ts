export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  AI?: {
    run: (model: string, input: unknown) => Promise<{ response?: string }>;
  };
  DASHBOARD_PASSWORD: string;
  ENCRYPTION_KEY: string;
  APP_URL: string;
}
