import { Card } from '../../components/Card';

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle: string;
}

export function StatCard({ title, value, subtitle }: StatCardProps) {
    return (
        <Card>
            <h3>{title}</h3>
            <p>{value}</p>
            <p>{subtitle}</p>
        </Card>
    );
}
