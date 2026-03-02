"use client";

import {
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const normalizeNextPath = (value: string | null) => {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  return value;
};

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [nextReady, setNextReady] = useState(false);

  const [userId, setUserId] = useState("");
  const [rememberId, setRememberId] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const queryNext = new URLSearchParams(window.location.search).get("next");
    setNextPath(normalizeNextPath(queryNext));
    setNextReady(true);
  }, []);

  useEffect(() => {
    if (!nextReady) return;

    const savedId = localStorage.getItem("we-et-login-id") ?? "";
    if (savedId) {
      setUserId(savedId);
      setRememberId(true);
    }

    localStorage.removeItem("we-et-auto-login");
    localStorage.removeItem("we-et-login-password");

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace(nextPath);
      }
    });
  }, [nextPath, nextReady, router]);

  const handleLogin = useCallback(async () => {
    if (!userId.trim()) {
      notifications.show({
        title: "아이디 필요",
        message: "아이디를 입력하세요.",
        color: "yellow",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim() }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "로그인 실패");
      }

      const { access_token, refresh_token } = await res.json();

      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (error) throw error;

      if (rememberId) {
        localStorage.setItem("we-et-login-id", userId);
      } else {
        localStorage.removeItem("we-et-login-id");
      }

      router.replace(nextPath);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      notifications.show({
        title: "로그인 실패",
        message,
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, [nextPath, rememberId, router, userId]);

  return (
    <Box className="app-shell soft-grid">
      <Center mih="100vh" p={{ base: 24, md: 48 }}>
        <Paper className="app-surface" radius="lg" p={{ base: 24, md: 40 }} maw={520} w="100%">
          <Stack gap="lg">
            <Box>
              <Title order={2} className="brand-title">
                WE-ET ERP 로그인
              </Title>
              <Text c="dimmed" mt="xs">
                계정으로 로그인해 업무를 시작하세요.
              </Text>
            </Box>
            <Stack gap="md">
              <Stack gap={4}>
                <Text size="sm" fw={500}>아이디</Text>
                <Group gap="xs" wrap="nowrap">
                  <TextInput
                    placeholder="아이디"
                    value={userId}
                    onChange={(event) => setUserId(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleLogin();
                    }}
                    required
                    style={{ flex: 1 }}
                  />
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>@we-et.com</Text>
                </Group>
              </Stack>

              <Checkbox
                label="아이디 저장"
                checked={rememberId}
                onChange={(event) => setRememberId(event.currentTarget.checked)}
              />
            </Stack>

            <Stack gap="sm" mt="md">
              <Button
                fullWidth
                size="md"
                loading={loading}
                onClick={handleLogin}
                color="blue"
              >
                로그인
              </Button>
              <Button
                fullWidth
                variant="subtle"
                color="gray"
                size="sm"
                component={Link}
                href={nextReady ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"}
              >
                계정이 없으신가요? 회원가입하기
              </Button>
            </Stack>

            <Text size="xs" c="dimmed" ta="center">
              WE-ET 내부 전용 시스템입니다.
            </Text>
          </Stack>
        </Paper>
      </Center>
    </Box>
  );
}
