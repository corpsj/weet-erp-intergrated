"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Grid,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { asNumber, formatCurrency } from "@/lib/format";
import type { Material } from "@/lib/types";
import { SearchableSelect } from "@/components/SearchableSelect";

type SpecTemplateType =
  | "text"
  | "rectTube"
  | "hBeam"
  | "plateFt"
  | "lumberInch"
  | "timberSpecies"
  | "size2"
  | "size2T"
  | "size3"
  | "roll"
  | "rollT"
  | "size2Unit"
  | "codeSizeT"
  | "singleUnit";

type SpecTemplate = {
  type: SpecTemplateType;
  widthUnit?: "m" | "mm";
  suffixUnit?: string;
};

type InlineEditField =
  | "name"
  | "spec"
  | "material_unit_cost"
  | "labor_unit_cost"
  | "expense_unit_cost"
  | "note";

const normalizeSpec = (value: string) => {
  return value
    .replace(/\*+/g, "x")
    .replace(/""/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
};

const displaySpec = (value: string | null | undefined) => {
  if (!value) return "";
  return normalizeSpec(value);
};

const detectTemplate = (spec: string): SpecTemplate => {
  const raw = spec ?? "";
  const normalized = normalizeSpec(raw);
  if (!normalized) return { type: "text" };
  const compact = normalized.replace(/\s+/g, "");

  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?m-\d+(?:\.\d+)?T$/i.test(compact)) {
    return { type: "rectTube" };
  }
  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?m$/i.test(compact)) {
    return { type: "hBeam" };
  }
  if (/^\d+'x\d+'-\d+(?:\.\d+)?T$/i.test(compact)) {
    return { type: "plateFt" };
  }
  if (/^\d+(?:\.\d+)?\"x\d+(?:\.\d+)?\"x\d+(?:\.\d+)?'$/i.test(compact)) {
    return { type: "lumberInch" };
  }
  if (/^.+\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:\s+\d+본)?$/i.test(normalized)) {
    return { type: "timberSpecies" };
  }
  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?-\d+(?:\.\d+)?T$/i.test(compact) && !/m/i.test(compact)) {
    return { type: "size2T" };
  }
  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?$/i.test(compact)) {
    return { type: "size3" };
  }
  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?$/i.test(compact)) {
    return { type: "size2" };
  }
  if (/^\d+(?:\.\d+)?mmx\d+(?:\.\d+)?m$/i.test(compact)) {
    return { type: "roll", widthUnit: "mm" };
  }
  if (/^\d+(?:\.\d+)?mx\d+(?:\.\d+)?m$/i.test(compact)) {
    return { type: "roll", widthUnit: "m" };
  }
  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?m-\d+(?:\.\d+)?T$/i.test(compact)) {
    return { type: "rollT", widthUnit: "m" };
  }
  if (/^\d+(?:\.\d+)?x\d+(?:\.\d+)?m$/i.test(compact)) {
    return { type: "roll", widthUnit: "m" };
  }
  const sizeUnit = compact.match(
    /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)([A-Za-z]+)$/i
  );
  if (sizeUnit) {
    return { type: "size2Unit", suffixUnit: sizeUnit[4] };
  }
  const codeSize = normalized.match(
    /^([A-Za-z0-9]+)\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)T$/i
  );
  if (codeSize) {
    return { type: "codeSizeT" };
  }
  const singleUnit = compact.match(/^(\d+(?:\.\d+)?)([A-Za-z㎡㎥㎟㎜㎝m²R]+)$/i);
  if (singleUnit) {
    return { type: "singleUnit", suffixUnit: singleUnit[2] };
  }
  return { type: "text" };
};

const emptySpecValues = (template: SpecTemplate): Record<string, string> => {
  switch (template.type) {
    case "rectTube":
      return { w: "", h: "", l: "", t: "" };
    case "hBeam":
      return { h: "", b: "", tw: "", tf: "", l: "" };
    case "plateFt":
      return { w: "", l: "", t: "" };
    case "lumberInch":
      return { w: "", h: "", l: "" };
    case "timberSpecies":
      return { species: "", w: "", h: "", l: "", count: "" };
    case "size2":
      return { w: "", h: "" };
    case "size2T":
      return { w: "", h: "", t: "" };
    case "size3":
      return { w: "", h: "", d: "" };
    case "roll":
      return { w: "", l: "" };
    case "rollT":
      return { w: "", l: "", t: "" };
    case "size2Unit":
      return { w: "", h: "", v: "" };
    case "codeSizeT":
      return { code: "", w: "", h: "", t: "" };
    case "singleUnit":
      return { v: "" };
    default:
      return { text: "" };
  }
};

const parseSpecValues = (spec: string, template: SpecTemplate): Record<string, string> => {
  const normalized = normalizeSpec(spec ?? "");
  const compact = normalized.replace(/\s+/g, "");
  switch (template.type) {
    case "rectTube": {
      const match = compact.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)m-(\d+(?:\.\d+)?)T$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], h: match[2], l: match[3], t: match[4] };
    }
    case "hBeam": {
      const match = compact.match(
        /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)m$/i
      );
      if (!match) return emptySpecValues(template);
      return { h: match[1], b: match[2], tw: match[3], tf: match[4], l: match[5] };
    }
    case "plateFt": {
      const match = compact.match(/^(\d+)'x(\d+)'-(\d+(?:\.\d+)?)T$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], l: match[2], t: match[3] };
    }
    case "lumberInch": {
      const match = compact.match(/^(\d+(?:\.\d+)?)\"x(\d+(?:\.\d+)?)\"x(\d+(?:\.\d+)?)'$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], h: match[2], l: match[3] };
    }
    case "timberSpecies": {
      const match = normalized.match(
        /^(.+?)\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:\s+(\d+))?\s*(?:본)?$/i
      );
      if (!match) return emptySpecValues(template);
      return {
        species: match[1],
        w: match[2],
        h: match[3],
        l: match[4],
        count: match[5] ?? "",
      };
    }
    case "size2T": {
      const match = compact.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)T$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], h: match[2], t: match[3] };
    }
    case "size3": {
      const match = compact.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], h: match[2], d: match[3] };
    }
    case "size2": {
      const match = compact.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], h: match[2] };
    }
    case "rollT": {
      const match = compact.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)m-(\d+(?:\.\d+)?)T$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], l: match[2], t: match[3] };
    }
    case "roll": {
      const match = compact.match(/^(\d+(?:\.\d+)?)(mm|m)?x(\d+(?:\.\d+)?)(m)$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], l: match[3] };
    }
    case "size2Unit": {
      const match = compact.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)([A-Za-z]+)$/i);
      if (!match) return emptySpecValues(template);
      return { w: match[1], h: match[2], v: match[3] };
    }
    case "codeSizeT": {
      const match = normalized.match(/^([A-Za-z0-9]+)\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)T$/i);
      if (!match) return emptySpecValues(template);
      return { code: match[1], w: match[2], h: match[3], t: match[4] };
    }
    case "singleUnit": {
      const match = compact.match(/^(\d+(?:\.\d+)?)([A-Za-z㎡㎥㎟㎜㎝m²R]+)$/i);
      if (!match) return emptySpecValues(template);
      return { v: match[1] };
    }
    default:
      return { text: spec ?? "" };
  }
};

const formatSpec = (values: Record<string, string>, template: SpecTemplate) => {
  switch (template.type) {
    case "rectTube":
      return `${values.w}x${values.h}x${values.l}m-${values.t}T`;
    case "hBeam":
      return `${values.h}x${values.b}x${values.tw}x${values.tf}x${values.l}m`;
    case "plateFt":
      return `${values.w}'x${values.l}'-${values.t}T`;
    case "lumberInch":
      return `${values.w}"x${values.h}"x${values.l}'`;
    case "timberSpecies": {
      const count = values.count ? ` ${values.count}본` : "";
      return `${values.species} ${values.w}x${values.h}x${values.l}${count}`.trim();
    }
    case "size2":
      return `${values.w}x${values.h}`;
    case "size2T":
      return `${values.w}x${values.h}-${values.t}T`;
    case "size3":
      return `${values.w}x${values.h}x${values.d}`;
    case "roll":
      return template.widthUnit === "mm"
        ? `${values.w}mmx${values.l}m`
        : `${values.w}x${values.l}m`;
    case "rollT":
      return `${values.w}x${values.l}m-${values.t}T`;
    case "size2Unit":
      return `${values.w}x${values.h}-${values.v}${template.suffixUnit ?? ""}`;
    case "codeSizeT":
      return `${values.code} ${values.w}x${values.h}x${values.t}T`.trim();
    case "singleUnit":
      return `${values.v}${template.suffixUnit ?? ""}`;
    default:
      return values.text ?? "";
  }
};

const isSpecComplete = (template: SpecTemplate, values: Record<string, string>) => {
  const required = (keys: string[]) => keys.every((key) => values[key]?.toString().trim());
  switch (template.type) {
    case "rectTube":
      return required(["w", "h", "l", "t"]);
    case "hBeam":
      return required(["h", "b", "tw", "tf", "l"]);
    case "plateFt":
      return required(["w", "l", "t"]);
    case "lumberInch":
      return required(["w", "h", "l"]);
    case "timberSpecies":
      return required(["species", "w", "h", "l"]);
    case "size2":
      return required(["w", "h"]);
    case "size2T":
      return required(["w", "h", "t"]);
    case "size3":
      return required(["w", "h", "d"]);
    case "roll":
      return required(["w", "l"]);
    case "rollT":
      return required(["w", "l", "t"]);
    case "size2Unit":
      return required(["w", "h", "v"]);
    case "codeSizeT":
      return required(["code", "w", "h", "t"]);
    case "singleUnit":
      return required(["v"]);
    default:
      return true;
  }
}; const emptyForm = {
  category: "",
  name: "",
  spec: "",
  unit: "",
  material_unit_cost: 0,
  labor_unit_cost: 0,
  expense_unit_cost: 0,
  note: "",
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{
    id: string;
    field: InlineEditField;
    value: string;
    original: string;
  } | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const inlineSavingRef = useRef(false);
  const [inlineSpecTemplate, setInlineSpecTemplate] = useState<SpecTemplate>({ type: "text" });
  const [inlineSpecValues, setInlineSpecValues] = useState<Record<string, string>>({ text: "" });
  const inlineSpecPointerRef = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [categorySelect, setCategorySelect] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [itemSelect, setItemSelect] = useState<string | null>(null);
  const [customItem, setCustomItem] = useState("");
  const [unitSelect, setUnitSelect] = useState<string | null>(null);
  const [specTemplate, setSpecTemplate] = useState<SpecTemplate>({ type: "text" });
  const [specValues, setSpecValues] = useState<Record<string, string>>({ text: "" });

  const loadMaterials = useCallback(async () => {
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .order("sort_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      notifications.show({
        title: "자재 불러오기 실패",
        message: error.message,
        color: "red",
      });
      return;
    }

    const normalized = ((data as Material[]) ?? []).map((item) => ({
      ...item,
      material_unit_cost: asNumber(item.material_unit_cost),
      labor_unit_cost: asNumber(item.labor_unit_cost),
      expense_unit_cost: asNumber(item.expense_unit_cost),
      sort_index: asNumber(item.sort_index),
    }));
    setMaterials(normalized);
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return materials;
    return materials.filter((item) => {
      return (
        item.category?.toLowerCase().includes(keyword) ||
        item.name?.toLowerCase().includes(keyword) ||
        item.spec?.toLowerCase().includes(keyword) ||
        item.unit?.toLowerCase().includes(keyword)
      );
    });
  }, [materials, search]);

  const categoryOptions = useMemo(() => {
    const categories: string[] = [];
    const seen = new Set<string>();
    filtered.forEach((material) => {
      const category = material.category?.trim() || "미분류";
      if (!seen.has(category)) {
        seen.add(category);
        categories.push(category);
      }
    });
    return categories;
  }, [filtered]);

  const categoryOptionsAll = useMemo(() => {
    const categories: string[] = [];
    const seen = new Set<string>();
    materials.forEach((material) => {
      const category = material.category?.trim() || "미분류";
      if (!seen.has(category)) {
        seen.add(category);
        categories.push(category);
      }
    });
    return categories;
  }, [materials]);

  const itemOptions = useMemo(() => {
    if (!selectedCategory) return [];
    const items: string[] = [];
    const seen = new Set<string>();
    filtered.forEach((material) => {
      const category = material.category?.trim() || "미분류";
      if (category === selectedCategory) {
        const name = material.name?.trim() || "미지정";
        if (!seen.has(name)) {
          seen.add(name);
          items.push(name);
        }
      }
    });
    return items;
  }, [filtered, selectedCategory]);

  const modalItemOptions = useMemo(() => {
    const currentCategory =
      categorySelect === "__custom__" ? customCategory.trim() : categorySelect;
    if (!currentCategory) return [];
    const items: string[] = [];
    const seen = new Set<string>();
    materials.forEach((material) => {
      const category = material.category?.trim() || "미분류";
      if (category === currentCategory) {
        const name = material.name?.trim() || "미지정";
        if (!seen.has(name)) {
          seen.add(name);
          items.push(name);
        }
      }
    });
    return items;
  }, [categorySelect, customCategory, materials]);

  const unitOptionsAll = useMemo(() => {
    const units: string[] = [];
    const seen = new Set<string>();
    materials.forEach((material) => {
      const unit = material.unit?.trim();
      if (unit && !seen.has(unit)) {
        seen.add(unit);
        units.push(unit);
      }
    });
    const formUnit = form.unit?.trim();
    if (formUnit && !seen.has(formUnit)) {
      units.push(formUnit);
    }
    if (!seen.has("ea")) {
      units.push("ea");
    }
    return units;
  }, [form.unit, materials]);

  const currentCategory =
    categorySelect === "__custom__" ? customCategory.trim() : categorySelect ?? "";
  const currentItem = itemSelect === "__custom__" ? customItem.trim() : itemSelect ?? "";
  const editingCategory = editing?.category?.trim() ?? "";
  const editingItem = editing?.name?.trim() ?? "";
  const useEditingSpec =
    Boolean(editing) &&
    currentCategory === editingCategory &&
    currentItem === editingItem;
  const sampleSpec = useMemo(() => {
    if (!currentCategory || !currentItem) return "";
    const match = materials.find(
      (material) =>
        (material.category?.trim() || "미분류") === currentCategory &&
        (material.name?.trim() || "미지정") === currentItem &&
        material.spec
    );
    return match?.spec ?? "";
  }, [currentCategory, currentItem, materials]);
  const templateSpec = useEditingSpec ? editing?.spec ?? "" : sampleSpec;
  const detectedTemplate = useMemo(() => detectTemplate(templateSpec), [templateSpec]);

  const selectedMaterials = useMemo(() => {
    if (!selectedCategory || !selectedItem) return [];
    return filtered
      .filter((material) => {
        const category = material.category?.trim() || "미분류";
        const name = material.name?.trim() || "미지정";
        return category === selectedCategory && name === selectedItem;
      })
      .slice()
      .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
  }, [filtered, selectedCategory, selectedItem]);

  useEffect(() => {
    if (!categoryOptions.length) {
      setSelectedCategory(null);
      return;
    }
    if (!selectedCategory || !categoryOptions.includes(selectedCategory)) {
      setSelectedCategory(categoryOptions[0]);
    }
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    if (!itemOptions.length) {
      setSelectedItem(null);
      return;
    }
    if (!selectedItem || !itemOptions.includes(selectedItem)) {
      setSelectedItem(itemOptions[0]);
    }
  }, [itemOptions, selectedItem]);

  useEffect(() => {
    if (!opened) return;
    setSpecTemplate(detectedTemplate);
    if (useEditingSpec && editing) {
      setSpecValues(parseSpecValues(editing.spec ?? "", detectedTemplate));
    } else {
      setSpecValues(emptySpecValues(detectedTemplate));
    }
  }, [detectedTemplate, editing, opened, useEditingSpec]);

  const isMetalGalvanized =
    currentCategory === "금속" && currentItem === "아연각관";

  useEffect(() => {
    if (isMetalGalvanized && !form.unit) {
      setForm((prev) => ({ ...prev, unit: "ea" }));
    }
  }, [form.unit, isMetalGalvanized]);

  useEffect(() => {
    if (!categoryOptionsAll.length) {
      setCategorySelect("__custom__");
      return;
    }
    if (!categorySelect || !categoryOptionsAll.includes(categorySelect)) {
      setCategorySelect(categoryOptionsAll[0]);
    }
  }, [categoryOptionsAll, categorySelect]);

  useEffect(() => {
    if (!itemSelect && modalItemOptions.length) {
      setItemSelect(modalItemOptions[0]);
    }
  }, [modalItemOptions, itemSelect]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    const defaultCategory = categoryOptionsAll[0] ?? "";
    setCategorySelect(defaultCategory || "__custom__");
    setCustomCategory("");
    setItemSelect(null);
    setCustomItem("");
    setUnitSelect(unitOptionsAll[0] ?? "ea");
    setSpecValues({ text: "" });
    open();
  };

  const openEdit = (material: Material) => {
    const categoryValue = material.category?.trim() || "";
    const itemValue = material.name?.trim() || "";
    const categoryExists = categoryOptionsAll.includes(categoryValue);
    setCategorySelect(categoryExists ? categoryValue : "__custom__");
    setCustomCategory(categoryExists ? "" : categoryValue);
    const itemExists = materials.some(
      (item) => (item.category?.trim() || "미분류") === categoryValue && item.name?.trim() === itemValue
    );
    setItemSelect(itemExists ? itemValue : "__custom__");
    setCustomItem(itemExists ? "" : itemValue);
    setEditing(material);
    const template = detectTemplate(material.spec ?? "");
    setSpecTemplate(template);
    setSpecValues(parseSpecValues(material.spec ?? "", template));
    setUnitSelect(material.unit ?? "");
    setForm({
      category: material.category ?? "",
      name: material.name ?? "",
      spec: material.spec ?? "",
      unit: material.unit ?? "",
      material_unit_cost: material.material_unit_cost ?? 0,
      labor_unit_cost: material.labor_unit_cost ?? 0,
      expense_unit_cost: material.expense_unit_cost ?? 0,
      note: material.note ?? "",
    });
    open();
  };

  const handleSave = async () => {
    const categoryValue =
      categorySelect === "__custom__" ? customCategory.trim() : categorySelect ?? "";
    const itemValue = itemSelect === "__custom__" ? customItem.trim() : itemSelect ?? "";

    if (!categoryValue || !itemValue) {
      notifications.show({
        title: "필수 입력",
        message: "구분과 품목을 입력해주세요.",
        color: "red",
      });
      return;
    }

    setLoading(true);

    const rawSpec =
      specTemplate.type === "text" ? form.spec : formatSpec(specValues, specTemplate);
    const specValue = normalizeSpec(rawSpec);

    if (specTemplate.type !== "text" && !isSpecComplete(specTemplate, specValues)) {
      setLoading(false);
      notifications.show({
        title: "규격 입력 필요",
        message: "규격을 모두 입력해주세요.",
        color: "red",
      });
      return;
    }

    const unitValue = unitSelect ?? form.unit;
    const payload = {
      category: categoryValue,
      name: itemValue,
      spec: specValue,
      unit: unitValue,
      material_unit_cost: form.material_unit_cost || 0,
      labor_unit_cost: form.labor_unit_cost || 0,
      expense_unit_cost: form.expense_unit_cost || 0,
      note: form.note,
    };

    const { error } = editing
      ? await supabase.from("materials").update(payload).eq("id", editing.id)
      : await supabase.from("materials").insert(payload);

    setLoading(false);

    if (error) {
      notifications.show({
        title: "저장 실패",
        message: error.message,
        color: "red",
      });
      return;
    }

    notifications.show({
      title: "저장 완료",
      message: "자재가 저장되었습니다.",
      color: "gray",
    });

    close();
    await loadMaterials();
  };

  const handleDelete = async (material: Material) => {
    const confirmed = window.confirm(`${material.name} 삭제하시겠습니까?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from("materials")
      .delete()
      .eq("id", material.id);

    if (error) {
      notifications.show({
        title: "삭제 실패",
        message: error.message,
        color: "red",
      });
      return;
    }

    notifications.show({
      title: "삭제 완료",
      message: "자재가 삭제되었습니다.",
      color: "gray",
    });

    await loadMaterials();
  };

  const numberValue = (value: string) => {
    if (!value) return "";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : "";
  };

  const updateSpecValue = (key: string, value: number | string | null) => {
    setSpecValues((prev) => ({
      ...prev,
      [key]: value === null || value === "" ? "" : String(value),
    }));
  };

  const getInputValue = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    event?.currentTarget?.value ?? "";

  const startInlineEdit = (material: Material, field: InlineEditField) => {
    if (field === "spec") {
      const template = detectTemplate(material.spec ?? "");
      const values = parseSpecValues(material.spec ?? "", template);
      const formatted =
        template.type === "text" ? displaySpec(material.spec) || "" : formatSpec(values, template);
      setInlineSpecTemplate(template);
      setInlineSpecValues(values);
      setInlineEdit({
        id: material.id,
        field,
        value: formatted,
        original: formatted,
      });
      return;
    }
    if (field === "material_unit_cost") {
      const initialValue = String(material.material_unit_cost ?? 0);
      setInlineEdit({
        id: material.id,
        field,
        value: initialValue,
        original: initialValue,
      });
      return;
    }
    if (field === "labor_unit_cost") {
      const initialValue = String(material.labor_unit_cost ?? 0);
      setInlineEdit({
        id: material.id,
        field,
        value: initialValue,
        original: initialValue,
      });
      return;
    }
    if (field === "expense_unit_cost") {
      const initialValue = String(material.expense_unit_cost ?? 0);
      setInlineEdit({
        id: material.id,
        field,
        value: initialValue,
        original: initialValue,
      });
      return;
    }
    if (field === "note") {
      const initialValue = material.note ?? "";
      setInlineEdit({
        id: material.id,
        field,
        value: initialValue,
        original: initialValue,
      });
      return;
    }

    const initialValue = material.name ?? "";
    setInlineEdit({
      id: material.id,
      field,
      value: initialValue,
      original: initialValue,
    });
  };

  const cancelInlineEdit = () => {
    setInlineEdit(null);
  };

  const commitInlineEdit = async () => {
    if (!inlineEdit || inlineSavingRef.current) return;

    if (inlineEdit.field === "spec") {
      if (inlineSpecTemplate.type !== "text" && !isSpecComplete(inlineSpecTemplate, inlineSpecValues)) {
        notifications.show({
          title: "규격 입력 필요",
          message: "규격을 모두 입력해주세요.",
          color: "red",
        });
        return;
      }

      const nextSpecRaw =
        inlineSpecTemplate.type === "text"
          ? (inlineSpecValues.text ?? "").trim()
          : formatSpec(inlineSpecValues, inlineSpecTemplate);
      const normalizedSpec = nextSpecRaw ? normalizeSpec(nextSpecRaw) : "";
      const originalSpec = normalizeSpec(inlineEdit.original ?? "");

      if (normalizedSpec === originalSpec) {
        setInlineEdit(null);
        return;
      }

      inlineSavingRef.current = true;
      setInlineSaving(true);

      const { error } = await supabase
        .from("materials")
        .update({ spec: normalizedSpec || null })
        .eq("id", inlineEdit.id);

      setInlineSaving(false);
      inlineSavingRef.current = false;

      if (error) {
        notifications.show({
          title: "수정 실패",
          message: error.message,
          color: "red",
        });
        return;
      }

      setInlineEdit(null);
      await loadMaterials();
      return;
    }

    if (
      inlineEdit.field === "material_unit_cost" ||
      inlineEdit.field === "labor_unit_cost" ||
      inlineEdit.field === "expense_unit_cost"
    ) {
      const nextValue = asNumber(inlineEdit.value, 0);
      const originalValue = asNumber(inlineEdit.original, 0);

      if (nextValue === originalValue) {
        setInlineEdit(null);
        return;
      }

      inlineSavingRef.current = true;
      setInlineSaving(true);

      const { error } = await supabase
        .from("materials")
        .update({ [inlineEdit.field]: nextValue })
        .eq("id", inlineEdit.id);

      setInlineSaving(false);
      inlineSavingRef.current = false;

      if (error) {
        notifications.show({
          title: "수정 실패",
          message: error.message,
          color: "red",
        });
        return;
      }

      setInlineEdit(null);
      await loadMaterials();
      return;
    }

    if (inlineEdit.field === "note") {
      const nextValue = inlineEdit.value.trim();
      const originalValue = inlineEdit.original.trim();

      if (nextValue === originalValue) {
        setInlineEdit(null);
        return;
      }

      inlineSavingRef.current = true;
      setInlineSaving(true);

      const { error } = await supabase
        .from("materials")
        .update({ note: nextValue || null })
        .eq("id", inlineEdit.id);

      setInlineSaving(false);
      inlineSavingRef.current = false;

      if (error) {
        notifications.show({
          title: "수정 실패",
          message: error.message,
          color: "red",
        });
        return;
      }

      setInlineEdit(null);
      await loadMaterials();
      return;
    }

    const nextValue = inlineEdit.value.trim();
    const originalValue = inlineEdit.original.trim();

    if (nextValue === originalValue) {
      setInlineEdit(null);
      return;
    }

    if (!nextValue) {
      notifications.show({
        title: "품목 입력 필요",
        message: "품목 이름을 입력해주세요.",
        color: "red",
      });
      setInlineEdit(null);
      return;
    }

    inlineSavingRef.current = true;
    setInlineSaving(true);

    const payload = { name: nextValue };
    const { error } = await supabase.from("materials").update(payload).eq("id", inlineEdit.id);

    setInlineSaving(false);
    inlineSavingRef.current = false;

    if (error) {
      notifications.show({
        title: "수정 실패",
        message: error.message,
        color: "red",
      });
      return;
    }

    setInlineEdit(null);
    await loadMaterials();
  };

  const updateInlineSpecValue = (key: string, value: number | string | null) => {
    setInlineSpecValues((prev) => {
      const next = {
        ...prev,
        [key]: value === null || value === "" ? "" : String(value),
      };
      const nextSpec =
        inlineSpecTemplate.type === "text" ? next.text ?? "" : formatSpec(next, inlineSpecTemplate);
      setInlineEdit((prevEdit) => (prevEdit ? { ...prevEdit, value: nextSpec } : prevEdit));
      return next;
    });
  };
  const markInlineSpecPointer = () => {
    inlineSpecPointerRef.current = true;
    window.setTimeout(() => {
      inlineSpecPointerRef.current = false;
    }, 0);
  };

  const handleInlineSpecBlur = (event: React.FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    if (inlineSpecPointerRef.current) {
      return;
    }
    if (inlineEdit?.field === "spec") {
      void commitInlineEdit();
    }
  };

  const handleInlineKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitInlineEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEdit();
    }
  };

  const renderSpecFields = ({
    template,
    values,
    onChange,
    textValue,
    onTextChange,
    size = "sm",
    withLabel = true,
  }: {
    template: SpecTemplate;
    values: Record<string, string>;
    onChange: (key: string, value: number | string | null) => void;
    textValue: string;
    onTextChange: (value: string) => void;
    size?: "xs" | "sm" | "md";
    withLabel?: boolean;
  }) => {
    const label = withLabel ? "규격" : undefined;
    switch (template.type) {
      case "rectTube":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="가로"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={64}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="세로"
              value={numberValue(values.h)}
              onChange={(value) => onChange("h", value)}
              hideControls
              min={0}
              w={64}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="길이"
              value={numberValue(values.l)}
              onChange={(value) => onChange("l", value)}
              hideControls
              min={0}
              w={36}
              size={size}
            />
            <Text>m</Text>
            <Text>-</Text>
            <NumberInput
              placeholder="두께"
              value={numberValue(values.t)}
              onChange={(value) => onChange("t", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
            <Text>T</Text>
          </Group>
        );
      case "hBeam":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="높이"
              value={numberValue(values.h)}
              onChange={(value) => onChange("h", value)}
              hideControls
              min={0}
              w={64}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="폭"
              value={numberValue(values.b)}
              onChange={(value) => onChange("b", value)}
              hideControls
              min={0}
              w={64}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="웹두께"
              value={numberValue(values.tw)}
              onChange={(value) => onChange("tw", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="플랜지두께"
              value={numberValue(values.tf)}
              onChange={(value) => onChange("tf", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="길이"
              value={numberValue(values.l)}
              onChange={(value) => onChange("l", value)}
              hideControls
              min={0}
              w={36}
              size={size}
            />
            <Text>m</Text>
          </Group>
        );
      case "plateFt":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="폭"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={56}
              size={size}
            />
            <Text>&apos;</Text>
            <Text>x</Text>
            <NumberInput
              placeholder="길이"
              value={numberValue(values.l)}
              onChange={(value) => onChange("l", value)}
              hideControls
              min={0}
              w={36}
              size={size}
            />
            <Text>&apos;</Text>
            <Text>-</Text>
            <NumberInput
              placeholder="두께"
              value={numberValue(values.t)}
              onChange={(value) => onChange("t", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
            <Text>T</Text>
          </Group>
        );
      case "lumberInch":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="두께"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
            <Text>&quot;</Text>
            <Text>x</Text>
            <NumberInput
              placeholder="폭"
              value={numberValue(values.h)}
              onChange={(value) => onChange("h", value)}
              hideControls
              min={0}
              w={56}
              size={size}
            />
            <Text>&quot;</Text>
            <Text>x</Text>
            <NumberInput
              placeholder="길이"
              value={numberValue(values.l)}
              onChange={(value) => onChange("l", value)}
              hideControls
              min={0}
              w={36}
              size={size}
            />
            <Text>&apos;</Text>
          </Group>
        );
      case "timberSpecies":
        return (
          <Stack gap="xs">
            <TextInput
              label={label}
              placeholder="수종"
              value={values.species ?? ""}
              onChange={(event) => onChange("species", getInputValue(event))}
              size={size}
            />
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <NumberInput
                placeholder="가로"
                value={numberValue(values.w)}
                onChange={(value) => onChange("w", value)}
                hideControls
                min={0}
                w={64}
                size={size}
              />
              <Text>x</Text>
              <NumberInput
                placeholder="세로"
                value={numberValue(values.h)}
                onChange={(value) => onChange("h", value)}
                hideControls
                min={0}
                w={64}
                size={size}
              />
              <Text>x</Text>
              <NumberInput
                placeholder="길이"
                value={numberValue(values.l)}
                onChange={(value) => onChange("l", value)}
                hideControls
                min={0}
                w={36}
                size={size}
              />
              <NumberInput
                placeholder="본수"
                value={numberValue(values.count)}
                onChange={(value) => onChange("count", value)}
                hideControls
                min={0}
                w={64}
                size={size}
              />
              <Text>본</Text>
            </Group>
          </Stack>
        );
      case "size2":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="가로"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="세로"
              value={numberValue(values.h)}
              onChange={(value) => onChange("h", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
          </Group>
        );
      case "size2T":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="가로"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="세로"
              value={numberValue(values.h)}
              onChange={(value) => onChange("h", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>-</Text>
            <NumberInput
              placeholder="두께"
              value={numberValue(values.t)}
              onChange={(value) => onChange("t", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
            <Text>T</Text>
          </Group>
        );
      case "size3":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="가로"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="세로"
              value={numberValue(values.h)}
              onChange={(value) => onChange("h", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="두께"
              value={numberValue(values.d)}
              onChange={(value) => onChange("d", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
          </Group>
        );
      case "roll":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="폭"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>{template.widthUnit ?? "m"}</Text>
            <Text>x</Text>
            <NumberInput
              placeholder="길이"
              value={numberValue(values.l)}
              onChange={(value) => onChange("l", value)}
              hideControls
              min={0}
              w={36}
              size={size}
            />
            <Text>m</Text>
          </Group>
        );
      case "rollT":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="폭"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="길이"
              value={numberValue(values.l)}
              onChange={(value) => onChange("l", value)}
              hideControls
              min={0}
              w={36}
              size={size}
            />
            <Text>m</Text>
            <Text>-</Text>
            <NumberInput
              placeholder="두께"
              value={numberValue(values.t)}
              onChange={(value) => onChange("t", value)}
              hideControls
              min={0}
              w={32}
              size={size}
            />
            <Text>T</Text>
          </Group>
        );
      case "size2Unit":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="가로"
              value={numberValue(values.w)}
              onChange={(value) => onChange("w", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>x</Text>
            <NumberInput
              placeholder="세로"
              value={numberValue(values.h)}
              onChange={(value) => onChange("h", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>-</Text>
            <NumberInput
              placeholder="값"
              value={numberValue(values.v)}
              onChange={(value) => onChange("v", value)}
              hideControls
              min={0}
              w={68}
              size={size}
            />
            <Text>{template.suffixUnit ?? ""}</Text>
          </Group>
        );
      case "codeSizeT":
        return (
          <Stack gap="xs">
            <TextInput
              label={label}
              placeholder="코드"
              value={values.code ?? ""}
              onChange={(event) => onChange("code", getInputValue(event))}
              size={size}
            />
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <NumberInput
                placeholder="가로"
                value={numberValue(values.w)}
                onChange={(value) => onChange("w", value)}
                hideControls
                min={0}
                w={68}
                size={size}
              />
              <Text>x</Text>
              <NumberInput
                placeholder="세로"
                value={numberValue(values.h)}
                onChange={(value) => onChange("h", value)}
                hideControls
                min={0}
                w={68}
                size={size}
              />
              <Text>x</Text>
              <NumberInput
                placeholder="두께"
                value={numberValue(values.t)}
                onChange={(value) => onChange("t", value)}
                hideControls
                min={0}
                w={32}
                size={size}
              />
              <Text>T</Text>
            </Group>
          </Stack>
        );
      case "singleUnit":
        return (
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={label}
              placeholder="값"
              value={numberValue(values.v)}
              onChange={(value) => onChange("v", value)}
              hideControls
              min={0}
              w={76}
              size={size}
            />
            <Text>{template.suffixUnit ?? ""}</Text>
          </Group>
        );
      default:
        return (
          <TextInput
            label={label}
            placeholder="규격"
            value={textValue}
            onChange={(event) => onTextChange(getInputValue(event))}
            size={size}
          />
        );
    }
  };

  const renderSpecInput = () =>
    renderSpecFields({
      template: specTemplate,
      values: specValues,
      onChange: updateSpecValue,
      textValue: form.spec,
      onTextChange: (value) => {
        setForm((prev) => ({ ...prev, spec: value }));
        updateSpecValue("text", value);
      },
      size: "sm",
      withLabel: true,
    });

  const renderInlineSpecInput = () => (
    <Box
      onKeyDownCapture={handleInlineKeyDown}
      onBlurCapture={handleInlineSpecBlur}
      onMouseDownCapture={markInlineSpecPointer}
      onTouchStartCapture={markInlineSpecPointer}
    >
      {renderSpecFields({
        template: inlineSpecTemplate,
        values: inlineSpecValues,
        onChange: updateInlineSpecValue,
        textValue: inlineEdit?.value ?? "",
        onTextChange: (value) => updateInlineSpecValue("text", value),
        size: "xs",
        withLabel: false,
      })}
    </Box>
  );

  return (
    <Stack gap="md">
      <Paper className="app-surface" p="md" radius="md">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <TextInput
            placeholder="구분, 품목, 규격 검색"
            value={search}
            onChange={(event) => setSearch(getInputValue(event))}
            w={{ base: "100%", sm: 320 }}
          />
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              총 {filtered.length}건
            </Text>
            <Button color="gray" onClick={openNew}>
              신규 자재
            </Button>
          </Group>
        </Group>
        <Divider my="sm" />
        <Tabs defaultValue="hierarchy">
          <Tabs.List>
            <Tabs.Tab value="hierarchy">단계별</Tabs.Tab>
            <Tabs.Tab value="list">리스트</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="hierarchy" pt="sm">
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Paper withBorder p="md" radius="md">
                  <Text fw={600} mb="sm">
                    구분
                  </Text>
                  <Box style={{ maxHeight: 520, overflowY: "auto" }}>
                    <Stack gap="xs">
                      {categoryOptions.map((category) => (
                        <Button
                          key={category}
                          variant={selectedCategory === category ? "filled" : "light"}
                          color="gray"
                          fullWidth
                          onClick={() => setSelectedCategory(category)}
                        >
                          {category}
                        </Button>
                      ))}
                      {!categoryOptions.length && (
                        <Text size="sm" c="dimmed">
                          표시할 구분이 없습니다.
                        </Text>
                      )}
                    </Stack>
                  </Box>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Paper withBorder p="md" radius="md">
                  <Text fw={600} mb="sm">
                    품목
                  </Text>
                  <Box style={{ maxHeight: 520, overflowY: "auto" }}>
                    <Stack gap="xs">
                      {itemOptions.map((item) => (
                        <Button
                          key={item}
                          variant={selectedItem === item ? "filled" : "light"}
                          color="gray"
                          fullWidth
                          onClick={() => setSelectedItem(item)}
                        >
                          {item}
                        </Button>
                      ))}
                      {!itemOptions.length && (
                        <Text size="sm" c="dimmed">
                          표시할 품목이 없습니다.
                        </Text>
                      )}
                    </Stack>
                  </Box>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper withBorder p="md" radius="md">
                  <Text fw={600} mb="sm">
                    자재
                  </Text>
                  <Box style={{ maxHeight: 520, overflowY: "auto" }}>
                    <Stack gap="sm">
                      {selectedMaterials.map((material) => (
                        <Paper key={material.id} withBorder p="sm" radius="md">
                          <Group justify="space-between" align="flex-start" wrap="wrap">
                            <Box>
                              {inlineEdit?.id === material.id && inlineEdit.field === "name" ? (
                                <TextInput
                                  value={inlineEdit.value}
                                  onChange={(event) =>
                                    setInlineEdit((prev) =>
                                      prev ? { ...prev, value: getInputValue(event) } : prev
                                    )
                                  }
                                  onKeyDown={handleInlineKeyDown}
                                  onBlur={() => void commitInlineEdit()}
                                  size="xs"
                                  autoFocus
                                  disabled={inlineSaving}
                                />
                              ) : (
                                <Text
                                  fw={600}
                                  size="sm"
                                  role="button"
                                  tabIndex={0}
                                  style={{ cursor: "pointer" }}
                                  onClick={() => startInlineEdit(material, "name")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      startInlineEdit(material, "name");
                                    }
                                  }}
                                >
                                  {material.name}
                                </Text>
                              )}
                              {inlineEdit?.id === material.id && inlineEdit.field === "spec" ? (
                                renderInlineSpecInput()
                              ) : (
                                <Text
                                  size="xs"
                                  c={displaySpec(material.spec) ? undefined : "dimmed"}
                                  role="button"
                                  tabIndex={0}
                                  style={{ cursor: "pointer" }}
                                  onClick={() => startInlineEdit(material, "spec")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      startInlineEdit(material, "spec");
                                    }
                                  }}
                                >
                                  {displaySpec(material.spec) || "규격 없음"}
                                </Text>
                              )}
                              <Text size="xs" c="dimmed">
                                {material.unit || "단위 없음"}
                              </Text>
                              {inlineEdit?.id === material.id && inlineEdit.field === "note" ? (
                                <TextInput
                                  value={inlineEdit.value}
                                  onChange={(event) =>
                                    setInlineEdit((prev) =>
                                      prev ? { ...prev, value: getInputValue(event) } : prev
                                    )
                                  }
                                  onKeyDown={handleInlineKeyDown}
                                  onBlur={() => void commitInlineEdit()}
                                  size="xs"
                                  placeholder="거래처"
                                  disabled={inlineSaving}
                                />
                              ) : (
                                <Text
                                  size="xs"
                                  c={material.note ? undefined : "dimmed"}
                                  role="button"
                                  tabIndex={0}
                                  style={{ cursor: "pointer" }}
                                  onClick={() => startInlineEdit(material, "note")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      startInlineEdit(material, "note");
                                    }
                                  }}
                                >
                                  {material.note || "미입력"}
                                </Text>
                              )}
                            </Box>
                            <Group gap="lg" wrap="wrap">
                              {inlineEdit?.id === material.id &&
                                inlineEdit.field === "material_unit_cost" ? (
                                <NumberInput
                                  value={inlineEdit.value}
                                  onChange={(value) =>
                                    setInlineEdit((prev) =>
                                      prev
                                        ? {
                                          ...prev,
                                          value: value === null || value === "" ? "" : String(value),
                                        }
                                        : prev
                                    )
                                  }
                                  onKeyDown={handleInlineKeyDown}
                                  onBlur={() => void commitInlineEdit()}
                                  hideControls
                                  min={0}
                                  size="xs"
                                  w={96}
                                  disabled={inlineSaving}
                                />
                              ) : (
                                <Text
                                  size="xs"
                                  role="button"
                                  tabIndex={0}
                                  style={{ cursor: "pointer" }}
                                  onClick={() => startInlineEdit(material, "material_unit_cost")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      startInlineEdit(material, "material_unit_cost");
                                    }
                                  }}
                                >
                                  재료 {formatCurrency(material.material_unit_cost ?? 0)}
                                </Text>
                              )}
                              {inlineEdit?.id === material.id && inlineEdit.field === "labor_unit_cost" ? (
                                <NumberInput
                                  value={inlineEdit.value}
                                  onChange={(value) =>
                                    setInlineEdit((prev) =>
                                      prev
                                        ? {
                                          ...prev,
                                          value: value === null || value === "" ? "" : String(value),
                                        }
                                        : prev
                                    )
                                  }
                                  onKeyDown={handleInlineKeyDown}
                                  onBlur={() => void commitInlineEdit()}
                                  hideControls
                                  min={0}
                                  size="xs"
                                  w={96}
                                  disabled={inlineSaving}
                                />
                              ) : (
                                <Text
                                  size="xs"
                                  role="button"
                                  tabIndex={0}
                                  style={{ cursor: "pointer" }}
                                  onClick={() => startInlineEdit(material, "labor_unit_cost")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      startInlineEdit(material, "labor_unit_cost");
                                    }
                                  }}
                                >
                                  노무 {formatCurrency(material.labor_unit_cost ?? 0)}
                                </Text>
                              )}
                              {inlineEdit?.id === material.id &&
                                inlineEdit.field === "expense_unit_cost" ? (
                                <NumberInput
                                  value={inlineEdit.value}
                                  onChange={(value) =>
                                    setInlineEdit((prev) =>
                                      prev
                                        ? {
                                          ...prev,
                                          value: value === null || value === "" ? "" : String(value),
                                        }
                                        : prev
                                    )
                                  }
                                  onKeyDown={handleInlineKeyDown}
                                  onBlur={() => void commitInlineEdit()}
                                  hideControls
                                  min={0}
                                  size="xs"
                                  w={96}
                                  disabled={inlineSaving}
                                />
                              ) : (
                                <Text
                                  size="xs"
                                  role="button"
                                  tabIndex={0}
                                  style={{ cursor: "pointer" }}
                                  onClick={() => startInlineEdit(material, "expense_unit_cost")}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      startInlineEdit(material, "expense_unit_cost");
                                    }
                                  }}
                                >
                                  경비 {formatCurrency(material.expense_unit_cost ?? 0)}
                                </Text>
                              )}
                            </Group>
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="light"
                                color="red"
                                onClick={() => handleDelete(material)}
                              >
                                삭제
                              </Button>
                            </Group>
                          </Group>
                        </Paper>
                      ))}
                      {!selectedMaterials.length && (
                        <Text size="sm" c="dimmed">
                          표시할 자재가 없습니다.
                        </Text>
                      )}
                    </Stack>
                  </Box>
                </Paper>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>
          <Tabs.Panel value="list" pt="sm">
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>구분</Table.Th>
                  <Table.Th>품목</Table.Th>
                  <Table.Th>규격</Table.Th>
                  <Table.Th>단위</Table.Th>
                  <Table.Th>재료단가</Table.Th>
                  <Table.Th>노무단가</Table.Th>
                  <Table.Th>경비단가</Table.Th>
                  <Table.Th>거래처</Table.Th>
                  <Table.Th>관리</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((material) => (
                  <Table.Tr key={material.id}>
                    <Table.Td>{material.category}</Table.Td>
                    <Table.Td>
                      {inlineEdit?.id === material.id && inlineEdit.field === "name" ? (
                        <TextInput
                          value={inlineEdit.value}
                          onChange={(event) =>
                            setInlineEdit((prev) =>
                              prev ? { ...prev, value: getInputValue(event) } : prev
                            )
                          }
                          onKeyDown={handleInlineKeyDown}
                          onBlur={() => void commitInlineEdit()}
                          size="xs"
                          autoFocus
                          disabled={inlineSaving}
                        />
                      ) : (
                        <Text
                          size="sm"
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => startInlineEdit(material, "name")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              startInlineEdit(material, "name");
                            }
                          }}
                        >
                          {material.name}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {inlineEdit?.id === material.id && inlineEdit.field === "spec" ? (
                        renderInlineSpecInput()
                      ) : (
                        <Text
                          size="sm"
                          c={displaySpec(material.spec) ? undefined : "dimmed"}
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => startInlineEdit(material, "spec")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              startInlineEdit(material, "spec");
                            }
                          }}
                        >
                          {displaySpec(material.spec) || "규격 없음"}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{material.unit}</Table.Td>
                    <Table.Td>
                      {inlineEdit?.id === material.id &&
                        inlineEdit.field === "material_unit_cost" ? (
                        <NumberInput
                          value={inlineEdit.value}
                          onChange={(value) =>
                            setInlineEdit((prev) =>
                              prev
                                ? {
                                  ...prev,
                                  value: value === null || value === "" ? "" : String(value),
                                }
                                : prev
                            )
                          }
                          onKeyDown={handleInlineKeyDown}
                          onBlur={() => void commitInlineEdit()}
                          hideControls
                          min={0}
                          size="xs"
                          w={96}
                          disabled={inlineSaving}
                        />
                      ) : (
                        <Text
                          size="sm"
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => startInlineEdit(material, "material_unit_cost")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              startInlineEdit(material, "material_unit_cost");
                            }
                          }}
                        >
                          {formatCurrency(material.material_unit_cost ?? 0)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {inlineEdit?.id === material.id && inlineEdit.field === "labor_unit_cost" ? (
                        <NumberInput
                          value={inlineEdit.value}
                          onChange={(value) =>
                            setInlineEdit((prev) =>
                              prev
                                ? {
                                  ...prev,
                                  value: value === null || value === "" ? "" : String(value),
                                }
                                : prev
                            )
                          }
                          onKeyDown={handleInlineKeyDown}
                          onBlur={() => void commitInlineEdit()}
                          hideControls
                          min={0}
                          size="xs"
                          w={96}
                          disabled={inlineSaving}
                        />
                      ) : (
                        <Text
                          size="sm"
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => startInlineEdit(material, "labor_unit_cost")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              startInlineEdit(material, "labor_unit_cost");
                            }
                          }}
                        >
                          {formatCurrency(material.labor_unit_cost ?? 0)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {inlineEdit?.id === material.id &&
                        inlineEdit.field === "expense_unit_cost" ? (
                        <NumberInput
                          value={inlineEdit.value}
                          onChange={(value) =>
                            setInlineEdit((prev) =>
                              prev
                                ? {
                                  ...prev,
                                  value: value === null || value === "" ? "" : String(value),
                                }
                                : prev
                            )
                          }
                          onKeyDown={handleInlineKeyDown}
                          onBlur={() => void commitInlineEdit()}
                          hideControls
                          min={0}
                          size="xs"
                          w={96}
                          disabled={inlineSaving}
                        />
                      ) : (
                        <Text
                          size="sm"
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => startInlineEdit(material, "expense_unit_cost")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              startInlineEdit(material, "expense_unit_cost");
                            }
                          }}
                        >
                          {formatCurrency(material.expense_unit_cost ?? 0)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {inlineEdit?.id === material.id && inlineEdit.field === "note" ? (
                        <TextInput
                          value={inlineEdit.value}
                          onChange={(event) =>
                            setInlineEdit((prev) =>
                              prev ? { ...prev, value: getInputValue(event) } : prev
                            )
                          }
                          onKeyDown={handleInlineKeyDown}
                          onBlur={() => void commitInlineEdit()}
                          size="xs"
                          placeholder="거래처"
                          disabled={inlineSaving}
                        />
                      ) : (
                        <Text
                          size="sm"
                          c={material.note ? undefined : "dimmed"}
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => startInlineEdit(material, "note")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              startInlineEdit(material, "note");
                            }
                          }}
                        >
                          {material.note || "미입력"}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" color="red" onClick={() => handleDelete(material)}>
                        삭제
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>
        </Tabs>
      </Paper>

      <Modal opened={opened} onClose={close} title={editing ? "자재 수정" : "자재 추가"} size="lg">
        <Stack>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="xs">
              <SearchableSelect
                label="구분"
                placeholder="구분 선택"
                data={[
                  ...categoryOptionsAll.map((category) => ({ value: category, label: category })),
                  { value: "__custom__", label: "직접 입력" },
                ]}
                value={categorySelect}
                onChange={(value) => {
                  const nextValue = value ?? "__custom__";
                  setCategorySelect(nextValue);
                  if (nextValue !== "__custom__") {
                    setCustomCategory("");
                    setItemSelect(null);
                  } else {
                    setItemSelect("__custom__");
                  }
                }}
                required
              />
              {categorySelect === "__custom__" && (
                <TextInput
                  label="구분 직접 입력"
                  placeholder=""
                  value={customCategory}
                  onChange={(event) => setCustomCategory(getInputValue(event))}
                  required
                />
              )}
            </Stack>
            <Stack gap="xs">
              <SearchableSelect
                label="품목"
                placeholder="품목 선택"
                data={[
                  ...modalItemOptions.map((item) => ({ value: item, label: item })),
                  { value: "__custom__", label: "직접 입력" },
                ]}
                value={itemSelect}
                onChange={(value) => {
                  const nextValue = value ?? "__custom__";
                  setItemSelect(nextValue);
                  if (nextValue !== "__custom__") {
                    setCustomItem("");
                  }
                }}
                required
              />
              {itemSelect === "__custom__" && (
                <TextInput
                  label="품목 직접 입력"
                  placeholder=""
                  value={customItem}
                  onChange={(event) => setCustomItem(getInputValue(event))}
                  required
                />
              )}
            </Stack>
          </SimpleGrid>
          <Stack gap="xs">
            <Group align="flex-end" wrap="nowrap">
              <Box style={{ flex: 1 }}>{renderSpecInput()}</Box>
              <SearchableSelect
                label="단위"
                placeholder="단위"
                data={unitOptionsAll.map((unit) => ({ value: unit, label: unit }))}
                value={unitSelect ?? form.unit}
                onChange={(value) => {
                  setUnitSelect(value);
                  setForm((prev) => ({ ...prev, unit: value ?? "" }));
                }}
                w={120}
              />
            </Group>
          </Stack>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="sm">
              <NumberInput
                label="재료단가"
                value={form.material_unit_cost}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    material_unit_cost: typeof value === "number" ? value : 0,
                  }))
                }
                thousandSeparator=","
                min={0}
              />
              <NumberInput
                label="노무단가"
                value={form.labor_unit_cost}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    labor_unit_cost: typeof value === "number" ? value : 0,
                  }))
                }
                thousandSeparator=","
                min={0}
              />
              <NumberInput
                label="경비단가"
                value={form.expense_unit_cost}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    expense_unit_cost: typeof value === "number" ? value : 0,
                  }))
                }
                thousandSeparator=","
                min={0}
              />
            </Stack>
            <Textarea
              label="거래처"
              placeholder="거래처"
              value={form.note}
              onChange={(event) => {
                const note = getInputValue(event);
                setForm((prev) => ({ ...prev, note }));
              }}
              minRows={6}
            />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button variant="light" onClick={close}>
              취소
            </Button>
            <Button color="gray" onClick={handleSave} loading={loading}>
              저장
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

