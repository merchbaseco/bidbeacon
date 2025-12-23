import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogTrigger } from '../../../components/ui/dialog';
import type { ReportDatasetMetadata } from '../../hooks/use-reports';

export function ErrorDialog({ row, children }: { row: ReportDatasetMetadata; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (row.error) {
            await navigator.clipboard.writeText(row.error);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger disabled={!row.error}>{children}</DialogTrigger>
            <DialogPopup className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Error Details</DialogTitle>
                    <DialogDescription>Error message for this report dataset</DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    <div className="rounded-lg border bg-muted/50 p-4">
                        <pre className="overflow-auto text-sm whitespace-pre-wrap break-words">
                            <code>{row.error}</code>
                        </pre>
                    </div>
                </DialogPanel>
                <DialogFooter>
                    <Button variant="outline" onClick={handleCopy}>
                        {copied ? 'Copied!' : 'Copy Error'}
                    </Button>
                    <DialogClose>
                        <Button>Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
