# SP CLI Spec (Minimal Surface)

This spec defines the minimal Sponsored Products (SP) CLI surface. It excludes tags, bulk ops, auto-creation settings, global store settings, ad extensions, and creatives customization. Product-category/theme/location targets are excluded.

## Principles
- Config-only state. No per-command overrides.
- One way to do each thing.
- JSON output only.
- One CLI command maps to one API router file.
- Delete mirrors Amazon Ads SP v3 delete endpoints (soft-delete/archive semantics).

## Response Envelope
```json
{"ok": true, "data": {}}
```
```json
{"ok": false, "error": {"code": "MISSING_CONFIG", "message": "config.account is required", "details": {}}}
```

## Shared Schemas
```ts
const ConfigSchema = z.object({
  accountId: z.string(),
  range: z.string(), // "30d" or "YYYY-MM-DD..YYYY-MM-DD"
  timezone: z.enum(["account", "utc"])
});

const StateSchema = z.enum(["ENABLED", "PAUSED", "ARCHIVED"]);
const BidStrategySchema = z.enum(["MANUAL", "RULE_BASED", "SALES_DOWN_ONLY", "SALES_UP_AND_DOWN"]);
const KeywordMatchTypeSchema = z.enum(["BROAD", "PHRASE", "EXACT"]);
const ProductMatchTypeSchema = z.enum(["PRODUCT_EXACT", "PRODUCT_SIMILAR"]);
const ProductIdTypeSchema = z.enum(["ASIN", "SKU"]);
const PlacementSchema = z.enum(["TOP_OF_SEARCH", "REST_OF_SEARCH", "PRODUCT_PAGE", "SITE_AMAZON_BUSINESS"]);

const MoneySchema = z.number().nonnegative();
```

## Entity Shapes
```ts
const CampaignSchema = z.object({
  campaignId: z.string(),
  name: z.string(),
  state: StateSchema,
  budget: MoneySchema,
  bidStrategy: BidStrategySchema.nullable().optional(),
  startDateTime: z.string().nullable().optional(),
  endDateTime: z.string().nullable().optional(),
  portfolioId: z.string().nullable().optional()
});

const AdGroupSchema = z.object({
  adGroupId: z.string(),
  campaignId: z.string(),
  name: z.string(),
  defaultBid: MoneySchema,
  state: StateSchema
});

const AdSchema = z.object({
  adId: z.string(),
  campaignId: z.string(),
  adGroupId: z.string(),
  state: StateSchema,
  productIdType: ProductIdTypeSchema,
  productId: z.string()
});

const TargetSchema = z.object({
  targetId: z.string(),
  campaignId: z.string(),
  adGroupId: z.string(),
  state: StateSchema,
  bid: MoneySchema.nullable(),
  type: z.enum(["KEYWORD", "PRODUCT"]),
  keyword: z.string().nullable().optional(),
  keywordMatchType: KeywordMatchTypeSchema.nullable().optional(),
  productIdType: ProductIdTypeSchema.nullable().optional(),
  productId: z.string().nullable().optional(),
  productMatchType: ProductMatchTypeSchema.nullable().optional()
});

const MetricsTotalsSchema = z.object({
  impressions: z.number(),
  clicks: z.number(),
  spend: z.number(),
  purchases: z.number(),
  sales: z.number(),
  acos: z.number().nullable(),
  cpc: z.number().nullable(),
  ctr: z.number().nullable()
});

const MetricsPointSchema = z.object({
  start: z.string(),
  end: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  spend: z.number(),
  purchases: z.number(),
  sales: z.number()
});
```

## Config Commands
Config is local to the CLI and stored in `~/.bidbeacon/config.json`. These do not hit the API.

## Account Commands

### bb accounts list
Router: `src/api/routers/api/accounts-list.ts`
```ts
const Input = z.object({});
const Output = z.object({
  items: z.array(z.object({
    accountId: z.string(),
    name: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional()
  }))
});
```

## Campaign Commands

### bb campaigns list
Router: `src/api/routers/api/campaigns-list.ts`
```ts
const Input = z.object({});
const Output = z.object({ items: z.array(CampaignSchema) });
```

### bb campaigns get
Router: `src/api/routers/api/campaigns-get.ts`
```ts
const Input = z.object({ campaignId: z.string() });
const Output = z.object({ item: CampaignSchema });
```

### bb campaigns create
Router: `src/api/routers/api/campaigns-create.ts`
```ts
const Input = z.object({
  name: z.string(),
  budget: MoneySchema
});
const Output = z.object({ item: CampaignSchema });
```
Defaults applied server-side:
- `adProduct = SPONSORED_PRODUCTS`
- `state = PAUSED`
- `startDateTime = now`
- `marketplaceScope = SINGLE_MARKETPLACE`

### bb campaigns update
Router: `src/api/routers/api/campaigns-update.ts`
```ts
const Input = z.object({
  campaignId: z.string(),
  name: z.string().optional(),
  portfolioId: z.string().nullable().optional(),
  startDateTime: z.string().optional(),
  endDateTime: z.string().nullable().optional()
});
const Output = z.object({ item: CampaignSchema });
```

### bb campaigns pause
Router: `src/api/routers/api/campaigns-pause.ts`
```ts
const Input = z.object({ campaignId: z.string() });
const Output = z.object({ item: CampaignSchema });
```

### bb campaigns resume
Router: `src/api/routers/api/campaigns-resume.ts`
```ts
const Input = z.object({ campaignId: z.string() });
const Output = z.object({ item: CampaignSchema });
```

### bb campaigns delete
Router: `src/api/routers/api/campaigns-delete.ts`
```ts
const Input = z.object({ campaignId: z.string() });
const Output = z.object({ item: CampaignSchema });
```
Note: Amazon Ads SP v3 delete endpoints archive entities (soft delete).

### bb campaigns set-budget
Router: `src/api/routers/api/campaigns-set-budget.ts`
```ts
const Input = z.object({ campaignId: z.string(), budget: MoneySchema });
const Output = z.object({ item: CampaignSchema });
```

### bb campaigns set-bid-strategy
Router: `src/api/routers/api/campaigns-set-bid-strategy.ts`
```ts
const Input = z.object({ campaignId: z.string(), strategy: BidStrategySchema });
const Output = z.object({ item: CampaignSchema });
```

### bb campaigns set-bid-adjustments
Router: `src/api/routers/api/campaigns-set-bid-adjustments.ts`
```ts
const Input = z.object({
  campaignId: z.string(),
  scope: z.enum(["placement", "audience", "creative"]),
  adjustments: z.record(z.any())
});
const Output = z.object({ item: CampaignSchema });
```

## Ad Group Commands

### bb ad-groups list
Router: `src/api/routers/api/ad-groups-list.ts`
```ts
const Input = z.object({});
const Output = z.object({ items: z.array(AdGroupSchema) });
```

### bb ad-groups get
Router: `src/api/routers/api/ad-groups-get.ts`
```ts
const Input = z.object({ adGroupId: z.string() });
const Output = z.object({ item: AdGroupSchema });
```

### bb ad-groups create
Router: `src/api/routers/api/ad-groups-create.ts`
```ts
const Input = z.object({
  campaignId: z.string(),
  name: z.string(),
  defaultBid: MoneySchema
});
const Output = z.object({ item: AdGroupSchema });
```
Defaults applied server-side:
- `adProduct = SPONSORED_PRODUCTS`
- `state = ENABLED`

### bb ad-groups update
Router: `src/api/routers/api/ad-groups-update.ts`
```ts
const Input = z.object({
  adGroupId: z.string(),
  name: z.string()
});
const Output = z.object({ item: AdGroupSchema });
```

### bb ad-groups set-default-bid
Router: `src/api/routers/api/ad-groups-set-default-bid.ts`
```ts
const Input = z.object({ adGroupId: z.string(), value: MoneySchema });
const Output = z.object({ item: AdGroupSchema });
```

### bb ad-groups pause
Router: `src/api/routers/api/ad-groups-pause.ts`
```ts
const Input = z.object({ adGroupId: z.string() });
const Output = z.object({ item: AdGroupSchema });
```

### bb ad-groups resume
Router: `src/api/routers/api/ad-groups-resume.ts`
```ts
const Input = z.object({ adGroupId: z.string() });
const Output = z.object({ item: AdGroupSchema });
```

### bb ad-groups delete
Router: `src/api/routers/api/ad-groups-delete.ts`
```ts
const Input = z.object({ adGroupId: z.string() });
const Output = z.object({ item: AdGroupSchema });
```

## Ad Commands

### bb ads list
Router: `src/api/routers/api/ads-list.ts`
```ts
const Input = z.object({});
const Output = z.object({ items: z.array(AdSchema) });
```

### bb ads get
Router: `src/api/routers/api/ads-get.ts`
```ts
const Input = z.object({ adId: z.string() });
const Output = z.object({ item: AdSchema });
```

### bb ads create
Router: `src/api/routers/api/ads-create.ts`
```ts
const Input = z.object({
  adGroupId: z.string(),
  productIdType: ProductIdTypeSchema,
  productId: z.string()
});
const Output = z.object({ item: AdSchema });
```
Defaults applied server-side:
- `adProduct = SPONSORED_PRODUCTS`
- `adType = PRODUCT_AD`
- `state = ENABLED`
- `creative.productCreativeSettings.advertisedProduct` built from `productIdType` and `productId`

### bb ads update
Router: `src/api/routers/api/ads-update.ts`
```ts
const Input = z.object({ adId: z.string(), state: StateSchema });
const Output = z.object({ item: AdSchema });
```

### bb ads delete
Router: `src/api/routers/api/ads-delete.ts`
```ts
const Input = z.object({ adId: z.string() });
const Output = z.object({ deleted: z.literal(true), adId: z.string() });
```

## Target Commands

### bb targets list
Router: `src/api/routers/api/targets-list.ts`
```ts
const Input = z.object({});
const Output = z.object({ items: z.array(TargetSchema) });
```

### bb targets get
Router: `src/api/routers/api/targets-get.ts`
```ts
const Input = z.object({ targetId: z.string() });
const Output = z.object({ item: TargetSchema });
```

### bb targets create keyword
Router: `src/api/routers/api/targets-create-keyword.ts`
```ts
const Input = z.object({
  adGroupId: z.string(),
  keyword: z.string(),
  matchType: KeywordMatchTypeSchema,
  bid: MoneySchema
});
const Output = z.object({ item: TargetSchema });
```
Defaults applied server-side:
- `adProduct = SPONSORED_PRODUCTS`
- `negative = false`
- `state = ENABLED`
- `targetType = KEYWORD`

### bb targets create product
Router: `src/api/routers/api/targets-create-product.ts`
```ts
const Input = z.object({
  adGroupId: z.string(),
  productIdType: ProductIdTypeSchema,
  productId: z.string(),
  matchType: ProductMatchTypeSchema,
  bid: MoneySchema
});
const Output = z.object({ item: TargetSchema });
```
Defaults applied server-side:
- `adProduct = SPONSORED_PRODUCTS`
- `negative = false`
- `state = ENABLED`
- `targetType = PRODUCT`

### bb targets delete
Router: `src/api/routers/api/targets-delete.ts`
```ts
const Input = z.object({ targetId: z.string() });
const Output = z.object({ deleted: z.literal(true), targetId: z.string() });
```

### bb targets pause
Router: `src/api/routers/api/targets-pause.ts`
```ts
const Input = z.object({ targetId: z.string() });
const Output = z.object({ item: TargetSchema });
```

### bb targets resume
Router: `src/api/routers/api/targets-resume.ts`
```ts
const Input = z.object({ targetId: z.string() });
const Output = z.object({ item: TargetSchema });
```

## Bid Commands

### bb bids set
Router: `src/api/routers/api/bids-set.ts`
```ts
const Input = z.object({ targetId: z.string(), value: MoneySchema });
const Output = z.object({ item: TargetSchema });
```

### bb bids adjust
Router: `src/api/routers/api/bids-adjust.ts`
```ts
const Input = z.object({ targetId: z.string(), delta: z.number() });
const Output = z.object({ item: TargetSchema });
```

## Metrics Commands

### bb metrics campaigns
Router: `src/api/routers/api/metrics-campaigns.ts`
```ts
const Input = z.object({});
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

### bb metrics ad-groups
Router: `src/api/routers/api/metrics-ad-groups.ts`
```ts
const Input = z.object({});
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

### bb metrics ads
Router: `src/api/routers/api/metrics-ads.ts`
```ts
const Input = z.object({});
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

### bb metrics targets
Router: `src/api/routers/api/metrics-targets.ts`
```ts
const Input = z.object({});
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

### bb metrics campaign
Router: `src/api/routers/api/metrics-campaign.ts`
```ts
const Input = z.object({ campaignId: z.string() });
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

### bb metrics ad-group
Router: `src/api/routers/api/metrics-ad-group.ts`
```ts
const Input = z.object({ adGroupId: z.string() });
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

### bb metrics ad
Router: `src/api/routers/api/metrics-ad.ts`
```ts
const Input = z.object({ adId: z.string() });
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

### bb metrics target
Router: `src/api/routers/api/metrics-target.ts`
```ts
const Input = z.object({ targetId: z.string() });
const Output = z.object({ totals: MetricsTotalsSchema, series: z.array(MetricsPointSchema) });
```

## Enum Commands

### bb enums bid-strategy
Router: `src/api/routers/api/enums-bid-strategy.ts`
```ts
const Input = z.object({});
const Output = z.object({ items: z.array(BidStrategySchema) });
```

### bb enums match-type
Router: `src/api/routers/api/enums-match-type.ts`
```ts
const Input = z.object({});
const Output = z.object({
  keyword: z.array(KeywordMatchTypeSchema),
  product: z.array(ProductMatchTypeSchema)
});
```

### bb enums placement
Router: `src/api/routers/api/enums-placement.ts`
```ts
const Input = z.object({});
const Output = z.object({ items: z.array(PlacementSchema) });
```

### bb enums state
Router: `src/api/routers/api/enums-state.ts`
```ts
const Input = z.object({});
const Output = z.object({ items: z.array(StateSchema) });
```
