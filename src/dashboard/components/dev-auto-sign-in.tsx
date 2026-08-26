import { useSignIn } from '@clerk/clerk-react';
import { useEffect, useRef } from 'react';
import { apiBaseUrl } from '../router';

/**
 * Signs the dashboard in as the shared Merchbase Dev Sign-In user on load.
 *
 * A cloud agent opening a fresh VM has no password to type, and the seeded week
 * behind the sign-in form is the whole point of the boot. This asks the server
 * for a one-minute Clerk ticket and exchanges it for a session.
 *
 * Rendered only inside `<SignedOut>`, and compiled out of a production bundle:
 * `import.meta.env.DEV` is statically false in a `vite build`, so the fetch and
 * the ticket exchange are dead code the bundler drops. The server refuses the
 * endpoint independently — the two gates are deliberately not the same gate.
 *
 * The ticket is exchanged in memory and never written to the URL, so it cannot
 * end up in browser history, a referrer header, or a proxy access log.
 */
export const DevAutoSignIn = () => {
    const hasAttemptedRef = useRef(false);
    const { isLoaded, setActive, signIn } = useSignIn();

    useEffect(() => {
        if (!(import.meta.env.DEV && isLoaded && signIn && setActive)) {
            return;
        }
        if (hasAttemptedRef.current) {
            return;
        }
        hasAttemptedRef.current = true;

        signInWithDevTicket(signIn, setActive).catch(error => {
            console.error('[DevAutoSignIn] Unable to sign in automatically', error);
        });
    }, [isLoaded, setActive, signIn]);

    return null;
};

type SignInResource = NonNullable<ReturnType<typeof useSignIn>['signIn']>;
type SetActive = NonNullable<ReturnType<typeof useSignIn>['setActive']>;

const signInWithDevTicket = async (signIn: SignInResource, setActive: SetActive) => {
    const ticket = await requestDevTicket();
    if (!ticket) {
        return;
    }

    const attempt = await signIn.create({ strategy: 'ticket', ticket });
    if (attempt.status !== 'complete' || !attempt.createdSessionId) {
        console.error('[DevAutoSignIn] Clerk sign-in attempt did not complete', attempt.status);
        return;
    }

    await setActive({ session: attempt.createdSessionId });
};

const requestDevTicket = async () => {
    const response = await fetch(`${apiBaseUrl}/api/dev.createClerkSignInToken`, {
        body: JSON.stringify({ input: null }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
    });

    const payload = (await response.json()) as { result?: { data?: { ticket?: string } } };
    const ticket = payload.result?.data?.ticket;
    if (!(response.ok && ticket)) {
        // Not configured is the ordinary case on a machine that wants the sign-in
        // form, so this reports rather than throws.
        console.info('[DevAutoSignIn] No dev sign-in ticket available; showing the sign-in form.');
        return null;
    }

    return ticket;
};
