import { HugeiconsIcon } from '@hugeicons/react';
import { CircleIcon } from '@hugeicons-pro/core-solid-rounded';
import { CircleIcon as CircleIconStroke } from '@hugeicons-pro/core-stroke-rounded';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { useSelectedAccount } from '../../hooks/use-selected-account';

export function AccountSelector() {
    const { selectOptions, selectedRow, selectedValue, isLoading, error, handleValueChange } = useSelectedAccount();

    return (
        <div className="flex items-center justify-between gap-4">
            <Select disabled={isLoading || !!error || !selectOptions.length} onValueChange={handleValueChange} value={selectedValue}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue>
                        {_v =>
                            selectedRow ? (
                                <span className="flex items-center gap-1 font-mono text-sm">
                                    <span>{selectedRow.accountName}</span>
                                    <span className="inline-flex rounded-sm bg-muted px-1 py-0.5">{selectedRow.countryCode}</span>
                                </span>
                            ) : (
                                <div className="py-0.5 font-mono text-muted-foreground text-sm">Select account / marketplace</div>
                            )
                        }
                    </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                    {selectOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                            <span className="flex items-center gap-2 font-mono text-sm">
                                <HugeiconsIcon
                                    className={option.enabled ? 'text-green-600 dark:text-green-500' : 'text-neutral-400 dark:text-neutral-500'}
                                    icon={option.enabled ? CircleIcon : CircleIconStroke}
                                    size={16}
                                />
                                <span>{option.accountName}</span>
                                <span className="inline-flex rounded-sm bg-muted px-0.5 py-px">{option.countryCode}</span>
                            </span>
                        </SelectItem>
                    ))}
                </SelectPopup>
            </Select>
        </div>
    );
}
