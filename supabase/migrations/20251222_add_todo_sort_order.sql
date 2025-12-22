-- todos 테이블에 정렬 순서를 저장하기 위한 컬럼 추가
ALTER TABLE todos ADD COLUMN IF NOT EXISTS sort_order FLOAT8 DEFAULT 0;

-- 기존 데이터들에 대해 ID 순서대로 초기 sort_order 부여
WITH ordered_todos AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num
  FROM todos
)
UPDATE todos
SET sort_order = ordered_todos.row_num
FROM ordered_todos
WHERE todos.id = ordered_todos.id;
