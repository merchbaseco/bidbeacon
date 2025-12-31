import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '../../components/ui/dialog';

interface ReportResponseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    data: unknown;
    error?: string | null;
}

export function ReportResponseDialog({ open, onOpenChange, title, data, error }: ReportResponseDialogProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const text = error ? JSON.stringify({ error }, null, 2) : JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogPopup className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{error ? 'Error response from Amazon Ads API' : 'Response from Amazon Ads API'}</DialogDescription>
                </DialogHeader>
                <DialogPanel>
                    <div className="rounded-lg border bg-muted/50 p-4">
                        <pre className="overflow-auto text-sm">
                            <code>{error ? JSON.stringify({ error }, null, 2) : JSON.stringify(data, null, 2)}</code>
                        </pre>
                    </div>
                </DialogPanel>
                <DialogFooter>
                    <Button variant="outline" onClick={handleCopy}>
                        {copied ? 'Copied!' : 'Copy JSON'}
                    </Button>
                    <Button onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
