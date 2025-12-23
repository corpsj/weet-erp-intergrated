"use client";

import {
  ActionIcon,
  Box,
  Button,
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
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { calculateEstimate, sumPresetItems } from "@/lib/calc";
import { asNumber, formatCurrency } from "@/lib/format";
import type { Estimate, EstimateItem, EstimatePreset, Material, PresetWithItems } from "@/lib/types";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useReactToPrint } from "react-to-print";

const emptyEstimate = {
  name: "",
  description: "",
};

const emptyLink = {
  preset_id: "",
  quantity: 1,
};

const emptyEstimateItem = {
  material_id: "",
  label: "",
  cost_category: "material" as "material" | "labor" | "expense",
  quantity: 1,
  unit_cost: 0,
};

const MATERIAL_FILTER_ALL = "__all__";

const getMaterialLabel = (material: Material) => {
  const spec = material.spec ? material.spec.replace(/\*+/g, "x") : "";
  const unit = material.unit?.trim() || "";
  return `${material.name}${spec ? ` / ${spec}` : ""}${unit ? ` (${unit})` : ""}`;
};

export default function EstimatePage() {
  const [presets, setPresets] = useState<PresetWithItems[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimatePresets, setEstimatePresets] = useState<EstimatePreset[]>([]);
  const [estimateItems, setEstimateItems] = useState<EstimateItem[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [estimateModalOpened, estimateModal] = useDisclosure(false);
  const [linkModalOpened, linkModal] = useDisclosure(false);
  const [estimateForm, setEstimateForm] = useState(emptyEstimate);
  const [linkForm, setLinkForm] = useState(emptyLink);
  const [estimateItemForm, setEstimateItemForm] = useState(emptyEstimateItem);
  const [addMode, setAddMode] = useState<"preset" | "material" | "manual">("preset");
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [estimateSearch, setEstimateSearch] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState<string>(MATERIAL_FILTER_ALL);

  const loadData = useCallback(async (preferredSelectedEstimateId?: string | null) => {
    const selectedId = preferredSelectedEstimateId ?? selectedEstimateId;
    const [presetResult, estimateResult, linkResult, materialResult, estimateItemResult] = await Promise.all([
      supabase
        .from("process_presets")
        .select("id,name,description,created_at,process_preset_items(*)")
        .order("created_at", { ascending: false }),
      supabase.from("estimates").select("*").order("created_at", { ascending: false }),
      supabase.from("estimate_presets").select("*"),
      supabase
        .from("materials")
        .select("*")
        .order("sort_index", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("estimate_items").select("*"),
    ]);

    if (presetResult.error) {
      notifications.show({ title: "프리셋 불러오기 실패", message: presetResult.error.message, color: "red" });
    } else {
      const normalizedPresets = ((presetResult.data as PresetWithItems[]) ?? []).map((preset) => ({
        ...preset,
        process_preset_items: (preset.process_preset_items ?? []).map((item) => ({
          ...item,
          quantity: asNumber(item.quantity),
          unit_cost: asNumber(item.unit_cost),
        })),
      }));
      setPresets(normalizedPresets);
    }

    if (estimateResult.error) {
      notifications.show({ title: "견적 불러오기 실패", message: estimateResult.error.message, color: "red" });
    } else {
      const normalizedEstimates = ((estimateResult.data as Estimate[]) ?? []).map((estimate) => ({
        ...estimate,
        general_admin_value: asNumber(estimate.general_admin_value),
        sales_profit_value: asNumber(estimate.sales_profit_value),
        vat_rate: asNumber(estimate.vat_rate),
      }));
      setEstimates(normalizedEstimates);
      const nextSelected =
        selectedId && estimateResult.data?.some((estimate) => estimate.id === selectedId)
          ? selectedId
          : estimateResult.data?.[0]?.id ?? null;
      if (nextSelected !== selectedEstimateId) {
        setSelectedEstimateId(nextSelected);
      }
    }

    if (linkResult.error) {
      notifications.show({ title: "견적 프리셋 불러오기 실패", message: linkResult.error.message, color: "red" });
    } else {
      const normalizedLinks = ((linkResult.data as EstimatePreset[]) ?? []).map((link) => ({
        ...link,
        quantity: asNumber(link.quantity),
      }));
      setEstimatePresets(normalizedLinks);
    }

    if (materialResult.error) {
      notifications.show({ title: "자재 불러오기 실패", message: materialResult.error.message, color: "red" });
    } else {
      const normalizedMaterials = ((materialResult.data as Material[]) ?? []).map((item) => ({
        ...item,
        material_unit_cost: asNumber(item.material_unit_cost),
        labor_unit_cost: asNumber(item.labor_unit_cost),
        expense_unit_cost: asNumber(item.expense_unit_cost),
      }));
      setMaterials(normalizedMaterials);
    }

    if (estimateItemResult.error) {
      notifications.show({ title: "견적 자재 불러오기 실패", message: estimateItemResult.error.message, color: "red" });
    } else {
      const normalizedItems = ((estimateItemResult.data as EstimateItem[]) ?? []).map((item) => ({
        ...item,
        quantity: asNumber(item.quantity),
        unit_cost: asNumber(item.unit_cost),
      }));
      setEstimateItems(normalizedItems);
    }
  }, [selectedEstimateId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const selectedEstimate = useMemo(
    () => estimates.find((estimate) => estimate.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId]
  );

  const filteredEstimates = useMemo(() => {
    const keyword = estimateSearch.trim().toLowerCase();
    if (!keyword) return estimates;
    return estimates.filter((estimate) => {
      return (
        estimate.name?.toLowerCase().includes(keyword) ||
        estimate.description?.toLowerCase().includes(keyword)
      );
    });
  }, [estimateSearch, estimates]);

  const presetMap = useMemo(() => {
    const map = new Map<string, PresetWithItems>();
    presets.forEach((preset) => map.set(preset.id, preset));
    return map;
  }, [presets]);

  const materialMap = useMemo(() => {
    const map = new Map<string, Material>();
    materials.forEach((material) => map.set(material.id, material));
    return map;
  }, [materials]);

  const materialOptions = useMemo(() => {
    const byCategory = new Map<string, { value: string; label: string }[]>();
    const categoryOrder: string[] = [];
    materials.forEach((material) => {
      const category = material.category?.trim() || "미분류";
      const label = getMaterialLabel(material);

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

  const selectedLinks = useMemo(
    () => estimatePresets.filter((link) => link.estimate_id === selectedEstimateId),
    [estimatePresets, selectedEstimateId]
  );

  const selectedEstimateItems = useMemo(
    () => estimateItems.filter((item) => item.estimate_id === selectedEstimateId),
    [estimateItems, selectedEstimateId]
  );

  const estimateTotalMap = useMemo(() => {
    const linksByEstimate = new Map<string, EstimatePreset[]>();
    estimatePresets.forEach((link) => {
      const list = linksByEstimate.get(link.estimate_id);
      if (list) {
        list.push(link);
      } else {
        linksByEstimate.set(link.estimate_id, [link]);
      }
    });

    const itemsByEstimate = new Map<string, EstimateItem[]>();
    estimateItems.forEach((item) => {
      const list = itemsByEstimate.get(item.estimate_id);
      if (list) {
        list.push(item);
      } else {
        itemsByEstimate.set(item.estimate_id, [item]);
      }
    });

    const totalsByEstimate = new Map<string, number>();
    estimates.forEach((estimate) => {
      const links = linksByEstimate.get(estimate.id) ?? [];
      const items = itemsByEstimate.get(estimate.id) ?? [];
      const totals = links.reduce(
        (acc, link) => {
          const preset = presetMap.get(link.preset_id);
          if (!preset) return acc;
          const presetTotals = sumPresetItems(preset.process_preset_items ?? []);
          acc.material += presetTotals.material * link.quantity;
          acc.labor += presetTotals.labor * link.quantity;
          acc.expense += presetTotals.expense * link.quantity;
          return acc;
        },
        { material: 0, labor: 0, expense: 0 }
      );

      items.forEach((item) => {
        const lineTotal = item.quantity * item.unit_cost;
        if (item.cost_category === "material") totals.material += lineTotal;
        if (item.cost_category === "labor") totals.labor += lineTotal;
        if (item.cost_category === "expense") totals.expense += lineTotal;
      });

      const breakdown = calculateEstimate(
        totals,
        { type: estimate.general_admin_type, value: estimate.general_admin_value },
        { type: estimate.sales_profit_type, value: estimate.sales_profit_value },
        estimate.vat_rate
      );
      totalsByEstimate.set(estimate.id, breakdown.total);
    });

    return totalsByEstimate;
  }, [estimateItems, estimatePresets, estimates, presetMap]);

  const totals = useMemo(() => {
    const initial = { material: 0, labor: 0, expense: 0 };
    const withPresets = selectedLinks.reduce((acc, link) => {
      const preset = presetMap.get(link.preset_id);
      if (!preset) return acc;
      const presetTotals = sumPresetItems(preset.process_preset_items ?? []);
      acc.material += presetTotals.material * link.quantity;
      acc.labor += presetTotals.labor * link.quantity;
      acc.expense += presetTotals.expense * link.quantity;
      return acc;
    }, initial);

    selectedEstimateItems.forEach((item) => {
      const lineTotal = item.quantity * item.unit_cost;
      if (item.cost_category === "material") withPresets.material += lineTotal;
      if (item.cost_category === "labor") withPresets.labor += lineTotal;
      if (item.cost_category === "expense") withPresets.expense += lineTotal;
    });

    return withPresets;
  }, [selectedEstimateItems, selectedLinks, presetMap]);

  const breakdown = useMemo(() => {
    if (!selectedEstimate) return null;
    return calculateEstimate(
      totals,
      { type: selectedEstimate.general_admin_type, value: selectedEstimate.general_admin_value },
      { type: selectedEstimate.sales_profit_type, value: selectedEstimate.sales_profit_value },
      selectedEstimate.vat_rate
    );
  }, [selectedEstimate, totals]);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });

  const openEstimateModal = () => {
    setEstimateForm(emptyEstimate);
    estimateModal.open();
  };

  const openLinkModal = () => {
    setLinkForm(emptyLink);
    setEstimateItemForm(emptyEstimateItem);
    setAddMode("preset");
    setMaterialCategoryFilter(MATERIAL_FILTER_ALL);
    linkModal.open();
  };

  const inferCostCategory = useCallback((material: Material): "material" | "labor" | "expense" => {
    const materialCost = asNumber(material.material_unit_cost);
    const laborCost = asNumber(material.labor_unit_cost);
    const expenseCost = asNumber(material.expense_unit_cost);

    const positives = [
      materialCost > 0 ? ("material" as const) : null,
      laborCost > 0 ? ("labor" as const) : null,
      expenseCost > 0 ? ("expense" as const) : null,
    ].filter(Boolean) as Array<"material" | "labor" | "expense">;

    if (positives.length === 1) return positives[0];

    const combined = `${material.category ?? ""} ${material.name ?? ""}`.trim();
    if (/(노무|공임|인건)/.test(combined)) return "labor";
    if (/(경비|장비|운반|차량|렌탈|임대)/.test(combined)) return "expense";
    return "material";
  }, []);

  const handleCreateEstimate = async () => {
    if (!estimateForm.name.trim()) {
      notifications.show({ title: "견적 이름 필요", message: "견적 이름을 입력하세요.", color: "yellow" });
      return;
    }

    setSavingEstimate(true);
    const { error } = await supabase.from("estimates").insert({
      name: estimateForm.name,
      description: estimateForm.description,
      general_admin_type: "percent",
      general_admin_value: 0,
      sales_profit_type: "percent",
      sales_profit_value: 0,
      vat_rate: 10,
    });
    setSavingEstimate(false);

    if (error) {
      notifications.show({ title: "견적 생성 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "견적 생성 완료", message: "새 견적이 추가되었습니다.", color: "gray" });
    estimateModal.close();
    await loadData();
  };

  const handleDeleteEstimate = async (estimate: Pick<Estimate, "id" | "name">) => {
    const confirmed = window.confirm(`"${estimate.name}" 견적을 삭제할까요?\n(연결된 프리셋도 함께 삭제됩니다.)`);
    if (!confirmed) return;

    const deletingId = estimate.id;
    const { error } = await supabase.from("estimates").delete().eq("id", deletingId);

    if (error) {
      notifications.show({ title: "삭제 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "삭제 완료", message: "견적이 삭제되었습니다.", color: "gray" });
    await loadData(selectedEstimateId === deletingId ? null : selectedEstimateId);
  };

  const handleAddPreset = async () => {
    if (!selectedEstimate) return;
    if (!linkForm.preset_id) {
      notifications.show({ title: "프리셋 선택 필요", message: "프리셋을 선택하세요.", color: "yellow" });
      return;
    }

    setSavingLink(true);
    const { error } = await supabase.from("estimate_presets").insert({
      estimate_id: selectedEstimate.id,
      preset_id: linkForm.preset_id,
      quantity: linkForm.quantity,
    });
    setSavingLink(false);

    if (error) {
      notifications.show({ title: "프리셋 추가 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "프리셋 추가 완료", message: "견적에 프리셋이 추가되었습니다.", color: "gray" });
    linkModal.close();
    await loadData();
  };

  const handleAddMaterial = async () => {
    if (!selectedEstimate) return;

    if (addMode === "material" && !estimateItemForm.material_id) {
      notifications.show({ title: "자재 선택 필요", message: "자재를 선택하세요.", color: "yellow" });
      return;
    }

    if (addMode === "manual" && !estimateItemForm.label.trim()) {
      notifications.show({ title: "항목명 필요", message: "항목 이름을 입력하세요.", color: "yellow" });
      return;
    }

    setSavingLink(true);
    const { error } = await supabase.from("estimate_items").insert({
      estimate_id: selectedEstimate.id,
      cost_category: estimateItemForm.cost_category,
      label: estimateItemForm.label,
      quantity: estimateItemForm.quantity,
      unit_cost: estimateItemForm.unit_cost,
      material_id: addMode === "manual" ? null : estimateItemForm.material_id,
    });
    setSavingLink(false);

    if (error) {
      notifications.show({ title: "자재 추가 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "자재 추가 완료", message: "견적에 자재가 추가되었습니다.", color: "gray" });
    linkModal.close();
    await loadData();
  };

  const removeEstimateItem = async (itemId: string) => {
    const confirmed = window.confirm("자재를 견적에서 제거할까요?");
    if (!confirmed) return;

    const { error } = await supabase.from("estimate_items").delete().eq("id", itemId);

    if (error) {
      notifications.show({ title: "삭제 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "삭제 완료", message: "자재가 제거되었습니다.", color: "gray" });
    await loadData();
  };

  const updateEstimate = async (updates: Partial<Estimate>) => {
    if (!selectedEstimate) return;
    const { error } = await supabase
      .from("estimates")
      .update(updates)
      .eq("id", selectedEstimate.id);

    if (error) {
      notifications.show({ title: "견적 저장 실패", message: error.message, color: "red" });
      return;
    }

    await loadData();
    notifications.show({ title: "견적 저장 완료", message: "견적 정보가 업데이트되었습니다.", color: "gray" });
  };

  const updateQuantity = async (linkId: string, quantity: number) => {
    setEstimatePresets((prev) =>
      prev.map((link) => (link.id === linkId ? { ...link, quantity } : link))
    );

    const { error } = await supabase.from("estimate_presets").update({ quantity }).eq("id", linkId);

    if (error) {
      notifications.show({ title: "수량 업데이트 실패", message: error.message, color: "red" });
      return;
    }
  };

  const updateEstimateItemQuantity = async (itemId: string, quantity: number) => {
    setEstimateItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, quantity } : item)));

    const { error } = await supabase.from("estimate_items").update({ quantity }).eq("id", itemId);

    if (error) {
      notifications.show({ title: "수량 업데이트 실패", message: error.message, color: "red" });
      return;
    }
  };

  const removeLink = async (linkId: string) => {
    const confirmed = window.confirm("프리셋을 견적에서 제거할까요?");
    if (!confirmed) return;

    const { error } = await supabase.from("estimate_presets").delete().eq("id", linkId);

    if (error) {
      notifications.show({ title: "삭제 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "삭제 완료", message: "프리셋이 제거되었습니다.", color: "gray" });
    await loadData();
  };

  return (
    <Stack gap="md">
      <Paper className="app-surface" p="md" radius="lg">
        <Group align="flex-start" gap="md" wrap="nowrap">
          <Paper className="app-surface" p="md" radius="lg" w={360}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600}>견적</Text>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">
                    {filteredEstimates.length}건
                  </Text>
                  <Button size="compact-xs" variant="light" color="indigo" onClick={openEstimateModal}>
                    신규 견적
                  </Button>
                </Group>
              </Group>
              <TextInput
                placeholder="견적 검색"
                value={estimateSearch}
                onChange={(event) => setEstimateSearch(event.currentTarget.value)}
              />
              <Divider />
              <ScrollArea h={560} offsetScrollbars>
                <Stack gap="xs">
                  {filteredEstimates.map((estimate) => (
                    <Paper
                      key={estimate.id}
                      p="sm"
                      radius="md"
                      withBorder
                      onClick={() => setSelectedEstimateId(estimate.id)}
                      style={{
                        cursor: "pointer",
                        borderColor: estimate.id === selectedEstimateId ? "var(--accent)" : undefined,
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Box style={{ minWidth: 0 }}>
                          <Text fw={600} truncate>
                            {estimate.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {estimate.description || "설명 없음"}
                          </Text>
                        </Box>
                        <Group gap="xs" wrap="nowrap">
                          <Text fw={600} size="sm">
                            {formatCurrency(estimateTotalMap.get(estimate.id) ?? 0)}원
                          </Text>
                          <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                onClick={(event) => event.stopPropagation()}
                                aria-label="견적 메뉴"
                              >
                                ...
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                color="red"
                                onClick={() => {
                                  void handleDeleteEstimate(estimate);
                                }}
                              >
                                삭제
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Group>
                    </Paper>
                  ))}
                  {!filteredEstimates.length && (
                    <Text size="sm" c="dimmed">
                      표시할 견적이 없습니다.
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Paper className="app-surface" p="md" radius="lg">
              {selectedEstimate ? (
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start">
                    <Box>
                      <Text fw={600} size="lg">
                        {selectedEstimate.name}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {selectedEstimate.description || "설명 없음"}
                      </Text>
                    </Box>
                    <Group>
                      <Button variant="light" color="gray" onClick={() => handlePrint()}>
                        PDF 내보내기
                      </Button>
                      <Button variant="light" color="gray" onClick={openLinkModal}>
                        항목 추가
                      </Button>
                    </Group>
                  </Group>
                  <Divider />
                  {/* Visible Table for Web View */}
                  <Table verticalSpacing="sm" highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th style={{ width: "100%" }}>항목</Table.Th>
                        <Table.Th style={{ width: 110, textAlign: "right", whiteSpace: "nowrap" }}>수량</Table.Th>
                        <Table.Th style={{ width: 110, textAlign: "right", whiteSpace: "nowrap" }}>재료</Table.Th>
                        <Table.Th style={{ width: 110, textAlign: "right", whiteSpace: "nowrap" }}>노무</Table.Th>
                        <Table.Th style={{ width: 110, textAlign: "right", whiteSpace: "nowrap" }}>경비</Table.Th>
                        <Table.Th style={{ width: 120, textAlign: "right", whiteSpace: "nowrap" }}>합계</Table.Th>
                        <Table.Th style={{ width: 64, textAlign: "right", whiteSpace: "nowrap" }}>관리</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {selectedLinks.map((link) => {
                        const preset = presetMap.get(link.preset_id);
                        const presetTotals = preset ? sumPresetItems(preset.process_preset_items ?? []) : null;
                        const lineTotals = presetTotals
                          ? {
                            material: presetTotals.material * link.quantity,
                            labor: presetTotals.labor * link.quantity,
                            expense: presetTotals.expense * link.quantity,
                          }
                          : null;
                        const lineSum = lineTotals ? lineTotals.material + lineTotals.labor + lineTotals.expense : 0;

                        return (
                          <Table.Tr key={link.id}>
                            <Table.Td style={{ maxWidth: 0 }}>
                              <Text size="sm" truncate>
                                {preset?.name ?? "-"}
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                프리셋
                              </Text>
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>
                              <NumberInput
                                value={link.quantity}
                                min={0}
                                onChange={(value) => updateQuantity(link.id, typeof value === "number" ? value : 0)}
                                size="xs"
                                w={88}
                                step={1}
                                allowDecimal={false}
                              />
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {formatCurrency(lineTotals?.material ?? 0)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {formatCurrency(lineTotals?.labor ?? 0)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {formatCurrency(lineTotals?.expense ?? 0)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(lineSum)}</Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>
                              <Menu position="bottom-end" withinPortal>
                                <Menu.Target>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    onClick={(event) => event.stopPropagation()}
                                    aria-label="항목 메뉴"
                                  >
                                    ...
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item color="red" onClick={() => void removeLink(link.id)}>
                                    삭제
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}

                      {selectedEstimateItems.map((item) => {
                        const sum = item.quantity * item.unit_cost;
                        const categoryLabel =
                          item.cost_category === "material" ? "재료" : item.cost_category === "labor" ? "노무" : "경비";
                        const lineTotals =
                          item.cost_category === "material"
                            ? { material: sum, labor: 0, expense: 0 }
                            : item.cost_category === "labor"
                              ? { material: 0, labor: sum, expense: 0 }
                              : { material: 0, labor: 0, expense: sum };

                        return (
                          <Table.Tr key={item.id}>
                            <Table.Td style={{ maxWidth: 0 }}>
                              <Text size="sm" truncate>
                                {item.label}
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                자재 · {categoryLabel}
                              </Text>
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>
                              <NumberInput
                                value={item.quantity}
                                min={0}
                                onChange={(value) =>
                                  updateEstimateItemQuantity(item.id, typeof value === "number" ? value : 0)
                                }
                                size="xs"
                                w={88}
                                step={1}
                                allowDecimal={false}
                              />
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {formatCurrency(lineTotals.material)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {formatCurrency(lineTotals.labor)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {formatCurrency(lineTotals.expense)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(sum)}</Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>
                              <Menu position="bottom-end" withinPortal>
                                <Menu.Target>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    onClick={(event) => event.stopPropagation()}
                                    aria-label="항목 메뉴"
                                  >
                                    ...
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item color="red" onClick={() => void removeEstimateItem(item.id)}>
                                    삭제
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                  <Divider />
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={600}>판가 구성</Text>
                      <Button
                        size="xs"
                        variant="light"
                        color="gray"
                        onClick={() =>
                          updateEstimate({
                            general_admin_type: selectedEstimate.general_admin_type,
                            general_admin_value: selectedEstimate.general_admin_value,
                            sales_profit_type: selectedEstimate.sales_profit_type,
                            sales_profit_value: selectedEstimate.sales_profit_value,
                            vat_rate: selectedEstimate.vat_rate,
                          })
                        }
                      >
                        판가 저장
                      </Button>
                    </Group>

                    <Group align="flex-start" gap="md" wrap="nowrap">
                      <Paper withBorder p="sm" radius="md" style={{ flex: 1, minWidth: 0 }}>
                        <Stack gap={10}>
                          <Text size="sm" fw={600}>
                            관리비/이윤/부가세
                          </Text>
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Text size="sm" fw={500}>
                              일반관리비
                            </Text>
                            <Group gap="xs" align="center" wrap="nowrap">
                              <SegmentedControl
                                size="xs"
                                value={selectedEstimate.general_admin_type}
                                data={[
                                  { value: "percent", label: "%" },
                                  { value: "fixed", label: "금액" },
                                ]}
                                onChange={(value) => {
                                  const nextValue = (value as Estimate["general_admin_type"]) ?? "percent";
                                  setEstimates((prev) =>
                                    prev.map((item) =>
                                      item.id === selectedEstimate.id
                                        ? { ...item, general_admin_type: nextValue }
                                        : item
                                    )
                                  );
                                }}
                              />
                              <NumberInput
                                size="xs"
                                value={selectedEstimate.general_admin_value}
                                onChange={(value) => {
                                  const nextValue = typeof value === "number" ? value : 0;
                                  setEstimates((prev) =>
                                    prev.map((item) =>
                                      item.id === selectedEstimate.id
                                        ? { ...item, general_admin_value: nextValue }
                                        : item
                                    )
                                  );
                                }}
                                thousandSeparator=","
                                min={0}
                                w={48}
                                rightSection={
                                  <Text size="xs" c="dimmed">
                                    {selectedEstimate.general_admin_type === "percent" ? "%" : "원"}
                                  </Text>
                                }
                              />
                            </Group>
                          </Group>

                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Text size="sm" fw={500}>
                              영업이윤
                            </Text>
                            <Group gap="xs" align="center" wrap="nowrap">
                              <SegmentedControl
                                size="xs"
                                value={selectedEstimate.sales_profit_type}
                                data={[
                                  { value: "percent", label: "%" },
                                  { value: "fixed", label: "금액" },
                                ]}
                                onChange={(value) => {
                                  const nextValue = (value as Estimate["sales_profit_type"]) ?? "percent";
                                  setEstimates((prev) =>
                                    prev.map((item) =>
                                      item.id === selectedEstimate.id
                                        ? { ...item, sales_profit_type: nextValue }
                                        : item
                                    )
                                  );
                                }}
                              />
                              <NumberInput
                                size="xs"
                                value={selectedEstimate.sales_profit_value}
                                onChange={(value) => {
                                  const nextValue = typeof value === "number" ? value : 0;
                                  setEstimates((prev) =>
                                    prev.map((item) =>
                                      item.id === selectedEstimate.id
                                        ? { ...item, sales_profit_value: nextValue }
                                        : item
                                    )
                                  );
                                }}
                                thousandSeparator=","
                                min={0}
                                w={48}
                                rightSection={
                                  <Text size="xs" c="dimmed">
                                    {selectedEstimate.sales_profit_type === "percent" ? "%" : "원"}
                                  </Text>
                                }
                              />
                            </Group>
                          </Group>

                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Text size="sm" fw={500}>
                              부가세
                            </Text>
                            <NumberInput
                              size="xs"
                              value={selectedEstimate.vat_rate}
                              onChange={(value) => {
                                const nextValue = typeof value === "number" ? value : 0;
                                setEstimates((prev) =>
                                  prev.map((item) =>
                                    item.id === selectedEstimate.id ? { ...item, vat_rate: nextValue } : item
                                  )
                                );
                              }}
                              min={0}
                              max={100}
                              w={48}
                              rightSection={
                                <Text size="xs" c="dimmed">
                                  %
                                </Text>
                              }
                            />
                          </Group>
                        </Stack>
                      </Paper>

                      <Paper withBorder p="sm" radius="md" style={{ width: 360 }}>
                        <Stack gap={8}>
                          <Text size="sm" fw={600}>
                            산출 결과
                          </Text>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              재료
                            </Text>
                            <Text fw={600} size="sm">
                              {formatCurrency(breakdown?.totals.material ?? 0)}원
                            </Text>
                          </Group>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              노무
                            </Text>
                            <Text fw={600} size="sm">
                              {formatCurrency(breakdown?.totals.labor ?? 0)}원
                            </Text>
                          </Group>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              경비
                            </Text>
                            <Text fw={600} size="sm">
                              {formatCurrency(breakdown?.totals.expense ?? 0)}원
                            </Text>
                          </Group>
                          <Divider />
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              소계
                            </Text>
                            <Text size="sm">{formatCurrency(breakdown?.subtotal ?? 0)}원</Text>
                          </Group>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              일반관리비
                            </Text>
                            <Text size="sm">{formatCurrency(breakdown?.generalAdmin ?? 0)}원</Text>
                          </Group>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              영업이윤
                            </Text>
                            <Text size="sm">{formatCurrency(breakdown?.salesProfit ?? 0)}원</Text>
                          </Group>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              부가세
                            </Text>
                            <Text size="sm">{formatCurrency(breakdown?.vat ?? 0)}원</Text>
                          </Group>
                          <Divider />
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              최종 판매가
                            </Text>
                            <Text fw={700} size="sm">
                              {formatCurrency(breakdown?.total ?? 0)}원
                            </Text>
                          </Group>
                        </Stack>
                      </Paper>
                    </Group>
                  </Stack>

                  <div style={{ display: "none" }}>
                    <div ref={printRef} style={{ padding: "40px 30px", fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif", color: "#111", lineHeight: 1.3 }}>
                      <style type="text/css" media="print">
                        {`
                          @page { size: A4; margin: 10mm; }
                          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                          .print-container { width: 100%; max-width: 210mm; margin: 0 auto; box-sizing: border-box; }
                          
                          .header-title { 
                            font-size: 26px; /* Reduced from 36px */
                            font-weight: 900; 
                            text-align: center; 
                            margin-bottom: 30px; 
                            letter-spacing: 8px;
                            text-decoration: underline;
                            text-underline-offset: 6px;
                          }

                          /* Supplier/Recipient Grid */
                          .top-section { display: flex; gap: 20px; margin-bottom: 20px; align-items: stretch; }
                          .recipient-box { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 2px; }
                          
                          /* Supplier Table - Adjusted size */
                          .supplier-table { width: 350px; border-collapse: collapse; border: 2px solid #000; font-size: 11px; }
                          .supplier-table td { border: 1px solid #000; padding: 4px 6px; text-align: center; height: 24px; }
                          .supplier-label { background-color: #eee; font-weight: bold; width: 25px; }
                          .supplier-field { background-color: #eee; font-weight: bold; width: 70px; } /* Increased from 50px */
                          .supplier-value { text-align: left !important; padding-left: 6px !important; }

                          /* Total Amount Box - Reduced size */
                          .total-box { 
                            border: 2px solid #000; 
                            padding: 8px 15px; /* Reduced padding */
                            margin-bottom: 20px; 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: center; 
                            background-color: #fff;
                          }

                          /* Main Items Table */
                          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; border-top: 2px solid #000; }
                          .items-table th { 
                            background-color: #eee; 
                            border-bottom: 1px solid #000; 
                            padding: 8px 4px; 
                            font-weight: bold; 
                            color: #000;
                            text-align: center;
                          }
                          .items-table td { 
                            padding: 6px 4px; 
                            border-bottom: 1px solid #ccc; 
                            color: #333;
                          }
                          .items-table tr:last-child td { border-bottom: 1px solid #000; }
                          
                          /* Footer Summary */
                          .footer-table { width: 100%; border-collapse: collapse; margin-top: 0px; font-size: 11px; }
                          .footer-table td { padding: 4px 8px; border-bottom: 1px solid #ddd; }
                          .footer-label { font-weight: bold; text-align: left; width: 100px; background-color: #f9f9f9; }
                          
                          .stamp-box { position: relative; width: 100%; height: 100%; min-height: 20px; display: flex; align-items: center; }
                          .stamp-img { 
                            position: absolute; 
                            left: 20px; /* Offset from center/left to overlap naturally */
                            top: 50%; 
                            transform: translateY(-50%); 
                            width: 60px; /* Real size scale */
                            height: 60px; 
                            opacity: 0.75; 
                            pointer-events: none; /* Ensure it doesn't interfere with interaction */
                            z-index: 10;
                          }

                          .text-right { text-align: right; }
                          .text-center { text-align: center; }
                          .text-bold { font-weight: bold; }
                        `}
                      </style>

                      <div className="print-container">
                        <div className="header-title">견 적 서</div>

                        <div className="top-section">
                          <div className="recipient-box">
                            <div style={{ fontSize: "12px", marginBottom: "12px", color: "#555" }}>
                              견적번호 : {new Date().getFullYear()}-{String(new Date().getMonth() + 1).padStart(2, '0')}{String(new Date().getDate()).padStart(2, '0')}-001
                            </div>
                            <div style={{ fontSize: "18px", marginBottom: "8px" }}>
                              <span style={{ borderBottom: "1px solid #000", paddingBottom: "2px", display: "inline-block", minWidth: "180px", fontWeight: "bold" }}>&nbsp;</span> 귀하
                            </div>
                            <div style={{ fontSize: "12px", marginTop: "8px", lineHeight: "1.6" }}>
                              <div>• 견적명 : <span style={{ fontWeight: "bold" }}>{selectedEstimate.name}</span></div>
                              <div>• 견적일 : {new Date().toLocaleDateString()}</div>
                              <div style={{ color: "#555", fontWeight: "bold" }}>• 유효기간 : 견적일로부터 30일</div>
                            </div>
                          </div>

                          <table className="supplier-table">
                            <tbody>
                              <tr>
                                <td rowSpan={4} className="supplier-label">공<br />급<br />자</td>
                                <td className="supplier-field">등록번호</td>
                                <td colSpan={3} className="supplier-value font-bold">660-86-01862</td>
                              </tr>
                              <tr>
                                <td className="supplier-field">상 호</td>
                                <td className="supplier-value">주식회사 위트</td>
                                <td className="supplier-field">성 명</td>
                                <td className="supplier-value" style={{ width: "80px", position: "relative" }}>
                                  <div className="stamp-box">
                                    박현태 (인)
                                    <img
                                      src="/stamp.png"
                                      className="stamp-img"
                                      alt="stamp"
                                    />
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td className="supplier-field">주 소</td>
                                <td colSpan={3} className="supplier-value" style={{ fontSize: "10px" }}>전남 함평군 대동면 금산길 205-27</td>
                              </tr>
                              <tr>
                                <td className="supplier-field">업 태</td>
                                <td className="supplier-value">제조업</td>
                                <td className="supplier-field">종 목</td>
                                <td className="supplier-value">이동식주택</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="total-box">
                          <div style={{ fontSize: "13px", fontWeight: "bold" }}>합계금액 (VAT 포함)</div>
                          <div style={{ fontSize: "16px", fontWeight: "900", letterSpacing: "0px" }}>
                            {(() => {
                              const total = Math.floor(breakdown?.total ?? 0);
                              const units = ["", "만", "억", "조"];
                              const nums = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
                              const tenUnits = ["", "십", "백", "천"];

                              let result = "";
                              let unitIndex = 0;
                              let tempAmount = total;

                              if (tempAmount === 0) return "영원整";

                              while (tempAmount > 0) {
                                const part = tempAmount % 10000;
                                if (part > 0) {
                                  let partResult = "";
                                  let partTemp = part;
                                  for (let i = 0; i < 4; i++) {
                                    const digit = partTemp % 10;
                                    if (digit > 0) {
                                      partResult = nums[digit] + tenUnits[i] + partResult;
                                    }
                                    partTemp = Math.floor(partTemp / 10);
                                  }
                                  result = partResult + units[unitIndex] + result;
                                }
                                tempAmount = Math.floor(tempAmount / 10000);
                                unitIndex++;
                              }
                              return `금${result}원整 (₩${total.toLocaleString()})`;
                            })()}
                          </div>
                        </div>

                        <table className="items-table">
                          <thead>
                            <tr>
                              <th style={{ width: "40%" }}>품명 / 규격</th>
                              <th style={{ width: "10%" }}>정보</th>
                              <th style={{ width: "10%" }}>단위</th>
                              <th style={{ width: "10%" }}>수량</th>
                              <th style={{ width: "15%" }}>단가</th>
                              <th style={{ width: "15%" }}>공급가액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Links (Presets) */}
                            {selectedLinks.map((link) => {
                              const preset = presetMap.get(link.preset_id);
                              const presetTotals = preset ? sumPresetItems(preset.process_preset_items ?? []) : null;
                              const unitCost = Math.floor(presetTotals ? presetTotals.material + presetTotals.labor + presetTotals.expense : 0);
                              const amount = Math.floor(unitCost * link.quantity);
                              return (
                                <tr key={`link-${link.id}`}>
                                  <td>
                                    <div className="text-bold">{preset?.name}</div>
                                  </td>
                                  <td className="text-center" style={{ fontSize: "10px", color: "#666" }}>프리셋</td>
                                  <td className="text-center">식</td>
                                  <td className="text-center">{link.quantity.toLocaleString()}</td>
                                  <td className="text-right">{unitCost.toLocaleString()}</td>
                                  <td className="text-right">{amount.toLocaleString()}</td>
                                </tr>
                              );
                            })}

                            {/* Estimate Items */}
                            {selectedEstimateItems.map((item) => {
                              const unitCost = Math.floor(item.unit_cost);
                              const amount = Math.floor(item.quantity * unitCost);
                              return (
                                <tr key={`item-${item.id}`}>
                                  <td>
                                    <div className="text-bold">{item.label}</div>
                                  </td>
                                  <td className="text-center" style={{ fontSize: "10px", color: "#666" }}>
                                    {item.cost_category === "material" ? "자재" : item.cost_category === "labor" ? "노무" : "경비"}
                                  </td>
                                  <td className="text-center">-</td>
                                  <td className="text-center">{item.quantity.toLocaleString()}</td>
                                  <td className="text-right">{unitCost.toLocaleString()}</td>
                                  <td className="text-right">{amount.toLocaleString()}</td>
                                </tr>
                              );
                            })}

                            {/* Filler Rows to Maintain Minimum Height */}
                            {Array.from({ length: Math.max(0, 14 - selectedLinks.length - selectedEstimateItems.length) }).map((_, i) => (
                              <tr key={`empty-${i}`}>
                                <td style={{ height: "28px" }}>&nbsp;</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div style={{ marginTop: "60px", textAlign: "center" }}>
                          <div style={{ fontSize: "14px", fontWeight: "bold" }}>위와 같이 견적을 제출합니다.</div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "40px" }}>
                          <table className="footer-table" style={{ width: "45%", borderTop: "2px solid #000" }}>
                            <tbody>
                              <tr>
                                <td className="footer-label">공급가액 소계</td>
                                <td className="text-right">{Math.floor(breakdown?.subtotal ?? 0).toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td className="footer-label">
                                  일반관리비
                                  {selectedEstimate.general_admin_type === 'percent' && (
                                    <span style={{ fontWeight: 'normal', fontSize: '10px' }}> ({selectedEstimate.general_admin_value}%)</span>
                                  )}
                                </td>
                                <td className="text-right">{Math.floor(breakdown?.generalAdmin ?? 0).toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td className="footer-label">
                                  영업이윤
                                  {selectedEstimate.sales_profit_type === 'percent' && (
                                    <span style={{ fontWeight: 'normal', fontSize: '10px' }}> ({selectedEstimate.sales_profit_value}%)</span>
                                  )}
                                </td>
                                <td className="text-right">{Math.floor(breakdown?.salesProfit ?? 0).toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td className="footer-label">부가가치세</td>
                                <td className="text-right">{Math.floor(breakdown?.vat ?? 0).toLocaleString()}</td>
                              </tr>
                              <tr style={{ backgroundColor: "#f0f0f0", borderTop: "1px solid #000" }}>
                                <td className="footer-label" style={{ backgroundColor: "#e0e0e0" }}>총 합 계</td>
                                <td className="text-right text-bold" style={{ fontSize: "14px" }}>{Math.floor(breakdown?.total ?? 0).toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  왼쪽에서 견적을 선택하세요.
                </Text>
              )
              }
            </Paper >
          </Box >
        </Group >
      </Paper >

      <Modal opened={estimateModalOpened} onClose={estimateModal.close} title="신규 견적" size="lg">
        <Stack>
          <TextInput
            label="견적 이름"
            placeholder=""
            value={estimateForm.name}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setEstimateForm((prev) => ({ ...prev, name }));
            }}
            required
          />
          <TextInput
            label="설명"
            placeholder="견적 설명"
            value={estimateForm.description}
            onChange={(event) => {
              const description = event.currentTarget.value;
              setEstimateForm((prev) => ({ ...prev, description }));
            }}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={estimateModal.close}>
              취소
            </Button>
            <Button color="gray" onClick={handleCreateEstimate} loading={savingEstimate}>
              저장
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={linkModalOpened} onClose={linkModal.close} title="항목 추가" size="lg">
        <Stack>
          <SegmentedControl
            fullWidth
            data={[
              { value: "preset", label: "프리셋" },
              { value: "material", label: "자재" },
              { value: "manual", label: "직접입력" },
            ]}
            value={addMode}
            onChange={(value) => {
              const nextValue = (value as typeof addMode) ?? "preset";
              setAddMode(nextValue);
            }}
          />

          {addMode === "preset" ? (
            <>
              <Group align="flex-end" wrap="nowrap">
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <SearchableSelect
                    label="프리셋 선택"
                    data={presets.map((preset) => ({ value: preset.id, label: preset.name }))}
                    value={linkForm.preset_id}
                    onChange={(value) => setLinkForm((prev) => ({ ...prev, preset_id: value ?? "" }))}
                    placeholder="프리셋 선택"
                  />
                </Box>
                <NumberInput
                  label="수량"
                  value={linkForm.quantity}
                  min={0}
                  onChange={(value) =>
                    setLinkForm((prev) => ({
                      ...prev,
                      quantity: typeof value === "number" ? value : 1,
                    }))
                  }
                  w={140}
                />
              </Group>
            </>
          ) : (
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
                  value={estimateItemForm.material_id}
                  placeholder="자재 선택"
                  onChange={(value) => {
                    const materialId = value ?? "";
                    const material = materialMap.get(materialId);
                    if (!material) {
                      setEstimateItemForm((prev) => ({ ...prev, material_id: "" }));
                      return;
                    }

                    const nextCostCategory = inferCostCategory(material);
                    const unitCost =
                      nextCostCategory === "material"
                        ? asNumber(material.material_unit_cost)
                        : nextCostCategory === "labor"
                          ? asNumber(material.labor_unit_cost)
                          : asNumber(material.expense_unit_cost);
                    const label = `${material.name}${material.spec ? ` / ${material.spec.replace(/\*+/g, "x")}` : ""}`;

                    setEstimateItemForm((prev) => ({
                      ...prev,
                      material_id: materialId,
                      cost_category: nextCostCategory,
                      label,
                      unit_cost: unitCost,
                    }));
                  }}
                  nothingFoundMessage="검색 결과가 없습니다."
                />
              </SimpleGrid>

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
                    value={estimateItemForm.cost_category}
                    onChange={(value) => {
                      const nextValue = (value as EstimateItem["cost_category"]) ?? "material";
                      const material = estimateItemForm.material_id
                        ? materialMap.get(estimateItemForm.material_id)
                        : undefined;
                      const unitCost =
                        material && nextValue === "material"
                          ? asNumber(material.material_unit_cost)
                          : material && nextValue === "labor"
                            ? asNumber(material.labor_unit_cost)
                            : material
                              ? asNumber(material.expense_unit_cost)
                              : estimateItemForm.unit_cost;

                      setEstimateItemForm((prev) => ({
                        ...prev,
                        cost_category: nextValue,
                        unit_cost: unitCost,
                      }));
                    }}
                  />
                </Stack>

                <NumberInput
                  label="수량"
                  value={estimateItemForm.quantity}
                  min={0}
                  onChange={(value) =>
                    setEstimateItemForm((prev) => ({
                      ...prev,
                      quantity: typeof value === "number" ? value : 1,
                    }))
                  }
                />
                <NumberInput
                  label="단가"
                  value={estimateItemForm.unit_cost}
                  min={0}
                  thousandSeparator=","
                  onChange={(value) =>
                    setEstimateItemForm((prev) => ({
                      ...prev,
                      unit_cost: typeof value === "number" ? value : 0,
                    }))
                  }
                />
              </Group>
            </>
          )}

          {addMode === "manual" && (
            <>
              <TextInput
                label="항목명"
                placeholder="항목 이름 입력"
                value={estimateItemForm.label}
                onChange={(event) =>
                  setEstimateItemForm((prev) => ({ ...prev, label: event.currentTarget.value }))
                }
                required
              />
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
                    value={estimateItemForm.cost_category}
                    onChange={(value) => {
                      const nextValue = (value as EstimateItem["cost_category"]) ?? "material";
                      setEstimateItemForm((prev) => ({ ...prev, cost_category: nextValue }));
                    }}
                  />
                </Stack>
                <NumberInput
                  label="수량"
                  value={estimateItemForm.quantity}
                  min={0}
                  onChange={(value) =>
                    setEstimateItemForm((prev) => ({
                      ...prev,
                      quantity: typeof value === "number" ? value : 1,
                    }))
                  }
                />
                <NumberInput
                  label="단가"
                  value={estimateItemForm.unit_cost}
                  min={0}
                  thousandSeparator=","
                  onChange={(value) =>
                    setEstimateItemForm((prev) => ({
                      ...prev,
                      unit_cost: typeof value === "number" ? value : 0,
                    }))
                  }
                />
              </Group>
            </>
          )}
          <Group justify="flex-end">
            <Button variant="light" onClick={linkModal.close}>
              취소
            </Button>
            <Button
              color="gray"
              onClick={addMode === "preset" ? handleAddPreset : handleAddMaterial}
              loading={savingLink}
            >
              저장
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack >
  );
}
