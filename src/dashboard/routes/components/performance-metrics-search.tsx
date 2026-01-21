import { useDeferredValue, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Search01Icon from '@merchbaseco/icons/core-solid-rounded/Search01Icon';
import Flag01Icon from '@merchbaseco/icons/core-solid-rounded/Flag01Icon';
import Megaphone01Icon from '@merchbaseco/icons/core-solid-rounded/Megaphone01Icon';
import Target01Icon from '@merchbaseco/icons/core-solid-rounded/Target01Icon';
import { useAtom } from 'jotai';
import { Combobox, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPopup, ComboboxStatus } from '../../components/ui/combobox';
import { Tabs, TabsList, TabsTab } from '../../components/ui/tabs';
import { usePerformanceEntitySearch } from '../hooks/use-performance-entity-search';
import { entityFiltersAtom, searchInputAtom } from './performance-metrics-atoms';

const PerformanceMetricsSearch = ({ accountId }: { accountId: string }) => {
    const [searchInput, setSearchInput] = useAtom(searchInputAtom);
    const [entityFilters, setEntityFilters] = useAtom(entityFiltersAtom);
    const deferredSearchInput = useDeferredValue(searchInput);

    const {
        results: searchResults,
        isFetching: isSearching,
        shouldSearch,
    } = usePerformanceEntitySearch({
        accountId: accountId!,
        query: deferredSearchInput,
    });

    const searchResultsWithValues = searchResults.map(result => ({
        ...result,
        value: `${result.type}:${result.id}`,
    }));

    const availableSearchResults = searchResultsWithValues.filter(result => !entityFilters.some(filter => filter.type === result.type && filter.id === result.id));

    const groupedSearchResults = {
        campaigns: availableSearchResults.filter(result => result.type === 'campaign'),
        ads: availableSearchResults.filter(result => result.type === 'ad'),
        targets: availableSearchResults.filter(result => result.type === 'target'),
    };

    const searchResultsCount = availableSearchResults.length;
    const totalSearchResultsCount = searchResultsWithValues.length;
    const campaignCount = groupedSearchResults.campaigns.length;
    const adCount = groupedSearchResults.ads.length;
    const targetCount = groupedSearchResults.targets.length;
    const firstTabWithResults = campaignCount > 0 ? 'campaigns' : adCount > 0 ? 'ads' : targetCount > 0 ? 'targets' : 'campaigns';
    const [activeTab, setActiveTab] = useState<'campaigns' | 'ads' | 'targets'>(firstTabWithResults);
    const searchStatusLabel = isSearching
        ? 'Searching...'
        : shouldSearch
          ? `${searchResultsCount} result${searchResultsCount === 1 ? '' : 's'}`
          : 'Type at least 2 characters to search';
    const searchEmptyTitle = !shouldSearch ? 'Start typing to search' : totalSearchResultsCount === 0 ? 'No matches yet' : 'All matches already added';
    const searchEmptyHint = !shouldSearch
        ? 'Campaigns, ads, and targets will appear here.'
        : totalSearchResultsCount === 0
          ? 'Try a campaign name, ad ASIN, or target keyword.'
          : 'Clear a filter to add another result.';

    useEffect(() => {
        if (!shouldSearch) {
            if (activeTab !== 'campaigns') {
                setActiveTab('campaigns');
            }
            return;
        }
        const activeCount = activeTab === 'campaigns' ? campaignCount : activeTab === 'ads' ? adCount : targetCount;
        if (activeCount === 0 && activeTab !== firstTabWithResults) {
            setActiveTab(firstTabWithResults);
        }
    }, [shouldSearch, activeTab, campaignCount, adCount, targetCount, firstTabWithResults]);

    const tabConfig = {
        campaigns: {
            label: 'Campaigns',
            icon: Flag01Icon,
            badgeClass: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-400',
            count: campaignCount,
        },
        ads: {
            label: 'Ads',
            icon: Megaphone01Icon,
            badgeClass: 'border-sky-500/25 bg-sky-500/12 text-sky-400',
            count: adCount,
        },
        targets: {
            label: 'Targets',
            icon: Target01Icon,
            badgeClass: 'border-amber-500/25 bg-amber-500/12 text-amber-400',
            count: targetCount,
        },
    };

    const activeResults = activeTab === 'campaigns' ? groupedSearchResults.campaigns : activeTab === 'ads' ? groupedSearchResults.ads : groupedSearchResults.targets;
    const activeConfig = tabConfig[activeTab];

    return (
        <div className="max-w-background-frame-max mx-auto px-4 mt-6">
            <Combobox
                value={null}
                onValueChange={value => {
                    if (!value) return;
                    const selected = availableSearchResults.find(result => result.value === value);
                    if (!selected) return;

                    setEntityFilters(current => {
                        if (current.some(filter => filter.type === selected.type && filter.id === selected.id)) {
                            return current;
                        }
                        return [
                            ...current,
                            {
                                type: selected.type,
                                id: selected.id,
                                label: selected.label,
                                description: selected.description,
                            },
                        ];
                    });

                    setSearchInput('');
                }}
                inputValue={searchInput}
                onInputValueChange={(value, eventDetails) => {
                    if (!['input-change', 'input-clear', 'input-paste'].includes(eventDetails.reason)) {
                        return;
                    }
                    setSearchInput(value);
                }}
                autoHighlight
            >
                <div className="relative">
                    <HugeiconsIcon icon={Search01Icon} size={18} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <ComboboxInput placeholder="Search by campaign name, ad ASIN, or target keyword..." size="lg" showTrigger={false} className="text-base *:data-[slot=input]:ps-12 pl-8" />
                </div>
                <ComboboxPopup sideOffset={8}>
                    <ComboboxStatus className="flex items-center border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                        {searchStatusLabel}
                    </ComboboxStatus>
                    {shouldSearch && totalSearchResultsCount > 0 ? (
                        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)} className="border-b border-border/60 px-3 pt-2 pb-2">
                            <TabsList variant="underline" className="w-full justify-start gap-2 bg-transparent p-0 text-muted-foreground/80">
                                {(Object.keys(tabConfig) as Array<keyof typeof tabConfig>).map(key => {
                                    const option = tabConfig[key];
                                    return (
                                        <TabsTab
                                            key={key}
                                            value={key}
                                            disabled={option.count === 0}
                                            className="gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] data-disabled:opacity-40"
                                        >
                                            <span className={`flex size-5 items-center justify-center rounded border ${option.badgeClass}`}>
                                                <HugeiconsIcon icon={option.icon} size={12} />
                                            </span>
                                            <span>{option.label}</span>
                                            <span className="text-[11px] text-muted-foreground/70">{option.count}</span>
                                        </TabsTab>
                                    );
                                })}
                            </TabsList>
                        </Tabs>
                    ) : null}
                    <ComboboxList>
                        {activeResults.map(result => (
                            <ComboboxItem
                                key={result.value}
                                value={result.value}
                                className="grid-cols-[0_1fr] gap-0 py-2 ps-2 [&_[data-slot=combobox-item-indicator]]:hidden"
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 flex size-8 items-center justify-center rounded-md border ${activeConfig.badgeClass}`}>
                                        <HugeiconsIcon icon={activeConfig.icon} size={16} />
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm font-medium text-foreground/90">{result.label}</span>
                                        {result.description ? <span className="text-xs text-muted-foreground">{result.description}</span> : null}
                                    </div>
                                </div>
                            </ComboboxItem>
                        ))}
                    </ComboboxList>
                    {availableSearchResults.length === 0 ? (
                        <ComboboxEmpty className="px-4 py-6">
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="flex size-11 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground">
                                    <HugeiconsIcon icon={Search01Icon} size={18} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground/90">{searchEmptyTitle}</p>
                                    <p className="text-xs text-muted-foreground">{searchEmptyHint}</p>
                                </div>
                            </div>
                        </ComboboxEmpty>
                    ) : null}
                </ComboboxPopup>
            </Combobox>
        </div>
    );
};

export { PerformanceMetricsSearch };
