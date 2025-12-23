"use client";

import {
  Box,
  Button,
  Container,
  FileButton,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCamera, IconUpload } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

type ApiItemResponse<T> = {
  item?: T;
  message?: string;
};

export default function UtilityBillUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [siteId, setSiteId] = useState("");
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(async () => {
    if (!file) {
      notifications.show({ title: "파일 선택", message: "업로드할 고지서를 선택하세요.", color: "yellow" });
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (siteId.trim()) form.set("site_id", siteId.trim());

      const response = await fetchWithAuth("/api/utility-bills", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as ApiItemResponse<{ id: string }> | null;
      if (!response.ok) throw new Error(payload?.message ?? "업로드 실패");

      const id = payload?.item?.id as string | undefined;
      notifications.show({ title: "업로드 완료", message: "처리를 시작했습니다.", color: "gray" });
      if (id) {
        router.push(`/utility-bills/${id}`);
        return;
      }
      router.push("/utility-bills");
    } catch (error) {
      notifications.show({
        title: "업로드 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setUploading(false);
    }
  }, [file, router, siteId]);

  return (
    <Container size={720} py="xl">
      <Stack gap="lg">
        <Box>
          <Title order={2}>공과금 고지서 업로드</Title>
          <Text c="dimmed" size="sm">
            촬영 또는 파일 업로드 후 자동 처리 상태를 확인하세요.
          </Text>
        </Box>

        <Paper withBorder radius="md" p="lg">
          <Stack gap="md">
            <TextInput
              label="현장 ID (선택)"
              placeholder="site_id"
              value={siteId}
              onChange={(event) => setSiteId(event.currentTarget.value)}
            />

            <Group>
              <FileButton onChange={setFile} accept="image/*" capture="environment">
                {(props) => (
                  <Button {...props} leftSection={<IconCamera size={16} />} variant="light" color="gray">
                    촬영/선택
                  </Button>
                )}
              </FileButton>
              <Text size="sm" c="dimmed">
                {file ? file.name : "선택된 파일이 없습니다."}
              </Text>
            </Group>

            <Button
              leftSection={<IconUpload size={16} />}
              color="gray"
              onClick={() => void upload()}
              loading={uploading}
            >
              업로드 후 처리 시작
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
