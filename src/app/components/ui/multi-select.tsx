"use client";

import * as React from "react";
import { ChevronsUpDown, Loader2, Plus, X } from "lucide-react";

import { cn } from "./utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface MultiSelectOption {
  value: string;
  label: string;
  // Дополнительные слова для поиска (например, синонимы, артикул), не
  // показываются, но участвуют в фильтрации cmdk.
  keywords?: string[];
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  // Кастомный рендер строки в выпадающем списке (например, с бейджем
  // статуса) — по умолчанию просто label.
  renderOption?: (option: MultiSelectOption, isSelected: boolean) => React.ReactNode;
  // Включает строку "+ Добавить «…»" в конце списка, когда введённый текст
  // не совпадает ни с одним существующим option — позволяет создать новый
  // вариант, не выходя из комбобокса. Должен: создать сущность, добавить её
  // в options на стороне вызывающего (иначе выбранный чип не сможет
  // показать label) и вернуть созданный option. Бросает Error с
  // человекочитаемым сообщением при ошибке — оно показывается инлайн рядом
  // со строкой создания.
  onCreateOption?: (inputValue: string) => Promise<MultiSelectOption>;
  createOptionLabel?: (inputValue: string) => string;
}

// Стандартный шаблон shadcn multi-select combobox поверх command + popover +
// checkbox: без ограничения на количество выбранных элементов, выбранные
// значения показываются чипами на самом триггере.
export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = "Выберите…",
  searchPlaceholder = "Поиск…",
  emptyText = "Ничего не найдено",
  disabled,
  className,
  renderOption,
  onCreateOption,
  createOptionLabel = (inputValue) => `+ Добавить «${inputValue}»`,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const selectedOptions = React.useMemo(
    () => options.filter((option) => selectedSet.has(option.value)),
    [options, selectedSet],
  );

  const trimmedSearch = search.trim();
  // Совпадение по точному названию (без учёта регистра) — если такой товар
  // уже есть в каталоге, предлагать создать дубликат смысла нет, его и так
  // можно выбрать из списка выше.
  const hasExactMatch = React.useMemo(
    () =>
      options.some(
        (option) => option.label.trim().toLowerCase() === trimmedSearch.toLowerCase(),
      ),
    [options, trimmedSearch],
  );
  const showCreateOption = Boolean(onCreateOption) && trimmedSearch.length > 0 && !hasExactMatch;

  const handleCreateOption = async () => {
    if (!onCreateOption || creating || !trimmedSearch) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreateOption(trimmedSearch);
      onChange([...selected, created.value]);
      setSearch("");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Не удалось создать");
    } finally {
      setCreating(false);
    }
  };

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const removeValue = (value: string, event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch("");
          setCreateError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full justify-between gap-2 px-3 py-2 font-normal",
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 overflow-hidden">
            {selectedOptions.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedOptions.map((option) => (
                <Badge key={option.value} variant="secondary" className="gap-1 pr-1">
                  <span className="max-w-[10rem] truncate">{option.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Убрать «${option.label}»`}
                    onClick={(event) => removeValue(option.value, event)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        removeValue(option.value, event);
                      }
                    }}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              setCreateError(null);
            }}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={[option.label, ...(option.keywords ?? [])].join(" ")}
                    onSelect={() => toggleValue(option.value)}
                    className="gap-2"
                  >
                    <Checkbox checked={isSelected} className="pointer-events-none" />
                    {renderOption ? (
                      renderOption(option, isSelected)
                    ) : (
                      <span className="truncate">{option.label}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {showCreateOption && (
              // forceMount на группе и на пункте: без этого cmdk скрывает их
              // тем же фильтром по совпадению текста, что и обычные опции —
              // а текст "+ Добавить «…»" сам никогда не совпадёт с search.
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={`__create__${trimmedSearch}`}
                  disabled={creating}
                  onSelect={() => void handleCreateOption()}
                  className="gap-2 text-primary"
                >
                  {creating ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <Plus className="size-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {creating ? `Создаём «${trimmedSearch}»…` : createOptionLabel(trimmedSearch)}
                  </span>
                </CommandItem>
                {createError && (
                  <p className="px-3 pb-2 pt-1 text-xs text-destructive">{createError}</p>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
