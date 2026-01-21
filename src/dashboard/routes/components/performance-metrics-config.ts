export type MetricConfig = {
    key: 'impressions' | 'clicks' | 'orders' | 'spend' | 'acos';
    label: string;
    formatter: (value: number) => string;
    color?: string;
    isGood?: 'up' | 'down';
};

const METRICS: MetricConfig[] = [
    {
        key: 'clicks',
        label: 'Clicks',
        formatter: value => value.toLocaleString(),
        color: '#6366f1',
        isGood: 'up',
    },
    {
        key: 'orders',
        label: 'Orders',
        formatter: value => value.toLocaleString(),
        color: '#10b981',
        isGood: 'up',
    },
    {
        key: 'impressions',
        label: 'Impressions',
        formatter: value => value.toLocaleString(),
        isGood: 'up',
    },
    {
        key: 'spend',
        label: 'Spend',
        formatter: value => `$${value.toFixed(2)}`,
        isGood: 'down',
    },
    {
        key: 'acos',
        label: 'ACoS',
        formatter: value => `${value.toFixed(1)}%`,
        isGood: 'down',
    },
];

const PERIOD_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this_month', label: 'This month' },
    { value: 'this_year', label: 'This year' },
] as const;

const RANGE_OPTIONS = [
    { value: 'last_30_days', label: '30 days' },
    { value: 'last_6_months', label: '6 months' },
    { value: 'last_12_months', label: '12 months' },
    { value: 'all_time', label: 'All time' },
] as const;

const ALL_RANGE_OPTIONS = [...PERIOD_OPTIONS, ...RANGE_OPTIONS] as const;

type PerformanceRange = (typeof ALL_RANGE_OPTIONS)[number]['value'];

export { ALL_RANGE_OPTIONS, METRICS, PERIOD_OPTIONS, RANGE_OPTIONS, type PerformanceRange };
