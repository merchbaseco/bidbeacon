export const SEARCH_RESOURCES = ['campaign', 'ad_group', 'ad', 'target', 'product', 'change_event'] as const;

export type SearchResource = (typeof SEARCH_RESOURCES)[number];
export const SEARCH_OPERATORS = ['eq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte'] as const;

export type SearchOperator = (typeof SEARCH_OPERATORS)[number];
export type SearchFieldValueKind = 'boolean' | 'date' | 'datetime' | 'json' | 'number' | 'string';

const CAMPAIGN_RESOURCE_FIELDS = [
    'campaign.id',
    'campaign.name',
    'campaign.state',
    'campaign.deliveryStatus',
    'campaign.dailyBudget',
    'campaign.targetingMode',
    'campaign.bidStrategy',
    'campaign.startDate',
    'campaign.endDate',
] as const;

const AD_GROUP_RESOURCE_FIELDS = ['adGroup.id', 'adGroup.name', 'adGroup.state', 'adGroup.deliveryStatus', 'adGroup.defaultBid'] as const;

const AD_RESOURCE_FIELDS = ['ad.id', 'ad.state', 'ad.deliveryStatus', 'ad.asin', 'ad.productTitle', 'ad.type'] as const;

const TARGET_RESOURCE_FIELDS = [
    'target.id',
    'target.state',
    'target.deliveryStatus',
    'target.type',
    'target.scope',
    'target.bid',
    'target.negative',
    'target.keyword',
    'target.asin',
    'target.matchType',
] as const;

const PRODUCT_RESOURCE_FIELDS = ['product.asin', 'product.title'] as const;

const CHANGE_EVENT_RESOURCE_FIELDS = [
    'changeEvent.id',
    'changeEvent.resourceType',
    'changeEvent.resourceId',
    'changeEvent.eventType',
    'changeEvent.field',
    'changeEvent.previousValue',
    'changeEvent.newValue',
    'changeEvent.changedAt',
    'changeEvent.source',
] as const;

const PERFORMANCE_FIELDS = [
    'metrics.impressions',
    'metrics.clicks',
    'metrics.spend',
    'metrics.orders',
    'metrics.sales',
    'metrics.acos',
    'metrics.cpc',
    'metrics.ctr',
    'metrics.roas',
    'metrics.cvr',
] as const;

export const CAMPAIGN_SEARCH_FIELDS = [...CAMPAIGN_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date'] as const;
export const AD_GROUP_SEARCH_FIELDS = [...AD_GROUP_RESOURCE_FIELDS, ...CAMPAIGN_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date', 'segments.hour'] as const;
export const AD_SEARCH_FIELDS = [...AD_RESOURCE_FIELDS, ...AD_GROUP_RESOURCE_FIELDS, ...CAMPAIGN_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date', 'segments.hour'] as const;
export const TARGET_SEARCH_FIELDS = [...TARGET_RESOURCE_FIELDS, ...AD_GROUP_RESOURCE_FIELDS, ...CAMPAIGN_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date'] as const;
export const PRODUCT_SEARCH_FIELDS = [...PRODUCT_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date', 'segments.hour'] as const;
export const CHANGE_EVENT_SEARCH_FIELDS = [...CHANGE_EVENT_RESOURCE_FIELDS] as const;

export const SEARCH_FIELDS = [...AD_SEARCH_FIELDS, ...TARGET_RESOURCE_FIELDS, ...PRODUCT_RESOURCE_FIELDS, ...CHANGE_EVENT_RESOURCE_FIELDS] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number];
export type CampaignSearchField = (typeof CAMPAIGN_SEARCH_FIELDS)[number];
export type AdGroupSearchField = (typeof AD_GROUP_SEARCH_FIELDS)[number];
export type AdSearchField = (typeof AD_SEARCH_FIELDS)[number];
export type TargetSearchField = (typeof TARGET_SEARCH_FIELDS)[number];
export type ProductSearchField = (typeof PRODUCT_SEARCH_FIELDS)[number];
export type ChangeEventSearchField = (typeof CHANGE_EVENT_SEARCH_FIELDS)[number];

export type SearchFieldDefinition = {
    field: SearchField;
    kind: SearchFieldValueKind;
    filterOperators: readonly SearchOperator[];
    compatibleResources: readonly SearchResource[];
    defaultResources: readonly SearchResource[];
    default: boolean;
    performance: boolean;
    segment: boolean;
    sortable: boolean;
};

const performanceResources = ['campaign', 'ad_group', 'ad', 'target', 'product'] as const satisfies readonly SearchResource[];
const campaignResources = ['campaign', 'ad_group', 'ad', 'target'] as const satisfies readonly SearchResource[];
const childResources = ['ad_group', 'ad', 'target'] as const satisfies readonly SearchResource[];
const adResource = ['ad'] as const satisfies readonly SearchResource[];
const targetResource = ['target'] as const satisfies readonly SearchResource[];
const productResource = ['product'] as const satisfies readonly SearchResource[];
const changeEventResource = ['change_event'] as const satisfies readonly SearchResource[];
const productAndChildResources = ['ad_group', 'ad', 'product'] as const satisfies readonly SearchResource[];
const stringEqualityOperators = ['eq', 'in'] as const satisfies readonly SearchOperator[];
const nameOperators = ['eq', 'in', 'contains'] as const satisfies readonly SearchOperator[];
const numericOperators = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const satisfies readonly SearchOperator[];
const booleanOperators = ['eq', 'in'] as const satisfies readonly SearchOperator[];
const dateOperators = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const satisfies readonly SearchOperator[];
const timestampOperators = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const satisfies readonly SearchOperator[];
const jsonOperators = ['eq', 'in'] as const satisfies readonly SearchOperator[];

const definition = <TField extends SearchField>(
    field: TField,
    kind: SearchFieldValueKind,
    filterOperators: readonly SearchOperator[],
    compatibleResources: readonly SearchResource[],
    defaultResources: readonly SearchResource[] = [],
    options: { performance?: boolean; segment?: boolean; sortable?: boolean } = {}
): SearchFieldDefinition => ({
    field,
    kind,
    filterOperators,
    compatibleResources,
    defaultResources,
    default: defaultResources.length > 0,
    performance: options.performance ?? false,
    segment: options.segment ?? false,
    sortable: options.sortable ?? true,
});

export const searchFieldRegistry: Readonly<Record<SearchField, SearchFieldDefinition>> = {
    'campaign.id': definition('campaign.id', 'string', stringEqualityOperators, campaignResources, ['campaign', 'ad_group', 'ad', 'target']),
    'campaign.name': definition('campaign.name', 'string', nameOperators, campaignResources, ['campaign', 'ad_group', 'ad', 'target']),
    'campaign.state': definition('campaign.state', 'string', stringEqualityOperators, campaignResources, ['campaign']),
    'campaign.deliveryStatus': definition('campaign.deliveryStatus', 'string', stringEqualityOperators, campaignResources, ['campaign']),
    'campaign.dailyBudget': definition('campaign.dailyBudget', 'number', numericOperators, campaignResources, ['campaign']),
    'campaign.targetingMode': definition('campaign.targetingMode', 'string', stringEqualityOperators, campaignResources),
    'campaign.bidStrategy': definition('campaign.bidStrategy', 'string', stringEqualityOperators, campaignResources),
    'campaign.startDate': definition('campaign.startDate', 'date', dateOperators, campaignResources),
    'campaign.endDate': definition('campaign.endDate', 'date', dateOperators, campaignResources),
    'adGroup.id': definition('adGroup.id', 'string', stringEqualityOperators, childResources, ['ad_group', 'ad', 'target']),
    'adGroup.name': definition('adGroup.name', 'string', nameOperators, childResources, ['ad_group', 'ad', 'target']),
    'adGroup.state': definition('adGroup.state', 'string', stringEqualityOperators, childResources, ['ad_group']),
    'adGroup.deliveryStatus': definition('adGroup.deliveryStatus', 'string', stringEqualityOperators, childResources, ['ad_group']),
    'adGroup.defaultBid': definition('adGroup.defaultBid', 'number', numericOperators, childResources, ['ad_group']),
    'ad.id': definition('ad.id', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.state': definition('ad.state', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.deliveryStatus': definition('ad.deliveryStatus', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.asin': definition('ad.asin', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.productTitle': definition('ad.productTitle', 'string', [], adResource, ['ad'], { sortable: false }),
    'ad.type': definition('ad.type', 'string', stringEqualityOperators, adResource),
    'target.id': definition('target.id', 'string', stringEqualityOperators, targetResource, ['target']),
    'target.state': definition('target.state', 'string', stringEqualityOperators, targetResource, ['target']),
    'target.deliveryStatus': definition('target.deliveryStatus', 'string', stringEqualityOperators, targetResource, ['target']),
    'target.type': definition('target.type', 'string', stringEqualityOperators, targetResource, ['target']),
    'target.scope': definition('target.scope', 'string', stringEqualityOperators, targetResource, ['target']),
    'target.bid': definition('target.bid', 'number', numericOperators, targetResource, ['target']),
    'target.negative': definition('target.negative', 'boolean', booleanOperators, targetResource, ['target']),
    'target.keyword': definition('target.keyword', 'string', nameOperators, targetResource, ['target']),
    'target.asin': definition('target.asin', 'string', stringEqualityOperators, targetResource, ['target']),
    'target.matchType': definition('target.matchType', 'string', stringEqualityOperators, targetResource, ['target']),
    'changeEvent.id': definition('changeEvent.id', 'string', stringEqualityOperators, changeEventResource, ['change_event']),
    'changeEvent.resourceType': definition('changeEvent.resourceType', 'string', stringEqualityOperators, changeEventResource, ['change_event']),
    'changeEvent.resourceId': definition('changeEvent.resourceId', 'string', stringEqualityOperators, changeEventResource, ['change_event']),
    'changeEvent.eventType': definition('changeEvent.eventType', 'string', stringEqualityOperators, changeEventResource, ['change_event']),
    'changeEvent.field': definition('changeEvent.field', 'string', stringEqualityOperators, changeEventResource, ['change_event']),
    'changeEvent.previousValue': definition('changeEvent.previousValue', 'json', jsonOperators, changeEventResource, ['change_event']),
    'changeEvent.newValue': definition('changeEvent.newValue', 'json', jsonOperators, changeEventResource, ['change_event']),
    'changeEvent.changedAt': definition('changeEvent.changedAt', 'datetime', timestampOperators, changeEventResource, ['change_event']),
    'changeEvent.source': definition('changeEvent.source', 'string', stringEqualityOperators, changeEventResource, ['change_event']),
    'metrics.impressions': definition('metrics.impressions', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.clicks': definition('metrics.clicks', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.spend': definition('metrics.spend', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.orders': definition('metrics.orders', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.sales': definition('metrics.sales', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.acos': definition('metrics.acos', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.cpc': definition('metrics.cpc', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.ctr': definition('metrics.ctr', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.roas': definition('metrics.roas', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'metrics.cvr': definition('metrics.cvr', 'number', numericOperators, performanceResources, ['campaign', 'ad_group', 'ad', 'target', 'product'], { performance: true }),
    'segments.date': definition('segments.date', 'date', dateOperators, performanceResources, [], { performance: true, segment: true }),
    'segments.hour': definition('segments.hour', 'number', numericOperators, productAndChildResources, [], { performance: true, segment: true }),
    'product.asin': definition('product.asin', 'string', stringEqualityOperators, productResource, ['product']),
    'product.title': definition('product.title', 'string', [], productResource, ['product'], { sortable: false }),
};

export const CAMPAIGN_DEFAULT_FIELDS = CAMPAIGN_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('campaign')) as CampaignSearchField[];
export const AD_GROUP_DEFAULT_FIELDS = AD_GROUP_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('ad_group')) as AdGroupSearchField[];
export const AD_DEFAULT_FIELDS = AD_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('ad')) as AdSearchField[];
export const TARGET_DEFAULT_FIELDS = TARGET_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('target')) as TargetSearchField[];
export const PRODUCT_DEFAULT_FIELDS = PRODUCT_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('product')) as ProductSearchField[];
export const CHANGE_EVENT_DEFAULT_FIELDS = CHANGE_EVENT_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('change_event')) as ChangeEventSearchField[];

export const getSearchField = (field: string) => (Object.hasOwn(searchFieldRegistry, field) ? searchFieldRegistry[field as SearchField] : undefined);

export const getSearchDefaultFields = (resource: SearchResource) =>
    resource === 'campaign'
        ? CAMPAIGN_DEFAULT_FIELDS
        : resource === 'ad_group'
          ? AD_GROUP_DEFAULT_FIELDS
          : resource === 'ad'
            ? AD_DEFAULT_FIELDS
            : resource === 'target'
              ? TARGET_DEFAULT_FIELDS
              : resource === 'product'
                ? PRODUCT_DEFAULT_FIELDS
                : CHANGE_EVENT_DEFAULT_FIELDS;

export const isSearchFieldCompatible = (resource: SearchResource, field: string) => getSearchField(field)?.compatibleResources.includes(resource) ?? false;

export const isSearchPerformanceField = (field: string) => getSearchField(field)?.performance ?? false;

export const isSearchSegmentField = (field: string) => getSearchField(field)?.segment ?? false;

export const isSearchHourSegmentField = (field: string) => field === 'segments.hour';

export const campaignSearchFieldRegistry = Object.fromEntries(CAMPAIGN_SEARCH_FIELDS.map(field => [field, searchFieldRegistry[field]])) as Readonly<Record<CampaignSearchField, SearchFieldDefinition>>;

export const getCampaignSearchField = (field: string) => (Object.hasOwn(campaignSearchFieldRegistry, field) ? campaignSearchFieldRegistry[field as CampaignSearchField] : undefined);

export const isCampaignPerformanceField = (field: string) => campaignSearchFieldRegistry[field as CampaignSearchField]?.performance ?? false;

export const isCampaignSegmentField = (field: string) => campaignSearchFieldRegistry[field as CampaignSearchField]?.segment ?? false;
