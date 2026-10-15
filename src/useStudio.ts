import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { Content, Room } from "./domain";
import {
  agentSchema,
  approveProposal,
  beginTurn,
  characterSchema,
  changed,
  createProject,
  defaultAgents,
  demoStudioTurn,
  projectSummary,
  rejectProposal,
  stopTurn,
  type CharacterProfile,
  type ProjectBrief,
  type ProjectSummary,
  type StudioAction,
  type StudioAgent,
  type StudioProject,
  type StudioState,
} from "./studio";

function initial(): StudioState {
  try {
    const raw = JSON.parse(localStorage.getItem("byga-studio-v1") || "null");
    if (
      raw &&
      Array.isArray(raw.projects) &&
      Array.isArray(raw.characters) &&
      Array.isArray(raw.agents)
    )
      return {
        projects: raw.projects,
        characters: raw.characters.map((c: unknown) =>
          characterSchema.parse(c),
        ),
        agents: defaultAgents.map(
          (a) => raw.agents.find((v: StudioAgent) => v.id === a.id) || a,
        ),
      };
  } catch {}
  return {
    agents: structuredClone(defaultAgents),
    characters: [],
    projects: [],
  };
}
export function useStudio({
  live,
  enabled,
  unauthorized,
  onContent,
}: {
  live: boolean;
  enabled: boolean;
  unauthorized: () => void;
  onContent: (content: Content) => Promise<void>;
}) {
  const [state, setState] = useState<StudioState>(() =>
    live
      ? { agents: structuredClone(defaultAgents), characters: [], projects: [] }
      : initial(),
  );
  const ref = useRef(state);
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<{
    projectId: string;
    agentId: Room;
    runId: string;
  }>();
  const workRef = useRef<typeof working>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const epoch = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const selection = useRef(0);
  const callbacks = useRef({ unauthorized, onContent });
  callbacks.current = { unauthorized, onContent };
  function apply(next: StudioState) {
    ref.current = next;
    setState(next);
  }
  function putProject(project: StudioProject) {
    const old = ref.current.projects.find((p) => p.id === project.id);
    if (old && old.revision > project.revision) return;
    apply({
      ...ref.current,
      projects: [
        project,
        ...ref.current.projects.filter((p) => p.id !== project.id),
      ],
    });
    setSummaries((rows) => [
      projectSummary(project),
      ...rows.filter((p) => p.id !== project.id),
    ]);
  }
  function getProject(id: string) {
    const project = ref.current.projects.find((p) => p.id === id);
    if (!project) throw new Error("Pilih atau buat proyek terlebih dahulu.");
    return project;
  }
  async function execute<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const invocation = epoch.current;
    setError("");
    try {
      return await fn();
    } catch (e) {
      if (invocation !== epoch.current) return undefined;
      if (e instanceof ApiError && e.status === 401)
        callbacks.current.unauthorized();
      setError(
        e instanceof Error ? e.message : "Terjadi kesalahan. Coba lagi.",
      );
      return undefined;
    }
  }
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const scheduled = epoch.current;
    const result = queue.current
      .catch(() => undefined)
      .then(() => {
        if (scheduled !== epoch.current)
          throw new Error(
            "Mode workspace berubah. Coba lagi di mode yang aktif.",
          );
        return fn();
      });
    queue.current = result;
    return result;
  }
  async function reload() {
    if (!live || !enabled) return;
    const current = epoch.current;
    const data = await api<{
      agents: StudioAgent[];
      characters: CharacterProfile[];
      projects: ProjectSummary[];
    }>("/studio");
    if (current !== epoch.current) return;
    apply({ ...ref.current, agents: data.agents, characters: data.characters });
    setSummaries(data.projects);
  }
  useEffect(() => {
    const current = ++epoch.current;
    controller.current?.abort();
    workRef.current = undefined;
    setWorking(undefined);
    queue.current = Promise.resolve();
    setActiveId("");
    setLoading(false);
    setError("");
    const key = live ? "byga-studio-active-live" : "byga-studio-active-demo";
    if (!live) {
      const data = initial();
      apply(data);
      setSummaries(data.projects.map(projectSummary));
      try {
        const id = localStorage.getItem(key);
        if (data.projects.some((p) => p.id === id)) setActiveId(id!);
      } catch {}
      return;
    }
    apply({
      agents: structuredClone(defaultAgents),
      characters: [],
      projects: [],
    });
    setSummaries([]);
    if (!enabled) return;
    setLoading(true);
    void execute(async () => {
      await reload();
      if (epoch.current !== current) return;
      const id = localStorage.getItem(key);
      if (id) {
        try {
          const project = await api<StudioProject>(
            `/studio/projects/${encodeURIComponent(id)}`,
          );
          if (epoch.current === current) {
            putProject(project);
            setActiveId(id);
          }
        } catch {
          /* A removed project must not block the office. */
        }
      }
    }).finally(() => {
      if (epoch.current === current) setLoading(false);
    });
    return () => {
      epoch.current++;
      controller.current?.abort();
    };
  }, [live, enabled]);
  useEffect(() => {
    if (!live && state === ref.current) {
      try {
        localStorage.setItem("byga-studio-v1", JSON.stringify(state));
      } catch {
        setError(
          "Penyimpanan browser penuh. Unduh hasil penting sebelum melanjutkan.",
        );
      }
    }
  }, [state, live]);
  useEffect(() => {
    try {
      if (activeId)
        localStorage.setItem(
          live ? "byga-studio-active-live" : "byga-studio-active-demo",
          activeId,
        );
    } catch {}
  }, [activeId, live]);
  async function select(id: string) {
    const requestId = ++selection.current;
    return execute(async () => {
      const current = epoch.current;
      const project = live
        ? await api<StudioProject>(`/studio/projects/${encodeURIComponent(id)}`)
        : getProject(id);
      if (current !== epoch.current || requestId !== selection.current) return;
      putProject(project);
      setActiveId(id);
      return project;
    });
  }
  async function create(name: string, accountId: string, brief?: ProjectBrief) {
    selection.current++;
    return execute(() =>
      serial(async () => {
        const current = epoch.current;
        const project = live
          ? await api<StudioProject>("/studio/projects", {
              name,
              accountId,
              brief,
            })
          : createProject(name, accountId, brief);
        if (current !== epoch.current) return;
        putProject(project);
        setActiveId(project.id);
        return project;
      }),
    );
  }
  async function saveBrief(id: string, brief: ProjectBrief, name?: string) {
    if (!ref.current.projects.some((p) => p.id === id)) return;
    return execute(() =>
      serial(async () => {
        const current = epoch.current;
        const previous = getProject(id);
        try {
          const project = live
            ? await api<StudioProject>(
                `/studio/projects/${id}`,
                { brief, name, expectedRevision: previous.revision },
                "PATCH",
              )
            : changed({
                ...previous,
                briefDraft: brief,
                name: name || previous.name,
              });
          if (current !== epoch.current) return;
          putProject(project);
          return project;
        } catch (e) {
          if (live && e instanceof ApiError && e.status === 409) {
            const latest = await api<StudioProject>(`/studio/projects/${id}`);
            if (current === epoch.current) putProject(latest);
          }
          throw e;
        }
      }),
    );
  }
  async function saveAgent(agent: StudioAgent) {
    return execute(() =>
      serial(async () => {
        const current = epoch.current;
        agentSchema.parse(agent);
        const next = live
          ? await api<StudioAgent>(`/studio/agents/${agent.id}`, agent, "PUT")
          : { ...agent, revision: agent.revision + 1 };
        if (current !== epoch.current) return;
        apply({
          ...ref.current,
          agents: ref.current.agents.map((a) => (a.id === next.id ? next : a)),
        });
        return next;
      }),
    );
  }
  async function saveCharacter(character: CharacterProfile) {
    return execute(() =>
      serial(async () => {
        const current = epoch.current;
        characterSchema.parse(character);
        const next = live
          ? await api<CharacterProfile>(
              `/studio/characters/${character.id}`,
              character,
              "PUT",
            )
          : { ...character, revision: character.revision + 1 };
        if (current !== epoch.current) return;
        apply({
          ...ref.current,
          characters: [
            next,
            ...ref.current.characters.filter((c) => c.id !== next.id),
          ],
        });
        return next;
      }),
    );
  }
  async function turn(
    id: string,
    agentId: Room,
    message: string,
    action: StudioAction = "chat",
    sceneId?: string,
  ) {
    if (workRef.current) {
      setError("Tunggu agen selesai atau hentikan generasi yang berjalan.");
      return;
    }
    return execute(async () => {
      const invocation = epoch.current;
      await queue.current.catch(() => undefined);
      if (invocation !== epoch.current) return;
      if (workRef.current)
        throw new Error("Agen masih bekerja. Tunggu atau hentikan generasi.");
      const current = epoch.current;
      const previous = getProject(id);
      const runId = crypto.randomUUID();
      const begun = beginTurn(
        previous,
        { id: runId, agentId, action, sceneId },
        message,
      );
      const work = { projectId: id, agentId, runId };
      const abort = new AbortController();
      controller.current = abort;
      workRef.current = work;
      setWorking(work);
      putProject(begun);
      try {
        const next = live
          ? await studioRequest<StudioProject>(
              `/studio/projects/${id}/turn`,
              {
                runId,
                agentId,
                message,
                action,
                sceneId,
                expectedRevision: previous.revision,
              },
              abort.signal,
            )
          : await (async () => {
              await new Promise((resolve) => setTimeout(resolve, 650));
              if (abort.signal.aborted) return undefined;
              return demoStudioTurn(getProject(id), runId, message);
            })();
        if (current !== epoch.current || workRef.current?.runId !== runId)
          return;
        if (next) putProject(next);
        return next;
      } catch (e) {
        if (abort.signal.aborted || current !== epoch.current) return;
        if (live) {
          const latest = await api<StudioProject>(
            `/studio/projects/${id}`,
          ).catch(() => undefined);
          if (latest && current === epoch.current) putProject(latest);
        } else
          putProject(
            stopTurn(
              getProject(id),
              runId,
              e instanceof Error ? e.message : "Generasi gagal.",
            ),
          );
        throw e;
      } finally {
        if (workRef.current?.runId === runId) {
          workRef.current = undefined;
          setWorking(undefined);
        }
      }
    });
  }
  async function cancel() {
    const active = ref.current.projects.find((p) => p.id === activeId);
    const work =
      workRef.current ||
      (active?.run
        ? {
            projectId: active.id,
            agentId: active.run.agentId,
            runId: active.run.id,
          }
        : undefined);
    if (!work) return;
    workRef.current = undefined;
    setWorking(undefined);
    controller.current?.abort();
    return execute(async () => {
      const current = epoch.current;
      const project = live
        ? await api<StudioProject>(
            `/studio/projects/${work.projectId}/cancel`,
            { runId: work.runId },
          )
        : stopTurn(getProject(work.projectId), work.runId);
      if (current === epoch.current) putProject(project);
    });
  }
  async function decide(
    projectId: string,
    proposalId: string,
    decision: "approve" | "reject",
  ) {
    return execute(() =>
      serial(async () => {
        const current = epoch.current;
        const previous = getProject(projectId);
        try {
          const result = live
            ? await api<{ project: StudioProject; content?: Content }>(
                `/studio/projects/${projectId}/proposals/${proposalId}/${decision}`,
                { expectedRevision: previous.revision },
              )
            : decision === "approve"
              ? approveProposal(previous, proposalId)
              : { project: rejectProposal(previous, proposalId) };
          if (current !== epoch.current) return;
          putProject(result.project);
          if (result.content) await callbacks.current.onContent(result.content);
          return result.project;
        } catch (e) {
          if (live && e instanceof ApiError && e.status === 409) {
            const latest = await api<StudioProject>(
              `/studio/projects/${projectId}`,
            );
            if (current === epoch.current) putProject(latest);
          }
          throw e;
        }
      }),
    );
  }
  return {
    ...state,
    summaries,
    activeId,
    project: state.projects.find((p) => p.id === activeId),
    loading,
    error,
    clearError: () => setError(""),
    working:
      working ||
      (() => {
        const project = state.projects.find((p) => p.id === activeId);
        return project?.run
          ? {
              projectId: project.id,
              agentId: project.run.agentId,
              runId: project.run.id,
            }
          : undefined;
      })(),
    select,
    create,
    saveBrief,
    saveAgent,
    saveCharacter,
    turn,
    cancel,
    decide,
    reload: () => execute(reload),
  };
}
async function studioRequest<T>(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => {
    throw new ApiError("Respons backend tidak valid.", response.status);
  });
  if (!response.ok)
    throw new ApiError(
      typeof data === "object" &&
        data &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Agen gagal memproses permintaan.",
      response.status,
    );
  return data as T;
}
export type StudioController = ReturnType<typeof useStudio>;
