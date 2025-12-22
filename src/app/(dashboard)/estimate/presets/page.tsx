"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { asNumber, formatCurrency } from "@/lib/format";
import { sumPresetItems } from "@/lib/calc";
import type { Material, PresetWithItems } from "@/lib/types";
import { SearchableSelect } from "@/components/SearchableSelect";

const emptyPreset = {
  name: "",
  description: "",
};

const emptyItem = {
  type: "material" as "material" | "custom",
  cost_category: "material" as "material" | "labor" | "expense",
  material_id: "",
  label: "",
  unit: "",
  quantity: 1,
  unit_cost: 0,
};

const categoryLabels = {
  material: "재료",
  labor: "노무",
  expense: "경비",
} as const;

const MATERIAL_FILTER_ALL = "__all__";

export default function PresetsPage() {
  const [presets, setPresets] = useState<PresetWithItems[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetModalOpened, presetModal] = useDisclosure(false);
  const [itemModalOpened, itemModal] = useDisclosure(false);
  const [presetForm, setPresetForm] = useState(emptyPreset);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [savingPreset, setSavingPreset] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [continueAddingItem, setContinueAddingItem] = useState(true);
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState<string>(MATERIAL_FILTER_ALL);
  const [presetSearch, setPresetSearch] = useState("");

  const loadData = useCallback(async (preferredSelectedPresetId?: string | null) => {
    const selectedId = preferredSelectedPresetId ?? selectedPresetId;
    const [{ data: presetData, error: presetError }, { data: materialData, error: materialError }] =
      await Promise.all([
        supabase
          .from("process_presets")
          .select("id,name,description,created_at,process_preset_items(*)")
          .order("created_at", { ascending: false }),
        supabase
          .from("materials")
          .select("*")
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (presetError) {
      notifications.show({ title: "프리셋 불러오기 실패", message: presetError.message, color: "red" });
    } else {
      const normalized = ((presetData as PresetWithItems[]) ?? []).map((preset) => ({
        ...preset,
        process_preset_items: (preset.process_preset_items ?? []).map((item) => ({
          ...item,
          quantity: asNumber(item.quantity),
          unit_cost: asNumber(item.unit_cost),
        })),
      }));
      setPresets(normalized);
      const nextSelected =
        selectedId && presetData?.some((preset) => preset.id === selectedId)
          ? selectedId
          : presetData?.[0]?.id ?? null;
      if (nextSelected !== selectedPresetId) {
        setSelectedPresetId(nextSelected);
      }
    }

    if (materialError) {
      notifications.show({ title: "자재 불러오기 실패", message: materialError.message, color: "red" });
    } else {
      const normalizedMaterials = ((materialData as Material[]) ?? []).map((item) => ({
        ...item,
        material_unit_cost: asNumber(item.material_unit_cost),
        labor_unit_cost: asNumber(item.labor_unit_cost),
        expense_unit_cost: asNumber(item.expense_unit_cost),
      }));
      setMaterials(normalizedMaterials);
    }
  }, [selectedPresetId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

  const selectedTotals = useMemo(() => {
    if (!selectedPreset) return null;
    return sumPresetItems(selectedPreset.process_preset_items ?? []);
  }, [selectedPreset]);

  const filteredPresets = useMemo(() => {
    const keyword = presetSearch.trim().toLowerCase();
    if (!keyword) return presets;
    return presets.filter((preset) => {
      return (
        preset.name?.toLowerCase().includes(keyword) ||
        preset.description?.toLowerCase().includes(keyword)
      );
    });
  }, [presetSearch, presets]);

  const materialOptions = useMemo(() => {
    const byCategory = new Map<string, { value: string; label: string }[]>();
    const categoryOrder: string[] = [];
    materials.forEach((material) => {
      const category = material.category?.trim() || "미분류";
      const spec = material.spec ? material.spec.replace(/\*+/g, "x") : "";
      const unit = material.unit?.trim() || "";
      const label = `${material.name}${spec ? ` / ${spec}` : ""}${unit ? ` (${unit})` : ""}`;

      if (!byCategory.has(category)) {
        byCategory.set(category, []);
        categoryOrder.push(category);
      }
      byCategory.get(category)!.push({ value: material.id, label });
    });

    return categoryOrder.map((group) => ({
      group,
      items: byCategory.get(group) ?? [],
    }));
  }, [materials]);

  const materialCategories = useMemo(() => materialOptions.map((option) => option.group), [materialOptions]);

  const filteredMaterialOptions = useMemo(() => {
    if (materialCategoryFilter === MATERIAL_FILTER_ALL) return materialOptions;
    const match = materialOptions.find((option) => option.group === materialCategoryFilter);
    return match ? [match] : [];
  }, [materialCategoryFilter, materialOptions]);

  const openPresetModal = () => {
    setPresetForm(emptyPreset);
    presetModal.open();
  };

  const openItemModal = () => {
    setItemForm(emptyItem);
    setMaterialCategoryFilter(MATERIAL_FILTER_ALL);
    itemModal.open();
  };

  const inferCostCategory = useCallback((material: Material): typeof emptyItem.cost_category => {
    const materialCost = asNumber(material.material_unit_cost);
    const laborCost = asNumber(material.labor_unit_cost);
    const expenseCost = asNumber(material.expense_unit_cost);

    const positives = [
      materialCost > 0 ? ("material" as const) : null,
      laborCost > 0 ? ("labor" as const) : null,
      expenseCost > 0 ? ("expense" as const) : null,
    ].filter(Boolean) as Array<typeof emptyItem.cost_category>;

    if (positives.length === 1) return positives[0];

    const combined = `${material.category ?? ""} ${material.name ?? ""}`.trim();
    if (/(노무|공임|인건)/.test(combined)) return "labor";
    if (/(경비|장비|운반|차량|렌탈|임대)/.test(combined)) return "expense";
    return "material";
  }, []);

  const applyMaterialDefaults = (materialId: string, costCategory: typeof itemForm.cost_category) => {
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;

    const unitCost =
      costCategory === "material"
        ? material.material_unit_cost ?? 0
        : costCategory === "labor"
          ? material.labor_unit_cost ?? 0
          : material.expense_unit_cost ?? 0;

    const label = `${material.name}${material.spec ? ` / ${material.spec.replace(/\*+/g, "x")}` : ""}`;

    setItemForm((prev) => ({
      ...prev,
      material_id: materialId,
      label,
      unit: material.unit ?? "",
      unit_cost: unitCost,
    }));
  };

  const handlePresetSave = async () => {
    if (!presetForm.name.trim()) {
      notifications.show({ title: "프리셋 이름 필요", message: "프리셋 이름을 입력하세요.", color: "yellow" });
      return;
    }

    setSavingPreset(true);
    const { error } = await supabase.from("process_presets").insert({
      name: presetForm.name,
      description: presetForm.description,
    });
    setSavingPreset(false);

    if (error) {
      notifications.show({ title: "프리셋 생성 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "프리셋 생성 완료", message: "새 프리셋이 추가되었습니다.", color: "gray" });
    presetModal.close();
    await loadData();
  };

  const handleItemSave = async () => {
    if (!selectedPreset) return;

    if (itemForm.type === "material" && !itemForm.material_id) {
      notifications.show({ title: "자재 선택 필요", message: "자재 항목을 선택하세요.", color: "yellow" });
      return;
    }

    if (!itemForm.label.trim()) {
      notifications.show({ title: "항목명 필요", message: "항목명을 입력하세요.", color: "yellow" });
      return;
    }

    setSavingItem(true);
    const { error } = await supabase.from("process_preset_items").insert({
      preset_id: selectedPreset.id,
      cost_category: itemForm.cost_category,
      label: itemForm.label,
      unit: itemForm.unit,
      quantity: itemForm.quantity,
      unit_cost: itemForm.unit_cost,
      material_id: itemForm.type === "material" ? itemForm.material_id : null,
    });
    setSavingItem(false);

    if (error) {
      notifications.show({ title: "항목 추가 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "항목 추가 완료", message: "프리셋 항목이 저장되었습니다.", color: "gray" });
    await loadData();

    if (continueAddingItem) {
      setItemForm((prev) => ({
        ...emptyItem,
        type: prev.type,
        cost_category: prev.cost_category,
      }));
      return;
    }

    itemModal.close();
  };

  const handleDeletePreset = async (preset: Pick<PresetWithItems, "id" | "name">) => {
    const confirmed = window.confirm(`"${preset.name}" 프리셋을 삭제할까요?\n(하위 항목도 함께 삭제됩니다.)`);
    if (!confirmed) return;

    const deletingPresetId = preset.id;
    const { error } = await supabase.from("process_presets").delete().eq("id", deletingPresetId);

    if (error) {
      notifications.show({ title: "삭제 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "삭제 완료", message: "프리셋이 삭제되었습니다.", color: "gray" });
    await loadData(selectedPresetId === deletingPresetId ? null : selectedPresetId);
  };

  const handleDeleteItem = async (itemId: string) => {
    const confirmed = window.confirm("프리셋 항목을 삭제할까요?");
    if (!confirmed) return;

    const { error } = await supabase.from("process_preset_items").delete().eq("id", itemId);

    if (error) {
      notifications.show({ title: "삭제 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "삭제 완료", message: "프리셋 항목이 삭제되었습니다.", color: "gray" });
    await loadData();
  };

  const renderPresetDetail = () => {
    if (!selectedPreset) {
      return (
        <Text size="sm" c="dimmed">
          프리셋을 선택하세요.
        </Text>
      );
    }

    return (
      <Stack gap="md">
        <Box>
          <Text fw={600} size="lg">
            {selectedPreset.name}
          </Text>
          <Text size="sm" c="dimmed">
            {selectedPreset.description || "설명 없음"}
          </Text>
        </Box>

        <Group justify="flex-end">
          <Button variant="light" color="gray" onClick={openItemModal}>
            항목 추가
          </Button>
        </Group>

        <Divider />

        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>구분</Table.Th>
              <Table.Th>항목</Table.Th>
              <Table.Th>단위</Table.Th>
              <Table.Th>수량</Table.Th>
              <Table.Th>단가</Table.Th>
              <Table.Th>합계</Table.Th>
              <Table.Th>관리</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {selectedPreset.process_preset_items?.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>{categoryLabels[item.cost_category]}</Table.Td>
                <Table.Td>{item.label}</Table.Td>
                <Table.Td>{item.unit}</Table.Td>
                <Table.Td>{item.quantity}</Table.Td>
                <Table.Td>{formatCurrency(item.unit_cost)}</Table.Td>
                <Table.Td>{formatCurrency(item.quantity * item.unit_cost)}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="subtle" color="gray" onClick={() => handleDeleteItem(item.id)}>
                    삭제
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Divider />

        <Group justify="space-between" align="flex-start">
          <Text fw={600}>소계</Text>
          <Group gap="lg" wrap="wrap">
            <Text size="sm">재료 {formatCurrency(selectedTotals?.material ?? 0)}원</Text>
            <Text size="sm">노무 {formatCurrency(selectedTotals?.labor ?? 0)}원</Text>
            <Text size="sm">경비 {formatCurrency(selectedTotals?.expense ?? 0)}원</Text>
          </Group>
        </Group>
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      <Paper className="app-surface" p="md" radius="md">
        <Group justify="flex-end" align="center">
          <Button color="gray" onClick={openPresetModal}>
            신규 프리셋
          </Button>
        </Group>
        <Divider my="sm" />
        <Group align="flex-start" gap="md" wrap="nowrap">
          <Paper className="app-surface" p="md" radius="lg" w={360}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600}>프리셋</Text>
                <Text size="sm" c="dimmed">
                  {filteredPresets.length}건
                </Text>
              </Group>
              <TextInput
                placeholder="프리셋 검색"
                value={presetSearch}
                onChange={(event) => setPresetSearch(event.currentTarget.value)}
              />
              <Divider />
              <ScrollArea h={560} offsetScrollbars>
                <Stack gap="xs">
                  {filteredPresets.map((preset) => {
                    const totals = sumPresetItems(preset.process_preset_items ?? []);
                    const totalCost = totals.material + totals.labor + totals.expense;
                    return (
                      <Paper
                        key={preset.id}
                        p="sm"
                        radius="md"
                        withBorder
                        onClick={() => setSelectedPresetId(preset.id)}
                        style={{
                          cursor: "pointer",
                          borderColor: preset.id === selectedPresetId ? "var(--accent)" : undefined,
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Box style={{ minWidth: 0 }}>
                            <Text fw={600} truncate>
                              {preset.name}
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                              {preset.description || "설명 없음"}
                            </Text>
                          </Box>
                          <Group gap="xs" wrap="nowrap">
                            <Text fw={600} size="sm">
                              {formatCurrency(totalCost)}원
                            </Text>
                            <Menu withinPortal position="bottom-end">
                              <Menu.Target>
                                <ActionIcon
                                  variant="subtle"
                                  color="gray"
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label="프리셋 메뉴"
                                >
                                  <Text span>⋯</Text>
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item
                                  color="red"
                                  onClick={() => {
                                    void handleDeletePreset(preset);
                                  }}
                                >
                                  삭제
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Group>
                        </Group>
                      </Paper>
                    );
                  })}
                  {!filteredPresets.length && (
                    <Text size="sm" c="dimmed">
                      표시할 프리셋이 없습니다.
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Paper className="app-surface" p="md" radius="lg">
              <ScrollArea h={560} offsetScrollbars>
                {renderPresetDetail()}
              </ScrollArea>
            </Paper>
          </Box>
        </Group>
      </Paper>

      <Modal opened={presetModalOpened} onClose={presetModal.close} title="신규 프리셋" size="lg">
        <Stack>
          <TextInput
            label="프리셋 이름"
            placeholder=""
            value={presetForm.name}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setPresetForm((prev) => ({ ...prev, name }));
            }}
            required
          />
          <Textarea
            label="설명"
            placeholder="프리셋 설명"
            value={presetForm.description}
            onChange={(event) => {
              const description = event.currentTarget.value;
              setPresetForm((prev) => ({ ...prev, description }));
            }}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={presetModal.close}>
              취소
            </Button>
            <Button color="gray" onClick={handlePresetSave} loading={savingPreset}>
              저장
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={itemModalOpened} onClose={itemModal.close} title="프리셋 항목 추가" size="lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleItemSave();
          }}
        >
          <Stack>
            <SegmentedControl
              fullWidth
              data={[
                { value: "material", label: "목록에서 선택" },
                { value: "custom", label: "직접 입력" },
              ]}
              value={itemForm.type}
              onChange={(value) => {
                const nextType = (value as typeof itemForm.type) ?? "material";
                setItemForm((prev) => ({
                  ...prev,
                  type: nextType,
                  material_id: nextType === "material" ? prev.material_id : "",
                  label: nextType === "material" ? prev.label : "",
                  unit: nextType === "material" ? prev.unit : "",
                  unit_cost: nextType === "material" ? prev.unit_cost : 0,
                }));
              }}
            />

            {itemForm.type === "material" ? (
              <>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <SearchableSelect
                    label="구분"
                    placeholder="전체"
                    data={[
                      { value: MATERIAL_FILTER_ALL, label: "전체" },
                      ...materialCategories.map((category) => ({ value: category, label: category })),
                    ]}
                    value={materialCategoryFilter}
                    onChange={(value) => {
                      setMaterialCategoryFilter(value ?? MATERIAL_FILTER_ALL);
                    }}
                    nothingFoundMessage="검색 결과가 없습니다."
                  />
                  <SearchableSelect
                    label="자재 항목"
                    data={filteredMaterialOptions}
                    value={itemForm.material_id}
                    placeholder="자재 선택"
                    onChange={(value) => {
                      const materialId = value ?? "";
                      const selected = materials.find((item) => item.id === materialId);
                      const nextCostCategory = selected ? inferCostCategory(selected) : itemForm.cost_category;
                      setItemForm((prev) => ({
                        ...prev,
                        material_id: materialId,
                        cost_category: nextCostCategory,
                      }));
                      applyMaterialDefaults(materialId, nextCostCategory);
                    }}
                    nothingFoundMessage="검색 결과가 없습니다."
                  />
                </SimpleGrid>
              </>
            ) : (
              <TextInput
                label="항목명"
                placeholder=""
                value={itemForm.label}
                onChange={(event) => {
                  const label = event.currentTarget.value;
                  setItemForm((prev) => ({ ...prev, label }));
                }}
                required
              />
            )}

            <Group grow align="flex-end">
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  비용 구분
                </Text>
                <SegmentedControl
                  data={[
                    { value: "material", label: "재료" },
                    { value: "labor", label: "노무" },
                    { value: "expense", label: "경비" },
                  ]}
                  value={itemForm.cost_category}
                  onChange={(value) => {
                    const nextValue = (value as typeof itemForm.cost_category) ?? "material";
                    setItemForm((prev) => ({ ...prev, cost_category: nextValue }));
                    if (itemForm.type === "material" && itemForm.material_id) {
                      applyMaterialDefaults(itemForm.material_id, nextValue);
                    }
                  }}
                />
              </Stack>

              <NumberInput
                label="수량"
                value={itemForm.quantity}
                onChange={(value) =>
                  setItemForm((prev) => ({
                    ...prev,
                    quantity: typeof value === "number" ? value : 1,
                  }))
                }
                min={0}
              />
              <NumberInput
                label="단가"
                value={itemForm.unit_cost}
                onChange={(value) =>
                  setItemForm((prev) => ({
                    ...prev,
                    unit_cost: typeof value === "number" ? value : 0,
                  }))
                }
                thousandSeparator=","
                min={0}
              />
            </Group>

            {itemForm.type === "material" && (
              <TextInput
                label="표시 이름"
                description="필요 시 항목명을 수정할 수 있습니다."
                value={itemForm.label}
                onChange={(event) => {
                  const label = event.currentTarget.value;
                  setItemForm((prev) => ({ ...prev, label }));
                }}
              />
            )}

            <Group justify="space-between" align="center">
              <Checkbox
                label="저장 후 계속 추가"
                checked={continueAddingItem}
                onChange={(event) => setContinueAddingItem(event.currentTarget.checked)}
              />
              <Group justify="flex-end">
                <Button variant="light" onClick={itemModal.close} type="button">
                  취소
                </Button>
                <Button color="gray" type="submit" loading={savingItem}>
                  저장
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
