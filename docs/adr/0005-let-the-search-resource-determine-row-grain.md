---
summary: Records why the selected Search resource controls row grain and selectable ancestry.
read_when:
  - changing Search resources, row grain, ancestry, or Product-to-Ad traversal
---

# Let the Search resource determine row grain

The selected Search resource determines the primary grain of every result row; callers may select fields from that resource and its ancestors but not its children. Allowing descendant fields was rejected because it would multiply rows and make performance metrics ambiguous, while ancestor fields preserve grain and provide useful campaign and ad-group context for ads and targets.

`product` is a read-only reporting resource whose row grain is one advertised ASIN aggregated across ads. Product rows expose `product.asin` as the relationship key rather than embedding ad or campaign ID arrays. An agent drills into controllable topology by searching `ad` with an `ad.asin` filter; default Ad fields provide the matching ad, ad-group, and campaign identities in one follow-up call.
