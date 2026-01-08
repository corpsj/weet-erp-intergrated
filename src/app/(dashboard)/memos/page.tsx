"use client";

import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  Divider,
  ScrollArea,
  Skeleton,
  rem,
  Tooltip,
  Badge,
  Modal,
  Menu,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPaperclip,
  IconPlus,
  IconSearch,
  IconTrash,
  IconPinned,
  IconPinnedFilled,
  IconChevronRight,
  IconFolder,
  IconFolderFilled,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconArrowBackUp,
  IconX,
  IconDots,
  IconPencil,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMediaQuery, useDebouncedCallback } from "@mantine/hooks";

type Memo = {
  id: string;
  title: string | null;
  body: string;
  is_pinned: boolean;
  folder: string | null;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author?: { name: string } | null;
};

type MemoFolder = {
  id: string;
  name: string;
  created_at: string;
};

type Attachment = {
  id: string;
  memo_id: string;
  object_path: string;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

export default function MemosPage() {
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery("(max-width: 48em)");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [sidebarOpened, setSidebarOpened] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { data: items = [], isLoading: loading } = useQuery<Memo[]>({
    queryKey: ["memos", selectedFolder === "trash"],
    queryFn: async () => {
      const isTrash = selectedFolder === "trash";
      const response = await fetchWithAuth(`/api/memos${isTrash ? "?deleted=true" : ""}`);
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      return (payload?.items ?? []) as Memo[];
    },
  });

  const [isPinned, setIsPinned] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const { data: folderItems = [], isLoading: foldersLoading } = useQuery<MemoFolder[]>({
    queryKey: ["memo_folders"],
    queryFn: async () => {
      const response = await fetchWithAuth("/api/memos/folders");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "폴더 불러오기 실패");
      return (payload?.items ?? []) as MemoFolder[];
    },
  });

  const selectedMemo = useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);

  const loadAttachments = useCallback(async (memoId: string) => {
    const response = await fetchWithAuth(`/api/memos/${memoId}/attachments`);
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) throw new Error(payload?.message ?? "첨부 불러오기 실패");
    setAttachments((payload?.items ?? []) as Attachment[]);
  }, []);

  useEffect(() => {
    if (selectedMemo) {
      setTitle(selectedMemo.title ?? "");
      setBody(selectedMemo.body);
      setIsPinned(selectedMemo.is_pinned);
      setFolder(selectedMemo.folder);
      void loadAttachments(selectedMemo.id);
    } else {
      setTitle("");
      setBody("");
      setIsPinned(false);
      setFolder(null);
      setAttachments([]);
    }
  }, [selectedMemo, loadAttachments]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<Memo>) => {
      if (!selectedId) {
        const response = await fetchWithAuth("/api/memos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "생성 실패");
        return data.item as Memo;
      } else {
        const response = await fetchWithAuth(`/api/memos/${selectedId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "수정 실패");
        return data.item as Memo;
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<Memo[]>(["memos", selectedFolder === "trash"], (old?: Memo[]) => {
        if (!old) return [data];
        const exists = old.find((x: Memo) => x.id === data.id);
        if (exists) {
          return old.map((x: Memo) => (x.id === data.id ? data : x)).sort((a: Memo, b: Memo) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
            return dayjs(b.updated_at).unix() - dayjs(a.updated_at).unix();
          });
        }
        return [data, ...old].sort((a: Memo, b: Memo) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return dayjs(b.updated_at).unix() - dayjs(a.updated_at).unix();
        });
      });
      if (!selectedId) setSelectedId(data.id);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetchWithAuth("/api/memos/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "폴더 생성 실패");
      return data.item as MemoFolder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["memo_folders"] });
      notifications.show({ title: "폴더 생성", message: `"${data.name}" 폴더가 생성되었습니다.`, color: "indigo" });
      setIsAddingFolder(false);
      setNewFolderName("");
      setSelectedFolder(data.name);
    },
    onError: (err) => {
      notifications.show({ title: "폴더 생성 실패", message: err.message, color: "red" });
    }
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await fetchWithAuth(`/api/memos/folders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "폴더 수정 실패");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memo_folders"] });
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      setEditingFolderId(null);
      setEditingFolderName("");
      notifications.show({ title: "폴더 수정", message: "폴더 이름이 변경되었습니다.", color: "indigo" });
    },
    onError: (err) => {
      notifications.show({ title: "폴더 수정 실패", message: err.message, color: "red" });
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/memos/folders/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("폴더 삭제 실패");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memo_folders"] });
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      if (selectedFolder && selectedFolder !== "all" && selectedFolder !== "pinned" && selectedFolder !== "trash") {
        setSelectedFolder("all"); // Reset selection if deleted folder was active
      }
      notifications.show({ title: "폴더 삭제", message: "폴더가 삭제되었습니다.", color: "gray" });
    },
    onError: (err: any) => {
      notifications.show({ title: "폴더 삭제 실패", message: err.message, color: "red" });
    }
  });

  const debouncedSave = useDebouncedCallback((currentTitle: string, currentBody: string, currentIsPinned: boolean, currentFolder: string | null) => {
    saveMutation.mutate({ title: currentTitle.trim() || null, body: currentBody, is_pinned: currentIsPinned, folder: currentFolder });
  }, 1000);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    debouncedSave(val, body, isPinned, folder);
  };

  const handleBodyChange = (val: string) => {
    setBody(val);
    debouncedSave(title, val, isPinned, folder);
  };

  const togglePin = () => {
    const nextValue = !isPinned;
    setIsPinned(nextValue);
    saveMutation.mutate({ is_pinned: nextValue });
  };

  const deleteMutation = useMutation({
    mutationFn: async ({ id, permanent }: { id: string; permanent?: boolean }) => {
      const response = await fetchWithAuth(`/api/memos/${id}${permanent ? "?permanent=true" : ""}`, { method: "DELETE" });
      if (!response.ok) throw new Error("삭제 실패");
    },
    onSuccess: (_, { id, permanent }) => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      if (selectedId === id) setSelectedId(null);
      notifications.show({
        title: permanent ? "완전 삭제 완료" : "휴지통으로 이동",
        message: permanent ? "메모가 완전히 삭제되었습니다." : "메모가 휴지통으로 이동되었습니다.",
        color: "gray"
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/memos/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleted_at: null }),
      });
      if (!response.ok) throw new Error("복구 실패");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      notifications.show({ title: "복구 완료", message: "메모가 복구되었습니다.", color: "indigo" });
    },
  });

  const handleCreate = () => {
    if (selectedFolder === "trash") setSelectedFolder("all");
    setSelectedId(null);
    setTitle("");
    setBody("");
    setIsPinned(false);
    setFolder(selectedFolder === "all" || selectedFolder === "pinned" || selectedFolder === "trash" ? null : selectedFolder);
    setAttachments([]);
    if (!isMobile) {
      setTimeout(() => editorRef.current?.focus(), 50);
    }
  };

  const handleDelete = (id: string) => {
    const isTrash = selectedFolder === "trash" || selectedMemo?.deleted_at;
    if (isTrash) {
      if (window.confirm("이 메모를 영구적으로 삭제하시겠습니까? 복구할 수 없습니다.")) {
        deleteMutation.mutate({ id, permanent: true });
      }
    } else {
      deleteMutation.mutate({ id });
    }
  };

  const handleRestore = (id: string) => {
    restoreMutation.mutate(id);
  };

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        let currentId = selectedId;

        // If it's a new memo, create it first
        if (!currentId) {
          const response = await fetchWithAuth("/api/memos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: title.trim() || null,
              body: body || "",
              is_pinned: isPinned,
              folder: selectedFolder === "all" || selectedFolder === "pinned" || selectedFolder === "trash" ? null : selectedFolder
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || "메모 생성 실패");
          currentId = data.item.id;
          setSelectedId(currentId);
          // Invalidate to show in list immediately
          queryClient.invalidateQueries({ queryKey: ["memos"] });
        }

        const form = new FormData();
        form.set("file", file);
        const response = await fetchWithAuth(`/api/memos/${currentId}/attachments`, { method: "POST", body: form });
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) throw new Error(payload?.message ?? "업로드 실패");
        await loadAttachments(currentId!);
        notifications.show({ title: "업로드 완료", message: "첨부가 업로드되었습니다.", color: "gray" });
      } catch (error) {
        notifications.show({
          title: "업로드 실패",
          message: error instanceof Error ? error.message : "알 수 없는 오류",
          color: "red",
        });
      } finally {
        setUploading(false);
      }
    },
    [selectedId, title, body, isPinned, selectedFolder, loadAttachments, queryClient]
  );

  const openAttachment = useCallback(async (attachmentId: string) => {
    try {
      const response = await fetchWithAuth(`/api/memos/attachments/${attachmentId}/download`);
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "열기 실패");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      notifications.show({ title: "열기 실패", message: "첨부 파일을 열 수 없습니다.", color: "red" });
    }
  }, []);

  const folders = useMemo(() => {
    // Unique folder names from BOTH the folder table and the memos (legacy/adhoc)
    const fromMemos = items.map((x: Memo) => x.folder).filter(Boolean) as string[];
    const fromTable = folderItems.map((x: MemoFolder) => x.name);
    return Array.from(new Set([...fromTable, ...fromMemos])).sort();
  }, [items, folderItems]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedFolder === "pinned") {
      list = list.filter((x: Memo) => x.is_pinned);
    } else if (selectedFolder !== "all" && selectedFolder !== "trash") {
      list = list.filter((x: Memo) => x.folder === selectedFolder);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((x: Memo) => x.title?.toLowerCase().includes(q) || x.body.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedFolder, searchQuery]);

  const groupedMemos = useMemo(() => {
    const list = filteredItems;
    const now = dayjs();

    // Split pinned if not in "pinned" or "trash" view
    const showPinnedSeparately = selectedFolder !== "pinned" && selectedFolder !== "trash" && !searchQuery;

    const pinned = showPinnedSeparately ? list.filter(item => item.is_pinned && !item.deleted_at) : [];
    const others = showPinnedSeparately ? list.filter(item => !(item.is_pinned && !item.deleted_at)) : list;

    const sections: { title: string; items: Memo[] }[] = [];

    if (pinned.length > 0) {
      sections.push({ title: "고정된 메모", items: pinned });
    }

    const today: Memo[] = [];
    const yesterday: Memo[] = [];
    const last7Days: Memo[] = [];
    const rest: { [key: string]: Memo[] } = {};

    others.forEach(item => {
      const date = dayjs(item.updated_at);
      if (date.isSame(now, 'day')) {
        today.push(item);
      } else if (date.isSame(now.subtract(1, 'day'), 'day')) {
        yesterday.push(item);
      } else if (date.isAfter(now.subtract(7, 'day'))) {
        last7Days.push(item);
      } else {
        const monthYear = date.format('YYYY년 M월');
        if (!rest[monthYear]) rest[monthYear] = [];
        rest[monthYear].push(item);
      }
    });

    const mainTitle = selectedFolder === "trash" ? "삭제됨" : (showPinnedSeparately ? "메모" : "");

    if (today.length > 0) sections.push({ title: mainTitle ? `${mainTitle} - 오늘` : "오늘", items: today });
    if (yesterday.length > 0) sections.push({ title: mainTitle ? `${mainTitle} - 어제` : "어제", items: yesterday });
    if (last7Days.length > 0) sections.push({ title: mainTitle ? `${mainTitle} - 지난 7일` : "지난 7일", items: last7Days });

    Object.keys(rest).sort((a, b) => dayjs(rest[b][0].updated_at).diff(dayjs(rest[a][0].updated_at))).forEach(key => {
      sections.push({ title: mainTitle ? `${mainTitle} - ${key}` : key, items: rest[key] });
    });

    return sections;
  }, [filteredItems, selectedFolder, searchQuery]);

  const highlightSearch = (text: string | null, query: string) => {
    if (!text) return "";
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} style={{ backgroundColor: "#ffeb3b", color: "#000" }}>{part}</span>
          ) : part
        )}
      </>
    );
  };

  // UI Components
  const folderList = (
    <Stack gap={2} p="md">
      <Button
        variant={selectedFolder === "all" ? "light" : "subtle"}
        color="indigo"
        justify="flex-start"
        leftSection={<IconFolder size={18} />}
        onClick={() => setSelectedFolder("all")}
        radius="md"
        styles={{
          root: { height: 36 },
          label: { fontWeight: 600 }
        }}
      >
        모든 메모
      </Button>
      <Button
        variant={selectedFolder === "pinned" ? "light" : "subtle"}
        color="indigo"
        justify="flex-start"
        leftSection={<IconPinned size={18} />}
        onClick={() => setSelectedFolder("pinned")}
        radius="md"
        styles={{
          root: { height: 36 },
          label: { fontWeight: 600 }
        }}
      >
        고정됨
      </Button>

      <Text size="xs" fw={700} c="dimmed" px="sm" mt="md" mb={4}>폴더</Text>

      {folders.map((f) => {
        // Find folder ID from folderItems list if possible. 
        // Logic: 'folders' array is just strings. 'folderItems' is {id, name}.
        // We match by name. If no match (legacy string-only folder), we can't delete/rename properly via ID API.
        // But for newly created ones via API, they exist in folderItems.
        const folderObj = folderItems?.find((mf) => mf.name === f);
        const isEditing = editingFolderId === folderObj?.id;

        if (isEditing && folderObj) {
          return (
            <Group
              key={f}
              gap="xs"
              wrap="nowrap"
              style={{
                height: 36,
                backgroundColor: '#1E40AF', // Dark blue background for selection
                borderRadius: 6,
                paddingLeft: 'calc(var(--mantine-spacing-sm) + 4px)',
                alignItems: 'center',
                marginTop: 2,
                border: '1px solid #60A5FA' // Lighter blue border
              }}
            >
              <IconFolder size={18} color="white" style={{ flexShrink: 0 }} />
              <TextInput
                defaultValue={editingFolderName}
                onChange={(e) => setEditingFolderName(e.currentTarget.value)}
                variant="unstyled"
                size="sm"
                style={{ flex: 1 }}
                styles={{ input: { fontWeight: 600, height: 36, padding: 0, color: 'white' } }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editingFolderName.trim()) {
                    updateFolderMutation.mutate({ id: folderObj.id, name: editingFolderName.trim() });
                  } else if (e.key === "Escape") {
                    setEditingFolderId(null);
                  }
                }}
                ref={(input) => {
                  if (input) {
                    input.focus();
                    // input.select(); // Auto-select text
                  }
                }}
                onFocus={(e) => e.target.select()}
                onBlur={() => {
                  if (editingFolderName.trim() && editingFolderName !== f) {
                    updateFolderMutation.mutate({ id: folderObj.id, name: editingFolderName.trim() });
                  } else {
                    setEditingFolderId(null);
                  }
                }}
              />
            </Group>
          );
        }

        return (
          <Button
            key={f}
            variant={selectedFolder === f ? "light" : "subtle"}
            color="indigo"
            justify="flex-start"
            leftSection={<IconFolder size={18} />}
            rightSection={
              folderObj ? (
                <Menu shadow="md" width={200} position="right-start" withArrow withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <IconDots size={16} stroke={2.5} />
                    </ActionIcon>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconPencil size={14} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolderId(folderObj.id);
                        setEditingFolderName(folderObj.name);
                        // Also select it when editing starts? 
                        setSelectedFolder(f);
                      }}
                    >
                      폴더 이름 변경
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`'${f}' 폴더를 삭제하시겠습니까?\n포함된 메모는 유지되지만 폴더 구분은 사라집니다.`)) {
                          deleteFolderMutation.mutate(folderObj.id);
                        }
                      }}
                    >
                      폴더 삭제
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ) : null
            }
            onClick={() => setSelectedFolder(f)}
            radius="md"
            fullWidth
            styles={{
              root: {
                height: 36,
                paddingRight: 4
              },
              label: { fontWeight: 600, flex: 1 },
              section: { marginRight: 10 }
            }}
          >
            {f}
          </Button>
        );
      })}
      {isAddingFolder ? (
        <Group
          gap="xs"
          wrap="nowrap"
          style={{
            height: 36,
            backgroundColor: '#3b5bdb',  // Indigo-7 equivalent
            borderRadius: 6,
            paddingLeft: 'calc(var(--mantine-spacing-sm) + 4px)',
            alignItems: 'center',
            border: '2px solid #748ffc' // Indigo-4 equivalent
          }}
        >
          <IconFolder size={18} color="white" style={{ flexShrink: 0 }} />
          <TextInput
            defaultValue={newFolderName}
            onChange={(e) => setNewFolderName(e.currentTarget.value)}
            variant="unstyled"
            size="sm"
            style={{ flex: 1 }}
            styles={{ input: { fontWeight: 600, height: 36, padding: 0, color: 'white' } }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) {
                createFolderMutation.mutate(newFolderName.trim());
              } else if (e.key === "Escape") {
                setIsAddingFolder(false);
                setNewFolderName("");
              }
            }}
            ref={(input) => {
              if (input) {
                input.focus();
                // input.select(); 
              }
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => {
              if (!newFolderName.trim()) setIsAddingFolder(false);
              // Optionally confirm on blur? 
              // createFolderMutation.mutate(newFolderName.trim());
            }}
          />
        </Group>
      ) : (
        <Button
          variant="subtle"
          color="gray"
          size="compact-xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setIsAddingFolder(true);
            setNewFolderName("새로운 폴더");
          }}
          radius="md"
          mt={4}
          justify="flex-start"
          styles={{
            root: { height: 36 },
            label: { fontSize: 13, fontWeight: 500 }
          }}
        >
          새 폴더...
        </Button>
      )}

      <Box style={{ flex: 1 }} />

      <Button
        variant={selectedFolder === "trash" ? "filled" : "subtle"}
        color={selectedFolder === "trash" ? "#fa5252" : "gray"}
        justify="flex-start"
        leftSection={<IconTrash size={18} />}
        onClick={() => setSelectedFolder("trash")}
        radius="lg"
        styles={{
          root: { height: 36, backgroundColor: selectedFolder === "trash" ? "#fa5252" : "transparent" },
          label: { fontWeight: 600, color: selectedFolder === "trash" ? "white" : undefined }
        }}
      >
        최근 삭제된 항목
      </Button>
    </Stack>
  );

  const memoList = (
    <Stack gap={0} h="100%">
      <Box p="md">
        <Group gap="xs">
          <TextInput
            placeholder="검색"
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            radius="md"
            size="sm"
            style={{ flex: 1 }}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-gray-1)',
                border: 'none',
                paddingLeft: 34
              }
            }}
            rightSection={searchQuery && (
              <ActionIcon size="xs" variant="subtle" onClick={() => setSearchQuery("")}>
                <IconX size={14} />
              </ActionIcon>
            )}
          />
          <ActionIcon variant="light" color="indigo" size="lg" radius="md" onClick={handleCreate}>
            <IconPlus size={18} />
          </ActionIcon>
        </Group>
      </Box>
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={0} px="xs">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <Box key={i} p="md" style={{ borderBottom: '1px solid var(--border)' }}>
                <Skeleton height={16} width="60%" mb={8} radius="xl" />
                <Skeleton height={12} width="90%" radius="xl" />
              </Box>
            ))
          ) : groupedMemos.length > 0 ? (
            groupedMemos.map((group) => (
              <Box key={group.title} mb="xs">
                <Box px="md" py={6}>
                  <Text size="xs" fw={800} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{group.title}</Text>
                </Box>
                <Stack gap={2}>
                  {group.items.map((item) => (
                    <Box
                      key={item.id}
                      px="md"
                      py="sm"
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        cursor: 'pointer',
                        borderRadius: 8,
                        backgroundColor: selectedId === item.id ? 'var(--mantine-color-indigo-0)' : 'transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap" mb={4} align="flex-start">
                        <Group gap={6} style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={700} size="sm" lineClamp={1} style={{ color: 'var(--mantine-color-text)' }}>
                            {highlightSearch(item.title || "제목 없음", searchQuery)}
                          </Text>
                          {item.author?.name && (
                            <Text
                              size="10px"
                              fw={500}
                              c="dimmed"
                              style={{
                                backgroundColor: 'rgba(0,0,0,0.04)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {item.author.name}
                            </Text>
                          )}
                        </Group>
                        <Group gap={6} wrap="nowrap" align="center">
                          {item.is_pinned && !item.deleted_at && (
                            <IconPinnedFilled size={12} color="var(--mantine-color-indigo-6)" />
                          )}
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                            {dayjs(item.updated_at).isSame(dayjs(), 'day')
                              ? dayjs(item.updated_at).format("HH:mm")
                              : dayjs(item.updated_at).format("YYYY-MM-DD")}
                          </Text>
                        </Group>
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={2} style={{ lineHeight: 1.5 }}>
                        {highlightSearch(item.body || "추가 텍스트 없음", searchQuery)}
                      </Text>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))
          ) : (
            <Box p="xl" style={{ textAlign: 'center' }}>
              <IconNotes size={48} color="var(--border)" style={{ marginBottom: 12, opacity: 0.5 }} />
              <Text size="sm" c="dimmed">메모가 없습니다</Text>
            </Box>
          )}
        </Stack>
      </ScrollArea>
      <Box p="md">
        {/* Remove bottom button as requested */}
      </Box>
    </Stack>
  );


  const editorContent = (
    <Stack gap={0} h="100%">
      <Group justify="space-between" px="md" py="xs" style={{ background: 'transparent' }}>
        <Group gap="xs">
          {isMobile && selectedId && (
            <ActionIcon variant="subtle" color="gray" onClick={() => setSelectedId(null)}>
              <IconChevronRight style={{ transform: 'rotate(180deg)' }} />
            </ActionIcon>
          )}
          {!isMobile && (
            <ActionIcon variant="subtle" color="gray" onClick={() => setSidebarOpened(!sidebarOpened)}>
              {sidebarOpened ? <IconLayoutSidebarLeftCollapse size={20} /> : <IconLayoutSidebarLeftExpand size={20} />}
            </ActionIcon>
          )}
          <Box component="div" style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-dimmed)', fontWeight: 600 }}>
            {selectedId ? (
              <Group gap={6} wrap="nowrap">
                {saveMutation.isPending ? (
                  "저장 중..."
                ) : (
                  <>
                    {selectedMemo?.deleted_at ? "휴지통" : dayjs(selectedMemo?.updated_at).format("YYYY년 M월 D일 HH:mm")}
                    {selectedMemo?.author?.name && (
                      <Text inherit component="span" style={{ opacity: 0.6 }}>
                        • {selectedMemo.author.name}
                      </Text>
                    )}
                  </>
                )}
              </Group>
            ) : "새 메모"}
          </Box>
        </Group>
        <Group gap="xs">
          {selectedId && (
            <>
              {selectedMemo?.deleted_at ? (
                <>
                  <Button
                    size="xs"
                    variant="light"
                    color="#EBB036"
                    leftSection={<IconArrowBackUp size={16} />}
                    onClick={() => handleRestore(selectedId)}
                    radius="md"
                  >
                    복구
                  </Button>
                  <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(selectedId)}>
                    <IconTrash size={20} />
                  </ActionIcon>
                </>
              ) : (
                <>
                  <Tooltip label={isPinned ? "고정 해제" : "고정"}>
                    <ActionIcon
                      variant="subtle"
                      color={isPinned ? "indigo" : "gray"}
                      onClick={togglePin}
                      loading={saveMutation.isPending && saveMutation.variables?.is_pinned !== undefined}
                    >
                      {isPinned ? <IconPinnedFilled size={20} /> : <IconPinned size={20} />}
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="폴더 이동">
                    <ActionIcon variant="subtle" color="gray" onClick={() => {
                      const newFolder = window.prompt("폴더 이름을 입력하세요 (비우면 폴더 없음)", folder || "");
                      if (newFolder !== null) {
                        setFolder(newFolder.trim() || null);
                        saveMutation.mutate({ folder: newFolder.trim() || null });
                      }
                    }}>
                      <IconFolder size={20} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="삭제">
                    <ActionIcon variant="subtle" color="gray" onClick={() => handleDelete(selectedId)}>
                      <IconTrash size={20} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </>
          )}
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }} p="xl">
        <Stack gap="md" maw={850} mx="auto">
          {selectedMemo?.deleted_at && (
            <Paper p="xs" bg="red.0" withBorder style={{ borderColor: 'var(--mantine-color-red-2)', borderRadius: 12 }}>
              <Text size="xs" c="red.9" ta="center" fw={600}>이 메모는 휴지통에 있습니다. 읽기 전용입니다.</Text>
            </Paper>
          )}
          <TextInput
            placeholder="제목"
            variant="unstyled"
            readOnly={!!selectedMemo?.deleted_at}
            styles={{
              input: {
                fontSize: rem(32),
                fontWeight: 800,
                padding: 0,
                height: 'auto',
                minHeight: 'auto',
                color: 'var(--mantine-color-text)',
                letterSpacing: '-0.5px'
              }
            }}
            value={title}
            onChange={(e) => handleTitleChange(e.currentTarget.value)}
          />
          <Textarea
            ref={editorRef}
            placeholder="여기에 내용을 입력하십시오..."
            variant="unstyled"
            autosize
            minRows={10}
            readOnly={!!selectedMemo?.deleted_at}
            styles={{
              input: {
                fontSize: rem(17),
                padding: 0,
                lineHeight: 1.6,
                color: 'var(--mantine-color-text)'
              }
            }}
            value={body}
            onChange={(e) => handleBodyChange(e.currentTarget.value)}
          />

          <Box mt="xl">
            <Divider mb="lg" />
            <Group justify="space-between" mb="xs">
              <Text fw={800} size="sm" c="dimmed">첨부 파일</Text>
              {!selectedMemo?.deleted_at && (
                <FileButton onChange={(file) => file && void upload(file)} accept="*/*">
                  {(props) => (
                    <ActionIcon {...props} variant="subtle" color="indigo" loading={uploading}>
                      <IconPlus size={20} />
                    </ActionIcon>
                  )}
                </FileButton>
              )}
            </Group>
            <Group gap="xs">
              {attachments.map((a) => (
                <Paper
                  key={a.id}
                  p="xs"
                  radius="md"
                  withBorder
                  onClick={() => void openAttachment(a.id)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <IconPaperclip size={16} color="var(--mantine-color-indigo-6)" />
                  <Stack gap={0}>
                    <Text size="xs" fw={700} lineClamp={1}>{a.filename ?? "파일"}</Text>
                    <Text size="10px" c="dimmed">{a.content_type?.split('/')?.[1]?.toUpperCase() ?? "FILE"}</Text>
                  </Stack>
                </Paper>
              ))}
              {!attachments.length && (
                <Text size="xs" c="dimmed" fs="italic">첨부가 없습니다.</Text>
              )}
            </Group>
          </Box>
        </Stack>
      </ScrollArea>
    </Stack>
  );

  if (isMobile) {
    return (
      <Box h="calc(100vh - 144px)" style={{ margin: '-16px', background: 'white' }}>
        {selectedId ? editorContent : (
          <Stack gap={0} h="100%">
            <Box p="md">
              <Text size="xl" fw={900} mb="sm">메모</Text>
              <TextInput
                placeholder="검색"
                leftSection={<IconSearch size={16} />}
                radius="lg"
                styles={{ input: { backgroundColor: '#f1f1f1', border: 'none' } }}
              />
            </Box>
            <ScrollArea style={{ flex: 1 }}>
              {memoList}
            </ScrollArea>
            <Group justify="flex-end" p="md">
              <ActionIcon size="xl" radius="xl" color="#EBB036" variant="filled" onClick={handleCreate}>
                <IconPlus />
              </ActionIcon>
            </Group>
          </Stack>
        )}
      </Box>
    );
  }

  return (
    <Paper radius="xl" withBorder style={{
      overflow: 'hidden',
      height: 'calc(100dvh - 160px)',
      background: 'white',
      display: 'flex',
      boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
      border: '1px solid #e0e0e0'
    }}>
      {/* Column 1: Folders (Glassmorphism Sidebar) */}
      {sidebarOpened && (
        <Box style={{
          width: 240,
          borderRight: '1px solid #f0f0f0',
          background: 'rgba(250, 250, 250, 0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }}>
          {folderList}
        </Box>
      )}

      {/* Column 2: List */}
      <Box style={{ width: 340, borderRight: '1px solid #f0f0f0', background: 'white' }}>
        {memoList}
      </Box>

      {/* Column 3: Editor */}
      <Box style={{ flex: 1, background: 'white' }}>
        {editorContent}
      </Box>

      {/* Modals */}
    </Paper>
  );
}

// Add a dummy icon for the empty state
function IconNotes({ size, color, style }: { size: number; color: string; style: any }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="7 13 12 18 21 5" />
    </svg>
  );
}

