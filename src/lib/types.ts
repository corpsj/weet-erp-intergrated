export type Material = {
  id: string;
  category: string;
  name: string;
  spec: string;
  unit: string;
  material_unit_cost: number | null;
  labor_unit_cost: number | null;
  expense_unit_cost: number | null;
  note: string | null;
  sort_index: number | null;
};

export type AppUser = {
  id: string;
  name: string;
  initials: string | null;
  color: string | null;
  position: string | null;
  bio: string | null;
  created_at: string;
};

export type TodoStatus = "todo" | "in_progress" | "done";

export type TodoPriority = "high" | "medium" | "low";

export type Todo = {
  id: string;
  title: string;
  status: TodoStatus;
  priority: TodoPriority;
  parent_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  note: string | null;
  sort_index: number | null;
  sort_order: number | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  color: string | null;
  note: string | null;
  created_at: string;
};

export type ProcessPreset = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type ProcessPresetItem = {
  id: string;
  preset_id: string;
  cost_category: "material" | "labor" | "expense";
  label: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  material_id: string | null;
};

export type PresetWithItems = ProcessPreset & {
  process_preset_items: ProcessPresetItem[];
};

export type Estimate = {
  id: string;
  name: string;
  description: string | null;
  general_admin_type: "percent" | "fixed";
  general_admin_value: number;
  sales_profit_type: "percent" | "fixed";
  sales_profit_value: number;
  vat_rate: number;
  created_at: string;
};

export type EstimatePreset = {
  id: string;
  estimate_id: string;
  preset_id: string;
  quantity: number;
};

export type EstimateItem = {
  id: string;
  estimate_id: string;
  cost_category: "material" | "labor" | "expense";
  label: string;
  quantity: number;
  unit_cost: number;
  material_id: string | null;
};

export type UtilityBillStatus = "PROCESSING" | "NEEDS_REVIEW" | "CONFIRMED" | "REJECTED";

export type UtilityBill = {
  id: string;
  company_id: string;
  site_id: string | null;
  vendor_name: string | null;
  bill_type: "ELECTRICITY" | "WATER" | "GAS" | "TELECOM" | "TAX" | "ETC" | null;
  amount_due: number | null;
  due_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  customer_no: string | null;
  payment_account: string | null;
  status: UtilityBillStatus;
  confidence: number | null;
  ocr_mode: "TEMPLATE" | "GENERAL" | null;
  template_id: string | null;
  raw_ocr_text: string | null;
  extracted_json: Record<string, unknown> | null;
  file_url: string | null;
  processed_file_url: string | null;
  processing_stage: "PREPROCESS" | "TEMPLATE_OCR" | "GENERAL_OCR" | "GEMINI" | "VALIDATE" | "DONE" | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};
