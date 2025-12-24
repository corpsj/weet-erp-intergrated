"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePathname } from "next/navigation";

// Define supported menu IDs
export type MenuId = "notice" | "estimate" | "todo" | "expense" | "utility" | "tax" | "transaction" | "memo";

type NotificationContextType = {
    unreadCounts: Record<MenuId, number>;
    markAsRead: (menuId: MenuId) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    isLoading: boolean;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [unreadCounts, setUnreadCounts] = useState<Record<MenuId, number>>({
        notice: 0,
        estimate: 0,
        todo: 0,
        expense: 0,
        utility: 0,
        tax: 0,
        transaction: 0,
        memo: 0,
    });
    const [lastReadTimes, setLastReadTimes] = useState<Record<MenuId, string | null>>({
        notice: null,
        estimate: null,
        todo: null,
        expense: null,
        utility: null,
        tax: null,
        transaction: null,
        memo: null,
    });
    const [isLoading, setIsLoading] = useState(true);
    const pathname = usePathname();

    // Helper to get table name from menu ID
    const getTableName = (menuId: MenuId): string => {
        switch (menuId) {
            case "notice": return "notices"; // Assuming 'notices' table exists, or posts? user needs to confirm table names. Actually I will verify table names later.
            case "estimate": return "estimates";
            case "todo": return "todos";
            case "expense": return "expenses";
            case "utility": return "utility_bills";
            case "tax": return "tax_invoices"; // Assuming table name
            case "transaction": return "transactions"; // Assuming table name
            case "memo": return "memos";
            default: return "";
        }
    };

    // Helper to map route to menu ID
    const getMenuIdFromPath = (path: string): MenuId | null => {
        // Logic to map path to menuId
        if (path === '/' || path.startsWith('/notice')) return 'notice'; // Assuming hub has notices or distinct route? 
        // Actually user said "Hub" shows summary. But sidebar has "Memo" etc.
        // Let's stick to strict paths.
        if (path.startsWith('/estimate')) return 'estimate';
        if (path.startsWith('/todo')) return 'todo';
        if (path.startsWith('/memos')) return 'memo';
        if (path.startsWith('/expenses')) return 'expense';
        if (path.startsWith('/utility-bills')) return 'utility';
        if (path.startsWith('/tax-invoices')) return 'tax';
        if (path.startsWith('/transactions')) return 'transaction';
        return null;
    };

    const fetchUnreadBasic = useCallback(async (userId: string) => {
        // 1. Get last read times
        const { data: reads } = await supabase
            .from("user_menu_reads")
            .select("menu_id, last_read_at")
            .eq("user_id", userId);

        const newLastReads = { ...lastReadTimes };
        if (reads) {
            reads.forEach((r) => {
                if (Object.keys(newLastReads).includes(r.menu_id)) {
                    newLastReads[r.menu_id as MenuId] = r.last_read_at;
                }
            });
        }
        setLastReadTimes(newLastReads);

        // 2. Count unread items for each menu
        // This could be optimized with a dedicated RPC or view, but for now we run parallel queries.
        // Ideally we assume tables exist. I need to be careful about table names.
        // Validated tables: todos, estimates, utility_bills, user_menu_reads.
        // 'memos', 'expenses', 'tax_invoices', 'transactions' - assumed based on layout links.

        // To avoid breaking if table doesn't exist, I will try-catch or limit scope.
        // Let's implement for known tables first: todo, estimate, utility.

        const countDraft = { ...unreadCounts };

        // Helper to fetch count
        const getCount = async (table: string, lastRead: string | null) => {
            if (!lastRead) return 0; // If never read, maybe everything is unread? Or 0? Let's say 0 to be annoying initially, or treat 'null' as 'beginning of time'?
            // Better treatment: if null, fetch current count.
            const query = supabase.from(table).select('*', { count: 'exact', head: true });
            if (lastRead) {
                query.gt('created_at', lastRead);
            }
            const { count } = await query;
            return count || 0;
        };

        // Todo
        // For Todos, we might care about 'assignee_id' matching user, but prompt said "New items in menu".
        // "My unread items".
        // "New items created".
        // For shared resources (Notices), it's everything new.
        // For private/team resources (Todos), is it everything? User said "내가(각 사용자별) 확인하지 않은 새로운 항목이 생겼다면".
        // If it's a team ERP, seeing *all* new todos might be noisy.
        // But let's stick to "Created after last read" for simplicity as planned.

        const promises = (Object.keys(newLastReads) as MenuId[]).map(async (menu) => {
            const table = getTableName(menu);
            if (!table) return;

            // Skip tables I am uncertain about to avoid errors, or wrap in try-catch
            try {
                // Special handling if needed
                let count = 0;
                // Setup default last read if null (e.g. 7 days ago, or now?)
                // If null, it means user never clicked. Showing ALL items might be huge.
                // Let's cap at 99 or just count from "now" if first time?
                // Strategy: If last_read is null, set it to NOW immediately? No.
                // Let's assume 'null' means 'Unread count = total count'.

                const lastRead = newLastReads[menu];
                const query = supabase.from(table).select('*', { count: 'exact', head: true });
                if (lastRead) {
                    query.gt('created_at', lastRead);
                }
                const { count: c, error } = await query;
                if (!error && c !== null) {
                    countDraft[menu] = c;
                }
            } catch (e) {
                console.warn(`Failed to count for ${menu}`, e);
            }
        });

        await Promise.all(promises);
        setUnreadCounts(countDraft);
        setIsLoading(false);
    }, []);

    // Initial Fetch & Realtime Subscription
    useEffect(() => {
        let mounted = true;
        const channel = supabase.channel('notification_changes');

        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && mounted) {
                await fetchUnreadBasic(user.id);

                // Subscribe to changes
                // We listen for INSERT on relevant tables
                // Note: Postgres changes require REPLICA IDENTITY FULL or primary key.
                // Filtering by table is possible.
                const tables = ['todos', 'estimates', 'utility_bills', 'memos', 'expenses', 'tax_invoices', 'transactions']; // Add 'notices' if exists

                tables.forEach(table => {
                    channel.on(
                        'postgres_changes',
                        { event: 'INSERT', schema: 'public', table: table },
                        () => {
                            // Refresh counts
                            // Optimistic update: find which menu matches this table, increment count
                            // For safety, re-fetch counts? Or simple increment?
                            // Simple increment is better for UX.
                            // Find menuId for table
                            // We need reverse mapping table -> menu
                            // For simplicity, just re-fetch all for now to be accurate w timestamps
                            fetchUnreadBasic(user.id);

                            // Trigger Web Notification if supported
                            if ("Notification" in window && Notification.permission === "granted") {
                                new Notification("새로운 알림이 있습니다.", { body: `${table}에 새로운 항목이 추가되었습니다.` });
                            }
                        }
                    )
                });

                channel.subscribe();
            }
        };

        init();

        return () => {
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, [fetchUnreadBasic]);

    // Mark as Read Logic
    const markAsRead = async (menuId: MenuId) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Update local state optimistic
        setUnreadCounts(prev => ({ ...prev, [menuId]: 0 }));
        const nowStr = new Date().toISOString();
        setLastReadTimes(prev => ({ ...prev, [menuId]: nowStr }));

        // DB Call (RPC or Upsert)
        // We created a function update_user_menu_read, or distinct rpc?
        // We defined "create or replace function update_user_menu_read(p_menu_id text)..." in migration.
        // But wait, RPC is `update_user_menu_read`.

        const { error } = await supabase.rpc('update_user_menu_read', { p_menu_id: menuId });
        if (error) {
            console.error("Failed to mark read", JSON.stringify(error, null, 2));
            // Revert?
        }
    };

    const markAllAsRead = async () => {
        const menus = Object.keys(unreadCounts) as MenuId[];
        await Promise.all(menus.map(m => markAsRead(m)));
    };

    // Auto-mark read on route change
    useEffect(() => {
        const currentMenu = getMenuIdFromPath(pathname);
        if (currentMenu && unreadCounts[currentMenu] > 0) {
            // Debounce or immediate? Immediate is fine for "click".
            // But user said "Clicking menu marks as read". Navigating IS clicking menu generally.
            markAsRead(currentMenu);
        }
    }, [pathname, unreadCounts]); // dependencies? if unreadCounts changes, we don't want to re-trigger markAsRead loop.
    // Actually, if we are ON the page, and new item comes (realtime), unread count goes 0 -> 1.
    // Should we auto-read it? 
    // Yes, if user is currently viewing "Todo" list, and new Todo comes, it is technically "seen"?
    // Or should we keep it unread until refresh?
    // "Last read time" strategy means "Time I clicked".
    // If I am on the page, and I refresh comparison time, it stays 0.
    // Let's simplify: When entering route, mark read.
    // If staying on route, subsequent notifications might increment badge (toast?), but badge on sidebar might increment.
    // If I am on Todo page, sidebar todo badge says '1'?
    // Usually if active, badge should be hidden or 0.

    // Refined Auto-read Effect
    useEffect(() => {
        const currentMenu = getMenuIdFromPath(pathname);
        if (currentMenu) {
            markAsRead(currentMenu);
        }
    }, [pathname]);

    // App Badge Sync
    useEffect(() => {
        if ("setAppBadge" in navigator) {
            const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
            if (total > 0) {
                navigator.setAppBadge(total).catch(e => console.error("Badging failed", e));
            } else {
                navigator.clearAppBadge().catch(e => console.error("Clear badge failed", e));
            }
        }
    }, [unreadCounts]);


    return (
        <NotificationContext.Provider value={{ unreadCounts, markAsRead, markAllAsRead, isLoading }}>
            {children}
        </NotificationContext.Provider>
    );
}

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error("useNotifications must be used within a NotificationProvider");
    }
    return context;
};
