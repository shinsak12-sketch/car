import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="error-page">
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>요청하신 페이지가 없거나 삭제되었습니다.</p>
      <Link href="/" className="btn-primary">상황판으로</Link>
    </div>
  );
}
