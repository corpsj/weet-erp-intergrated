"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from "react";

import {
  ActionIcon,
  Autocomplete,
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Drawer,
  Group,
  Menu,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateInput, type DateStringValue } from "@mantine/dates";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconColumns3,
  IconDotsVertical,
  IconEdit,
  IconFlag,
  IconLayoutGrid,
  IconList,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabaseClient";
import type { AppUser, Todo, TodoPriority } from "@/lib/types";

type SortMode = "due" | "priority";

const priorityLabels: Record<TodoPriority, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

const priorityRank: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const statusColumns = [
  { id: "todo", label: "할 일", color: "gray" },
  { id: "in_progress", label: "진행 중", color: "blue" },
  { id: "done", label: "완료", color: "green" },
];

const priorityOptions = (Object.keys(priorityLabels) as TodoPriority[]).map((priority) => ({
  value: priority,
  label: priorityLabels[priority],
}));

const priorityColor = (priority: TodoPriority) => {
  if (priority === "high") return "red";
  if (priority === "medium") return "yellow";
  return "gray";
};

const formatDue = (value: string) => dayjs(value).format("YYYY-MM-DD");

const isOverdue = (dueDate: string | null, isDone: boolean) => {
  if (!dueDate || isDone) return false;
  return dayjs(dueDate).isBefore(dayjs(), "day");
};

const matchAssigneeId = (value: string, users: AppUser[]) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const matched = users.find((user) => user.name === normalized);
  return matched?.id ?? null;
};

type AssigneeFilter = "all" | "unassigned" | string;

type EditorMode =
  | {
    mode: "create";
    parentId: string | null;
  }
  | {
    mode: "edit";
    todoId: string;
  };

const compareTodos = (a: Todo, b: Todo, sortMode: SortMode) => {
  // sort_order가 있으면 우선적으로 사용 (드래그 앤 드롭 지원)
  if (a.sort_order !== undefined && b.sort_order !== undefined && a.sort_order !== b.sort_order) {
    return (a.sort_order as number) - (b.sort_order as number);
  }

  const dueCompare = (() => {
    const aValue = a.due_date ? dayjs(a.due_date).valueOf() : Number.POSITIVE_INFINITY;
    const bValue = b.due_date ? dayjs(b.due_date).valueOf() : Number.POSITIVE_INFINITY;
    return aValue - bValue;
  })();

  const priorityCompare = priorityRank[a.priority] - priorityRank[b.priority];

  if (sortMode === "due") {
    if (dueCompare !== 0) return dueCompare;
    if (priorityCompare !== 0) return priorityCompare;
  } else {
    if (priorityCompare !== 0) return priorityCompare;
    if (dueCompare !== 0) return dueCompare;
  }

  return dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf();
};

const collectAncestorIds = (todoId: string, todoById: Record<string, Todo>) => {
  const ids: string[] = [];
  let current: Todo | undefined = todoById[todoId];

  while (current?.parent_id) {
    const parentId: string | null = current.parent_id;
    if (!parentId) break;
    const parent: Todo | undefined = todoById[parentId];
    if (!parent) break;
    ids.push(parent.id);
    current = parent;
  }

  return ids;
};

const buildVisibleTree = (params: {
  todos: Todo[];
  todoById: Record<string, Todo>;
  query: string;
  assigneeFilter: AssigneeFilter;
  showDone: boolean;
  sortMode: SortMode;
}) => {
  const queryLower = params.query.trim().toLowerCase();
  const included = new Set<string>();
  const matched = new Set<string>();

  const matches = (todo: Todo) => {
    if (!params.showDone && todo.status === "done") return false;
    if (params.assigneeFilter === "unassigned" && todo.assignee_id) return false;
    if (params.assigneeFilter !== "all" && params.assigneeFilter !== "unassigned") {
      if (todo.assignee_id !== params.assigneeFilter) return false;
    }
    if (queryLower) {
      return todo.title.toLowerCase().includes(queryLower);
    }
    return true;
  };

  params.todos.forEach((todo) => {
    if (!matches(todo)) return;
    matched.add(todo.id);
    included.add(todo.id);
    collectAncestorIds(todo.id, params.todoById).forEach((ancestorId) => included.add(ancestorId));
  });

  const childrenByParent = new Map<string | null, Todo[]>();
  const push = (parentId: string | null, todo: Todo) => {
    const list = childrenByParent.get(parentId) ?? [];
    list.push(todo);
    childrenByParent.set(parentId, list);
  };

  params.todos.forEach((todo) => {
    if (!included.has(todo.id)) return;
    const parentId =
      todo.parent_id && included.has(todo.parent_id) ? (todo.parent_id as string) : null;
    push(parentId, todo);
  });

  childrenByParent.forEach((list, parentId) => {
    list.sort((a, b) => compareTodos(a, b, params.sortMode));
    childrenByParent.set(parentId, list);
  });

  return { included, matched, childrenByParent };
};

function TodoCard({
  todo,
  assignee,
  hasChildren,
  childCount,
  expanded,
  selected,
  highlighted,
  onToggleExpanded,
  onToggleDone,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  assignee?: AppUser;
  hasChildren: boolean;
  childCount: number;
  expanded: boolean;
  selected: boolean;
  highlighted: boolean;
  onToggleExpanded: () => void;
  onToggleDone: (checked: boolean) => void;
  onSelect: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = todo.status === "done";
  const overdue = isOverdue(todo.due_date ?? null, done);
  const borderColor = overdue
    ? "var(--mantine-color-red-4)"
    : highlighted
      ? "var(--mantine-color-blue-4)"
      : undefined;

  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      onClick={onSelect}
      style={{
        cursor: "pointer",
        aspectRatio: "1 / 1",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: selected ? "var(--mantine-color-gray-0)" : undefined,
        opacity: done ? 0.7 : 1,
        borderColor,
      }}
    >
      <Stack gap={6} style={{ flex: 1 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Checkbox
            size="sm"
            checked={done}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onToggleDone(event.currentTarget.checked)}
            mt={2}
          />
          <Menu withinPortal position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={(event) => event.stopPropagation()}
                aria-label="작업"
              >
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconPlus size={14} />}
                onClick={(event) => {
                  event.stopPropagation();
                  onAddChild();
                }}
              >
                하위 업무 추가
              </Menu.Item>
              <Menu.Item
                leftSection={<IconEdit size={14} />}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              >
                편집
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                삭제
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Text
          size="sm"
          fw={700}
          td={done ? "line-through" : "none"}
          c={done ? "dimmed" : "dark"}
          lineClamp={3}
          style={{ flex: 1 }}
        >
          {todo.title}
        </Text>

        <Group gap={6} wrap="wrap">
          <Badge
            color={priorityColor(todo.priority)}
            size="xs"
            variant="light"
            leftSection={<IconFlag size={12} />}
          >
            {priorityLabels[todo.priority]}
          </Badge>
          {todo.due_date && (
            <Badge
              color={overdue ? "red" : "gray"}
              size="xs"
              variant={overdue ? "filled" : "light"}
              leftSection={<IconCalendar size={12} />}
            >
              {formatDue(todo.due_date)}
            </Badge>
          )}
          {overdue && (
            <Badge color="red" size="xs" variant="filled">
              지연
            </Badge>
          )}
        </Group>

        <Group justify="space-between" align="center" wrap="nowrap">
          {assignee ? (
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar size={20} radius="xl" color={assignee.color ?? "blue"}>
                {assignee.initials ?? assignee.name.slice(0, 1)}
              </Avatar>
              <Text size="xs" c="dimmed" lineClamp={1} style={{ minWidth: 0 }}>
                {assignee.name}
              </Text>
            </Group>
          ) : (
            <Text size="xs" c="dimmed">
              미지정
            </Text>
          )}

          <Group gap={4} wrap="nowrap">
            <ActionIcon
              size="sm"
              variant="light"
              color="gray"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild();
              }}
              aria-label="하위 업무 추가"
            >
              <IconPlus size={16} />
            </ActionIcon>
            {hasChildren ? (
              <ActionIcon
                size="sm"
                variant="light"
                color="gray"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpanded();
                }}
                aria-label={expanded ? "접기" : "펼치기"}
              >
                {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
              </ActionIcon>
            ) : null}
            {hasChildren ? (
              <Badge color="gray" variant="light" size="xs">
                {childCount}
              </Badge>
            ) : null}
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}

function TodoListItem({
  todo,
  assignee,
  depth,
  onToggleDone,
  onOpen,
  onAddChild,
  hasChildren,
  childCount,
  expanded,
  onToggleExpanded,
}: {
  todo: Todo;
  assignee?: AppUser;
  depth: number;
  onToggleDone: (checked: boolean) => void;
  onOpen: () => void;
  onAddChild: () => void;
  hasChildren?: boolean;
  childCount?: number;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const done = todo.status === "done";
  const overdue = isOverdue(todo.due_date ?? null, done);

  return (
    <Paper
      withBorder
      radius="sm"
      p="xs"
      onClick={onOpen}
      style={{
        cursor: "pointer",
        background: done
          ? "var(--mantine-color-gray-0)"
          : depth > 0
            ? "var(--mantine-color-gray-1)"
            : "white",
        opacity: done ? 0.8 : 1,
        borderColor: overdue ? "var(--mantine-color-red-4)" : undefined,
        marginLeft: depth * 24,
        borderLeft: depth > 0 ? `3px solid var(--mantine-color-blue-2)` : undefined,
        transition: "all 0.2s ease",
        boxShadow: depth === 0 ? "var(--mantine-shadow-xs)" : "none",
      }}
      className="todo-list-item"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {hasChildren && (
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpanded?.();
              }}
            >
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>
          )}
          {!hasChildren && depth > 0 && <Box w={22} />}
          <Checkbox
            size="sm"
            checked={done}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onToggleDone(event.currentTarget.checked)}
          />
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text
              size="sm"
              fw={700}
              td={done ? "line-through" : "none"}
              c={done ? "dimmed" : "dark"}
              lineClamp={1}
            >
              {todo.title}
            </Text>
            <Group gap={6} wrap="nowrap">
              <Badge
                color={priorityColor(todo.priority)}
                size="xs"
                variant="light"
                leftSection={<IconFlag size={10} />}
              >
                {priorityLabels[todo.priority]}
              </Badge>
              {todo.due_date && (
                <Badge
                  color={overdue ? "red" : "gray"}
                  size="xs"
                  variant={overdue ? "filled" : "light"}
                  leftSection={<IconCalendar size={10} />}
                >
                  {formatDue(todo.due_date)}
                </Badge>
              )}
              {hasChildren && !expanded && (
                <Badge size="xs" variant="light" color="gray" leftSection={<IconList size={10} />}>
                  {childCount}
                </Badge>
              )}
            </Group>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {assignee && (
            <Avatar size={24} radius="xl" color={assignee.color ?? "blue"} title={assignee.name}>
              {assignee.initials ?? assignee.name.slice(0, 1)}
            </Avatar>
          )}
          <ActionIcon
            variant="light"
            color="gray"
            size="md"
            onClick={(event) => {
              event.stopPropagation();
              onAddChild();
            }}
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "board">("board");

  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [showDone, setShowDone] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("due");

  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editorOpened, editorHandlers] = useDisclosure(false);
  const [editorMode, setEditorMode] = useState<EditorMode>({ mode: "create", parentId: null });
  const [mutating, setMutating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    status: Todo["status"];
    priority: TodoPriority;
    assigneeInput: string;
    due_date: DateStringValue | null;
  }>({
    title: "",
    status: "todo",
    priority: "medium",
    assigneeInput: "",
    due_date: null,
  });

  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const userById = useMemo(() => {
    return users.reduce<Record<string, AppUser>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [users]);

  const todoById = useMemo(() => {
    return todos.reduce<Record<string, Todo>>((acc, todo) => {
      acc[todo.id] = todo;
      return acc;
    }, {});
  }, [todos]);

  const assigneeOptions = useMemo(() => users.map((user) => `@${user.name}`), [users]);

  const fullChildrenMap = useMemo(() => {
    return todos.reduce<Map<string, Todo[]>>((acc, todo) => {
      if (!todo.parent_id) return acc;
      const list = acc.get(todo.parent_id) ?? [];
      list.push(todo);
      acc.set(todo.parent_id, list);
      return acc;
    }, new Map());
  }, [todos]);

  const currentTodo = editorMode.mode === "edit" ? todoById[editorMode.todoId] : null;
  const currentParentId =
    editorMode.mode === "create" ? editorMode.parentId : currentTodo?.parent_id ?? null;
  const currentParent = currentParentId ? todoById[currentParentId] : null;

  useEffect(() => {
    if (!editorOpened) return;

    if (editorMode.mode === "edit") {
      const todo = todoById[editorMode.todoId];
      if (!todo) return;
      const assigneeName = todo.assignee_id ? userById[todo.assignee_id]?.name : null;
      setForm({
        title: todo.title ?? "",
        status: todo.status,
        priority: todo.priority,
        assigneeInput: assigneeName ? `@${assigneeName}` : "",
        due_date: todo.due_date ?? null,
      });
      return;
    }

    const parentAssigneeName = currentParent?.assignee_id ? userById[currentParent.assignee_id]?.name : null;
    setForm({
      title: "",
      status: currentParent?.status ?? "todo",
      priority: currentParent?.priority ?? "medium",
      assigneeInput: parentAssigneeName ? `@${parentAssigneeName}` : "",
      due_date: null,
    });
  }, [currentParent, editorMode, editorOpened, todoById, userById]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: todoData, error: todoError }, { data: userData, error: userError }] =
      await Promise.all([
        supabase
          .from("todos")
          .select("*")
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase.from("app_users").select("*").order("created_at"),
      ]);
    setLoading(false);

    if (todoError) {
      notifications.show({ title: "To-Do 불러오기 실패", message: todoError.message, color: "red" });
      return;
    }
    if (userError) {
      notifications.show({ title: "사용자 불러오기 실패", message: userError.message, color: "red" });
      return;
    }

    setTodos(todoData ?? []);
    setUsers(userData ?? []);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const syncTodo = useCallback(async (todoId: string, updates: Partial<Todo>) => {
    // 1. 로컬 상태 즉시 업데이트 (Optimistic UI)
    setTodos(prev => prev.map(t => t.id === todoId ? { ...t, ...updates } : t));

    // 2. DB 업데이트
    const { error } = await supabase.from("todos").update(updates).eq("id", todoId);

    if (error) {
      notifications.show({ title: "동기화 실패", message: error.message, color: "red" });
      await loadAll(); // 실패 시 서버 상태로 원복
    }
  }, [loadAll]);

  const activeCount = useMemo(() => todos.filter((todo) => todo.status !== "done").length, [todos]);
  const doneCount = useMemo(() => todos.filter((todo) => todo.status === "done").length, [todos]);

  const { matched, childrenByParent } = useMemo(() => {
    return buildVisibleTree({
      todos,
      todoById,
      query,
      assigneeFilter,
      showDone,
      sortMode,
    });
  }, [assigneeFilter, query, showDone, sortMode, todoById, todos]);

  const autoExpandedIds = useMemo(() => {
    const hasFilter = Boolean(query.trim()) || assigneeFilter !== "all";
    if (!hasFilter && !selectedId) return new Set<string>();

    const ids = new Set<string>();
    matched.forEach((todoId) => {
      collectAncestorIds(todoId, todoById).forEach((ancestorId) => ids.add(ancestorId));
    });
    if (selectedId) {
      collectAncestorIds(selectedId, todoById).forEach((ancestorId) => ids.add(ancestorId));
    }
    return ids;
  }, [assigneeFilter, matched, query, selectedId, todoById]);

  const openCreate = useCallback(
    (parentId: string | null) => {
      setDeleteArmed(false);
      setEditorMode({ mode: "create", parentId });
      editorHandlers.open();
    },
    [editorHandlers]
  );

  const openEdit = useCallback(
    (todoId: string) => {
      setDeleteArmed(false);
      setSelectedId(todoId);
      setEditorMode({ mode: "edit", todoId });
      editorHandlers.open();
    },
    [editorHandlers]
  );

  const closeEditor = useCallback(() => {
    setDeleteArmed(false);
    editorHandlers.close();
  }, [editorHandlers]);

  useHotkeys([
    ["n", () => openCreate(null)],
    ["mod+n", () => openCreate(null)],
    ["Escape", () => closeEditor()],
  ]);

  const collectDescendantIds = useCallback(
    (rootId: string) => {
      const ids: string[] = [];
      const stack = [rootId];
      while (stack.length) {
        const currentId = stack.pop();
        if (!currentId) continue;
        const children = fullChildrenMap.get(currentId) ?? [];
        children.forEach((child) => {
          ids.push(child.id);
          stack.push(child.id);
        });
      }
      return ids;
    },
    [fullChildrenMap]
  );

  const toggleDone = useCallback(
    async (todo: Todo, checked: boolean) => {
      const nextStatus = checked ? "done" : "todo";
      if (todo.status === nextStatus) return;

      const idsToUpdate = checked ? [todo.id, ...collectDescendantIds(todo.id)] : [todo.id];
      setMutating(true);
      const { error } = await supabase
        .from("todos")
        .update({ status: nextStatus })
        .in("id", idsToUpdate);
      setMutating(false);

      if (error) {
        notifications.show({ title: "상태 변경 실패", message: error.message, color: "red" });
        return;
      }

      await loadAll();
    },
    [collectDescendantIds, loadAll]
  );

  const saveEditor = useCallback(async () => {
    const title = form.title.trim();
    if (!title) {
      notifications.show({ title: "필수 입력", message: "업무 제목을 입력해주세요.", color: "red" });
      return;
    }

    const assigneeId = matchAssigneeId(form.assigneeInput, users);
    if (form.assigneeInput.trim() && !assigneeId) {
      notifications.show({
        title: "담당자 확인",
        message: "담당자는 기존 사용자(@이름)로만 저장할 수 있습니다.",
        color: "red",
      });
      return;
    }

    setSaving(true);

    if (editorMode.mode === "edit") {
      const { error } = await supabase
        .from("todos")
        .update({
          title,
          status: form.status,
          priority: form.priority,
          assignee_id: assigneeId,
          due_date: form.due_date ?? null,
        })
        .eq("id", editorMode.todoId);
      setSaving(false);

      if (error) {
        notifications.show({ title: "저장 실패", message: error.message, color: "red" });
        return;
      }

      notifications.show({ title: "저장 완료", message: "To-Do가 저장되었습니다.", color: "gray" });
      await loadAll();
      return;
    }

    const { data, error } = await supabase
      .from("todos")
      .insert({
        title,
        status: form.status,
        priority: form.priority,
        parent_id: editorMode.parentId,
        assignee_id: assigneeId,
        due_date: form.due_date ?? null,
        note: null as string | null,
      })
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      notifications.show({ title: "추가 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "추가 완료", message: "To-Do가 추가되었습니다.", color: "gray" });
    await loadAll();

    if (data?.id) {
      setSelectedId(data.id);
      setEditorMode({ mode: "edit", todoId: data.id });
      editorHandlers.open();
      if (data.parent_id) {
        setExpandedById((prev) => ({ ...prev, [data.parent_id as string]: true }));
      }
    } else {
      editorHandlers.close();
    }
  }, [editorHandlers, editorMode, form, loadAll, users]);

  const armDelete = useCallback((todoId: string) => {
    setSelectedId(todoId);
    setEditorMode({ mode: "edit", todoId });
    setDeleteArmed(true);
    editorHandlers.open();
  }, [editorHandlers]);

  const deleteCurrent = useCallback(async () => {
    if (editorMode.mode !== "edit") return;
    const todo = todoById[editorMode.todoId];
    if (!todo) return;

    setSaving(true);
    const { error } = await supabase.from("todos").delete().eq("id", todo.id);
    setSaving(false);

    if (error) {
      notifications.show({ title: "삭제 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "삭제 완료", message: "To-Do가 삭제되었습니다.", color: "gray" });
    setDeleteArmed(false);
    editorHandlers.close();
    if (selectedId === todo.id) setSelectedId(null);
    await loadAll();
  }, [editorHandlers, editorMode, loadAll, selectedId, todoById]);

  const toggleExpanded = (todoId: string) => {
    setExpandedById((prev) => {
      const currentExpanded = prev[todoId] ?? autoExpandedIds.has(todoId);
      return { ...prev, [todoId]: !currentExpanded };
    });
  };

  const quickAdd = useCallback(async (title: string, parentId: string | null = null, status: Todo["status"] = "todo") => {
    setSaving(true);
    const { data, error } = await supabase
      .from("todos")
      .insert({
        title,
        status,
        priority: "medium",
        parent_id: parentId,
        assignee_id: null,
        due_date: null,
        note: null,
      })
      .select("*")
      .single();
    setSaving(false);

    if (error) {
      notifications.show({ title: "추가 실패", message: error.message, color: "red" });
      return;
    }

    await loadAll();
    if (data?.id) {
      setSelectedId(data.id);
      setEditorMode({ mode: "edit", todoId: data.id });
      editorHandlers.open();
    }
  }, [loadAll, editorHandlers]);

  const statusColumns: { id: Todo["status"]; label: string; color: string }[] = [
    { id: "todo", label: "할 일", color: "gray" },
    { id: "in_progress", label: "진행 중", color: "blue" },
    { id: "done", label: "완료", color: "green" },
  ];

  const renderTree = (parentId: string | null, depth: number): ReactNode => {
    const list = childrenByParent.get(parentId) ?? [];
    if (list.length === 0 && parentId === null) return null;

    return (
      <Stack gap="xs">
        {list.map((todo) => {
          const hasChildren = (childrenByParent.get(todo.id)?.length ?? 0) > 0;
          const childCount = childrenByParent.get(todo.id)?.length ?? 0;
          const expanded = expandedById[todo.id] || autoExpandedIds.has(todo.id);
          const selected = selectedId === todo.id;
          const highlighted = matched.has(todo.id);

          return (
            <Box key={todo.id}>
              {viewMode === "grid" ? (
                <TodoCard
                  todo={todo}
                  assignee={todo.assignee_id ? userById[todo.assignee_id] : undefined}
                  hasChildren={hasChildren}
                  childCount={childCount}
                  expanded={expanded}
                  selected={selected}
                  highlighted={highlighted}
                  onToggleExpanded={() =>
                    setExpandedById((prev) => ({ ...prev, [todo.id]: !prev[todo.id] }))
                  }
                  onToggleDone={(checked) => toggleDone(todo, checked)}
                  onSelect={() => {
                    setSelectedId(todo.id);
                    setEditorMode({ mode: "edit", todoId: todo.id });
                    editorHandlers.open();
                  }}
                  onAddChild={() => openCreate(todo.id)}
                  onEdit={() => openEdit(todo.id)}
                  onDelete={() => armDelete(todo.id)}
                />
              ) : (
                <TodoListItem
                  todo={todo}
                  assignee={todo.assignee_id ? userById[todo.assignee_id] : undefined}
                  depth={depth}
                  onToggleDone={(checked) => toggleDone(todo, checked)}
                  onOpen={() => {
                    setSelectedId(todo.id);
                    setEditorMode({ mode: "edit", todoId: todo.id });
                    editorHandlers.open();
                  }}
                  onAddChild={() => openCreate(todo.id)}
                  hasChildren={hasChildren}
                  childCount={childCount}
                  expanded={expanded}
                  onToggleExpanded={() => toggleExpanded(todo.id)}
                />
              )}
              {expanded && renderTree(todo.id, depth + 1)}
            </Box>
          );
        })}
        {depth === 0 && (
          <Paper withBorder p="xs" radius="sm" style={{ borderStyle: "dashed", background: "transparent" }}>
            <TextInput
              variant="unstyled"
              placeholder="+ 새 업무를 입력하고 Enter..."
              size="sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  quickAdd(e.currentTarget.value.trim(), parentId);
                  e.currentTarget.value = "";
                }
              }}
            />
          </Paper>
        )}
      </Stack>
    );
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === "card") {
      const todoId = draggableId;
      const newStatus = destination.droppableId as Todo["status"];
      // 대상 컬럼의 업무 목록을 가져오되, 현재 드래그 중인 업무는 제외하고 정렬함
      const targetColumnTodos = todos
        .filter(t => t.status === newStatus && !t.parent_id && t.id !== todoId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      let newSortOrder: number;
      if (targetColumnTodos.length === 0) {
        newSortOrder = 1000;
      } else if (destination.index === 0) {
        newSortOrder = (targetColumnTodos[0].sort_order ?? 0) - 1000;
      } else if (destination.index >= targetColumnTodos.length) {
        newSortOrder = (targetColumnTodos[targetColumnTodos.length - 1].sort_order ?? 0) + 1000;
      } else {
        const prev = targetColumnTodos[destination.index - 1].sort_order ?? 0;
        const next = targetColumnTodos[destination.index].sort_order ?? 0;
        newSortOrder = (prev + next) / 2;
      }

      setTodos(prev => prev.map(t => t.id === todoId ? { ...t, status: newStatus, sort_order: newSortOrder } : t));

      const { error } = await supabase.from("todos").update({ status: newStatus, sort_order: newSortOrder }).eq("id", todoId);
      if (error) {
        notifications.show({ title: "이동 실패", message: error.message, color: "red" });
        await loadAll();
      }
    }
  };

  const renderBoard = () => {
    return (
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="board" direction="horizontal" type="column">
          {(provided) => (
            <Box
              {...provided.droppableProps}
              ref={provided.innerRef}
              style={{
                display: "flex",
                gap: "16px",
                overflowX: "auto",
                paddingBottom: "16px",
                minHeight: "calc(100vh - 280px)",
                alignItems: "flex-start",
              }}
            >
              {statusColumns.map((column, index) => {
                const columnTodos = todos.filter((t) => t.status === column.id && !t.parent_id);
                const filteredTodos = columnTodos.filter((t) => {
                  if (query.trim() && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
                  if (assigneeFilter !== "all") {
                    if (assigneeFilter === "unassigned") return !t.assignee_id;
                    return t.assignee_id === assigneeFilter;
                  }
                  return true;
                }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

                return (
                  <Draggable key={column.id} draggableId={column.id} index={index}>
                    {(provided) => (
                      <Paper
                        {...provided.draggableProps}
                        ref={provided.innerRef}
                        withBorder
                        radius="md"
                        p="sm"
                        bg="gray.0"
                        style={{
                          ...provided.draggableProps.style,
                          width: "320px",
                          minWidth: "320px",
                          display: "flex",
                          flexDirection: "column",
                          maxHeight: "100%",
                          flexShrink: 0,
                        }}
                      >
                        <Group justify="space-between" mb="sm" {...provided.dragHandleProps}>
                          <Group gap="xs">
                            <Badge color={column.color} variant="filled" size="sm" radius="sm">
                              {column.label}
                            </Badge>
                            <Text size="xs" fw={700} c="dimmed">
                              {filteredTodos.length}
                            </Text>
                          </Group>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={() => openCreate(null)}
                          >
                            <IconPlus size={16} />
                          </ActionIcon>
                        </Group>

                        <Droppable droppableId={column.id} type="card">
                          {(provided) => (
                            <Stack {...provided.droppableProps} ref={provided.innerRef} gap="xs" style={{ minHeight: 50 }}>
                              {filteredTodos.map((todo, idx) => {
                                const assignee = todo.assignee_id ? userById[todo.assignee_id] : undefined;
                                const isDone = todo.status === "done";
                                const overdue = isOverdue(todo.due_date ?? null, isDone);
                                const subTasks = fullChildrenMap.get(todo.id) ?? [];
                                const hasChildren = subTasks.length > 0;
                                const expanded = expandedById[todo.id] || autoExpandedIds.has(todo.id);

                                return (
                                  <Draggable key={todo.id} draggableId={todo.id} index={idx}>
                                    {(provided) => (
                                      <Box
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        style={{
                                          ...provided.draggableProps.style,
                                          marginBottom: hasChildren && !expanded ? 12 : 8
                                        }}
                                      >
                                        <Box style={{ position: "relative" }}>
                                          {/* Stack effect layers */}
                                          {hasChildren && !expanded && (
                                            <>
                                              <Box
                                                style={{
                                                  position: "absolute",
                                                  top: 4, left: 4, right: -4, bottom: -4,
                                                  background: "white",
                                                  border: "1px solid var(--mantine-color-gray-3)",
                                                  borderRadius: "var(--mantine-radius-sm)",
                                                  zIndex: 0
                                                }}
                                              />
                                              <Box
                                                style={{
                                                  position: "absolute",
                                                  top: 8, left: 8, right: -8, bottom: -8,
                                                  background: "white",
                                                  border: "1px solid var(--mantine-color-gray-2)",
                                                  borderRadius: "var(--mantine-radius-sm)",
                                                  zIndex: -1,
                                                  opacity: 0.6
                                                }}
                                              />
                                            </>
                                          )}

                                          <Paper
                                            withBorder
                                            radius="sm"
                                            p="xs"
                                            onClick={(e) => {
                                              if (e.detail > 1) return; // Skip toggle on second click of a double click
                                              if (hasChildren) {
                                                e.stopPropagation();
                                                toggleExpanded(todo.id);
                                              } else {
                                                openEdit(todo.id);
                                              }
                                            }}
                                            onDoubleClick={(e) => {
                                              e.stopPropagation();
                                              openEdit(todo.id);
                                            }}
                                            style={{
                                              position: "relative",
                                              zIndex: 1,
                                              cursor: "pointer",
                                              background: selectedId === todo.id ? "var(--mantine-color-gray-1)" : "white",
                                              borderColor: overdue ? "var(--mantine-color-red-4)" : undefined,
                                              boxShadow: "var(--mantine-shadow-xs)",
                                            }}
                                          >
                                            <Stack gap={6}>
                                              <Group justify="space-between" wrap="nowrap">
                                                <Text size="sm" fw={700} lineClamp={2} td={isDone ? "line-through" : "none"} c={isDone ? "dimmed" : "dark"} style={{ flex: 1 }}>
                                                  {todo.title}
                                                </Text>
                                                {hasChildren && (
                                                  <ActionIcon
                                                    size="xs"
                                                    variant="filled"
                                                    color={expanded ? "blue.1" : "gray.1"}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      toggleExpanded(todo.id);
                                                    }}
                                                    style={{
                                                      color: expanded ? "var(--mantine-color-blue-6)" : "var(--mantine-color-gray-6)",
                                                      transition: "all 0.2s ease"
                                                    }}
                                                  >
                                                    {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                                  </ActionIcon>
                                                )}
                                              </Group>
                                              <Group justify="space-between" wrap="nowrap">
                                                <Group gap={4} wrap="wrap">
                                                  <Badge color={priorityColor(todo.priority)} size="xs" variant="light">
                                                    {priorityLabels[todo.priority]}
                                                  </Badge>
                                                  {todo.due_date && (
                                                    <Text size="10px" c={overdue ? "red" : "dimmed"} fw={overdue ? 700 : 400}>
                                                      {dayjs(todo.due_date).format("MM/DD")}
                                                    </Text>
                                                  )}
                                                  {hasChildren && !expanded && (
                                                    <Badge size="xs" variant="light" color="gray" leftSection={<IconList size={10} />}>
                                                      {subTasks.length}
                                                    </Badge>
                                                  )}
                                                </Group>
                                                {assignee && (
                                                  <Avatar
                                                    size="sm"
                                                    radius="xl"
                                                    color={assignee.color ?? "blue"}
                                                    styles={{
                                                      root: { width: 'auto', minWidth: 32, padding: '0 4px' },
                                                      placeholder: { fontSize: '10px', fontWeight: 700 }
                                                    }}
                                                  >
                                                    {assignee.name}
                                                  </Avatar>
                                                )}
                                              </Group>
                                            </Stack>
                                          </Paper>

                                          {expanded && (
                                            <Box mt={4} style={{ position: "relative", paddingLeft: 16 }}>
                                              {/* 수직 계층선 */}
                                              <Box
                                                style={{
                                                  position: "absolute",
                                                  left: 8,
                                                  top: -8,
                                                  bottom: 24,
                                                  width: 1,
                                                  borderLeft: "2px solid var(--mantine-color-gray-3)",
                                                }}
                                              />
                                              <Stack gap={6}>
                                                {subTasks.map((sub) => {
                                                  const subAssignee = sub.assignee_id ? userById[sub.assignee_id] : undefined;
                                                  const subDone = sub.status === "done";
                                                  return (
                                                    <Box key={sub.id} style={{ position: "relative" }}>
                                                      {/* 수평 연결선 (L자형) */}
                                                      <Box
                                                        style={{
                                                          position: "absolute",
                                                          left: -8,
                                                          top: 14,
                                                          width: 8,
                                                          height: 2,
                                                          background: "var(--mantine-color-gray-3)",
                                                        }}
                                                      />
                                                      <Paper
                                                        withBorder
                                                        radius="sm"
                                                        p="xs"
                                                        onClick={(e) => { e.stopPropagation(); openEdit(sub.id); }}
                                                        style={{
                                                          cursor: "pointer",
                                                          background: subDone ? "var(--mantine-color-gray-0)" : "white",
                                                          opacity: subDone ? 0.8 : 1,
                                                          boxShadow: "var(--mantine-shadow-xs)",
                                                          borderColor: subDone ? "var(--mantine-color-gray-2)" : undefined,
                                                        }}
                                                      >
                                                        <Group gap="xs" align="flex-start" wrap="nowrap">
                                                          <Checkbox
                                                            size="xs"
                                                            checked={subDone}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => toggleDone(sub, e.currentTarget.checked)}
                                                            mt={2}
                                                          />
                                                          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                                                            <Text size="xs" fw={700} lineClamp={1} td={subDone ? "line-through" : "none"} c={subDone ? "dimmed" : "dark"}>
                                                              {sub.title}
                                                            </Text>
                                                            <Group justify="space-between" wrap="nowrap">
                                                              <Group gap={4}>
                                                                <Badge color={priorityColor(sub.priority)} size="10px" variant="light">
                                                                  {priorityLabels[sub.priority]}
                                                                </Badge>
                                                                {!subDone && sub.status !== "todo" && (
                                                                  <Badge size="10px" variant="dot" color={statusColumns.find(c => c.id === sub.status)?.color}>
                                                                    {statusColumns.find(c => c.id === sub.status)?.label}
                                                                  </Badge>
                                                                )}
                                                              </Group>
                                                              {subAssignee && (
                                                                <Avatar
                                                                  size={16}
                                                                  radius="xl"
                                                                  color={subAssignee.color ?? "blue"}
                                                                >
                                                                  {subAssignee.initials ?? subAssignee.name.slice(0, 1)}
                                                                </Avatar>
                                                              )}
                                                            </Group>
                                                          </Stack>
                                                        </Group>
                                                      </Paper>
                                                    </Box>
                                                  );
                                                })}
                                              </Stack>
                                            </Box>
                                          )}
                                        </Box>
                                      </Box>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}

                              <Paper withBorder p="xs" radius="sm" style={{ borderStyle: "dashed", background: "transparent" }}>
                                <TextInput
                                  variant="unstyled"
                                  placeholder="+ 새 업무를 입력하고 Enter..."
                                  size="sm"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                      quickAdd(e.currentTarget.value.trim(), null, column.id);
                                      e.currentTarget.value = "";
                                    }
                                  }}
                                />
                              </Paper>
                            </Stack>
                          )}
                        </Droppable>
                      </Paper>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </Box>
          )}
        </Droppable>
      </DragDropContext>
    );
  };

  const assigneeSelectData = useMemo(() => {
    return [
      { value: "all", label: "전체" },
      { value: "unassigned", label: "미지정" },
      ...users.map((user) => ({ value: user.id, label: user.name })),
    ];
  }, [users]);

  const editorPath = useMemo(() => {
    const startId = editorMode.mode === "edit" ? editorMode.todoId : (editorMode.parentId ?? null);
    if (!startId) return [] as Todo[];

    const path: Todo[] = [];
    let current: Todo | undefined = todoById[startId];
    while (current) {
      path.unshift(current);
      if (!current.parent_id) break;
      current = todoById[current.parent_id];
    }
    return path;
  }, [editorMode, todoById]);

  const editorChildren = useMemo(() => {
    if (editorMode.mode !== "edit") return [] as Todo[];
    const list = fullChildrenMap.get(editorMode.todoId) ?? [];
    return [...list].sort((a, b) => compareTodos(a, b, sortMode));
  }, [editorMode, fullChildrenMap, sortMode]);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={2}>To-Do</Title>
          <Text size="xs" c="dimmed">
            진행 {activeCount} · 완료 {doneCount}
          </Text>
        </Stack>
        <Button size="sm" color="gray" leftSection={<IconPlus size={16} />} onClick={() => openCreate(null)}>
          새 업무
        </Button>
      </Group>

      <Paper withBorder radius="md" p="xs">
        <Group gap="xs" align="center" wrap="wrap">
          <TextInput
            placeholder="검색"
            aria-label="업무 검색"
            size="sm"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <Select
            placeholder="담당자"
            aria-label="담당자 필터"
            size="sm"
            data={assigneeSelectData}
            value={assigneeFilter}
            onChange={(value) => setAssigneeFilter((value as AssigneeFilter) ?? "all")}
            allowDeselect={false}
            style={{ minWidth: 160 }}
          />
          <SegmentedControl
            size="sm"
            value={sortMode}
            onChange={(value) => setSortMode(value as SortMode)}
            data={[
              { value: "due", label: "마감일" },
              { value: "priority", label: "우선순위" },
            ]}
          />
          <SegmentedControl
            size="sm"
            value={viewMode}
            onChange={(value) => setViewMode(value as "grid" | "list" | "board")}
            data={[
              { value: "list", label: <IconList size={16} /> },
              { value: "board", label: <IconColumns3 size={16} /> },
              { value: "grid", label: <IconLayoutGrid size={16} /> },
            ]}
          />
          <Checkbox
            size="sm"
            label="완료 포함"
            checked={showDone}
            onChange={(event) => setShowDone(event.currentTarget.checked)}
          />
          <Button size="sm" variant="light" color="gray" onClick={loadAll} loading={loading}>
            새로고침
          </Button>
        </Group>
      </Paper>

      <Box pos="relative" style={{ height: "calc(100vh - 200px)" }}>
        <Paper
          withBorder
          radius="md"
          p="xs"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box style={{ flex: 1, overflowY: "auto", padding: "4px" }}>
            {viewMode === "board" ? (
              renderBoard()
            ) : (
              renderTree(null, 0) || (
                <Text size="sm" c="dimmed" ta="center" mt="xl">
                  표시할 업무가 없습니다.
                </Text>
              )
            )}
          </Box>
        </Paper>

        {editorOpened && (
          <Paper
            withBorder
            shadow="xl"
            radius="md"
            p="md"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "400px",
              height: "100%",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              backgroundColor: "white",
              borderLeft: "1px solid var(--mantine-color-gray-2)",
              boxShadow: "-4px 0 12px rgba(0,0,0,0.05)",
            }}
          >
            <Group justify="space-between" mb="lg">
              <Title order={4}>
                {editorMode.mode === "create" ? "새 업무 추가" : "업무 상세 정보"}
              </Title>
              <ActionIcon variant="subtle" color="gray" onClick={closeEditor}>
                <IconX size={20} />
              </ActionIcon>
            </Group>

            <Stack gap="md">
              {currentParent && (
                <Paper withBorder p="xs" bg="gray.0">
                  <Text size="xs" c="dimmed">
                    상위 업무
                  </Text>
                  <Text size="sm" fw={700}>
                    {currentParent.title}
                  </Text>
                </Paper>
              )}

              {editorMode.mode === "edit" && currentTodo && (
                <Group gap="xs" grow>
                  <Select
                    label="상태"
                    data={[
                      { value: "todo", label: "할 일" },
                      { value: "in_progress", label: "진행 중" },
                      { value: "done", label: "완료" },
                    ]}
                    value={form.status}
                    onChange={(value) => {
                      const val = (value as Todo["status"]) ?? "todo";
                      setForm((prev) => ({ ...prev, status: val }));
                      if (editorMode.mode === "edit") {
                        if (val === "done") {
                          const todo = todoById[editorMode.todoId];
                          if (todo) toggleDone(todo, true);
                        } else {
                          syncTodo(editorMode.todoId, { status: val });
                        }
                      }
                    }}
                    allowDeselect={false}
                  />
                  <Checkbox
                    mt={24}
                    label="완료됨"
                    checked={form.status === "done"}
                    disabled={mutating}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      const nextStatus = checked ? "done" : "todo";
                      setForm((prev) => ({ ...prev, status: nextStatus }));
                      if (editorMode.mode === "edit") {
                        const todo = todoById[editorMode.todoId];
                        if (todo) toggleDone(todo, checked);
                      }
                    }}
                  />
                </Group>
              )}

              <TextInput
                label="업무"
                placeholder="업무 내용을 입력하세요"
                value={form.title}
                onChange={(event) => {
                  const val = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, title: val }));

                  if (editorMode.mode === "edit") {
                    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
                    titleTimeoutRef.current = setTimeout(() => {
                      if (val.trim()) syncTodo(editorMode.todoId, { title: val.trim() });
                    }, 1000);
                  }
                }}
                required
              />

              <Group grow>
                <Select
                  label="우선순위"
                  data={priorityOptions}
                  value={form.priority}
                  onChange={(value) => {
                    const priority = (value as TodoPriority) ?? "medium";
                    setForm((prev) => ({ ...prev, priority }));
                    if (editorMode.mode === "edit") {
                      syncTodo(editorMode.todoId, { priority });
                    }
                  }}
                />
                <Autocomplete
                  label="담당자"
                  placeholder="@이름"
                  data={assigneeOptions}
                  value={form.assigneeInput}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, assigneeInput: value }));
                    if (editorMode.mode === "edit") {
                      const assigneeId = matchAssigneeId(value, users);
                      if (value.trim() === "" || assigneeId) {
                        syncTodo(editorMode.todoId, { assignee_id: assigneeId });
                      }
                    }
                  }}
                />
              </Group>

              <DateInput
                label="마감일"
                placeholder="날짜 선택"
                value={form.due_date ? dayjs(form.due_date).toDate() : null}
                onChange={(date) => {
                  const dateStr = date ? dayjs(date).format("YYYY-MM-DD") : null;
                  setForm((prev) => ({
                    ...prev,
                    due_date: dateStr,
                  }));
                  if (editorMode.mode === "edit") {
                    syncTodo(editorMode.todoId, { due_date: dateStr });
                  }
                }}
                clearable
              />

              <Paper withBorder radius="md" p="sm">
                <Group justify="space-between" mb="xs">
                  <Text fw={700} size="sm">
                    하위 업무 ({editorChildren.length})
                  </Text>
                  <ActionIcon variant="light" color="gray" size="sm" onClick={() => openCreate(editorMode.mode === "edit" ? editorMode.todoId : null)}>
                    <IconPlus size={14} />
                  </ActionIcon>
                </Group>
                <Stack gap="xs">
                  {editorChildren.map((child) => {
                    const childAssignee = child.assignee_id ? userById[child.assignee_id] : undefined;
                    const childDone = child.status === "done";
                    return (
                      <Paper
                        key={child.id}
                        withBorder
                        radius="md"
                        p="xs"
                        onClick={() => openEdit(child.id)}
                        style={{ cursor: "pointer", background: "white", borderColor: "var(--mantine-color-gray-3)" }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="sm" wrap="nowrap">
                            <Checkbox
                              size="xs"
                              checked={childDone}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => toggleDone(child, e.currentTarget.checked)}
                            />
                            <Stack gap={2}>
                              <Text size="xs" fw={700} td={childDone ? "line-through" : "none"} c={childDone ? "dimmed" : "dark"}>
                                {child.title}
                              </Text>
                              <Badge color={priorityColor(child.priority)} size="10px" variant="light">
                                {priorityLabels[child.priority]}
                              </Badge>
                            </Stack>
                          </Group>
                          <Group gap="xs">
                            {childAssignee && (
                              <Avatar size={20} radius="xl">
                                {childAssignee.initials ?? childAssignee.name.slice(0, 1)}
                              </Avatar>
                            )}
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); openCreate(child.id); }}
                            >
                              <IconPlus size={14} />
                            </ActionIcon>
                          </Group>
                        </Group>
                      </Paper>
                    );
                  })}
                  {editorChildren.length === 0 && (
                    <Text size="xs" c="dimmed" ta="center">하위 업무가 없습니다.</Text>
                  )}
                </Stack>
              </Paper>

              <Group justify="flex-start">
                {!deleteArmed ? (
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => setDeleteArmed(true)}
                  >
                    업무 삭제
                  </Button>
                ) : (
                  <Group gap="xs">
                    <Text size="xs" c="red" fw={700}>정말 삭제?</Text>
                    <Button size="xs" variant="default" onClick={() => setDeleteArmed(false)}>취소</Button>
                    <Button size="xs" color="red" onClick={deleteCurrent} loading={saving}>삭제</Button>
                  </Group>
                )}
              </Group>
            </Stack>

            <Group justify="flex-end" mt="xl" pt="md" style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
              <Button variant="default" onClick={closeEditor}>닫기</Button>
              {editorMode.mode === "create" && (
                <Button onClick={saveEditor} loading={saving}>추가</Button>
              )}
            </Group>
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
