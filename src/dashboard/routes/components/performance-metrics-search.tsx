import { useDeferredValue } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Search01Icon from '@merchbaseco/icons/core-solid-rounded/Search01Icon';
import { useAtom } from 'jotai';
import { Combobox, ComboboxEmpty, ComboboxGroup, ComboboxGroupLabel, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPopup, ComboboxStatus } from '../../components/ui/combobox';
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
    const searchStatusLabel = isSearching ? 'Searching...' : shouldSearch ? `${searchResultsCount} result${searchResultsCount === 1 ? '' : 's'}` : 'Type at least 2 characters to search';
    const searchEmptyLabel = shouldSearch ? 'No matches found.' : 'Start typing to search campaigns, ads, and targets.';

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
                    <HugeiconsIcon icon={Search01Icon} size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <ComboboxInput placeholder="Search by campaign name, ad ASIN, or target keyword..." size="lg" showTrigger={false} className="text-base *:data-[slot=input]:ps-12 pl-8" />
                </div>
                <ComboboxPopup sideOffset={8}>
                    <ComboboxStatus>{searchStatusLabel}</ComboboxStatus>
                    <ComboboxList>
                        {groupedSearchResults.campaigns.length > 0 ? (
                            <ComboboxGroup>
                                <ComboboxGroupLabel>Campaigns</ComboboxGroupLabel>
                                {groupedSearchResults.campaigns.map(result => (
                                    <ComboboxItem key={result.value} value={result.value}>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-medium">{result.label}</span>
                                            {result.description ? <span className="text-xs text-muted-foreground">{result.description}</span> : null}
                                        </div>
                                    </ComboboxItem>
                                ))}
                            </ComboboxGroup>
                        ) : null}
                        {groupedSearchResults.ads.length > 0 ? (
                            <ComboboxGroup>
                                <ComboboxGroupLabel>Ads</ComboboxGroupLabel>
                                {groupedSearchResults.ads.map(result => (
                                    <ComboboxItem key={result.value} value={result.value}>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-medium">{result.label}</span>
                                            {result.description ? <span className="text-xs text-muted-foreground">{result.description}</span> : null}
                                        </div>
                                    </ComboboxItem>
                                ))}
                            </ComboboxGroup>
                        ) : null}
                        {groupedSearchResults.targets.length > 0 ? (
                            <ComboboxGroup>
                                <ComboboxGroupLabel>Targets</ComboboxGroupLabel>
                                {groupedSearchResults.targets.map(result => (
                                    <ComboboxItem key={result.value} value={result.value}>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-medium">{result.label}</span>
                                            {result.description ? <span className="text-xs text-muted-foreground">{result.description}</span> : null}
                                        </div>
                                    </ComboboxItem>
                                ))}
                            </ComboboxGroup>
                        ) : null}
                    </ComboboxList>
                    <ComboboxEmpty>{searchEmptyLabel}</ComboboxEmpty>
                </ComboboxPopup>
            </Combobox>
        </div>
    );
};

export { PerformanceMetricsSearch };
