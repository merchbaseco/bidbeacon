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
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                            <div className="text-sm">{item.label}</div>
                        </div>
                    ))}
                </div>
            </div>
            {children}
        </Card>
    );
};
