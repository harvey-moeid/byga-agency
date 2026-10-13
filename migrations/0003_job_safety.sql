CREATE TABLE cron_runs(name TEXT NOT NULL, scheduled_at INTEGER NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, PRIMARY KEY(name,scheduled_at));
CREATE INDEX cron_runs_retention ON cron_runs(started_at);
ALTER TABLE notification_jobs ADD COLUMN lease TEXT;
ALTER TABLE notification_jobs ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0;
CREATE INDEX notification_due ON notification_jobs(status,next_at,lease_until);
CREATE INDEX activity_time ON activity(time);
