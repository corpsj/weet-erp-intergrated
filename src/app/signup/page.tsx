"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  Box,
  Button,
  Center,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const normalizeNextPath = (value: string | null) => {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  return value;
};

export default function SignupPage() {
  const router = useRouter();

  const [nextPath, setNextPath] = useState("/");
  const [nextReady, setNextReady] = useState(false);

  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [approvalCode, setApprovalCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [checking, setChecking] = useState(false);
  const [idCheckedFor, setIdCheckedFor] = useState<string | null>(null);
  const [idAvailable, setIdAvailable] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const normalizedUserId = useMemo(() => userId.trim().toLowerCase(), [userId]);
  const email = useMemo(() => (normalizedUserId ? `${normalizedUserId}@we-et.com` : ""), [normalizedUserId]);

  useEffect(() => {
    const queryNext = new URLSearchParams(window.location.search).get("next");
    setNextPath(normalizeNextPath(queryNext));
    setNextReady(true);
  }, []);

  useEffect(() => {
    setIdCheckedFor(null);
    setIdAvailable(null);
  }, [normalizedUserId]);

  useEffect(() => {
    if (!nextReady) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace(nextPath);
      }
    });
  }, [nextPath, nextReady, router]);

  const checkDuplicate = useCallback(async () => {
    if (!normalizedUserId) {
      notifications.show({ title: "아이디 필요", message: "아이디를 입력하세요.", color: "yellow" });
      return;
    }

    setChecking(true);
    const response = await fetch("/api/signup/check-id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: normalizedUserId }),
    }).catch(() => null);
    setChecking(false);

    if (!response) {
      notifications.show({ title: "중복 확인 실패", message: "네트워크 오류가 발생했습니다.", color: "red" });
      return;
    }

    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      notifications.show({
        title: "중복 확인 실패",
        message: payload?.message ?? "요청 처리에 실패했습니다.",
        color: "red",
      });
      return;
    }

    const available = Boolean(payload?.available);
    setIdCheckedFor(normalizedUserId);
    setIdAvailable(available);
    notifications.show({
      title: available ? "사용 가능" : "사용 불가",
      message: available ? "이 아이디를 사용할 수 있습니다." : "이미 사용 중인 아이디입니다.",
      color: available ? "gray" : "red",
    });
  }, [normalizedUserId]);

  const handleSignup = useCallback(async () => {
    if (!normalizedUserId) {
      notifications.show({ title: "아이디 필요", message: "아이디를 입력하세요.", color: "yellow" });
      return;
    }
    if (idCheckedFor !== normalizedUserId || idAvailable !== true) {
      notifications.show({
        title: "중복 확인 필요",
        message: "아이디 중복확인을 먼저 진행하세요.",
        color: "yellow",
      });
      return;
    }
    if (!name.trim()) {
      notifications.show({ title: "이름 필요", message: "이름을 입력하세요.", color: "yellow" });
      return;
    }
    if (!approvalCode.trim()) {
      notifications.show({ title: "승인코드 필요", message: "회원가입 승인코드를 입력하세요.", color: "yellow" });
      return;
    }
    if (password.length < 6) {
      notifications.show({
        title: "비밀번호 오류",
        message: "비밀번호는 6자 이상이어야 합니다.",
        color: "red",
      });
      return;
    }
    if (password !== passwordConfirm) {
      notifications.show({
        title: "비밀번호 확인",
        message: "비밀번호와 비밀번호 확인이 일치하지 않습니다.",
        color: "red",
      });
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: normalizedUserId,
        password,
        name: name.trim(),
        approvalCode: approvalCode.trim(),
      }),
    }).catch(() => null);

    if (!response) {
      setSubmitting(false);
      notifications.show({ title: "회원가입 실패", message: "네트워크 오류가 발생했습니다.", color: "red" });
      return;
    }

    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      setSubmitting(false);
      notifications.show({
        title: "회원가입 실패",
        message: payload?.message ?? "요청 처리에 실패했습니다.",
        color: "red",
      });
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (error) {
      notifications.show({ title: "자동 로그인 실패", message: error.message, color: "red" });
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    notifications.show({ title: "회원가입 완료", message: "로그인되었습니다.", color: "gray" });
    router.replace(nextPath);
  }, [
    approvalCode,
    email,
    idAvailable,
    idCheckedFor,
    name,
    nextPath,
    normalizedUserId,
    password,
    passwordConfirm,
    router,
  ]);

  return (
    <Box className="app-shell soft-grid">
      <Center mih="100vh" p={{ base: 24, md: 48 }}>
        <Paper className="app-surface" radius="lg" p={{ base: 24, md: 40 }} maw={560} w="100%">
          <Stack gap="lg">
            <Box>
              <Title order={2} className="brand-title">
                WE-ET ERP 회원가입
              </Title>
              <Text c="dimmed" mt="xs">
                승인코드가 있어야 가입할 수 있습니다.
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
                  <Button
                    loading={checking}
                    onClick={checkDuplicate}
                    variant="light"
                    color="gray"
                    size="sm"
                  >
                    중복확인
                  </Button>
                </Group>
                {idCheckedFor && (
                  <Text size="xs" c={idAvailable ? "blue" : "red"} mt={2}>
                    {idAvailable ? "사용 가능한 아이디입니다." : "이미 사용 중인 아이디입니다."}
                  </Text>
                )}
              </Stack>

              <PasswordInput
                label="비밀번호"
                placeholder="6자 이상 입력"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
              />

              <PasswordInput
                label="비밀번호 확인"
                placeholder="비밀번호 재입력"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.currentTarget.value)}
                required
              />

              <TextInput
                label="이름"
                placeholder="성함을 입력하세요"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                required
              />

              <TextInput
                label="회원가입 승인코드"
                placeholder="관리자에게 문의하세요"
                value={approvalCode}
                onChange={(event) => setApprovalCode(event.currentTarget.value)}
                required
              />
            </Stack>

            <Stack gap="sm" mt="md">
              <Button
                fullWidth
                size="md"
                loading={submitting}
                onClick={handleSignup}
                color="blue"
              >
                회원가입 완료
              </Button>
              <Button
                fullWidth
                variant="subtle"
                color="gray"
                size="sm"
                component={Link}
                href={`/login?next=${encodeURIComponent(nextPath)}`}
              >
                이미 계정이 있으신가요? 로그인하기
              </Button>
            </Stack>

            <Text size="xs" c="dimmed" ta="center">
              아이디는 영문/숫자와 . _ - 만 사용할 수 있습니다. (3~30자)
            </Text>
          </Stack>
        </Paper>
      </Center>
    </Box>
  );
}

