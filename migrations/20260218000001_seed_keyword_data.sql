-- Seed data for keyword_performance table for testing
-- This populates test data for retailer 2041 for January 2026

BEGIN;

-- Insert keyword performance data for January 2026
INSERT INTO keyword_performance (retailer_id, search_term, insight_date, impressions, clicks, conversions, ctr, conversion_rate)
VALUES
-- January 10, 2026
('2041', 'blue shoes', '2026-01-10', 1500, 45, 8, 3.00, 17.78),
('2041', 'running shoes', '2026-01-10', 2800, 98, 18, 3.50, 18.37),
('2041', 'sports sneakers', '2026-01-10', 950, 28, 3, 2.95, 10.71),
('2041', 'athletic footwear', '2026-01-10', 3200, 88, 22, 2.75, 25.00),
('2041', 'casual shoes', '2026-01-10', 1100, 32, 4, 2.91, 12.50),
('2041', 'winter boots', '2026-01-10', 800, 18, 2, 2.25, 11.11),
('2041', 'hiking shoes', '2026-01-10', 620, 15, 1, 2.42, 6.67),
('2041', 'mens trainers', '2026-01-10', 1200, 35, 5, 2.92, 14.29),
('2041', 'womens sneakers', '2026-01-10', 900, 24, 3, 2.67, 12.50),
('2041', 'black running shoes', '2026-01-10', 450, 18, 4, 4.00, 22.22),

-- January 15, 2026 (different activity)
('2041', 'blue shoes', '2026-01-15', 1600, 52, 10, 3.25, 19.23),
('2041', 'running shoes', '2026-01-15', 2900, 105, 20, 3.62, 19.05),
('2041', 'sports sneakers', '2026-01-15', 1000, 30, 4, 3.00, 13.33),
('2041', 'athletic footwear', '2026-01-15', 3400, 95, 25, 2.79, 26.32),
('2041', 'casual shoes', '2026-01-15', 1200, 38, 5, 3.17, 13.16),
('2041', 'winter boots', '2026-01-15', 850, 20, 2, 2.35, 10.00),
('2041', 'hiking shoes', '2026-01-15', 650, 18, 2, 2.77, 11.11),
('2041', 'mens trainers', '2026-01-15', 1300, 40, 6, 3.08, 15.00),
('2041', 'womens sneakers', '2026-01-15', 950, 28, 4, 2.95, 14.29),
('2041', 'black running shoes', '2026-01-15', 480, 20, 5, 4.17, 25.00),
('2041', 'waterproof shoes', '2026-01-15', 520, 12, 1, 2.31, 8.33),

-- January 20, 2026 (more data)
('2041', 'blue shoes', '2026-01-20', 1700, 56, 11, 3.29, 19.64),
('2041', 'running shoes', '2026-01-20', 3100, 112, 22, 3.61, 19.64),
('2041', 'sports sneakers', '2026-01-20', 1100, 33, 5, 3.00, 15.15),
('2041', 'athletic footwear', '2026-01-20', 3600, 102, 27, 2.83, 26.47),
('2041', 'casual shoes', '2026-01-20', 1300, 42, 6, 3.23, 14.29),
('2041', 'winter boots', '2026-01-20', 900, 22, 3, 2.44, 13.64),
('2041', 'hiking shoes', '2026-01-20', 700, 20, 2, 2.86, 10.00),
('2041', 'mens trainers', '2026-01-20', 1400, 44, 7, 3.14, 15.91),
('2041', 'womens sneakers', '2026-01-20', 1000, 30, 5, 3.00, 16.67),
('2041', 'black running shoes', '2026-01-20', 500, 22, 6, 4.40, 27.27),
('2041', 'waterproof shoes', '2026-01-20', 600, 15, 2, 2.50, 13.33),
('2041', 'leather shoes', '2026-01-20', 450, 10, 1, 2.22, 10.00);

COMMIT;
