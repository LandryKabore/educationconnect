import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";

/**
 * « À … · Cc … », like Gmail: who else got a message sent to several people.
 * Database function ef_message_recipients; until it exists, nothing is shown.
 */
export type RecipientsLine = { to: string[]; cc: string[] };

type Row = {
  recipient_id: string;
  first_name: string | null;
  last_name: string | null;
  is_cc: boolean;
  is_admin: boolean;
};

export function useMessageRecipients(
  threadIds: (string | null | undefined)[],
  me: string | undefined,
): Map<string, RecipientsLine> {
  const ids = [...new Set(threadIds.filter((t): t is string => !!t))];
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["message-recipients", id],
      staleTime: 5 * 60_000,
      retry: false,
      queryFn: async (): Promise<Row[]> => {
        const { data, error } = await supabase.rpc("ef_message_recipients", { p_thread: id });
        if (error) return [];
        return (data ?? []) as Row[];
      },
    })),
  });
  const out = new Map<string, RecipientsLine>();
  ids.forEach((id, i) => {
    const rows = results[i]?.data ?? [];
    if (rows.length < 2) return;
    const names = (cc: boolean) => {
      const list: string[] = [];
      for (const r of rows) {
        if (r.is_cc !== cc) continue;
        const n =
          r.recipient_id === me ? "vous" : r.is_admin ? "Administration" : fullName(r.first_name, r.last_name);
        if (n && !list.includes(n)) list.push(n);
      }
      return list;
    };
    out.set(id, { to: names(false), cc: names(true) });
  });
  return out;
}

export function RecipientsLineText({ line, mine }: { line: RecipientsLine; mine: boolean }) {
  return (
    <span className={`mb-1 block max-w-full px-1 text-[11px] text-slate-500 ${mine ? "text-right" : "text-left"}`}>
      <span className="font-semibold">À :</span> {line.to.join(", ")}
      {line.cc.length ? (
        <>
          {"  ·  "}
          <span className="font-semibold">Cc :</span> {line.cc.join(", ")}
        </>
      ) : null}
    </span>
  );
}
