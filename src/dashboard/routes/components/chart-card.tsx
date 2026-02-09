import { Card } from '@/dashboard/components/ui/card';
import type { LegendItem } from '@/dashboard/lib/chart-constants';

export const ChartCard = ({ title, legendItems, children }: { title: string; legendItems: LegendItem[]; children: React.ReactNode }) => {
    return (
        <Card className="overflow-visible p-2 pb-0">
            <div className="flex items-start justify-between p-2 pb-0">
                <div className="font-medium text-sm tracking-tight">{title}</div>
                <div className="flex items-center gap-4">
                    {legendItems.map(item => (
                        <div className="flex items-center gap-1" key={item.label}>
                            {item.color === 'rainbow' ? (
                                <div
                                    className="size-2.5 rounded-full"
                                    style={{
                                        background: 'conic-gradient(#F59E0B 0deg 90deg, #10B981 90deg 180deg, #3B82F6 180deg 270deg, #8B5CF6 270deg 360deg)',
                                    }}
                                />
                            ) : (
                                <div className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
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
