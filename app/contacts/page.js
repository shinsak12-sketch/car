import Link from 'next/link';
import { sql } from '@/lib/db';
import { CONTACT_CATEGORIES } from '@/lib/constants';
import { createContact, updateContact, deleteContact } from '@/actions/contacts';
import ToggleForm from '@/components/ToggleForm';
import ContactCard from '@/components/ContactCard';

export const dynamic = 'force-dynamic';

export default async function ContactsPage({ searchParams }) {
  const category = CONTACT_CATEGORIES.includes(searchParams?.category) ? searchParams.category : '';
  const q = (searchParams?.q || '').trim();
  const pat = `%${q}%`;

  let items;
  if (category && q) {
    items = await sql`SELECT c.*, au.name AS author_name FROM contacts c LEFT JOIN users au ON au.id = c.author_id
      WHERE c.category = ${category}
        AND (c.name ILIKE ${pat} OR c.org ILIKE ${pat} OR c.phone ILIKE ${pat} OR c.memo ILIKE ${pat})
      ORDER BY CASE c.category WHEN '경찰' THEN 0 WHEN '구청' THEN 1 WHEN '변호사' THEN 2
               WHEN '사내' THEN 3 WHEN '상대측' THEN 4 ELSE 5 END, c.name`;
  } else if (category) {
    items = await sql`SELECT c.*, au.name AS author_name FROM contacts c LEFT JOIN users au ON au.id = c.author_id
      WHERE c.category = ${category}
      ORDER BY CASE c.category WHEN '경찰' THEN 0 WHEN '구청' THEN 1 WHEN '변호사' THEN 2
               WHEN '사내' THEN 3 WHEN '상대측' THEN 4 ELSE 5 END, c.name`;
  } else if (q) {
    items = await sql`SELECT c.*, au.name AS author_name FROM contacts c LEFT JOIN users au ON au.id = c.author_id
      WHERE (c.name ILIKE ${pat} OR c.org ILIKE ${pat} OR c.phone ILIKE ${pat} OR c.memo ILIKE ${pat})
      ORDER BY CASE c.category WHEN '경찰' THEN 0 WHEN '구청' THEN 1 WHEN '변호사' THEN 2
               WHEN '사내' THEN 3 WHEN '상대측' THEN 4 ELSE 5 END, c.name`;
  } else {
    items = await sql`SELECT c.*, au.name AS author_name FROM contacts c LEFT JOIN users au ON au.id = c.author_id
      ORDER BY CASE c.category WHEN '경찰' THEN 0 WHEN '구청' THEN 1 WHEN '변호사' THEN 2
               WHEN '사내' THEN 3 WHEN '상대측' THEN 4 ELSE 5 END, c.name`;
  }

  return (
    <>
      <div className="page-head">
        <h1>연락처 · 관계자</h1>
        <ToggleForm label="＋ 연락처 추가">
          <form action={createContact} className="form-card">
            <div className="grid2">
              <label>이름<input type="text" name="name" required /></label>
              <label>분류
                <select name="category" defaultValue="기타">
                  {CONTACT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>소속/기관<input type="text" name="org" placeholder="예: OO경찰서 정보과" /></label>
              <label>직책/역할<input type="text" name="role" placeholder="예: 담당 경관" /></label>
              <label>전화번호<input type="tel" name="phone" placeholder="010-0000-0000" /></label>
              <label>이메일<input type="email" name="email" /></label>
            </div>
            <label>메모<textarea name="memo" rows={2} /></label>
            <label className="check"><input type="checkbox" name="notify" value="1" /> 비상 알림 대상에 포함</label>
            <div className="form-actions"><button className="btn-primary">추가</button></div>
          </form>
        </ToggleForm>
      </div>

      <div className="chips-scroll">
        <Link href="/contacts" className={`chip-f ${!category ? 'on' : ''}`}>전체</Link>
        {CONTACT_CATEGORIES.map((c) => (
          <Link key={c} href={`/contacts?category=${encodeURIComponent(c)}`} className={`chip-f ${category === c ? 'on' : ''}`}>{c}</Link>
        ))}
      </div>
      <form className="search-row" method="get" action="/contacts">
        {category && <input type="hidden" name="category" value={category} />}
        <input type="search" name="q" defaultValue={q} placeholder="이름·기관·번호 검색" />
        <button className="btn-sm">검색</button>
      </form>

      {items.length === 0 ? (
        <p className="empty big">등록된 연락처가 없습니다.</p>
      ) : (
        <div className="contact-grid">
          {items.map((c) => (
            <ContactCard
              key={c.id}
              c={c}
              updateAction={updateContact.bind(null, c.id)}
              deleteAction={deleteContact.bind(null, c.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
