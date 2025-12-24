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
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { calculateEstimate, sumPresetItems } from "@/lib/calc";
import { asNumber, formatCurrency } from "@/lib/format";
import type { Estimate, EstimateItem, EstimatePreset, Material, PresetWithItems } from "@/lib/types";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useReactToPrint } from "react-to-print";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
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

  // 1. Fetch Presets
  const { data: presets = [] } = useQuery<PresetWithItems[]>({
    queryKey: ["presets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_presets")
        .select("id,name,description,created_at,process_preset_items(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((preset) => ({
        ...preset,
        process_preset_items: (preset.process_preset_items ?? []).map((item) => ({
          ...item,
          quantity: asNumber(item.quantity),
          unit_cost: asNumber(item.unit_cost),
        })),
      }));
    },
  });

  // 2. Fetch Estimates
  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ["estimates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((estimate) => ({
        ...estimate,
        general_admin_value: asNumber(estimate.general_admin_value),
        sales_profit_value: asNumber(estimate.sales_profit_value),
        vat_rate: asNumber(estimate.vat_rate),
      }));
    },
  });

  // 3. Fetch Estimate Presets (Links)
  const { data: estimatePresets = [] } = useQuery<EstimatePreset[]>({
    queryKey: ["estimatePresets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimate_presets").select("*");
      if (error) throw error;
      return (data ?? []).map((link) => ({
        ...link,
        quantity: asNumber(link.quantity),
      }));
    },
  });

  // 4. Fetch Materials
  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("sort_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((item) => ({
        ...item,
        material_unit_cost: asNumber(item.material_unit_cost),
        labor_unit_cost: asNumber(item.labor_unit_cost),
        expense_unit_cost: asNumber(item.expense_unit_cost),
      }));
    },
  });

  // 5. Fetch Estimate Items (Items)
  const { data: estimateItems = [] } = useQuery<EstimateItem[]>({
    queryKey: ["estimateItems"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimate_items").select("*");
      if (error) throw error;
      return (data ?? []).map((item) => ({
        ...item,
        quantity: asNumber(item.quantity),
        unit_cost: asNumber(item.unit_cost),
      }));
    },
  });

  // Automatically select the first estimate if none is selected
  useEffect(() => {
    if (!selectedEstimateId && estimates.length > 0) {
      setSelectedEstimateId(estimates[0].id);
    }
  }, [estimates, selectedEstimateId]);

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
    await queryClient.invalidateQueries({ queryKey: ["estimates"] });
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
    await queryClient.invalidateQueries({ queryKey: ["estimates"] });
    if (selectedEstimateId === deletingId) {
      setSelectedEstimateId(null);
    }
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
    await queryClient.invalidateQueries({ queryKey: ["estimatePresets"] });
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
    await queryClient.invalidateQueries({ queryKey: ["estimateItems"] });
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
    await queryClient.invalidateQueries({ queryKey: ["estimateItems"] });
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

    await queryClient.invalidateQueries({ queryKey: ["estimates"] });
    notifications.show({ title: "견적 저장 완료", message: "견적 정보가 업데이트되었습니다.", color: "gray" });
  };

  const updateQuantity = async (linkId: string, quantity: number) => {
    // Optimistic update done by React Query automatically if we refetch, but here we can rely on fast re-fetch or implement optimistic updates properly.
    // For now, let's just invalidate query after mutation.
    // To make it feel responsive, maybe we could optimistic update locale state?
    // Actually the previous code updated local state manually.
    // Let's stick to invalidation for correctness first. The latency is low.

    // But to avoid UI jumpiness on input, we might want to update cache directly?
    // For simplicity given the scope, I will rely on invalidation. It might be slightly slower than local state but correct.
    // Actually, input lag might be an issue.
    // Let's rely on standard invalidation.

    const { error } = await supabase.from("estimate_presets").update({ quantity }).eq("id", linkId);

    if (error) {
      notifications.show({ title: "수량 업데이트 실패", message: error.message, color: "red" });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["estimatePresets"] });
  };

  const updateEstimateItemQuantity = async (itemId: string, quantity: number) => {
    const { error } = await supabase.from("estimate_items").update({ quantity }).eq("id", itemId);

    if (error) {
      notifications.show({ title: "수량 업데이트 실패", message: error.message, color: "red" });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["estimateItems"] });
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
    await queryClient.invalidateQueries({ queryKey: ["estimatePresets"] });
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
                        저장
                      </Button>
                    </Group>
                    {breakdown && (
                      <SimpleGrid cols={2}>
                        <Paper withBorder p="xs" radius="md">
                          <Text size="xs" c="dimmed">
                            순공사비
                          </Text>
                          <Text fw={700}>{formatCurrency(breakdown.netCost)}원</Text>
                        </Paper>
                        <Paper withBorder p="xs" radius="md">
                          <Text size="xs" c="dimmed">
                            총 합계
                          </Text>
                          <Text fw={700} c="blue">
                            {formatCurrency(breakdown.total)}원
                          </Text>
                        </Paper>
                        <Group align="center" gap="xs">
                          <Text size="sm">일반관리비</Text>
                          <SegmentedControl
                            size="xs"
                            data={[
                              { label: "%", value: "percent" },
                              { label: "원", value: "fixed" },
                            ]}
                            value={selectedEstimate.general_admin_type}
                            onChange={(value) =>
                              updateEstimate({ general_admin_type: value as "percent" | "fixed" })
                            }
                          />
                          <NumberInput
                            size="xs"
                            w={100}
                            value={selectedEstimate.general_admin_value}
                            onChange={(val) =>
                              updateEstimate({ general_admin_value: typeof val === "number" ? val : 0 })
                            }
                          />
                          <Text size="sm" c="dimmed">
                            = {formatCurrency(breakdown.generalAdmin)}원
                          </Text>
                        </Group>
                        <Group align="center" gap="xs">
                          <Text size="sm">이윤</Text>
                          <SegmentedControl
                            size="xs"
                            data={[
                              { label: "%", value: "percent" },
                              { label: "원", value: "fixed" },
                            ]}
                            value={selectedEstimate.sales_profit_type}
                            onChange={(value) =>
                              updateEstimate({ sales_profit_type: value as "percent" | "fixed" })
                            }
                          />
                          <NumberInput
                            size="xs"
                            w={100}
                            value={selectedEstimate.sales_profit_value}
                            onChange={(val) =>
                              updateEstimate({ sales_profit_value: typeof val === "number" ? val : 0 })
                            }
                          />
                          <Text size="sm" c="dimmed">
                            = {formatCurrency(breakdown.salesProfit)}원
                          </Text>
                        </Group>
                        <Group align="center" gap="xs">
                          <Text size="sm">부가세율</Text>
                          <NumberInput
                            size="xs"
                            w={60}
                            value={selectedEstimate.vat_rate}
                            onChange={(val) => updateEstimate({ vat_rate: typeof val === "number" ? val : 0 })}
                          />
                          <Text size="sm">%</Text>
                          <Text size="sm" c="dimmed">
                            = {formatCurrency(breakdown.vat)}원
                          </Text>
                        </Group>
                      </SimpleGrid>
                    )}
                  </Stack>
                </Stack>
              ) : (
                <Stack align="center" justify="center" h={400}>
                  <Text c="dimmed">견적을 선택하거나 새로 만드세요.</Text>
                  <Button variant="light" color="indigo" onClick={openEstimateModal}>
                    신규 견적
                  </Button>
                </Stack>
              )}
            </Paper>
          </Box>
        </Group>

        {/* Hidden Print Area */}
        <div style={{ display: "none" }}>
          <div ref={printRef} style={{ padding: "40px" }}>
            {selectedEstimate && breakdown && (
              <Stack gap="xl">
                <Title order={2} ta="center">
                  견적서
                </Title>
                <Table withTableBorder withColumnBorders>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Th w={100} bg="gray.1">
                        견적명
                      </Table.Th>
                      <Table.Td>{selectedEstimate.name}</Table.Td>
                      <Table.Th w={100} bg="gray.1">
                        작성일
                      </Table.Th>
                      <Table.Td>{new Date().toLocaleDateString()}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Th bg="gray.1">합계금액</Table.Th>
                      <Table.Td colSpan={3} fw={700} fz="lg">
                        {formatCurrency(breakdown.total)} 원 (VAT 포함)
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>

                <Table withTableBorder withColumnBorders>
                  <Table.Thead bg="gray.1">
                    <Table.Tr>
                      <Table.Th w={60} ta="center">
                        No
                      </Table.Th>
                      <Table.Th ta="center">품명</Table.Th>
                      <Table.Th w={60} ta="center">
                        단위
                      </Table.Th>
                      <Table.Th w={80} ta="center">
                        수량
                      </Table.Th>
                      <Table.Th w={100} ta="center">
                        단가
                      </Table.Th>
                      <Table.Th w={100} ta="center">
                        금액
                      </Table.Th>
                      <Table.Th w={80} ta="center">
                        비고
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {[
                      ...selectedLinks.map((link, i) => {
                        const preset = presetMap.get(link.preset_id);
                        const presetTotals = preset
                          ? sumPresetItems(preset.process_preset_items ?? [])
                          : { material: 0, labor: 0, expense: 0 };
                        const unitPrice =
                          presetTotals.material + presetTotals.labor + presetTotals.expense;
                        const totalPrice = unitPrice * link.quantity;
                        return (
                          <Table.Tr key={`link-${link.id}`}>
                            <Table.Td ta="center">{i + 1}</Table.Td>
                            <Table.Td>{preset?.name}</Table.Td>
                            <Table.Td ta="center">식</Table.Td>
                            <Table.Td ta="right">{link.quantity}</Table.Td>
                            <Table.Td ta="right">{formatCurrency(unitPrice)}</Table.Td>
                            <Table.Td ta="right">{formatCurrency(totalPrice)}</Table.Td>
                            <Table.Td ta="center">프리셋</Table.Td>
                          </Table.Tr>
                        );
                      }),
                      ...selectedEstimateItems.map((item, i) => {
                        const totalPrice = item.quantity * item.unit_cost;
                        return (
                          <Table.Tr key={`item-${item.id}`}>
                            <Table.Td ta="center">{selectedLinks.length + i + 1}</Table.Td>
                            <Table.Td>{item.label}</Table.Td>
                            <Table.Td ta="center">-</Table.Td>
                            <Table.Td ta="right">{item.quantity}</Table.Td>
                            <Table.Td ta="right">{formatCurrency(item.unit_cost)}</Table.Td>
                            <Table.Td ta="right">{formatCurrency(totalPrice)}</Table.Td>
                            <Table.Td ta="center">
                              {item.cost_category === "material"
                                ? "재료"
                                : item.cost_category === "labor"
                                  ? "노무"
                                  : "경비"}
                            </Table.Td>
                          </Table.Tr>
                        );
                      }),
                    ]}
                  </Table.Tbody>
                </Table>

                <Group justify="flex-end" mt="xl">
                  <Stack gap={0} align="flex-end">
                    <Text size="sm" c="dimmed">
                      위와 같이 견적을 제출합니다.
                    </Text>
                  </Stack>
                </Group>
              </Stack>
            )}
          </div>
        </div>
      </Paper>

      <Modal
        opened={estimateModalOpened}
        onClose={estimateModal.close}
        title="새 견적 만들기"
        centered
        radius="md"
      >
        <Stack>
          <TextInput
            label="견적명"
            placeholder="예: A동 신축공사"
            required
            value={estimateForm.name}
            onChange={(e) => setEstimateForm({ ...estimateForm, name: e.currentTarget.value })}
          />
          <TextInput
            label="설명"
            placeholder="간단한 메모"
            value={estimateForm.description}
            onChange={(e) =>
              setEstimateForm({ ...estimateForm, description: e.currentTarget.value })
            }
          />
          <Group justify="flex-end" mt="md">
            <Button variant="light" color="gray" onClick={estimateModal.close}>
              취소
            </Button>
            <Button color="indigo" onClick={handleCreateEstimate} loading={savingEstimate}>
              만들기
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={linkModalOpened}
        onClose={linkModal.close}
        title="항목 추가"
        centered
        size="lg"
        radius="md"
      >
        <Stack>
          <SegmentedControl
            value={addMode}
            onChange={(val) => setAddMode(val as any)}
            data={[
              { label: "프리셋 불러오기", value: "preset" },
              { label: "자재 선택", value: "material" },
              { label: "직접 입력", value: "manual" },
            ]}
          />

          {addMode === "preset" && (
            <>
              <SearchableSelect
                label="프리셋 선택"
                placeholder="검색 후 선택"
                options={presets.map((p) => ({ value: p.id, label: p.name }))}
                value={linkForm.preset_id}
                onChange={(val) => setLinkForm({ ...linkForm, preset_id: val })}
              />
              <NumberInput
                label="수량"
                min={1}
                value={linkForm.quantity}
                onChange={(val) =>
                  setLinkForm({ ...linkForm, quantity: typeof val === "number" ? val : 1 })
                }
              />
              <Group justify="flex-end" mt="md">
                <Button color="indigo" onClick={handleAddPreset} loading={savingLink}>
                  추가하기
                </Button>
              </Group>
            </>
          )}

          {addMode === "material" && (
            <>
              <Group mb="xs" gap="xs">
                <Button
                  size="compact-xs"
                  variant={materialCategoryFilter === MATERIAL_FILTER_ALL ? "filled" : "light"}
                  color="gray"
                  onClick={() => setMaterialCategoryFilter(MATERIAL_FILTER_ALL)}
                >
                  전체
                </Button>
                {/* Simplify categories for brevity or maybe just map top few? */}
                {/* For now filter is just basic text */}
              </Group>
              <SearchableSelect
                label="자재 선택"
                placeholder="검색 후 선택"
                options={filteredMaterialOptions}
                value={estimateItemForm.material_id}
                onChange={(val) => {
                  const mat = materialMap.get(val);
                  if (mat) {
                    const cat = inferCostCategory(mat);
                    const cost =
                      cat === "material"
                        ? mat.material_unit_cost
                        : cat === "labor"
                          ? mat.labor_unit_cost
                          : mat.expense_unit_cost;
                    setEstimateItemForm({
                      ...estimateItemForm,
                      material_id: val,
                      label: getMaterialLabel(mat),
                      cost_category: cat,
                      unit_cost: asNumber(cost),
                    });
                  } else {
                    setEstimateItemForm({ ...estimateItemForm, material_id: val });
                  }
                }}
              />
              <NumberInput
                label="수량"
                min={1}
                value={estimateItemForm.quantity}
                onChange={(val) =>
                  setEstimateItemForm({
                    ...estimateItemForm,
                    quantity: typeof val === "number" ? val : 1,
                  })
                }
              />
              <Group grow>
                <TextInput
                  label="항목명 (자동)"
                  readOnly
                  value={estimateItemForm.label}
                  variant="filled"
                />
                <NumberInput
                  label="단가 (자동)"
                  readOnly
                  value={estimateItemForm.unit_cost}
                  thousandSeparator=","
                  variant="filled"
                />
              </Group>
              <Group justify="flex-end" mt="md">
                <Button color="indigo" onClick={handleAddMaterial} loading={savingLink}>
                  추가하기
                </Button>
              </Group>
            </>
          )}

          {addMode === "manual" && (
            <>
              <TextInput
                label="항목명"
                placeholder="예: 잡자재대"
                required
                value={estimateItemForm.label}
                onChange={(e) =>
                  setEstimateItemForm({ ...estimateItemForm, label: e.currentTarget.value })
                }
              />
              <SegmentedControl
                value={estimateItemForm.cost_category}
                onChange={(val) =>
                  setEstimateItemForm({
                    ...estimateItemForm,
                    cost_category: val as "material" | "labor" | "expense",
                  })
                }
                data={[
                  { label: "재료비", value: "material" },
                  { label: "노무비", value: "labor" },
                  { label: "경비", value: "expense" },
                ]}
              />
              <NumberInput
                label="수량"
                min={1}
                value={estimateItemForm.quantity}
                onChange={(val) =>
                  setEstimateItemForm({
                    ...estimateItemForm,
                    quantity: typeof val === "number" ? val : 1,
                  })
                }
              />
              <NumberInput
                label="단가"
                min={0}
                value={estimateItemForm.unit_cost}
                onChange={(val) =>
                  setEstimateItemForm({
                    ...estimateItemForm,
                    unit_cost: typeof val === "number" ? val : 0,
                  })
                }
                thousandSeparator=","
              />
              <Group justify="flex-end" mt="md">
                <Button color="indigo" onClick={handleAddMaterial} loading={savingLink}>
                  추가하기
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
