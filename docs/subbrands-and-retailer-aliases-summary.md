# Subbrands and Retailer Aliases Summary

## Recommendation

- Keep retailer-owned brands in the main `brands` system.
- Do not store them only as metadata on `retailers`.
- Add retailer aliases as a separate identity layer, not mixed into `brand_aliases`.

## Why retailer-owned brands should stay in `brands`

Examples: `No7`, `Soltan`, `Autograph`, `Per Una`.

These behave like real brands in feeds, search terms, and filters, even if they are owned by a retailer.

If they sit only on the retailer record, we create two separate filtering and matching systems:

- one for brands
- one for retailer-owned labels

That makes search-term processing, UI editing, and reporting harder.

## Preferred brand model

Keep retailer-owned brands as normal rows in `brands`.

For now, do not split these into separate categories such as `retailer_owned` vs `retailer_sub_brand`.

Use one clear concept only:

- retailer-owned brand

Examples:

- `No7`
- `Soltan`
- `Autograph`
- `Per Una`

If the business later needs different behaviour, the model can be extended then.

When we do extend it in future, it should be because reporting, filtering, or search processing requires different treatment, not just because the ownership structure is slightly different.

Potential ownership metadata later could include:

- `owner_retailer_id`: nullable FK to `retailers.retailer_id`
- optional `parent_brand_id` for nested brand families if needed later

Examples:

- `No7` -> `owner_retailer_id = boots`
- `Soltan` -> `owner_retailer_id = boots`
- `Autograph` -> `owner_retailer_id = marks-and-spencer`

## Identity layers should stay separate

There are three different identity problems:

1. Retailer aliases
- `Boots`
- `Boots UK`
- misspellings and search-term variants that mean the retailer

2. Brand aliases
- `No7`, `No. 7`, `No 7`
- `M&S`, `Marks and Spencer` when used as a brand label

3. Retailer-owned brand relationships
- `No7` owned by `Boots`
- `Soltan` owned by `Boots`

These should not be collapsed into one alias table.

## Recommendation for retailer alias handling

Create a dedicated `retailer_aliases` table.

Purpose:

- map retailer-like search terms to canonical `retailer_id`
- capture display variants, known typos, and provider-specific names
- support deterministic matching before any fuzzy fallback

## Matching approach for search-term processing

Recommended order:

1. Exact retailer alias match
2. Exact brand alias match
3. Fuzzy fallback only if confidence is high
4. Leave unresolved candidates for review instead of auto-writing risky matches

## Practical takeaway

- Retailer-owned brands should be first-class brands with ownership metadata.
- Retailer aliases should have their own table.
- Brand aliases and retailer aliases can share normalization logic, but should remain separate models.

## Suggested next implementation steps

1. Add `owner_retailer_id` to `brands` when ownership needs to be stored directly
2. Add `retailer_aliases` table
3. Reuse shared normalization for both `brand_aliases` and `retailer_aliases`
4. Extend staff UI later to mark a brand as retailer-owned and select the owning retailer