-- Migration: 20260309010000_create_activ8_demo2_from_jd_williams_down

BEGIN;

DELETE FROM keywords_snapshots
WHERE retailer_id = 'demo2';

DELETE FROM category_performance_snapshots
WHERE retailer_id = 'demo2';

DELETE FROM product_performance_snapshots
WHERE retailer_id = 'demo2';

DELETE FROM auction_insights_snapshots
WHERE retailer_id = 'demo2';

DELETE FROM product_coverage_snapshots
WHERE retailer_id = 'demo2';

DELETE FROM retailer_access_tokens
WHERE retailer_id = 'demo2';

DELETE FROM user_retailer_access
WHERE retailer_id = 'demo2';

DELETE FROM reports
WHERE retailer_id = 'demo2';

DELETE FROM report_schedules
WHERE retailer_id = 'demo2';

DELETE FROM retailers
WHERE retailer_id = 'demo2';

DELETE FROM schema_migrations
WHERE version = '20260309010000';

COMMIT;
