"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Paper,
  PasswordInput,
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
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(true);
  const [autoLogin, setAutoLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const queryNext = new URLSearchParams(window.location.search).get("next");
    setNextPath(normalizeNextPath(queryNext));
    setNextReady(true);
  }, []);

  useEffect(() => {
    if (!nextReady) return;

    const savedId = localStorage.getItem("we-et-login-id") ?? "";
    const savedAuto = localStorage.getItem("we-et-auto-login") === "true";
    const savedPassword = localStorage.getItem("we-et-login-password") ?? "";
    if (savedId) {
      setUserId(savedId);
      setRememberId(true);
    }
    if (savedAuto) {
      setAutoLogin(true);
      if (savedPassword) {
        setPassword(savedPassword);
      }
    }

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
    if (!password) {
      notifications.show({
        title: "비밀번호 필요",
        message: "비밀번호를 입력하세요.",
        color: "yellow",
      });
      return;
    }

    setLoading(true);
    const email = `${userId}@we-et.com`;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      notifications.show({
        title: "로그인 실패",
        message: error.message,
        color: "red",
      });
      if (autoLogin) {
        localStorage.removeItem("we-et-auto-login");
        localStorage.removeItem("we-et-login-password");
        setAutoLogin(false);
      }
      return;
    }

    if (rememberId) {
      localStorage.setItem("we-et-login-id", userId);
    } else {
      localStorage.removeItem("we-et-login-id");
    }

    if (autoLogin) {
      localStorage.setItem("we-et-auto-login", "true");
      localStorage.setItem("we-et-login-password", password);
    } else {
      localStorage.removeItem("we-et-auto-login");
      localStorage.removeItem("we-et-login-password");
    }

    router.replace(nextPath);
  }, [autoLogin, nextPath, password, rememberId, router, userId]);


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
                    required
                    style={{ flex: 1 }}
                  />
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>@we-et.com</Text>
                </Group>
              </Stack>

              <PasswordInput
                label="비밀번호"
                placeholder="비밀번호"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
              />

              <Group justify="space-between">
                <Checkbox
                  label="아이디 저장"
                  checked={rememberId}
                  onChange={(event) => setRememberId(event.currentTarget.checked)}
                />
                <Checkbox
                  label="자동 로그인"
                  checked={autoLogin}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.checked;
                    setAutoLogin(nextValue);
                    if (nextValue) {
                      setRememberId(true);
                    }
                  }}
                />
              </Group>
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
              자동 로그인은 개인 PC에서만 사용하세요.
            </Text>
          </Stack>
        </Paper>
      </Center>
    </Box>
  );
}
