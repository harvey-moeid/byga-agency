export interface Env extends WorkerBindings {
  AI?: {
    run: (model: string, input: unknown) => Promise<{ response?: string }>;
  };
  DASHBOARD_PASSWORD: string;
  ENCRYPTION_KEY: string;
  APP_URL: string;
}
