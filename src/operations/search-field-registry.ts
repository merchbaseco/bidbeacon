export const SEARCH_OPERATORS = ['eq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte'] as const;

export type SearchOperator = (typeof SEARCH_OPERATORS)[number];
export type SearchFieldValueKind = 'date' | 'number' | 'string';

export const CAMPAIGN_SEARCH_FIELDS = [
    'campaign.id',
    'campaign.name',
    'campaign.state',
    'campaign.deliveryStatus',
    'campaign.dailyBudget',
    'campaign.targetingMode',
    'campaign.bidStrategy',
    'campaign.startDate',
    'campaign.endDate',
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
    'segments.date',
] as const;

export type CampaignSearchField = (typeof CAMPAIGN_SEARCH_FIELDS)[number];

export type SearchFieldDefinition = {
    field: CampaignSearchField;
    kind: SearchFieldValueKind;
    filterOperators: readonly SearchOperator[];
    default: boolean;
    performance: boolean;
    segment: boolean;
};

const stringEqualityOperators = ['eq', 'in'] as const satisfies readonly SearchOperator[];
const nameOperators = ['eq', 'in', 'contains'] as const satisfies readonly SearchOperator[];
const numericOperators = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const satisfies readonly SearchOperator[];
const dateOperators = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const satisfies readonly SearchOperator[];

export const campaignSearchFieldRegistry: Readonly<Record<CampaignSearchField, SearchFieldDefinition>> = {
    'campaign.id': { field: 'campaign.id', kind: 'string', filterOperators: stringEqualityOperators, default: true, performance: false, segment: false },
    'campaign.name': { field: 'campaign.name', kind: 'string', filterOperators: nameOperators, default: true, performance: false, segment: false },
    'campaign.state': { field: 'campaign.state', kind: 'string', filterOperators: stringEqualityOperators, default: true, performance: false, segment: false },
    'campaign.deliveryStatus': { field: 'campaign.deliveryStatus', kind: 'string', filterOperators: stringEqualityOperators, default: true, performance: false, segment: false },
    'campaign.dailyBudget': { field: 'campaign.dailyBudget', kind: 'number', filterOperators: numericOperators, default: true, performance: false, segment: false },
    'campaign.targetingMode': { field: 'campaign.targetingMode', kind: 'string', filterOperators: stringEqualityOperators, default: false, performance: false, segment: false },
    'campaign.bidStrategy': { field: 'campaign.bidStrategy', kind: 'string', filterOperators: stringEqualityOperators, default: false, performance: false, segment: false },
    'campaign.startDate': { field: 'campaign.startDate', kind: 'date', filterOperators: dateOperators, default: false, performance: false, segment: false },
    'campaign.endDate': { field: 'campaign.endDate', kind: 'date', filterOperators: dateOperators, default: false, performance: false, segment: false },
    'metrics.impressions': { field: 'metrics.impressions', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.clicks': { field: 'metrics.clicks', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.spend': { field: 'metrics.spend', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.orders': { field: 'metrics.orders', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.sales': { field: 'metrics.sales', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.acos': { field: 'metrics.acos', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.cpc': { field: 'metrics.cpc', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.ctr': { field: 'metrics.ctr', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.roas': { field: 'metrics.roas', kind: 'number', filterOperators: numericOperators, default: true, performance: true, segment: false },
    'metrics.cvr': { field: 'metrics.cvr', kind: 'number', filterOperators: numericOperators, default: false, performance: true, segment: false },
    'segments.date': { field: 'segments.date', kind: 'date', filterOperators: dateOperators, default: false, performance: true, segment: true },
};

export const CAMPAIGN_DEFAULT_FIELDS = CAMPAIGN_SEARCH_FIELDS.filter(field => campaignSearchFieldRegistry[field].default) as CampaignSearchField[];

export const getCampaignSearchField = (field: string) => (Object.hasOwn(campaignSearchFieldRegistry, field) ? campaignSearchFieldRegistry[field as CampaignSearchField] : undefined);

export const isCampaignPerformanceField = (field: string) => campaignSearchFieldRegistry[field as CampaignSearchField]?.performance ?? false;

export const isCampaignSegmentField = (field: string) => campaignSearchFieldRegistry[field as CampaignSearchField]?.segment ?? false;
