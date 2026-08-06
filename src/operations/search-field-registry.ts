export const SEARCH_RESOURCES = ['campaign', 'ad_group', 'ad'] as const;

export type SearchResource = (typeof SEARCH_RESOURCES)[number];
export const SEARCH_OPERATORS = ['eq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte'] as const;

export type SearchOperator = (typeof SEARCH_OPERATORS)[number];
export type SearchFieldValueKind = 'date' | 'number' | 'string';

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

export const CAMPAIGN_SEARCH_FIELDS = [...CAMPAIGN_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date', 'segments.placement'] as const;
export const AD_GROUP_SEARCH_FIELDS = [...AD_GROUP_RESOURCE_FIELDS, ...CAMPAIGN_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date', 'segments.hour'] as const;
export const AD_SEARCH_FIELDS = [...AD_RESOURCE_FIELDS, ...AD_GROUP_RESOURCE_FIELDS, ...CAMPAIGN_RESOURCE_FIELDS, ...PERFORMANCE_FIELDS, 'segments.date', 'segments.hour'] as const;

export const SEARCH_FIELDS = [...AD_SEARCH_FIELDS, 'segments.placement'] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number];
export type CampaignSearchField = (typeof CAMPAIGN_SEARCH_FIELDS)[number];
export type AdGroupSearchField = (typeof AD_GROUP_SEARCH_FIELDS)[number];
export type AdSearchField = (typeof AD_SEARCH_FIELDS)[number];

export type SearchFieldDefinition = {
    field: SearchField;
    kind: SearchFieldValueKind;
    filterOperators: readonly SearchOperator[];
    compatibleResources: readonly SearchResource[];
    defaultResources: readonly SearchResource[];
    default: boolean;
    performance: boolean;
    segment: boolean;
};

const allResources = SEARCH_RESOURCES;
const childResources = ['ad_group', 'ad'] as const satisfies readonly SearchResource[];
const adResource = ['ad'] as const satisfies readonly SearchResource[];
const stringEqualityOperators = ['eq', 'in'] as const satisfies readonly SearchOperator[];
const nameOperators = ['eq', 'in', 'contains'] as const satisfies readonly SearchOperator[];
const numericOperators = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const satisfies readonly SearchOperator[];
const dateOperators = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const satisfies readonly SearchOperator[];

const definition = <TField extends SearchField>(
    field: TField,
    kind: SearchFieldValueKind,
    filterOperators: readonly SearchOperator[],
    compatibleResources: readonly SearchResource[],
    defaultResources: readonly SearchResource[] = [],
    options: { performance?: boolean; segment?: boolean } = {}
): SearchFieldDefinition => ({
    field,
    kind,
    filterOperators,
    compatibleResources,
    defaultResources,
    default: defaultResources.length > 0,
    performance: options.performance ?? false,
    segment: options.segment ?? false,
});

export const searchFieldRegistry: Readonly<Record<SearchField, SearchFieldDefinition>> = {
    'campaign.id': definition('campaign.id', 'string', stringEqualityOperators, allResources, ['campaign', 'ad_group', 'ad']),
    'campaign.name': definition('campaign.name', 'string', nameOperators, allResources, ['campaign', 'ad_group', 'ad']),
    'campaign.state': definition('campaign.state', 'string', stringEqualityOperators, allResources, ['campaign']),
    'campaign.deliveryStatus': definition('campaign.deliveryStatus', 'string', stringEqualityOperators, allResources, ['campaign']),
    'campaign.dailyBudget': definition('campaign.dailyBudget', 'number', numericOperators, allResources, ['campaign']),
    'campaign.targetingMode': definition('campaign.targetingMode', 'string', stringEqualityOperators, allResources),
    'campaign.bidStrategy': definition('campaign.bidStrategy', 'string', stringEqualityOperators, allResources),
    'campaign.startDate': definition('campaign.startDate', 'date', dateOperators, allResources),
    'campaign.endDate': definition('campaign.endDate', 'date', dateOperators, allResources),
    'adGroup.id': definition('adGroup.id', 'string', stringEqualityOperators, childResources, ['ad_group', 'ad']),
    'adGroup.name': definition('adGroup.name', 'string', nameOperators, childResources, ['ad_group', 'ad']),
    'adGroup.state': definition('adGroup.state', 'string', stringEqualityOperators, childResources, ['ad_group']),
    'adGroup.deliveryStatus': definition('adGroup.deliveryStatus', 'string', stringEqualityOperators, childResources, ['ad_group']),
    'adGroup.defaultBid': definition('adGroup.defaultBid', 'number', numericOperators, childResources, ['ad_group']),
    'ad.id': definition('ad.id', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.state': definition('ad.state', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.deliveryStatus': definition('ad.deliveryStatus', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.asin': definition('ad.asin', 'string', stringEqualityOperators, adResource, ['ad']),
    'ad.productTitle': definition('ad.productTitle', 'string', nameOperators, adResource, ['ad']),
    'ad.type': definition('ad.type', 'string', stringEqualityOperators, adResource),
    'metrics.impressions': definition('metrics.impressions', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.clicks': definition('metrics.clicks', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.spend': definition('metrics.spend', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.orders': definition('metrics.orders', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.sales': definition('metrics.sales', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.acos': definition('metrics.acos', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.cpc': definition('metrics.cpc', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.ctr': definition('metrics.ctr', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.roas': definition('metrics.roas', 'number', numericOperators, allResources, ['campaign', 'ad_group', 'ad'], { performance: true }),
    'metrics.cvr': definition('metrics.cvr', 'number', numericOperators, allResources, [], { performance: true }),
    'segments.date': definition('segments.date', 'date', dateOperators, allResources, [], { performance: true, segment: true }),
    'segments.hour': definition('segments.hour', 'number', numericOperators, childResources, [], { performance: true, segment: true }),
    'segments.placement': definition('segments.placement', 'string', stringEqualityOperators, ['campaign'], [], { performance: true, segment: true }),
};

export const CAMPAIGN_DEFAULT_FIELDS = CAMPAIGN_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('campaign')) as CampaignSearchField[];
export const AD_GROUP_DEFAULT_FIELDS = AD_GROUP_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('ad_group')) as AdGroupSearchField[];
export const AD_DEFAULT_FIELDS = AD_SEARCH_FIELDS.filter(field => searchFieldRegistry[field].defaultResources.includes('ad')) as AdSearchField[];

export const getSearchField = (field: string) => (Object.hasOwn(searchFieldRegistry, field) ? searchFieldRegistry[field as SearchField] : undefined);

export const getSearchDefaultFields = (resource: SearchResource) => (resource === 'campaign' ? CAMPAIGN_DEFAULT_FIELDS : resource === 'ad_group' ? AD_GROUP_DEFAULT_FIELDS : AD_DEFAULT_FIELDS);

export const isSearchFieldCompatible = (resource: SearchResource, field: string) => getSearchField(field)?.compatibleResources.includes(resource) ?? false;

export const isSearchPerformanceField = (field: string) => getSearchField(field)?.performance ?? false;

export const isSearchSegmentField = (field: string) => getSearchField(field)?.segment ?? false;

export const isSearchHourSegmentField = (field: string) => field === 'segments.hour';

export const campaignSearchFieldRegistry = Object.fromEntries(CAMPAIGN_SEARCH_FIELDS.map(field => [field, searchFieldRegistry[field]])) as Readonly<Record<CampaignSearchField, SearchFieldDefinition>>;

export const getCampaignSearchField = (field: string) => (Object.hasOwn(campaignSearchFieldRegistry, field) ? campaignSearchFieldRegistry[field as CampaignSearchField] : undefined);

export const isCampaignPerformanceField = (field: string) => campaignSearchFieldRegistry[field as CampaignSearchField]?.performance ?? false;

export const isCampaignSegmentField = (field: string) => campaignSearchFieldRegistry[field as CampaignSearchField]?.segment ?? false;

export const isCampaignPlacementSegmentField = (field: string) => field === 'segments.placement';
