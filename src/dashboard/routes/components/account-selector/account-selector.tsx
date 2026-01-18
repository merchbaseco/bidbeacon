import { HugeiconsIcon } from '@hugeicons/react';
import CircleIcon from '@merchbaseco/icons/core-solid-rounded/CircleIcon';
import CircleIconStroke from '@merchbaseco/icons/core-stroke-rounded/CircleIcon';
import { useSelectedAccount } from '../../hooks/use-selected-account';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../../../components/ui/select';

export function AccountSelector() {
    const { selectOptions, selectedRow, selectedValue, isLoading, error, handleValueChange } = useSelectedAccount();

    return (
        <div className="flex items-center justify-between gap-4">
            <Select value={selectedValue} onValueChange={handleValueChange} disabled={isLoading || !!error || !selectOptions.length}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue>
                        {_v =>
                            selectedRow ? (
                                <span className="flex items-center gap-1 font-mono text-sm">
                                    <span>{selectedRow.accountName}</span>
                                    <span className="bg-muted rounded-sm px-1 py-0.5 inline-flex">{selectedRow.countryCode}</span>
                                </span>
                            ) : (
                                <div className="text-muted-foreground font-mono text-sm py-0.5">Select account / marketplace</div>
                            )
                        }
                    </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {selectOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                            <span className="flex items-center gap-2 font-mono text-sm">
                                <HugeiconsIcon
                                    icon={option.enabled ? CircleIcon : CircleIconStroke}
                                    size={16}
                                    className={option.enabled ? 'text-green-600 dark:text-green-500' : 'text-neutral-400 dark:text-neutral-500'}
                                />
                                <span>{option.accountName}</span>
                                <span className="bg-muted rounded-sm px-0.5 py-px inline-flex">{option.countryCode}</span>
                            </span>
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
        </div>
    );
}
