BEGIN;

-- Create prompt_templates table for managing AI insight generation prompts
CREATE TABLE prompt_templates (
    id BIGSERIAL PRIMARY KEY,
    page_type VARCHAR(50) NOT NULL,
    tab_name VARCHAR(50) NOT NULL DEFAULT 'insights',
    insight_type VARCHAR(50) NOT NULL,
    prompt_text TEXT NOT NULL,
    style_directive VARCHAR(50) DEFAULT 'standard',
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_by INTEGER,
    updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_active_prompt UNIQUE (page_type, tab_name, insight_type)
);

-- Seed initial prompt templates (v1: global, tab_name='insights')
INSERT INTO prompt_templates (page_type, tab_name, insight_type, prompt_text, style_directive) VALUES

-- OVERVIEW
('overview', 'insights', 'insight_panel', $pt$
Produce an Insights Panel with 3 sections: Beat rivals, Optimise spend, Explore opportunities. Each section must contain 2–3 concise bullets. Prefer using numbers from the snapshot where available. Focus on competitive advantage, efficiency, and expansion opportunities. Avoid speculation.
$pt$, 'standard'),
('overview', 'insights', 'market_analysis', $pt$
Write a market analysis with: (1) headline (1 sentence), (2) summary (1–2 sentences), (3) 2–3 highlights, and (4) 1–2 risks/watch-outs. Keep language executive-friendly and tie back to observed performance metrics.
$pt$, 'standard'),
('overview', 'insights', 'recommendation', $pt$
Provide recommendations in 3 sections: Quick wins (2–3 bullets), Strategic moves (2–3 bullets), Watch list (1–2 bullets). Prioritise impact and feasibility. Use metric-driven language (percentages, counts) when possible.
$pt$, 'standard'),

-- KEYWORDS
('keywords', 'insights', 'insight_panel', $pt$
Generate keyword-focused insights: explain what is driving search visibility and conversions, identify waste (low intent / low conversion), and propose concrete query/keyword actions. Output 3 sections (Beat rivals / Optimise spend / Explore opportunities), 2–3 bullets each, concise and numeric where possible.
$pt$, 'standard'),
('keywords', 'insights', 'market_analysis', $pt$
Provide market context for search terms: describe demand/intent signals, competitive pressure, and query mix changes implied by CTR/CVR patterns. Return headline, summary, 2–3 highlights, 1–2 risks.
$pt$, 'standard'),
('keywords', 'insights', 'recommendation', $pt$
Provide keyword recommendations: immediate optimisations (negatives, match types, bidding focus), strategic improvements (coverage expansion, structure changes), and watch-outs. Output Quick wins / Strategic moves / Watch list.
$pt$, 'standard'),

-- CATEGORIES
('categories', 'insights', 'insight_panel', $pt$
Generate category-focused insights: highlight strongest categories, where competitors likely outperform, and where budget/coverage should be reallocated. Output Beat rivals / Optimise spend / Explore opportunities with 2–3 bullets each. Keep actionable and grounded in the period snapshot.
$pt$, 'standard'),
('categories', 'insights', 'market_analysis', $pt$
Analyse category dynamics: where performance is concentrated vs diversified, where demand is shifting, and what competitive positioning is implied. Return headline, summary, 2–3 highlights, 1–2 risks.
$pt$, 'standard'),
('categories', 'insights', 'recommendation', $pt$
Provide category recommendations: reallocation across category segments, actions to improve weaker categories, and strategic positioning opportunities. Output Quick wins / Strategic moves / Watch list.
$pt$, 'standard'),

-- PRODUCTS
('products', 'insights', 'insight_panel', $pt$
Generate product-focused insights: prioritise high-performing products to scale, identify underperformers to fix or pause, and surface portfolio gaps/opportunities. Output Beat rivals / Optimise spend / Explore opportunities with 2–3 bullets each.
$pt$, 'standard'),
('products', 'insights', 'market_analysis', $pt$
Analyse product portfolio dynamics: concentration of conversions, efficiency signals, and likely competitive pressure on hero SKUs. Return headline, summary, 2–3 highlights, 1–2 risks.
$pt$, 'standard'),
('products', 'insights', 'recommendation', $pt$
Provide product recommendations: hero product scaling, underperformer remediation, and portfolio/pricing/inventory actions. Output Quick wins / Strategic moves / Watch list.
$pt$, 'standard');

COMMIT;
