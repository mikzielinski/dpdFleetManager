import { MaestroProcesses, ProcessInstances } from '@uipath/uipath-typescript/maestro-processes';
import { Processes } from '@uipath/uipath-typescript/processes';
import type { UiPath } from '@uipath/uipath-typescript/core';
import {
  MAESTRO_FOLDER_PATH,
  MAESTRO_INPUT_RECORD_ARG,
  MAESTRO_PROCESS_CANDIDATES,
  ORCHESTRATOR_RELEASE_NAME,
} from '../config';
import {
  BYPASS_AUTH,
  DEMO_MAESTRO_TARGET,
  analysisVariablesForRecord,
} from './demoData';

interface DemoRun {
  recordId: string;
  instanceId: string;
  startedAt: number;
}

const demoRuns: DemoRun[] = [];

const DEMO_ANALYSIS_MS = 6000;

export interface MaestroTarget {
  processKey: string;
  folderKey: string;
  folderId: number;
  name: string;
}

export interface AnalysisRun {
  recordIds: string[];
  instanceId?: string;
  folderKey: string;
  startedAt: number;
  status: 'starting' | 'running' | 'completed' | 'failed';
  error?: string;
  variables?: AnalysisVariables;
}

export interface AnalysisVariables {
  recordId?: string;
  fleetManagerNote?: string;
  combinedScore?: string;
  riskLevel?: string;
  decision?: string;
  flagType?: string;
  fraudFlag?: string;
  vehicleReg?: string;
  declaredAmount?: string;
  validationStatus?: string;
  summary?: string;
  latestRunStatus?: string;
}

async function resolveFromOrchestratorRelease(sdk: UiPath): Promise<MaestroTarget | null> {
  const processes = new Processes(sdk);
  for (const name of MAESTRO_PROCESS_CANDIDATES) {
    try {
      const release = await processes.getByName(name, { folderPath: MAESTRO_FOLDER_PATH });
      const processKey = release.key;
      if (!processKey || !release.folderKey || release.folderId == null) continue;
      return {
        processKey,
        folderKey: release.folderKey,
        folderId: release.folderId,
        name: release.name ?? name,
      };
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function resolveMaestroTarget(sdk: UiPath): Promise<MaestroTarget> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return { ...DEMO_MAESTRO_TARGET };
  }

  const fromOrch = await resolveFromOrchestratorRelease(sdk);
  if (fromOrch) return fromOrch;

  const maestro = new MaestroProcesses(sdk);
  const processes = new Processes(sdk);

  const all = await maestro.getAll();
  const target = all.find((p) =>
    MAESTRO_PROCESS_CANDIDATES.some(
      (c) => p.name === c || p.name.includes('DPDDataInvestigator') || p.name.includes('Agentic'),
    ),
  );
  if (!target?.processKey || !target.folderKey) {
    throw new Error(
      `Nie znaleziono release "${ORCHESTRATOR_RELEASE_NAME}" w folderze ${MAESTRO_FOLDER_PATH}. Opublikuj proces Agentic w Orchestratorze.`,
    );
  }

  let folderId: number | undefined;
  try {
    const byPath = await processes.getByName(target.name, { folderPath: MAESTRO_FOLDER_PATH });
    folderId = byPath.folderId;
  } catch {
    const orch = await processes.getAll();
    const match = orch.items.find((p) => p.folderKey === target.folderKey);
    folderId = match?.folderId;
  }

  if (folderId == null) {
    throw new Error('Nie udało się zmapować folderKey → folderId dla Orchestrator.start');
  }

  return {
    processKey: target.processKey,
    folderKey: target.folderKey,
    folderId,
    name: target.name,
  };
}

export async function startAnalysis(
  sdk: UiPath,
  target: MaestroTarget,
  recordId: string,
): Promise<{ jobKey?: string }> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    const instanceId = `demo-inst-${recordId}-${Date.now()}`;
    demoRuns.push({ recordId, instanceId, startedAt: Date.now() });
    return { jobKey: 'demo-job' };
  }

  const processes = new Processes(sdk);
  const inputArguments = JSON.stringify({ [MAESTRO_INPUT_RECORD_ARG]: recordId });
  const jobs = await processes.start(
    { processKey: target.processKey, inputArguments },
    target.folderId,
  );
  return { jobKey: jobs[0]?.key };
}

export async function findLatestInstance(
  sdk: UiPath,
  target: MaestroTarget,
  afterMs: number,
): Promise<string | undefined> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    const recent = demoRuns
      .filter((r) => r.startedAt >= afterMs - 5000)
      .sort((a, b) => b.startedAt - a.startedAt);
    return recent[0]?.instanceId;
  }

  const processInstances = new ProcessInstances(sdk);
  const result = await processInstances.getAll({
    processKey: target.processKey,
    pageSize: 20,
  });
  const recent = result.items
    .filter((i) => new Date(i.startedTime).getTime() >= afterMs - 5000)
    .sort((a, b) => new Date(b.startedTime).getTime() - new Date(a.startedTime).getTime());
  return recent[0]?.instanceId;
}

export async function pollInstanceVariables(
  sdk: UiPath,
  instanceId: string,
  folderKey: string,
): Promise<AnalysisVariables & { runStatus?: string }> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    const run = demoRuns.find((r) => r.instanceId === instanceId);
    if (!run) {
      return { latestRunStatus: 'Running', runStatus: 'Running' };
    }
    const complete = Date.now() - run.startedAt >= DEMO_ANALYSIS_MS;
    return analysisVariablesForRecord(run.recordId, complete);
  }

  const processInstances = new ProcessInstances(sdk);
  const inst = await processInstances.getById(instanceId, folderKey);
  const vars = await processInstances.getVariables(instanceId, folderKey);

  const flat: Record<string, unknown> = {};
  for (const g of vars.globalVariables ?? []) {
    if (g.name) flat[g.name] = g.value;
  }

  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = flat[n];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }
    return undefined;
  };

  return {
    recordId: pick('recordId', 'id', 'InRecord_Id', 'inRecordId'),
    fleetManagerNote: pick('fleetManagerNote'),
    combinedScore: pick('combinedScore'),
    riskLevel: pick('riskLevel'),
    decision: pick('decision'),
    flagType: pick('flagType'),
    vehicleReg: pick('vehicleReg', 'carRegistrationNum', 'carRegistration', 'CarRegistration'),
    declaredAmount: pick('declaredAmount', 'netPrice', 'NetPrice'),
    validationStatus: pick('validationStatus'),
    summary: pick('summary', 'invoiceSummary', 'formSummary', 'priceSummary'),
    latestRunStatus: inst.latestRunStatus,
    runStatus: inst.latestRunStatus,
  };
}

export function isTerminalStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return ['completed', 'faulted', 'canceled', 'cancelled', 'terminated'].some((x) => s.includes(x));
}

/** Skip auto-start when a matching instance ran within this window. */
export const RECENT_INSTANCE_WINDOW_MS = 30 * 60 * 1000;

export interface RecentInstanceMatch {
  instanceId: string;
  startedAt: number;
  latestRunStatus?: string;
  variables?: AnalysisVariables;
  isTerminal: boolean;
}

function instanceMatchesRecord(vars: AnalysisVariables, recordId: string): boolean {
  const rid = (vars.recordId ?? '').trim().toLowerCase();
  return rid === recordId.trim().toLowerCase();
}

/** Find a recent Maestro instance started for this InRecord_Id (Running or Completed). */
export async function findRecentInstanceForRecord(
  sdk: UiPath,
  target: MaestroTarget,
  recordId: string,
  windowMs = RECENT_INSTANCE_WINDOW_MS,
): Promise<RecentInstanceMatch | null> {
  if (!recordId.trim()) return null;

  if (BYPASS_AUTH) {
    await Promise.resolve();
    const run = demoRuns
      .filter((r) => r.recordId === recordId && Date.now() - r.startedAt < windowMs)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!run) return null;
    const complete = Date.now() - run.startedAt >= DEMO_ANALYSIS_MS;
    const variables = analysisVariablesForRecord(recordId, complete);
    const status = variables.latestRunStatus;
    return {
      instanceId: run.instanceId,
      startedAt: run.startedAt,
      latestRunStatus: status,
      variables,
      isTerminal: isTerminalStatus(status),
    };
  }

  const processInstances = new ProcessInstances(sdk);
  const result = await processInstances.getAll({
    processKey: target.processKey,
    pageSize: 30,
  });
  const cutoff = Date.now() - windowMs;
  const candidates = result.items
    .filter((i) => new Date(i.startedTime).getTime() >= cutoff)
    .sort((a, b) => new Date(b.startedTime).getTime() - new Date(a.startedTime).getTime());

  for (const inst of candidates) {
    try {
      const vars = await pollInstanceVariables(sdk, inst.instanceId, target.folderKey);
      if (!instanceMatchesRecord(vars, recordId)) continue;

      const status = vars.latestRunStatus ?? inst.latestRunStatus;
      const isTerminal = isTerminalStatus(status);
      if (isTerminal && status?.toLowerCase().includes('fault')) continue;

      return {
        instanceId: inst.instanceId,
        startedAt: new Date(inst.startedTime).getTime(),
        latestRunStatus: status,
        variables: vars,
        isTerminal,
      };
    } catch {
      // try next instance
    }
  }
  return null;
}
