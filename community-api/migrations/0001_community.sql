CREATE TABLE community_profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 24)
);
--> statement-breakpoint
CREATE TABLE community_videos (
  bvid TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  creator TEXT NOT NULL,
  cover TEXT NOT NULL,
  first_recommended_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE community_recommendations (
  user_id TEXT NOT NULL REFERENCES community_profiles(user_id),
  bvid TEXT NOT NULL REFERENCES community_videos(bvid),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, bvid)
);
--> statement-breakpoint
CREATE INDEX community_recent ON community_recommendations(created_at DESC);
--> statement-breakpoint
CREATE TABLE community_rate_windows (
  window_key TEXT PRIMARY KEY NOT NULL,
  minute INTEGER NOT NULL,
  uses INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX community_window_expiry ON community_rate_windows(minute);
--> statement-breakpoint
CREATE TRIGGER community_pilot_capacity
BEFORE INSERT ON community_recommendations
WHEN NOT EXISTS (
  SELECT 1 FROM community_recommendations WHERE user_id = NEW.user_id AND bvid = NEW.bvid
) AND (
  (SELECT COUNT(*) FROM community_recommendations) >= 2000
  OR (SELECT COUNT(*) FROM community_recommendations WHERE user_id = NEW.user_id) >= 100
)
BEGIN
  SELECT RAISE(ABORT, 'community_pilot_capacity');
END;
