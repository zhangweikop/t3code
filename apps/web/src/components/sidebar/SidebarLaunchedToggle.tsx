import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useGT, useMessages } from "gt-react";
import { ListTreeIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { cn } from "~/lib/utils";
import { useUiStateStore } from "../../uiStateStore";
import {
  countSidebarThreadGroup,
  resolveSidebarFolderDot,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { FOLDER_DOT_CLASS_NAME, FOLDER_DOT_LABEL } from "./SidebarProjectFolderHeader";

/**
 * Opens and closes the threads grouped under a lead thread. Closed, its dot keeps the
 * most urgent hidden state on the lead, so a hidden thread that needs you still shows.
 */
export function SidebarLaunchedToggle(props: {
  threadKey: string;
  threads: readonly EnvironmentThreadShell[];
  expanded: boolean;
  hiddenThreads: readonly EnvironmentThreadShell[];
  onToggle: (threadKey: string) => void;
  className?: string | undefined;
}) {
  const gt = useGT();
  const m = useMessages();
  const { threads, expanded, hiddenThreads } = props;
  const count = threads.length;
  const { waiting, running } = countSidebarThreadGroup(threads);
  // Selecting the dot, not the visit map, keeps other threads' visits from re-rendering this.
  const dot = useUiStateStore((state) =>
    expanded
      ? null
      : resolveSidebarFolderDot(
          hiddenThreads.map((thread) => ({
            ...thread,
            lastVisitedAt: resolveThreadLastVisitedAt(
              thread.lastVisitedAt,
              state.threadLastVisitedAtById[
                scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
              ],
            ),
          })),
        ),
  );
  const description = [
    gt("{count, plural, one {{count} thread inside} other {{count} threads inside}}", { count }),
    ...(waiting > 0 ? [gt("{count} waiting for you", { count: waiting })] : []),
    ...(running > 0 ? [gt("{count} running", { count: running })] : []),
  ].join(" · ");
  const handleClick = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    props.onToggle(props.threadKey);
  };
  // Clicks around the pill land on this wrapper, so the parent can widen the mouse target
  // with layout classes; the pill stays the focusable, labelled control.
  return (
    <span
      className={cn("inline-flex shrink-0 cursor-pointer items-center gap-1", props.className)}
      onClick={handleClick}
    >
      {dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-full", FOLDER_DOT_CLASS_NAME[dot])} />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge
              render={<button type="button" />}
              data-sidebar-toggle
              aria-expanded={expanded}
              // The dot is visual; its state is read out with the count.
              aria-label={dot ? description + m(FOLDER_DOT_LABEL[dot]) : description}
              size="sm"
              variant="secondary"
            />
          }
        >
          <ListTreeIcon aria-hidden />
          <span className="tabular-nums">{count}</span>
        </TooltipTrigger>
        <TooltipPopup side="top">{description}</TooltipPopup>
      </Tooltip>
    </span>
  );
}
