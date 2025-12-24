"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from "react";

import {
  Container,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  Box,
  rem,
  Affix,
  Transition,
  Drawer,
  Modal,
  SegmentedControl,
  ActionIcon,
  Menu,
  Autocomplete,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Popover,
  Select,
  SimpleGrid,
  Skeleton,
} from "@mantine/core";
import { DateInput, type DateStringValue } from "@mantine/dates";
import { useDisclosure, useHotkeys, useMediaQuery } from "@mantine/hooks";
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
import "dayjs/locale/ko";
dayjs.locale("ko");
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabaseClient";
import type { AppUser, Todo, TodoPriority } from "@/lib/types";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

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

const statusColumns: { id: Todo["status"]; label: string; color: string }[] = [
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


type AssigneeFilter = "all" | "anyone" | string;

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
    if (params.assigneeFilter === "anyone" && todo.assignee_id) return false;
    if (params.assigneeFilter !== "all" && params.assigneeFilter !== "anyone") {
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
  editingId,
  onUpdateTitle,
  setEditingId,
  opened,
  renderEditor,
  onClose,
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
  editingId: string | null;
  onUpdateTitle: (title: string) => void;
  setEditingId: (id: string | null) => void;
  opened?: boolean;
  renderEditor?: () => ReactNode;
  onClose?: () => void;
}) {
  const done = todo.status === "done";
  const overdue = isOverdue(todo.due_date ?? null, done);
  const borderColor = overdue
    ? "var(--mantine-color-red-4)"
    : highlighted
      ? "var(--mantine-color-blue-4)"
      : undefined;

  return (
    <Popover
      opened={opened}
      onClose={onClose}
      width={340}
      position="right-start"
      withArrow
      shadow="md"
      withinPortal
      portalProps={{ target: "#todo-scroll-container" }}
      closeOnClickOutside={true}
      clickOutsideEvents={['mousedown', 'touchstart']}
    >
      <Popover.Target>
        <Paper
          p="md"
          radius="md"
          withBorder
          className="soft-card animate-fade-in-up"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            onSelect();
          }}
          style={{
            cursor: "pointer",
            aspectRatio: "1 / 1",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: done ? "var(--mantine-color-gray-0)" : "var(--mantine-color-white)",
            opacity: done ? 0.7 : 1,
            borderColor,
            transition: "all 0.2s ease",
            boxShadow: "var(--mantine-shadow-xs)",
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

            {editingId === todo.id ? (
              <TextInput
                autoFocus
                size="xs"
                defaultValue={todo.title}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onUpdateTitle(e.currentTarget.value);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={(e) => onUpdateTitle(e.currentTarget.value)}
                onClick={(e) => e.stopPropagation()}
                mb={6}
              />
            ) : (
              <Text
                size="sm"
                fw={800}
                td={done ? "line-through" : "none"}
                c={done ? "dimmed" : "dark"}
                lineClamp={3}
                style={{ flex: 1, letterSpacing: '-0.01em' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                {todo.title}
              </Text>
            )}

            <Group gap={6} wrap="wrap">
              <Badge
                color={priorityColor(todo.priority)}
                size="xs"
                variant="light"
                radius="md"
                leftSection={<IconFlag size={12} />}
              >
                {priorityLabels[todo.priority]}
              </Badge>
              {todo.due_date && (
                <Badge
                  color={overdue ? "red" : "gray"}
                  size="xs"
                  variant={overdue ? "filled" : "light"}
                  radius="md"
                  leftSection={<IconCalendar size={12} />}
                >
                  {formatDue(todo.due_date)}
                </Badge>
              )}
              {overdue && (
                <Badge color="red" size="xs" variant="filled" radius="md">
                  지연
                </Badge>
              )}
            </Group>

            <Group justify="space-between" align="center" wrap="nowrap" mt="xs">
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
                  누구나
                </Text>
              )}

              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  size="sm"
                  variant="subtle"
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
                  <Badge color="indigo" variant="light" size="xs" radius="md">
                    {childCount}
                  </Badge>
                ) : null}
              </Group>
            </Group>
          </Stack>
        </Paper>
      </Popover.Target>
      <Popover.Dropdown>
        {renderEditor?.()}
      </Popover.Dropdown>
    </Popover >
  );
}

function TodoListItem({
  todo,
  assignee,
  depth,
  isMobile,
  onToggleDone,
  onOpen,
  onAddChild,
  hasChildren,
  childCount,
  expanded,
  onToggleExpanded,
  editingId,
  onUpdateTitle,
  setEditingId,
  opened,
  renderEditor,
  onClose,
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
  editingId: string | null;
  onUpdateTitle: (title: string) => void;
  setEditingId: (id: string | null) => void;
  opened?: boolean;
  renderEditor?: () => ReactNode;
  onClose?: () => void;
  isMobile?: boolean;
}) {
  const done = todo.status === "done";
  const overdue = isOverdue(todo.due_date ?? null, done);

  return (
    <Popover
      opened={opened}
      onClose={onClose}
      width={340}
      position="right-start"
      withArrow
      shadow="md"
      withinPortal
      portalProps={{ target: "#todo-scroll-container" }}
      closeOnClickOutside={true}
      clickOutsideEvents={['mousedown', 'touchstart']}
    >
      <Popover.Target>
        <Paper
          radius="md"
          withBorder
          p={isMobile ? "xs" : "sm"}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button, a')) return;
            onOpen();
          }}
          style={{
            cursor: "pointer",
            background: done
              ? "var(--mantine-color-gray-1)"
              : depth > 0
                ? "var(--mantine-color-gray-0)"
                : "var(--mantine-color-white)",
            opacity: done ? 0.7 : 1,
            borderColor: overdue ? "var(--mantine-color-red-4)" : "var(--mantine-color-gray-2)",
            marginLeft: depth * (isMobile ? 12 : 24),
            borderLeft: depth > 0 ? `4px solid var(--mantine-color-indigo-1)` : undefined,
            transition: "all 0.1s ease",
            boxShadow: depth === 0 ? "var(--mantine-shadow-xs)" : "none",
          }}
          className="todo-list-item animate-fade-in-up"
        >
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
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
              {!hasChildren && depth > 0 && <Box w={18} />}
              <Checkbox
                size={isMobile ? "xs" : "sm"}
                checked={done}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onToggleDone(event.currentTarget.checked)}
              />
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                {editingId === todo.id ? (
                  <TextInput
                    autoFocus
                    size="xs"
                    defaultValue={todo.title}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onUpdateTitle(e.currentTarget.value);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={(e) => onUpdateTitle(e.currentTarget.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <Text
                    size={isMobile ? "xs" : "sm"}
                    fw={700}
                    td={done ? "line-through" : "none"}
                    c={done ? "dimmed" : "dark"}
                    lineClamp={1}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onOpen();
                    }}
                  >
                    {todo.title}
                  </Text>
                )}
                {!isMobile && (
                  <Group gap={6} wrap="nowrap" mt={2}>
                    <Badge
                      color={priorityColor(todo.priority)}
                      size="xs"
                      variant="light"
                      radius="md"
                      leftSection={<IconFlag size={10} />}
                    >
                      {priorityLabels[todo.priority]}
                    </Badge>
                    {todo.due_date && (
                      <Badge
                        color={overdue ? "red" : "gray"}
                        size="xs"
                        variant={overdue ? "filled" : "light"}
                        radius="md"
                        leftSection={<IconCalendar size={10} />}
                      >
                        {formatDue(todo.due_date)}
                      </Badge>
                    )}
                  </Group>
                )}
              </Stack>
            </Group>

            <Group gap={4} wrap="nowrap">
              {isMobile ? (
                <>
                  {todo.priority === 'high' && <IconFlag size={14} color="var(--mantine-color-red-6)" />}
                  {assignee && (
                    <Avatar size={20} radius="xl" color={assignee.color ?? "blue"}>
                      {assignee.initials ?? assignee.name.slice(0, 1)}
                    </Avatar>
                  )}
                </>
              ) : (
                <>
                  {assignee && (
                    <Avatar size={24} radius="xl" color={assignee.color ?? "blue"} title={assignee.name}>
                      {assignee.initials ?? assignee.name.slice(0, 1)}
                    </Avatar>
                  )}
                  <ActionIcon
                    variant="light"
                    color="indigo"
                    radius="md"
                    size="md"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddChild();
                    }}
                  >
                    <IconPlus size={16} />
                  </ActionIcon>
                </>
              )}
            </Group>
          </Group>
        </Paper>
      </Popover.Target>
      <Popover.Dropdown>
        {renderEditor?.()}
      </Popover.Dropdown>
    </Popover>
  );
}

export default function TodoPage() {
  const queryClient = useQueryClient();
  const { data: todos = [], isLoading: todosLoading } = useQuery<Todo[]>({
    queryKey: ["todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("todos")
        .select("id, title, status, priority, parent_id, assignee_id, due_date, note, sort_index, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<AppUser[]>({
    queryKey: ["app_users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_users").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []).filter(u => u.name && (u.initials || u.color));
    },
  });

  const { data: currentUser } = useQuery<{ id: string } | null>({
    queryKey: ["current_user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    },
  });

  const loading = todosLoading || usersLoading;

  const [viewMode, setViewMode] = useState<"grid" | "list" | "board">("board");

  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    if (isMobile) {
      setViewMode("list");
    }
  }, [isMobile]);

  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [showDone, setShowDone] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("due");

  const [mobileStatusTab, setMobileStatusTab] = useState<Todo["status"]>("todo");
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingSubId, setAddingSubId] = useState<string | null>(null);

  const [editorOpened, editorHandlers] = useDisclosure(false);
  const [editorMode, setEditorMode] = useState<EditorMode>({ mode: "create", parentId: null });
  const [mutating, setMutating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const switchingRef = useRef(false);
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const userById = useMemo(() => {
    return users.reduce<Record<string, AppUser>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [users]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [users]);

  const todoById = useMemo(() => {
    return todos.reduce<Record<string, Todo>>((acc, todo) => {
      acc[todo.id] = todo;
      return acc;
    }, {});
  }, [todos]);


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

  const loadAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["todos"] }),
      queryClient.invalidateQueries({ queryKey: ["app_users"] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const syncTodo = useCallback(async (todoId: string, updates: Partial<Todo>) => {
    // 1. 로컬 상태 즉시 업데이트 (Optimistic UI)
    queryClient.setQueryData<Todo[]>(["todos"], (old) =>
      old?.map(t => t.id === todoId ? { ...t, ...updates } : t)
    );

    // 2. DB 업데이트
    const { error } = await supabase.from("todos").update(updates).eq("id", todoId);

    if (error) {
      notifications.show({ title: "동기화 실패", message: error.message, color: "red" });
      await loadAll(); // 실패 시 서버 상태로 원복
    }
  }, [loadAll, queryClient]);

  const updateTitle = useCallback(async (todoId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    queryClient.setQueryData<Todo[]>(["todos"], (old) =>
      old?.map(t => t.id === todoId ? { ...t, title: newTitle.trim() } : t)
    );
    const { error } = await supabase.from("todos").update({ title: newTitle.trim() }).eq("id", todoId);
    if (error) {
      notifications.show({ title: "제목 수정 실패", message: error.message, color: "red" });
      await loadAll();
    }
    setEditingId(null);
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
    const hasQuery = Boolean(query.trim());
    if (!hasQuery && !selectedId) return new Set<string>();

    const ids = new Set<string>();
    if (hasQuery) {
      matched.forEach((todoId) => {
        collectAncestorIds(todoId, todoById).forEach((ancestorId) => ids.add(ancestorId));
      });
    }
    if (selectedId) {
      collectAncestorIds(selectedId, todoById).forEach((ancestorId) => ids.add(ancestorId));
    }
    return ids;
  }, [matched, query, selectedId, todoById]);

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
      switchingRef.current = true;
      setDeleteArmed(false);
      setSelectedId(todoId);
      setEditorMode({ mode: "edit", todoId });
      editorHandlers.open();
      setTimeout(() => {
        switchingRef.current = false;
      }, 50);
    },
    [editorHandlers]
  );

  const closeEditor = useCallback(() => {
    if (switchingRef.current) return;
    setDeleteArmed(false);
    editorHandlers.close();
  }, [editorHandlers]);

  useEffect(() => {
    // Scroll listener removed as per user request to keep popover open during scroll
  }, []);

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

    const assigneeId = form.assigneeInput.trim() || null;

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
        assignee_id: (parentId ? todoById[parentId]?.assignee_id : null) ?? currentUser?.id ?? null,
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
  }, [loadAll, editorHandlers, todoById, currentUser]);


  const renderTree = (parentId: string | null, depth: number): ReactNode => {
    let list = childrenByParent.get(parentId) ?? [];

    // Status filter for mobile tab navigation (only for root items)
    if (isMobile && parentId === null) {
      list = list.filter(todo => todo.status === mobileStatusTab);
    }

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
                    openEdit(todo.id);
                    if (hasChildren) {
                      setExpandedById((prev) => ({ ...prev, [todo.id]: !prev[todo.id] }));
                    }
                  }}
                  onAddChild={() => openCreate(todo.id)}
                  onEdit={() => openEdit(todo.id)}
                  onDelete={() => armDelete(todo.id)}
                  editingId={editingId}
                  onUpdateTitle={(title) => updateTitle(todo.id, title)}
                  setEditingId={setEditingId}
                  opened={selectedId === todo.id && editorOpened}
                  renderEditor={renderEditorContent}
                  onClose={closeEditor}
                />
              ) : (
                <TodoListItem
                  todo={todo}
                  assignee={todo.assignee_id ? userById[todo.assignee_id] : undefined}
                  depth={depth}
                  onToggleDone={(checked) => toggleDone(todo, checked)}
                  onOpen={() => {
                    openEdit(todo.id);
                    if (hasChildren) {
                      setExpandedById((prev) => ({ ...prev, [todo.id]: !prev[todo.id] }));
                    }
                  }}
                  onAddChild={() => openCreate(todo.id)}
                  hasChildren={hasChildren}
                  childCount={childCount}
                  expanded={expanded}
                  onToggleExpanded={() => toggleExpanded(todo.id)}
                  editingId={editingId}
                  onUpdateTitle={(title) => updateTitle(todo.id, title)}
                  setEditingId={setEditingId}
                  opened={selectedId === todo.id && editorOpened}
                  renderEditor={renderEditorContent}
                  onClose={closeEditor}
                  isMobile={isMobile}
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

      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.map(t => t.id === todoId ? { ...t, status: newStatus, sort_order: newSortOrder } : t)
      );

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
                    if (assigneeFilter === "anyone") return !t.assignee_id;
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
                          <Group gap={4}>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              onClick={() => openCreate(null)}
                            >
                              <IconPlus size={16} />
                            </ActionIcon>
                          </Group>
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
                                                  top: 3, left: 3, right: -3, bottom: -3,
                                                  background: "white",
                                                  border: "1px solid var(--mantine-color-gray-3)",
                                                  borderRadius: "4px",
                                                  zIndex: 0
                                                }}
                                              />
                                              <Box
                                                style={{
                                                  position: "absolute",
                                                  top: 6, left: 6, right: -6, bottom: -6,
                                                  background: "white",
                                                  border: "1px solid var(--mantine-color-gray-2)",
                                                  borderRadius: "4px",
                                                  zIndex: -1,
                                                }}
                                              />
                                            </>
                                          )}

                                          <Popover
                                            opened={selectedId === todo.id && editorOpened}
                                            onClose={closeEditor}
                                            width={340}
                                            position="right-start"
                                            withArrow
                                            shadow="md"
                                            withinPortal
                                            portalProps={{ target: "#todo-scroll-container" }}
                                            closeOnClickOutside={true}
                                            clickOutsideEvents={['mousedown', 'touchstart']}
                                          >
                                            <Popover.Target>
                                              <Paper
                                                withBorder
                                                radius="sm"
                                                p="xs"
                                                onClick={(e) => {
                                                  if (e.detail > 1) return;
                                                  if ((e.target as HTMLElement).closest('button')) return;
                                                  openEdit(todo.id);
                                                  if (hasChildren) {
                                                    setExpandedById((prev) => ({ ...prev, [todo.id]: !prev[todo.id] }));
                                                  }
                                                }}
                                                onDoubleClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingId(todo.id);
                                                }}
                                                style={{
                                                  position: "relative",
                                                  zIndex: 1,
                                                  cursor: "pointer",
                                                  background: selectedId === todo.id || editingId === todo.id ? "var(--mantine-color-gray-1)" : "white",
                                                  borderColor: overdue ? "var(--mantine-color-red-4)" : "var(--mantine-color-gray-2)",
                                                  boxShadow: "var(--mantine-shadow-xs)",
                                                  transition: 'all 0.1s ease'
                                                }}
                                              >
                                                <Stack gap={6}>
                                                  <Group justify="space-between" wrap="nowrap">
                                                    {editingId === todo.id ? (
                                                      <TextInput
                                                        autoFocus
                                                        size="xs"
                                                        defaultValue={todo.title}
                                                        onKeyDown={(e) => {
                                                          if (e.key === "Enter") updateTitle(todo.id, e.currentTarget.value);
                                                          if (e.key === "Escape") setEditingId(null);
                                                        }}
                                                        onBlur={(e) => updateTitle(todo.id, e.currentTarget.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ flex: 1 }}
                                                      />
                                                    ) : (
                                                      <Text size="sm" fw={700} lineClamp={2} td={isDone ? "line-through" : "none"} c={isDone ? "dimmed" : "dark"} style={{ flex: 1 }}>
                                                        {todo.title}
                                                      </Text>
                                                    )}
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
                                                        <Badge
                                                          color={overdue ? "red" : "gray"}
                                                          size="xs"
                                                          variant={overdue ? "filled" : "light"}
                                                        >
                                                          {dayjs(todo.due_date).format("MM/DD")}
                                                        </Badge>
                                                      )}
                                                      {hasChildren && !expanded && (
                                                        <Badge size="xs" variant="light" color="gray" leftSection={<IconList size={10} />}>
                                                          {subTasks.length}
                                                        </Badge>
                                                      )}
                                                    </Group>
                                                    {assignee ? (
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
                                                    ) : (
                                                      <Avatar size="sm" radius="xl" color="gray" title="누구나">
                                                        ?
                                                      </Avatar>
                                                    )}
                                                  </Group>
                                                </Stack>
                                              </Paper>
                                            </Popover.Target>
                                            <Popover.Dropdown>
                                              {renderEditorContent()}
                                            </Popover.Dropdown>
                                          </Popover>

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
                                                      <Popover
                                                        opened={selectedId === sub.id && editorOpened}
                                                        onClose={closeEditor}
                                                        width={340}
                                                        position="right-start"
                                                        withArrow
                                                        shadow="md"
                                                        withinPortal
                                                        portalProps={{ target: "#todo-scroll-container" }}
                                                        closeOnClickOutside={true}
                                                        clickOutsideEvents={['mousedown', 'touchstart']}
                                                      >
                                                        <Popover.Target>
                                                          <Paper
                                                            withBorder
                                                            radius="sm"
                                                            p="xs"
                                                            onClick={(e) => {
                                                              if ((e.target as HTMLElement).closest('button')) return;
                                                              openEdit(sub.id);
                                                            }}
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
                                                                {editingId === sub.id ? (
                                                                  <TextInput
                                                                    autoFocus
                                                                    size="xs"
                                                                    defaultValue={sub.title}
                                                                    onKeyDown={(e) => {
                                                                      if (e.key === "Enter") updateTitle(sub.id, e.currentTarget.value);
                                                                      if (e.key === "Escape") setEditingId(null);
                                                                    }}
                                                                    onBlur={(e) => updateTitle(sub.id, e.currentTarget.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{ flex: 1 }}
                                                                  />
                                                                ) : (
                                                                  <Text size="sm" fw={700} lineClamp={1} td={subDone ? "line-through" : "none"} c={subDone ? "dimmed" : "dark"}>
                                                                    {sub.title}
                                                                  </Text>
                                                                )}
                                                                <Group justify="space-between" wrap="nowrap">
                                                                  <Group gap={4}>
                                                                    <Badge color={priorityColor(sub.priority)} size="xs" variant="light">
                                                                      {priorityLabels[sub.priority]}
                                                                    </Badge>
                                                                    {!subDone && sub.status !== "todo" && (
                                                                      <Badge size="xs" variant="dot" color={statusColumns.find(c => c.id === sub.status)?.color}>
                                                                        {statusColumns.find(c => c.id === sub.status)?.label}
                                                                      </Badge>
                                                                    )}
                                                                  </Group>
                                                                  {subAssignee && (
                                                                    <Avatar
                                                                      size={24}
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
                                                        </Popover.Target>
                                                        <Popover.Dropdown>
                                                          {renderEditorContent()}
                                                        </Popover.Dropdown>
                                                      </Popover>
                                                    </Box>
                                                  );
                                                })}
                                              </Stack>
                                              <Box mt={10}>
                                                {addingSubId === todo.id ? (
                                                  <Paper withBorder p="xs" radius="sm" shadow="sm">
                                                    <TextInput
                                                      autoFocus
                                                      variant="unstyled"
                                                      placeholder="하위 업무 제목 입력 후 Enter..."
                                                      size="xs"
                                                      onKeyDown={(e) => {
                                                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                                          quickAdd(e.currentTarget.value.trim(), todo.id, todo.status);
                                                          e.currentTarget.value = "";
                                                        }
                                                        if (e.key === "Escape") setAddingSubId(null);
                                                      }}
                                                      onBlur={() => {
                                                        // Delay to allow quickAdd to finish if Enter was pressed
                                                        setTimeout(() => setAddingSubId(null), 200);
                                                      }}
                                                    />
                                                  </Paper>
                                                ) : (
                                                  <Button
                                                    variant="light"
                                                    color="gray"
                                                    size="xs"
                                                    fullWidth
                                                    leftSection={<IconPlus size={14} />}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setAddingSubId(todo.id);
                                                    }}
                                                    styles={{
                                                      root: {
                                                        borderStyle: 'dashed',
                                                        backgroundColor: 'transparent',
                                                        '&:hover': { backgroundColor: 'var(--mantine-color-gray-0)' }
                                                      }
                                                    }}
                                                  >
                                                    하위 업무 추가
                                                  </Button>
                                                )}
                                              </Box>
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
      { value: "anyone", label: "누구나" },
      ...users.map((user) => ({ value: user.id, label: user.name })),
    ];
  }, [users]);

  // For the editor (create/edit), we need a simplified data without "all"
  const editorAssigneeData = useMemo(() => {
    return [
      { value: "none", label: "누구나" },
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

  const renderEditorContent = () => {
    if (editorMode.mode === "edit" && !currentTodo && !editorMode.todoId) return null;

    return (
      <Stack gap="md" py="xs">
        <Group justify="space-between">
          <Title order={5}>
            {editorMode.mode === "create" ? "새 업무 추가" : "업무 상세 정보"}
          </Title>
          <ActionIcon variant="subtle" color="gray" onClick={closeEditor}>
            <IconX size={16} />
          </ActionIcon>
        </Group>

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

        <TextInput
          label="업무"
          radius="md"
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

        <Group grow gap="xs">
          <Select
            label="우선순위"
            radius="md"
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
          <Select
            label="담당자"
            radius="md"
            placeholder="담당자 선택"
            data={editorAssigneeData}
            value={form.assigneeInput || "none"}
            onChange={(value) => {
              const val = value === "none" ? "" : (value ?? "");
              setForm((prev) => ({ ...prev, assigneeInput: val }));
              if (editorMode.mode === "edit") {
                syncTodo(editorMode.todoId, { assignee_id: val || null });
              }
            }}
            allowDeselect={false}
          />
        </Group>

        <Group grow gap="xs">
          <Select
            label="상태"
            radius="md"
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
          <DateInput
            label="마감일"
            radius="md"
            placeholder="날짜 선택"
            locale="ko"
            valueFormat="YYYY. MM. DD (ddd)"
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
        </Group>

        <Paper withBorder radius="md" p="md" bg="var(--mantine-color-gray-0)">
          <Group justify="space-between" mb="xs">
            <Text fw={700} size="sm" c="gray.7">
              하위 업무 ({editorChildren.length})
            </Text>
            <ActionIcon variant="light" color="indigo" size="sm" onClick={() => openCreate(editorMode.mode === "edit" ? editorMode.todoId : null)}>
              <IconPlus size={14} />
            </ActionIcon>
          </Group>
          <Stack gap="xs" style={{ maxHeight: 300, overflowY: 'auto', overscrollBehavior: 'contain' }}>
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
                  style={{
                    cursor: "pointer",
                    background: "white",
                    borderColor: "var(--mantine-color-gray-2)",
                    boxShadow: 'var(--mantine-shadow-xs)'
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <Checkbox
                        size="xs"
                        checked={childDone}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggleDone(child, e.currentTarget.checked)}
                      />
                      <Stack gap={0}>
                        <Text size="sm" fw={700} td={childDone ? "line-through" : "none"} c={childDone ? "dimmed" : "dark"} lineClamp={1}>
                          {child.title}
                        </Text>
                        <Group gap={4} mt={2}>
                          <Badge color={priorityColor(child.priority)} size="xs" variant="light" radius="md">
                            {priorityLabels[child.priority]}
                          </Badge>
                          {childAssignee && (
                            <Badge variant="dot" color="blue" size="xs">{childAssignee.name}</Badge>
                          )}
                        </Group>
                      </Stack>
                    </Group>
                    <ActionIcon
                      variant="subtle"
                      color="indigo"
                      size="sm"
                      radius="md"
                      onClick={(e) => { e.stopPropagation(); openCreate(child.id); }}
                    >
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Group>
                </Paper>
              );
            })}
            {editorChildren.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md">하위 업무가 없습니다.</Text>
            )}
          </Stack>
        </Paper>

        <Group justify="space-between" mt="xl">
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

          <Group gap="sm">
            <Button variant="subtle" color="gray" radius="md" onClick={closeEditor}>취소</Button>
            {editorMode.mode === "create" && (
              <Button color="indigo" radius="md" onClick={saveEditor} loading={saving}>추가하기</Button>
            )}
          </Group>
        </Group>
      </Stack>
    );
  };

  return (
    <Container size="xl" py="xl" px={isMobile ? "md" : "xl"}>
      {/* Desktop Header Title & Action */}
      <Group justify="space-between" mb="xl" visibleFrom="md" align="flex-end">
        <Box>
          <Title order={1} fw={800} style={{ letterSpacing: '-0.02em' }}>To-Do</Title>
          <Text c="dimmed" size="sm" fw={500}>프로젝트 진행 상황을 파악하고 업무를 관리합니다.</Text>
        </Box>
        <Button
          leftSection={<IconPlus size={18} />}
          color="indigo"
          radius="md"
          variant="light"
          onClick={() => openCreate(null)}
          size="md"
        >
          새 업무 추가
        </Button>
      </Group>

      {/* Global Controls & Filters */}
      <Group justify="space-between" mb="lg">
        <Group>
          <Box className="mobile-only" px="md">
            <Title order={2} fw={800} style={{ letterSpacing: '-0.02em' }}>To-Do</Title>
          </Box>
          <SegmentedControl
            value={viewMode}
            onChange={(val) => setViewMode(val as any)}
            data={[
              { label: <Group gap={4} wrap="nowrap"><IconColumns3 size={16} /><span>보드</span></Group>, value: "board" },
              { label: <Group gap={4} wrap="nowrap"><IconList size={16} /><span>목록</span></Group>, value: "list" },
            ]}
          />
        </Group>
      </Group>

      <Paper withBorder radius="md" p="md" bg="var(--mantine-color-white)">
        <Stack gap="md">
          <TextInput
            placeholder="업무 제목, 내용 검색..."
            size="md"
            leftSection={<IconSearch size={18} stroke={1.5} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            radius="md"
          />
          <Group gap="xs" wrap="wrap">
            <Text size="sm" fw={700} c="dimmed" mr={4}>담당자</Text>
            <Button
              variant={assigneeFilter === "all" ? "filled" : "light"}
              color={assigneeFilter === "all" ? "indigo" : "gray"}
              size="compact-sm"
              radius="xl"
              onClick={() => setAssigneeFilter("all")}
            >
              전체
            </Button>
            {sortedUsers.slice(0, isMobile ? 3 : undefined).map((user) => (
              <Button
                key={user.id}
                variant={assigneeFilter === user.id ? "filled" : "light"}
                color={assigneeFilter === user.id ? "indigo" : "gray"}
                size="compact-sm"
                radius="xl"
                onClick={() => setAssigneeFilter(user.id)}
              >
                {user.name}
              </Button>
            ))}
            {isMobile && sortedUsers.length > 3 && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button variant="light" color="gray" size="compact-sm" radius="xl">
                    기타...
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {sortedUsers.slice(3).map(user => (
                    <Menu.Item key={user.id} onClick={() => setAssigneeFilter(user.id)}>
                      {user.name}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Stack>
      </Paper>

      {isMobile && (
        <SegmentedControl
          fullWidth
          radius="md"
          size="sm"
          value={mobileStatusTab}
          onChange={(v) => setMobileStatusTab(v as Todo["status"])}
          data={[
            { label: '할 일', value: 'todo' },
            { label: '진행 중', value: 'in_progress' },
            { label: '완료', value: 'done' }
          ]}
          color="indigo"
          mb="xs"
        />
      )}

      <Box pos="relative" style={{ height: "calc(100vh - 200px)" }}>
        <Paper
          radius="md"
          withBorder
          p="xs"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: 'var(--mantine-color-white)'
          }}
        >
          <Box id="todo-scroll-container" ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "4px", position: "relative" }}>
            {loading ? (
              <Box p="md">
                {viewMode === "grid" ? (
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                    {Array(6).fill(0).map((_, i) => (
                      <Paper key={i} p="md" radius="md" withBorder h={180}>
                        <Stack gap="sm">
                          <Group justify="space-between"><Skeleton height={20} width={20} /><Skeleton height={20} width={20} /></Group>
                          <Skeleton height={24} width="80%" />
                          <Group gap={6}><Skeleton height={18} width={50} radius="md" /><Skeleton height={18} width={50} radius="md" /></Group>
                          <Group justify="space-between" mt="auto"><Skeleton height={20} width={60} radius="xl" /><Skeleton height={20} width={40} radius="md" /></Group>
                        </Stack>
                      </Paper>
                    ))}
                  </SimpleGrid>
                ) : viewMode === "list" ? (
                  <Stack gap="xs">
                    {Array(8).fill(0).map((_, i) => (
                      <Paper key={i} p="xs" radius="sm" withBorder shadow="0">
                        <Group gap="sm" wrap="nowrap">
                          <Skeleton height={20} width={20} />
                          <Skeleton height={20} width="60%" />
                          <Skeleton height={20} width={60} radius="xl" ml="auto" />
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Box style={{ display: "flex", gap: "1rem", overflowX: "auto" }}>
                    {["할 일", "진행 중", "완료"].map((label, i) => (
                      <Box key={i} style={{ minWidth: 320, flex: 1 }}>
                        <Paper p="sm" radius="md" withBorder bg="gray.0">
                          <Group justify="space-between" mb="md">
                            <Text fw={800} size="sm">{label}</Text>
                          </Group>
                          <Stack gap="sm">
                            {Array(3).fill(0).map((_, j) => (
                              <Paper key={j} p="sm" radius="md" withBorder h={120}>
                                <Stack gap="xs">
                                  <Skeleton height={18} width="90%" />
                                  <Skeleton height={14} width="40%" />
                                  <Group justify="space-between" mt="sm">
                                    <Box style={{ display: 'flex', gap: 4 }}>
                                      <Skeleton height={16} width={16} circle />
                                      <Skeleton height={16} width={16} circle />
                                    </Box>
                                    <Skeleton height={16} width={40} radius="md" />
                                  </Group>
                                </Stack>
                              </Paper>
                            ))}
                          </Stack>
                        </Paper>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ) : viewMode === "board" ? (
              renderBoard()
            ) : (
              renderTree(null, 0) || (
                <Text size="sm" c="dimmed" ta="center" mt="xl" py="xl">
                  표시할 업무가 없습니다.
                </Text>
              )
            )}
          </Box>
        </Paper>
      </Box>

      {/* Task Editor - Drawer for Mobile, Modal for Creation ONLY on Desktop (Editing uses Popover) */}
      {isMobile ? (
        <Drawer
          opened={editorOpened}
          onClose={closeEditor}
          position="bottom"
          size="90%"
          title={<Text fw={700}>업무 편집</Text>}
          radius="lg"
        >
          {renderEditorContent()}
        </Drawer>
      ) : (
        <Modal
          opened={editorOpened && editorMode.mode === "create"}
          onClose={closeEditor}
          title={<Text fw={700}>새 업무 추가</Text>}
          centered
          size="md"
          radius="md"
        >
          {renderEditorContent()}
        </Modal>
      )}

      {/* Universal FAB - Mobile Only */}
      <Affix position={{ bottom: isMobile ? 100 : 40, right: isMobile ? 24 : 40 }} className="mobile-only">
        <Transition transition="slide-up" mounted={true}>
          {(transitionStyles) => (
            <ActionIcon
              size={64}
              radius="xl"
              color="indigo"
              variant="filled"
              style={{
                ...transitionStyles,
                boxShadow: '0 8px 32px rgba(99, 102, 241, 0.4)',
                zIndex: 1000,
              }}
              onClick={() => openCreate(null)}
            >
              <IconPlus size={32} />
            </ActionIcon>
          )}
        </Transition>
      </Affix>
    </Container>
  );
}
