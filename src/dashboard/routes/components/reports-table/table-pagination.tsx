import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '../../../components/ui/pagination';
import { cn } from '../../../lib/utils.js';

type TablePaginationProps = {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

export const TablePagination = ({
    currentPage,
    totalPages,
    onPageChange,
}: TablePaginationProps) => {
    const renderPaginationItems = () => {
        const items = [];
        const maxVisiblePages = 5;

        if (totalPages <= maxVisiblePages) {
            // Show all pages if total pages is less than max visible
            for (let i = 1; i <= totalPages; i++) {
                items.push(
                    <PaginationItem key={i}>
                        <PaginationLink
                            isActive={i === currentPage}
                            onClick={e => {
                                e.preventDefault();
                                onPageChange(i);
                            }}
                        >
                            {i}
                        </PaginationLink>
                    </PaginationItem>
                );
            }
        } else {
            // Show first page
            items.push(
                <PaginationItem key={1}>
                    <PaginationLink
                        isActive={1 === currentPage}
                        onClick={e => {
                            e.preventDefault();
                            onPageChange(1);
                        }}
                    >
                        1
                    </PaginationLink>
                </PaginationItem>
            );

            // Calculate start and end of visible range
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            // Adjust if we're near the start
            if (currentPage <= 3) {
                end = Math.min(4, totalPages - 1);
            }

            // Adjust if we're near the end
            if (currentPage >= totalPages - 2) {
                start = Math.max(2, totalPages - 3);
            }

            // Add ellipsis before if needed
            if (start > 2) {
                items.push(
                    <PaginationItem key="ellipsis-start">
                        <PaginationEllipsis />
                    </PaginationItem>
                );
            }

            // Add visible pages
            for (let i = start; i <= end; i++) {
                items.push(
                    <PaginationItem key={i}>
                        <PaginationLink
                            isActive={i === currentPage}
                            onClick={e => {
                                e.preventDefault();
                                onPageChange(i);
                            }}
                        >
                            {i}
                        </PaginationLink>
                    </PaginationItem>
                );
            }

            // Add ellipsis after if needed
            if (end < totalPages - 1) {
                items.push(
                    <PaginationItem key="ellipsis-end">
                        <PaginationEllipsis />
                    </PaginationItem>
                );
            }

            // Show last page
            items.push(
                <PaginationItem key={totalPages}>
                    <PaginationLink
                        isActive={totalPages === currentPage}
                        onClick={e => {
                            e.preventDefault();
                            onPageChange(totalPages);
                        }}
                    >
                        {totalPages}
                    </PaginationLink>
                </PaginationItem>
            );
        }

        return items;
    };

    return (
        <Pagination className="justify-end">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        onClick={e => {
                            e.preventDefault();
                            onPageChange(Math.max(1, currentPage - 1));
                        }}
                        className={cn(
                            currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer',
                            '[&>span]:hidden'
                        )}
                    />
                </PaginationItem>
                {renderPaginationItems()}
                <PaginationItem>
                    <PaginationNext
                        onClick={e => {
                            e.preventDefault();
                            onPageChange(Math.min(totalPages, currentPage + 1));
                        }}
                        className={cn(
                            currentPage === totalPages
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer',
                            '[&>span]:hidden'
                        )}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
};

