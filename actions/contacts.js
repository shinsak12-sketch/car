'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/ensureSchema';
import { revalidatePath } from 'next/cache';
import { CONTACT_CATEGORIES } from '@/lib/constants';

function cat(v) {
  return CONTACT_CATEGORIES.includes(v) ? v : '기타';
}

export async function createContact(formData) {
  const user = await requireUser();
  await ensureSchema();
  const name = formData.get('name')?.toString().trim();
  if (!name) return;
  await sql`INSERT INTO contacts (name, org, role, phone, email, category, memo, notify, author_id)
    VALUES (${name}, ${formData.get('org')?.toString() || ''}, ${formData.get('role')?.toString() || ''},
            ${formData.get('phone')?.toString() || ''}, ${formData.get('email')?.toString() || ''},
            ${cat(formData.get('category')?.toString())}, ${formData.get('memo')?.toString() || ''},
            ${formData.get('notify') ? true : false}, ${user.id})`;
  revalidatePath('/contacts');
  revalidatePath('/');
}

export async function updateContact(id, formData) {
  await requireUser();
  const name = formData.get('name')?.toString().trim();
  if (!name) return;
  await sql`UPDATE contacts SET name=${name}, org=${formData.get('org')?.toString() || ''},
    role=${formData.get('role')?.toString() || ''}, phone=${formData.get('phone')?.toString() || ''},
    email=${formData.get('email')?.toString() || ''}, category=${cat(formData.get('category')?.toString())},
    memo=${formData.get('memo')?.toString() || ''}, notify=${formData.get('notify') ? true : false}
    WHERE id=${id}`;
  revalidatePath('/contacts');
}

export async function deleteContact(id) {
  await requireUser();
  await sql`DELETE FROM contacts WHERE id=${id}`;
  revalidatePath('/contacts');
  revalidatePath('/');
}
