import { HugeiconsIcon } from '@hugeicons/react';
import SecondBracketSquareIcon from '@merchbaseco/icons/core-solid-rounded/SecondBracketSquareIcon';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogTrigger } from '../../../components/ui/dialog';
import { api } from '../../../lib/trpc.js';
import type { ReportDatasetMetadata } from '../../hooks/use-reports';

interface ReportIdDialogProps {
    row: ReportDatasetMetadata;
    accountId: string | null;
}

export function ReportIdDialog({ row, accountId }: ReportIdDialogProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const retrieveReportMutation = api.reports.retrieve.useMutation();

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen && !retrieveReportMutation.data && !retrieveReportMutation.isPending && accountId && row.reportId) {
            // Fetch data when dialog opens
            retrieveReportMutation.mutate({
                accountId,
                timestamp: row.periodStart,
                aggregation: row.aggregation as 'hourly' | 'daily',
                entityType: row.entityType as 'target' | 'product',
            });
        }
    };

    const handleCopy = async () => {
        const data = retrieveReportMutation.data;
        const error = retrieveReportMutation.error;
        const text = error ? JSON.stringify({ error: error.message }, null, 2) : JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const data = retrieveReportMutation.data;
    const error = retrieveReportMutation.error?.message;

    return (
        <Dialog onOpenChange={handleOpenChange} open={open}>
            <DialogTrigger>
                <Button size="sm" variant="secondary">
                    <HugeiconsIcon icon={SecondBracketSquareIcon} size={16} />
                    Report_{row.reportId ? row.reportId.slice(-6) : ''}
                </Button>
            </DialogTrigger>
            <DialogPopup className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Retrieve Report Response</DialogTitle>
                    <DialogDescription>{error ? 'Error response from Amazon Ads API' : 'Response from Amazon Ads API'}</DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    <div className="rounded-lg border bg-muted/50 p-4">
                        {retrieveReportMutation.isPending ? (
                            <div className="text-muted-foreground text-sm">Loading...</div>
                        ) : (
                            <pre className="overflow-auto text-sm">
                                <code>{error ? JSON.stringify({ error }, null, 2) : JSON.stringify(data, null, 2)}</code>
                            </pre>
                        )}
                    </div>
                </DialogPanel>
                <DialogFooter>
                    <Button disabled={retrieveReportMutation.isPending} onClick={handleCopy} variant="outline">
                        {copied ? 'Copied!' : 'Copy JSON'}
                    </Button>
                    <DialogClose>
                        <Button>Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
