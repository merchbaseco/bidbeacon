import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 768px)';

export const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const media = window.matchMedia(MOBILE_QUERY);
        const handler = () => setIsMobile(media.matches);
        handler();
        media.addEventListener('change', handler);
        return () => media.removeEventListener('change', handler);
    }, []);

    return isMobile;
};
