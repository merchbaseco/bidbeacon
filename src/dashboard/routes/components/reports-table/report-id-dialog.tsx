import { useState } from 'react';
import { Badge } from '../../../components/ui/badge';
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
        if (newOpen && !retrieveReportMutation.data && !retrieveReportMutation.isPending) {
            // Fetch data when dialog opens
            if (accountId && row.reportId) {
                retrieveReportMutation.mutate({
                    accountId,
                    timestamp: row.periodStart,
                    aggregation: row.aggregation,
                    entityType: row.entityType,
                });
            }
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
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                    {row.reportId}
                </Badge>
            </DialogTrigger>
            <DialogPopup className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Retrieve Report Response</DialogTitle>
                    <DialogDescription>{error ? 'Error response from Amazon Ads API' : 'Response from Amazon Ads API'}</DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    <div className="rounded-lg border bg-muted/50 p-4">
                        {retrieveReportMutation.isPending ? (
                            <div className="text-sm text-muted-foreground">Loading...</div>
                        ) : (
                            <pre className="overflow-auto text-sm">
                                <code>{error ? JSON.stringify({ error }, null, 2) : JSON.stringify(data, null, 2)}</code>
                            </pre>
                        )}
                    </div>
                </DialogPanel>
                <DialogFooter>
                    <Button variant="outline" onClick={handleCopy} disabled={retrieveReportMutation.isPending}>
                        {copied ? 'Copied!' : 'Copy JSON'}
                    </Button>
                    <DialogClose asChild>
                        <Button>Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}

