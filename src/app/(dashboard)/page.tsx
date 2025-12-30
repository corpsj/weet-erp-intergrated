"use client";

import { Container, Grid, Stack, Box } from "@mantine/core";
import { HubNotifications } from "@/components/dashboard/HubNotifications";
import { HeaderWidget } from "@/components/dashboard/widgets/HeaderWidget";
import { MyFocusWidget } from "@/components/dashboard/widgets/MyFocusWidget";
import { FinancialPulseWidget } from "@/components/dashboard/widgets/FinancialPulseWidget";
import { AgendaWidget } from "@/components/dashboard/widgets/AgendaWidget";
import { QuickLauncherWidget } from "@/components/dashboard/widgets/QuickLauncherWidget";
import dayjs from "dayjs";
import "dayjs/locale/ko";

dayjs.locale("ko");

export default function HubPage() {
  return (
    <Container size="xl" py="lg">
      <Stack gap="lg">
        <HeaderWidget />

        <Grid gutter="lg">
          {/* Left Column (Main Focus) */}
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="lg">
              <Grid gutter="lg">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <HubNotifications />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Box style={{ height: 400 }}>
                    <MyFocusWidget />
                  </Box>
                </Grid.Col>
              </Grid>

              <Grid gutter="lg">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Box style={{ height: 320 }}>
                    <FinancialPulseWidget />
                  </Box>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <Box style={{ height: 320 }}>
                    <QuickLauncherWidget />
                  </Box>
                </Grid.Col>
              </Grid>
            </Stack>
          </Grid.Col>

          {/* Right Column (Agenda) */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Box style={{ height: '100%' }}>
              <AgendaWidget />
            </Box>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
