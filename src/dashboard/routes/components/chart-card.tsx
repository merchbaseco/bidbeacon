import { Card } from '@/dashboard/components/ui/card';
import type { LegendItem } from '@/dashboard/lib/chart-constants';

export const ChartCard = ({ title, legendItems, children }: { title: string; legendItems: LegendItem[]; children: React.ReactNode }) => {
    return (
        <Card className="p-4 pb-0 overflow-visible">
            <div className="flex items-start justify-between">
                <div className="text-sm font-medium tracking-tight">{title}</div>
                <div className="flex items-center gap-4">
                    {legendItems.map(item => (
                        <div key={item.label} className="flex items-center gap-1">
                            {item.color === 'rainbow' ? (
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                        background: 'linear-gradient(90deg, #F59E0B, #10B981, #14B8A6, #3B82F6, #8B5CF6, #EF4444, #EC4899, #6366F1)',
                                    }}
                                />
                            ) : (
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                            )}
                            <div className="text-sm">{item.label}</div>
                        </div>
                    ))}
                </div>
            </div>
            {children}
        </Card>
    );
};
