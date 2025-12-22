import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
    console.log("Checking for 'sort_order' column in 'todos' table...");
    const { data, error } = await supabase
        .from("todos")
        .select("id, title, sort_order")
        .limit(1);

    if (error) {
        if (error.message.includes("column \"sort_order\" does not exist") || error.code === "PGRST204") {
            console.error("\n❌ Error: 'sort_order' column is missing in the database.");
            console.log("Please run the following SQL in your Supabase SQL Editor:\n");
            console.log(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS sort_order FLOAT8 DEFAULT 0;
WITH ordered_todos AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num
  FROM todos
)
UPDATE todos
SET sort_order = ordered_todos.row_num
FROM ordered_todos
WHERE todos.id = ordered_todos.id;`);
        } else {
            console.error("Unexpected error:", error.message);
        }
    } else {
        console.log("✅ 'sort_order' column exists!");
        console.log("Sample data:", data);
    }
}

check();
