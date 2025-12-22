"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "@/app/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
