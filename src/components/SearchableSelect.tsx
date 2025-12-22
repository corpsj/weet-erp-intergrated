"use client";

import { Combobox, Input, InputBase, ScrollArea, type InputBaseProps } from "@mantine/core";
import { useCombobox } from "@mantine/core";
import { useMemo, useState } from "react";

export type SearchableSelectItem = { value: string; label: string; disabled?: boolean };
export type SearchableSelectGroup = { group: string; items: SearchableSelectItem[] };
export type SearchableSelectData = SearchableSelectItem[] | SearchableSelectGroup[];

type Props = Omit<InputBaseProps, "value" | "onChange" | "children"> & {
  data: SearchableSelectData;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  nothingFoundMessage?: string;
  searchPlaceholder?: string;
  withinPortal?: boolean;
};

const isGrouped = (data: SearchableSelectData): data is SearchableSelectGroup[] => {
  return Array.isArray(data) && data.length > 0 && "group" in data[0] && "items" in data[0];
};

const findLabel = (data: SearchableSelectData, value: string | null) => {
  if (!value) return "";
  if (isGrouped(data)) {
    for (const group of data) {
      const found = group.items.find((item) => item.value === value);
      if (found) return found.label;
    }
    return "";
  }
  return data.find((item) => item.value === value)?.label ?? "";
};

export function SearchableSelect({
  data,
  value,
  onChange,
  placeholder,
  nothingFoundMessage = "검색 결과가 없습니다.",
  searchPlaceholder = "검색어 입력...",
  withinPortal = true,
  disabled,
  ...inputProps
}: Props) {
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });

  const selectedLabel = useMemo(() => findLabel(data, value), [data, value]);

  const filteredData = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return data;

    if (isGrouped(data)) {
      return data
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.label.toLowerCase().includes(keyword)),
        }))
        .filter((group) => group.items.length > 0);
    }
    return data.filter((item) => item.label.toLowerCase().includes(keyword));
  }, [data, search]);

  const hasOptions = useMemo(() => {
    if (isGrouped(filteredData)) return filteredData.some((group) => group.items.length > 0);
    return filteredData.length > 0;
  }, [filteredData]);

  return (
    <Combobox
      store={combobox}
      withinPortal={withinPortal}
      onOptionSubmit={(nextValue) => {
        onChange(nextValue);
        combobox.closeDropdown();
        setSearch("");
      }}
    >
      <Combobox.Target>
        <InputBase
          {...inputProps}
          component="button"
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            combobox.toggleDropdown();
          }}
          pointer
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
        >
          {selectedLabel ? (
            selectedLabel
          ) : (
            <Input.Placeholder>{placeholder ?? ""}</Input.Placeholder>
          )}
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder={searchPlaceholder}
        />

        <ScrollArea.Autosize mah={260} type="auto">
          <Combobox.Options>
            {!hasOptions && <Combobox.Empty>{nothingFoundMessage}</Combobox.Empty>}

            {isGrouped(filteredData)
              ? filteredData.map((group) => (
                  <Combobox.Group key={group.group} label={group.group}>
                    {group.items.map((item) => (
                      <Combobox.Option key={item.value} value={item.value} disabled={item.disabled}>
                        {item.label}
                      </Combobox.Option>
                    ))}
                  </Combobox.Group>
                ))
              : filteredData.map((item) => (
                  <Combobox.Option key={item.value} value={item.value} disabled={item.disabled}>
                    {item.label}
                  </Combobox.Option>
                ))}
          </Combobox.Options>
        </ScrollArea.Autosize>
      </Combobox.Dropdown>
    </Combobox>
  );
}
