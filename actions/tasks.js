'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/constants';

function pri(v) {
  return TASK_PRIORITIES.includes(v) ? v : 'normal';
}
function nToId(v) {
  const n = Number(v);
  return v && !Number.isNaN(n) ? n : null;
}

export async function createTask(formData) {
  const user = await requireUser();
  const title = formData.get('title')?.toString().trim();
  if (!title) return;
  const description = formData.get('description')?.toString() || '';
  const priority = pri(formData.get('priority')?.toString());
  const assignee = nToId(formData.get('assignee_id'));
  const due = formData.get('due_date')?.toString() || null;

  await sql`INSERT INTO tasks (title, description, priority, assignee_id, due_date, author_id)
    VALUES (${title}, ${description}, ${priority}, ${assignee}, ${due}, ${user.id})`;
  revalidatePath('/tasks');
  revalidatePath('/');
  redirect('/tasks');
}

export async function setTaskStatus(id, status) {
  await requireUser();
  if (!TASK_STATUSES.includes(status)) return;
  await sql`UPDATE tasks SET status=${status}, updated_at=now() WHERE id=${id}`;
  revalidatePath('/tasks');
  revalidatePath('/');
}

export async function updateTask(id, formData) {
  await requireUser();
  const title = formData.get('title')?.toString().trim();
  const description = formData.get('description')?.toString() || '';
  const priority = pri(formData.get('priority')?.toString());
  const assignee = nToId(formData.get('assignee_id'));
  const due = formData.get('due_date')?.toString() || null;
  const status = formData.get('status')?.toString();
  const st = TASK_STATUSES.includes(status) ? status : 'todo';
  if (!title) return;
  await sql`UPDATE tasks SET title=${title}, description=${description}, priority=${priority},
    assignee_id=${assignee}, due_date=${due}, status=${st}, updated_at=now() WHERE id=${id}`;
  revalidatePath('/tasks');
}

export async function deleteTask(id) {
  await requireUser();
  await sql`DELETE FROM tasks WHERE id=${id}`;
  revalidatePath('/tasks');
  revalidatePath('/');
}
