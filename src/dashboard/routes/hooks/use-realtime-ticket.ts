import { useCallback, useEffect, useState } from 'react';
import { apiBaseUrl } from '../../router';

type TicketResponse = {
    ticket?: unknown;
};

export const useRealtimeTicket = () => {
    const [ticket, setTicket] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setTicket(null);

        try {
            const response = await fetch(`${apiBaseUrl}/api/events/ticket`, {
                cache: 'no-store',
                credentials: 'same-origin',
                redirect: 'manual',
                headers: {
                    Accept: 'application/json',
                },
                method: 'POST',
            });
            if (!response.ok) {
                return null;
            }

            const payload = (await response.json()) as TicketResponse;
            if (typeof payload.ticket !== 'string' || payload.ticket.length === 0) {
                return null;
            }

            setTicket(payload.ticket);
            return payload.ticket;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        refresh().catch(() => undefined);
    }, [refresh]);

    return { refresh, ticket };
};
