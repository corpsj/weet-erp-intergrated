import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const filePath = path.join(process.cwd(), "contents.csv");
if (!fs.existsSync(filePath)) {
  console.error("contents.csv not found at project root.");
  process.exit(1);
}

const csv = fs.readFileSync(filePath, "utf8");
const records = parse(csv, {
  columns: (header) => header.map((name) => name.trim().replace(/^\uFEFF/, "")),
  skip_empty_lines: true,
  relax_column_count: true,
  trim: true,
});

const getValue = (row, label) => {
  if (!row) return undefined;
  if (label in row) return row[label];
  const key = Object.keys(row).find(
    (name) => name.trim().replace(/^\uFEFF/, "") === label
  );
  return key ? row[key] : undefined;
};

const toNumber = (value) => {
  if (!value) return 0;
  const normalized = String(value).replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rawMaterials = records
  .filter((row) => getValue(row, "구분") && getValue(row, "품목"))
  .map((row, index) => ({
    category: getValue(row, "구분")?.trim() ?? "",
    name: getValue(row, "품목")?.trim() ?? "",
    spec: (getValue(row, "규격")?.trim() ?? "").replace(/\*+/g, "x"),
    unit: getValue(row, "단위")?.trim() ?? "",
    material_unit_cost: toNumber(getValue(row, "재료단가")),
    labor_unit_cost: toNumber(getValue(row, "노무단가")),
    expense_unit_cost: toNumber(getValue(row, "경비단가")),
    note: getValue(row, "비고")?.trim() || null,
    sort_index: index + 1,
  }));

const materialsMap = new Map();
for (const item of rawMaterials) {
  const key = `${item.category}__${item.name}__${item.spec}__${item.unit}`;
  if (!materialsMap.has(key)) {
    materialsMap.set(key, item);
  }
}
const materials = Array.from(materialsMap.values());

if (!materials.length) {
  const sample = records[0];
  console.error("No materials found in contents.csv.");
  console.error(
    "Detected columns:",
    sample ? Object.keys(sample).join(", ") : "(no records)"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const chunkSize = 500;

const run = async () => {
  for (let i = 0; i < materials.length; i += chunkSize) {
    const chunk = materials.slice(i, i + chunkSize);
    const { error } = await supabase.from("materials").upsert(chunk, {
      onConflict: "category,name,spec,unit",
    });

    if (error) {
      console.error("Import failed:", error.message);
      process.exit(1);
    }

    console.log(`Imported ${Math.min(i + chunkSize, materials.length)} / ${materials.length}`);
  }

  console.log("Import completed.");
};

run();
