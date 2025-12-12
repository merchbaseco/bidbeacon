import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from '../../components/ui/select';

type TableResultsRangeProps = {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalResults: number;
    onPageChange: (page: number) => void;
};

export const TableResultsRange = ({
    currentPage,
    totalPages,
    pageSize,
    totalResults,
    onPageChange,
}: TableResultsRangeProps) => {
    const getCurrentRange = () => {
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalResults);
        return `${start}-${end}`;
    };

    return (
        <div className="flex items-center gap-2 whitespace-nowrap">
            <p className="text-muted-foreground text-sm">Viewing</p>
            <Select
                onValueChange={value => {
                    onPageChange(Number(value));
                }}
                value={String(currentPage)}
            >
                <SelectTrigger
                    aria-label="Select result range"
                    className="w-fit min-w-none"
                    size="sm"
                >
                    <SelectValue>{getCurrentRange()}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {Array.from({ length: totalPages }, (_, i) => {
                        const pageNum = i + 1;
                        const start = i * pageSize + 1;
                        const end = Math.min((i + 1) * pageSize, totalResults);
                        return (
                            <SelectItem key={pageNum} value={String(pageNum)}>
                                {`${start}-${end}`}
                            </SelectItem>
                        );
                    })}
                </SelectPopup>
            </Select>
            <p className="text-muted-foreground text-sm">
                of <strong className="font-medium text-foreground">{totalResults}</strong> results
            </p>
        </div>
    );
};
