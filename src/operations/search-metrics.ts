export type SearchMetricTotals = {
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    sales: number;
};

export const buildSearchMetricValues = (totals: SearchMetricTotals) => ({
    impressions: totals.impressions,
    clicks: totals.clicks,
    spend: roundMetric(totals.spend),
    orders: totals.orders,
    sales: roundMetric(totals.sales),
    acos: ratioAsPercentage(totals.spend, totals.sales),
    cpc: ratio(totals.spend, totals.clicks),
    ctr: ratioAsPercentage(totals.clicks, totals.impressions),
    roas: ratio(totals.sales, totals.spend),
    cvr: ratioAsPercentage(totals.orders, totals.clicks),
});

export const summarizeSearchMetrics = (rows: readonly { metricTotals?: SearchMetricTotals }[]) => {
    const totals = rows.reduce<SearchMetricTotals>(
        (summary, row) => ({
            impressions: summary.impressions + (row.metricTotals?.impressions ?? 0),
            clicks: summary.clicks + (row.metricTotals?.clicks ?? 0),
            spend: summary.spend + (row.metricTotals?.spend ?? 0),
            orders: summary.orders + (row.metricTotals?.orders ?? 0),
            sales: summary.sales + (row.metricTotals?.sales ?? 0),
        }),
        emptySearchMetrics()
    );
    const metrics = buildSearchMetricValues(totals);
    return {
        'metrics.impressions': metrics.impressions,
        'metrics.clicks': metrics.clicks,
        'metrics.spend': metrics.spend,
        'metrics.orders': metrics.orders,
        'metrics.sales': metrics.sales,
        'metrics.acos': metrics.acos,
        'metrics.cpc': metrics.cpc,
        'metrics.ctr': metrics.ctr,
        'metrics.roas': metrics.roas,
        'metrics.cvr': metrics.cvr,
    };
};

export const emptySearchMetrics = (): SearchMetricTotals => ({ impressions: 0, clicks: 0, spend: 0, orders: 0, sales: 0 });

const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : roundMetric(numerator / denominator));

const ratioAsPercentage = (numerator: number, denominator: number) => (denominator === 0 ? null : roundMetric((numerator / denominator) * 100));

const roundMetric = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
