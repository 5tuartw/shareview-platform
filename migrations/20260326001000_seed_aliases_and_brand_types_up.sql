-- Migration: 20260326001000_seed_aliases_and_brand_types_up

BEGIN;

WITH retailer_seed(retailer_id, alias_name, alias_name_normalized, alias_type, notes) AS (
  VALUES
    ('boots', 'Boots UK', 'boots uk', 'display_name', 'Common retailer display variant.'),
    ('boots', 'Boots.com', 'boots com', 'display_name', 'Retailer domain-style naming.'),
    ('boots', 'bootscom', 'bootscom', 'search_term', 'Collapsed domain-style search term.'),
    ('marks-and-spencer', 'M&S', 'm and s', 'search_term', 'Common shorthand used in campaigns and search terms.'),
    ('marks-and-spencer', 'Marks and Spencer', 'marks and spencer', 'display_name', 'Ampersand-free spelling.'),
    ('marks-and-spencer', 'marksandspencer', 'marksandspencer', 'search_term', 'Whitespace-free search term variant.'),
    ('marks-and-spencer', 'mands', 'mands', 'typo', 'Short typo/shorthand observed in internal naming.'),
    ('asda-george', 'Asda George', 'asda george', 'display_name', 'Canonical display-name variant without slug punctuation.'),
    ('asda-george', 'asdageorge', 'asdageorge', 'provider_specific', 'Auction campaign slug variant.'),
    ('brandalley', 'Brand Alley', 'brand alley', 'display_name', 'Spaced variant of retailer name.'),
    ('brandalley', 'brandalley', 'brandalley', 'search_term', 'Whitespace-free search term variant.'),
    ('jd-williams', 'JD Williams', 'jd williams', 'display_name', 'Canonical display-name variant without slug punctuation.'),
    ('jd-williams', 'jdwilliams', 'jdwilliams', 'provider_specific', 'Auction campaign slug variant.'),
    ('simply-be', 'Simply Be', 'simply be', 'display_name', 'Canonical display-name variant without slug punctuation.'),
    ('simply-be', 'simplybe', 'simplybe', 'provider_specific', 'Auction campaign slug variant.'),
    ('pets-at-home', 'Pets at Home', 'pets at home', 'display_name', 'Canonical display-name variant without slug punctuation.'),
    ('pets-at-home', 'petsathome', 'petsathome', 'provider_specific', 'Auction campaign slug variant.'),
    ('tk-maxx', 'TK Maxx', 'tk maxx', 'display_name', 'Canonical display-name variant without slug punctuation.'),
    ('tk-maxx', 'tkmaxx', 'tkmaxx', 'provider_specific', 'Auction campaign slug variant.'),
    ('nobodys-child', 'Nobodys Child', 'nobodys child', 'typo', 'Apostrophe-free naming variant.'),
    ('nobodys-child', 'nobodyschild', 'nobodyschild', 'provider_specific', 'Collapsed search term / slug variant.'),
    ('aspinal-of-london', 'Aspinal', 'aspinal', 'search_term', 'Shortened retailer reference.'),
    ('aspinal-of-london', 'Aspinal London', 'aspinal london', 'display_name', 'Shortened display variant.'),
    ('harts-of-stur', 'Harts Of Stur', 'harts of stur', 'display_name', 'Canonical display-name variant without slug punctuation.'),
    ('harts-of-stur', 'hartsofstur', 'hartsofstur', 'provider_specific', 'Auction campaign slug variant.'),
    ('sephora', 'Feel Unique', 'feel unique', 'legacy', 'Legacy retailer name before Sephora rebrand.'),
    ('sephora', 'feelunique', 'feelunique', 'legacy', 'Legacy slug retained in provider data.'),
    ('uniqlo', 'UNIQLO', 'uniqlo', 'display_name', 'Upper-case retailer styling used in creative and search.')
)
INSERT INTO retailer_aliases (
  retailer_id,
  alias_name,
  alias_name_normalized,
  alias_type,
  source,
  confidence,
  is_active,
  notes,
  metadata,
  created_at,
  updated_at
)
SELECT
  retailer_id,
  alias_name,
  alias_name_normalized,
  alias_type,
  'seed-20260326',
  1,
  true,
  notes,
  jsonb_build_object('seed_key', '20260326001000'),
  NOW(),
  NOW()
FROM retailer_seed
ON CONFLICT (source, alias_name_normalized)
DO UPDATE SET
  retailer_id = EXCLUDED.retailer_id,
  alias_name = EXCLUDED.alias_name,
  alias_type = EXCLUDED.alias_type,
  confidence = EXCLUDED.confidence,
  is_active = true,
  notes = EXCLUDED.notes,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH brand_alias_seed(canonical_name, alias_name, alias_name_normalized, notes) AS (
  VALUES
    ('M&S', 'Marks and Spencer', 'marks and spencer', 'Expanded long-form alias for M&S brand labelling.'),
    ('M&S', 'M and S', 'm and s', 'Ampersand-free spoken variant.'),
    ('Autograph', 'Auto graph', 'auto graph', 'Common spacing typo.'),
    ('Nobody''s Child', 'Nobodys Child', 'nobodys child', 'Apostrophe-free spelling.'),
    ('Sephora Collection', 'SephoraCollection', 'sephoracollection', 'Collapsed brand naming in search terms.'),
    ('Denim & Co.', 'Denim and Co', 'denim and co', 'Ampersand-free spelling.'),
    ('Kim & Co', 'Kim and Co', 'kim and co', 'Ampersand-free spelling.'),
    ('Thompson & Morgan', 'Thompson and Morgan', 'thompson and morgan', 'Ampersand-free spelling.'),
    ('Hill''s Science Plan', 'Hills Science Plan', 'hills science plan', 'Apostrophe-free spelling.'),
    ('Hill''s Prescription Diet', 'Hills Prescription Diet', 'hills prescription diet', 'Apostrophe-free spelling.'),
    ('Wainwright''s', 'Wainwrights', 'wainwrights', 'Apostrophe-free spelling.'),
    ('Where''s that From', 'Wheres that From', 'wheres that from', 'Apostrophe-free spelling.'),
    ('U.S. Polo Assn.', 'US Polo Assn', 'us polo assn', 'Punctuation-free variant.'),
    ('P.E Nation', 'PE Nation', 'pe nation', 'Punctuation-free variant.'),
    ('jack & jones', 'Jack and Jones', 'jack and jones', 'Ampersand-free variant.'),
    ('bareMinerals', 'Bare Minerals', 'bare minerals', 'Spaced casing variant.'),
    ('MONSOON', 'Monsoon', 'monsoon', 'Common title-case variant.'),
    ('ARMANI', 'Armani', 'armani', 'Common title-case variant.')
)
INSERT INTO brand_aliases (
  brand_id,
  alias_name,
  alias_name_normalized,
  source,
  confidence,
  metadata,
  created_at,
  updated_at
)
SELECT
  b.brand_id,
  s.alias_name,
  s.alias_name_normalized,
  'seed-20260326',
  1,
  jsonb_build_object('seed_key', '20260326001000', 'notes', s.notes),
  NOW(),
  NOW()
FROM brand_alias_seed s
INNER JOIN brands b ON b.canonical_name = s.canonical_name
ON CONFLICT (source, alias_name_normalized)
DO UPDATE SET
  brand_id = EXCLUDED.brand_id,
  alias_name = EXCLUDED.alias_name,
  confidence = EXCLUDED.confidence,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

UPDATE brands AS b
SET
  brand_type = seeded.brand_type,
  brand_type_retailer_id = seeded.brand_type_retailer_id,
  updated_at = NOW()
FROM (
  VALUES
    ('ARKET', 'retailer_owned', 'arket'),
    ('Aspinal of London', 'retailer_owned', 'aspinal-of-london'),
    ('Autograph', 'retailer_owned', 'marks-and-spencer'),
    ('Brora', 'retailer_owned', 'brora'),
    ('George', 'retailer_owned', 'asda-george'),
    ('Jacamo', 'retailer_owned', 'jacamo'),
    ('JD Williams', 'retailer_owned', 'jd-williams'),
    ('LEGO', 'retailer_owned', 'lego'),
    ('Logik', 'retailer_owned', 'currys'),
    ('M&S', 'retailer_owned', 'marks-and-spencer'),
    ('Nobody''s Child', 'retailer_owned', 'nobodys-child'),
    ('Pets at Home', 'retailer_owned', 'pets-at-home'),
    ('Sephora Collection', 'retailer_owned', 'sephora'),
    ('Simply Be', 'retailer_owned', 'simply-be'),
    ('Uniqlo', 'retailer_owned', 'uniqlo')
) AS seeded(canonical_name, brand_type, brand_type_retailer_id)
WHERE b.canonical_name = seeded.canonical_name;

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('20260326001000', 'Seed retailer aliases, brand aliases, and initial brand classifications', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;