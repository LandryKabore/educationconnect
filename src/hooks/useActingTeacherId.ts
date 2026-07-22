import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * When a school admin opens a teacher workflow with `?teacherId=`,
 * act as that teacher for queries/mutations. Teachers always act as themselves.
 */
export function useActingTeacherId() {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const paramId = searchParams.get("teacherId")?.trim() || null;

  const actingTeacherId = useMemo(() => {
    if (role === "school_admin" && paramId) return paramId;
    return user?.id ?? null;
  }, [role, paramId, user?.id]);

  const isProxy =
    role === "school_admin" && !!paramId && paramId !== user?.id;

  return {
    actingTeacherId,
    isProxy,
    proxyTeacherId: isProxy ? paramId : null,
    searchSuffix: isProxy ? `?teacherId=${encodeURIComponent(paramId!)}` : "",
  };
}
