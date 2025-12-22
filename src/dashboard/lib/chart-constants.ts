/**
 * Shared chart constants and types for dashboard components
 */

export type LegendItem = {
    label: string;
    value: string;
    color: string;
};

/**
 * Default color palette for chart legends
 * Can be cycled through using modulo when there are more items than colors
 */
export const LEGEND_COLORS = [
    '#F59E0B', // Amber/Orange
    '#10B981', // Green
    '#06B6D4', // Cyan
    '#3B82F6', // Blue
    '#8B5CF6', // Purple
    '#EF4444', // Red
    '#EC4899', // Pink
    '#6366F1', // Indigo
];
