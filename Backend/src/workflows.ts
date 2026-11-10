// Render Workflows client (render.com/docs/workflows). The API hands slow or retry-worthy jobs to the paytogether-workflows
// service (tasks in src/tasks.ts). Off without RENDER_API_KEY: then the API runs the same jobs in-process (local dev, tests).
import { Render } from '@renderinc/sdk';

// Task slugs are {workflow-slug}/{task-name}; the workflow's slug is shown on its Definitions page in the dashboard.
const SLUG = process.env.RENDER_WORKFLOW_SLUG || 'paytogether-workflows';
export const enabled = !!process.env.RENDER_API_KEY;
let client: Render | undefined;
const api = () => (client ??= new Render()).workflows; // reads RENDER_API_KEY

/** Runs a task and waits for it. Throws unless it succeeded, so callers keep their existing error handling. */
export async function run<T>(task: string, args: unknown[]): Promise<T> {
  const d = await api().runTask(`${SLUG}/${task}`, args);
  if (String(d.status) !== 'succeeded' && String(d.status) !== 'completed') throw new Error(`Workflow task ${task} ${d.status}: ${d.error ?? 'no details'}`);
  return d.results[0] as T;
}

/** Starts a task without waiting (fire and forget). */
export const start = (task: string, args: unknown[]) => api().startTask(`${SLUG}/${task}`, args);
